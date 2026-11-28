-- Adult role workflows. Existing content and append-only student results are retained.
alter table public.learning_materials add column curriculum jsonb not null default '{}'
  check(jsonb_typeof(curriculum)='object');
alter table public.workspace_records drop constraint workspace_records_kind_check;
alter table public.workspace_records add constraint workspace_records_kind_check
  check(kind in ('plan','session','curriculum','dataset','training','announcement','question_bank'));

create table public.material_favorites (
  educator_id uuid not null references public.profiles(id),
  material_id uuid not null references public.learning_materials(id),
  created_at timestamptz not null default now(),
  primary key(educator_id,material_id)
);
alter table public.material_favorites enable row level security;
revoke all on public.material_favorites from anon,authenticated;
grant select on public.material_favorites to authenticated;
create policy favorites_owner on public.material_favorites for select to authenticated
  using(educator_id=auth.uid() and private.current_account_role() is not null);

create table public.learning_material_reviews (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.learning_materials(id),
  material_version integer not null,
  reviewer_id uuid not null references public.profiles(id),
  decision text not null check(decision in ('published','draft','archived')),
  notes text not null check(length(btrim(notes)) between 3 and 2000),
  reviewed_at timestamptz not null default now()
);
alter table public.learning_material_reviews enable row level security;
revoke all on public.learning_material_reviews from anon,authenticated;
grant select on public.learning_material_reviews to authenticated;
create policy reviews_authorized on public.learning_material_reviews for select to authenticated
using(private.current_account_role() is not null and (private.is_active_administrator() or exists(
  select 1 from public.learning_materials m where m.id=material_id and m.owner_id=auth.uid())));
create index learning_reviews_material on public.learning_material_reviews(material_id,reviewed_at desc);

alter function private.workspace_snapshot() rename to workspace_snapshot_core;
revoke all on function private.workspace_snapshot_core() from public,anon,authenticated;
create function private.workspace_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; admin boolean:=private.is_active_administrator();
begin
  if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501';end if;
  result:=private.workspace_snapshot_core();
  result:=result||jsonb_build_object(
    'favorites',coalesce((select jsonb_agg(material_id) from public.material_favorites where educator_id=auth.uid()),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by reviewed_at desc) from public.learning_material_reviews r
      join public.learning_materials m on m.id=r.material_id where admin or m.owner_id=auth.uid()),'[]'::jsonb),
    'model_evaluations',case when admin then coalesce((select jsonb_agg(to_jsonb(e)) from public.model_evaluations e),'[]'::jsonb) else '[]'::jsonb end,
    'model_activations',case when admin then coalesce((select jsonb_agg(to_jsonb(a) order by activated_at desc) from public.model_activations a),'[]'::jsonb) else '[]'::jsonb end);
  if admin then result:=jsonb_set(result,'{educators}',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'email',email,'role',role,'status',status,'grade_levels',grade_levels,'created_at',created_at))
    from public.profiles),'[]'::jsonb));end if;
  return result;
end $$;
create or replace function public.workspace_snapshot() returns jsonb language sql security invoker set search_path='' as $$select private.workspace_snapshot()$$;

alter function private.save_learning_material(uuid,jsonb) rename to save_learning_material_content;
revoke all on function private.save_learning_material_content(uuid,jsonb) from public,anon,authenticated;
create function private.save_learning_material(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; mapping jsonb:=coalesce(p_data->'curriculum','{}'); reference public.workspace_records;
begin
  if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501';end if;
  if jsonb_typeof(mapping)<>'object' or pg_column_size(mapping)>5000 then raise exception 'Invalid curriculum selection';end if;
  if mapping?'quarter' and (mapping->>'quarter')::integer not between 1 and 4 then raise exception 'Choose quarter 1 to 4';end if;
  if coalesce(mapping->>'reference_id','')<>'' then
    select * into reference from public.workspace_records where id=(mapping->>'reference_id')::uuid and kind='curriculum' and status='published';
    if reference.id is null then raise exception 'Select a published curriculum reference';end if;
    if (reference.data->>'grade_level')::integer<>(p_data->>'grade_level')::integer
      or reference.data->>'learning_area' is distinct from mapping->>'learning_area'
      or (reference.data->>'quarter')::integer is distinct from (mapping->>'quarter')::integer then
      raise exception 'The reference must match the selected grade, learning area and quarter';end if;
    mapping:=mapping||jsonb_build_object('version',reference.data->>'curriculum_version','reference_title',reference.title);
  else mapping:=mapping-'version'-'reference_title';end if;
  result:=private.save_learning_material_content(p_id,p_data);
  update public.learning_materials set curriculum=mapping where id=result;
  return result;
end $$;
create or replace function public.save_learning_material(p_id uuid,p_data jsonb) returns uuid language sql security invoker set search_path='' as $$select private.save_learning_material(p_id,p_data)$$;

alter function private.save_workspace_record(uuid,jsonb) rename to save_workspace_record_content;
revoke all on function private.save_workspace_record_content(uuid,jsonb) from public,anon,authenticated;
create function private.save_workspace_record(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare kind text:=p_data->>'kind'; content jsonb:=coalesce(p_data->'data','{}');
  old public.workspace_records; dataset public.workspace_records; payload jsonb:=p_data; v_id uuid;
begin
  if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501';end if;
  if kind in ('curriculum','dataset','training','announcement','question_bank') and not private.is_active_administrator() then
    raise exception 'Administrator access required' using errcode='42501';end if;
  if p_id is not null then
    select * into old from public.workspace_records where id=p_id for update;
    if old.id is null or (old.owner_id<>auth.uid() and not private.is_active_administrator()) then raise exception 'Record ownership mismatch' using errcode='42501';end if;
    if old.kind<>kind then raise exception 'Record type cannot be changed';end if;
    if kind='training' and old.status='published' and (p_data->>'status'<>'archived' or old.data<>content) then
      raise exception 'Published training packages are immutable. Create a new package.';end if;
  end if;
  if jsonb_typeof(content)<>'object' then raise exception 'Record data must be an object';end if;
  if kind='curriculum' then
    if coalesce((content->>'grade_level')::integer,0) not between 1 and 6 or coalesce((content->>'quarter')::integer,0) not between 1 and 4
      or length(btrim(coalesce(content->>'learning_area','')))=0 or length(btrim(coalesce(content->>'curriculum_version','')))=0
      or coalesce(content->>'source_url','') !~ '^https?://' then raise exception 'Enter grade, learning area, quarter, curriculum version and source URL';end if;
  elsif kind='dataset' then
    if jsonb_typeof(content->'pairs') is distinct from 'array' or jsonb_array_length(content->'pairs') not between 1 and 10000
      or length(btrim(coalesce(content->>'license','')))=0 or length(btrim(coalesce(content->>'source_url','')))=0 then raise exception 'Record bilingual pairs, provenance and usage rights';end if;
    if exists(select 1 from jsonb_array_elements(content->'pairs') p where length(btrim(coalesce(p->>'en','')))=0 or length(btrim(coalesce(p->>'fil','')))=0) then raise exception 'Every pair needs English and Filipino text';end if;
    if p_data->>'status'='published' then
      if exists(select 1 from jsonb_array_elements(content->'pairs') p group by lower(btrim(p->>'en')) having count(*)>1) then
        raise exception 'Resolve duplicate or conflicting English pairs before approval';end if;
      content:=content||jsonb_build_object('approved_by',auth.uid(),'approved_at',now());
    else content:=content-'approved_by'-'approved_at';end if;
  elsif kind='training' and (old.id is null or old.status<>'published') then
    select * into dataset from public.workspace_records where id=(content->>'dataset_id')::uuid and kind='dataset' and status='published';
    if dataset.id is null then raise exception 'Select an approved dataset';end if;
    content:=jsonb_build_object('dataset_id',dataset.id,'dataset_title',dataset.title,'dataset',dataset.data,
      'dataset_checksum',encode(extensions.digest(dataset.data::text,'sha256'),'hex'),
      'details',coalesce(content->>'details',''),'seed',42,'directions',jsonb_build_array('en_to_fil','fil_to_en'),
      'instructions','Run prepare_dataset.py, train.py, evaluate_model.py and package_model.py on an appropriate training machine.');
  elsif kind in ('plan','session') then
    if coalesce((content->>'grade_level')::integer,0) not between 1 and 6 then raise exception 'Choose Grade 1 to 6';end if;
    if exists(select 1 from jsonb_array_elements_text(coalesce(content->'material_ids','[]')) selected
      where not exists(select 1 from public.learning_materials m where m.id=selected::uuid and m.status<>'archived'
        and (m.status='published' or m.owner_id=auth.uid()) and m.grade_level=(content->>'grade_level')::integer)) then
      raise exception 'Select available materials for this educator and grade' using errcode='42501';end if;
    if kind='session' and (coalesce((content->>'participant_count')::integer,-1)<0
      or coalesce((content->>'total_count')::integer,-1)<0 or coalesce((content->>'correct_count')::integer,-1)<0
      or (content->>'correct_count')::integer>(content->>'total_count')::integer) then raise exception 'Enter valid class-level participant and result counts';end if;
  elsif kind='question_bank' then
    if jsonb_typeof(content->'questions') is distinct from 'array' or jsonb_array_length(content->'questions') not between 1 and 50 then raise exception 'A bank needs 1 to 50 questions';end if;
    if exists(select 1 from jsonb_array_elements(content->'questions') q where length(btrim(coalesce(q->>'prompt','')))=0 or
      jsonb_typeof(q->'options') is distinct from 'array' or not exists(select 1 from jsonb_array_elements(q->'options') o where o->>'id'=q->>'correct_option_id')) then raise exception 'Every bank question needs options and an answer key';end if;
  end if;
  payload:=jsonb_set(payload,'{data}',content);
  if kind='question_bank' then
    v_id:=coalesce(p_id,gen_random_uuid());
    insert into public.workspace_records(id,owner_id,kind,title,data,status) values(v_id,auth.uid(),kind,btrim(p_data->>'title'),content,coalesce(p_data->>'status','draft'))
      on conflict(id) do update set title=excluded.title,data=excluded.data,status=excluded.status,updated_at=now();
    insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'question_bank_saved',kind,v_id);
    return v_id;
  end if;
  return private.save_workspace_record_content(p_id,payload);
end $$;
create or replace function public.save_workspace_record(p_id uuid,p_data jsonb) returns uuid language sql security invoker set search_path='' as $$select private.save_workspace_record(p_id,p_data)$$;

create function private.set_material_favorite(p_id uuid,p_saved boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501';end if;
  if not exists(select 1 from public.learning_materials where id=p_id and (status='published' or owner_id=auth.uid() or private.is_active_administrator())) then raise exception 'Material is not available' using errcode='42501';end if;
  if p_saved then insert into public.material_favorites(educator_id,material_id) values(auth.uid(),p_id) on conflict do nothing;
  else delete from public.material_favorites where educator_id=auth.uid() and material_id=p_id;end if;
end $$;
create function public.set_material_favorite(p_id uuid,p_saved boolean) returns void language sql security invoker set search_path='' as $$select private.set_material_favorite(p_id,p_saved)$$;

create function private.review_learning_material(p_id uuid,p_decision text,p_notes text) returns void
language plpgsql security definer set search_path='' as $$
declare material public.learning_materials;
begin
  if not private.is_active_administrator() then raise exception 'Administrator access required' using errcode='42501';end if;
  if p_decision not in ('published','draft','archived') or length(btrim(coalesce(p_notes,''))) not between 3 and 2000 then raise exception 'Choose a decision and record review notes';end if;
  select * into material from public.learning_materials where id=p_id for update;
  if material.id is null then raise exception 'Material not found';end if;
  update public.learning_materials set status=p_decision,updated_at=now() where id=p_id;
  insert into public.learning_material_reviews(material_id,material_version,reviewer_id,decision,notes) values(p_id,material.version,auth.uid(),p_decision,btrim(p_notes));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'material_reviewed','learning_material',p_id,jsonb_build_object('decision',p_decision,'notes',p_notes));
end $$;
create function public.review_learning_material(p_id uuid,p_decision text,p_notes text) returns void language sql security invoker set search_path='' as $$select private.review_learning_material(p_id,p_decision,p_notes)$$;

create function private.register_trained_model(p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare package public.workspace_records; dataset_id uuid:=gen_random_uuid(); snapshot_id uuid:=gen_random_uuid();
  run_id uuid:=gen_random_uuid(); model_id uuid:=gen_random_uuid(); metric jsonb; pair jsonb; revision_id uuid;
  evaluations jsonb:=p_data->'evaluations'; manifest jsonb:=p_data->'manifest';
begin
  if not private.is_active_administrator() then raise exception 'Administrator access required' using errcode='42501';end if;
  if pg_column_size(p_data)>1000000 then raise exception 'Registration is too large';end if;
  select * into package from public.workspace_records where id=(p_data->>'training_package_id')::uuid and kind='training' and status='published';
  if package.id is null then raise exception 'Select a published training package';end if;
  if length(btrim(coalesce(p_data->>'name','')))=0 or length(btrim(coalesce(p_data->>'version','')))=0
    or coalesce(p_data->>'artifact_checksum','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_data->>'artifact_uri','') !~ '^(https://|supabase://)'
    or manifest->>'model_version' is distinct from p_data->>'version'
    or jsonb_typeof(manifest->'files') is distinct from 'object' or manifest->'files'='{}'::jsonb
    or length(btrim(coalesce(p_data->>'review_notes','')))<3 then raise exception 'Provide the real artifact URI, checksum, package manifest and review notes';end if;
  if exists(select 1 from jsonb_each_text(manifest->'files') where value !~ '^[a-f0-9]{64}$' or key like '%..%' or key like '/%') then raise exception 'Invalid artifact manifest';end if;
  if jsonb_typeof(evaluations) is distinct from 'object' then raise exception 'Import the measured evaluation report';end if;
  foreach metric in array array[evaluations->'en_to_fil',evaluations->'fil_to_en'] loop
    if metric is null or coalesce((metric->>'sample_count')::integer,0)<=0
      or (metric->>'sacrebleu') is null or (metric->>'sacrebleu')::numeric not between 0 and 100
      or (metric->>'chrf') is null or (metric->>'chrf')::numeric not between 0 and 100 then raise exception 'Both directions need measured BLEU, chrF and a positive sample count';end if;
  end loop;
  insert into public.translation_datasets(id,name,description,created_by) values(dataset_id,package.title,'Frozen source from reviewed training package',auth.uid());
  insert into public.dataset_snapshots(id,dataset_id,version,checksum_sha256,random_seed,train_ratio,validation_ratio,test_ratio,created_by)
    values(snapshot_id,dataset_id,1,package.data->>'dataset_checksum',42,.8,.1,.1,auth.uid());
  for pair in select value from jsonb_array_elements(package.data->'dataset'->'pairs') loop
    insert into public.translation_pair_revisions(dataset_id,revision_number,english,filipino,source,license,review_state,created_by)
      values(dataset_id,1,pair->>'en',pair->>'fil',package.data->'dataset'->>'source_url',package.data->'dataset'->>'license','approved',auth.uid()) returning id into revision_id;
    insert into public.dataset_snapshot_pairs(snapshot_id,pair_revision_id) values(snapshot_id,revision_id);
  end loop;
  insert into public.training_runs(id,snapshot_id,configuration,status,checkpoint_uri,completed_at,created_by)
    values(run_id,snapshot_id,jsonb_build_object('package_id',package.id,'manifest',manifest),'completed',p_data->>'artifact_uri',now(),auth.uid());
  insert into public.model_versions(id,training_run_id,name,version,artifact_uri,artifact_checksum,dataset_snapshot_id,training_configuration)
    values(model_id,run_id,btrim(p_data->>'name'),p_data->>'version',p_data->>'artifact_uri',p_data->>'artifact_checksum',snapshot_id,jsonb_build_object('manifest',manifest,'package_id',package.id));
  for metric in select value||jsonb_build_object('direction',key) from jsonb_each(evaluations) where key in ('en_to_fil','fil_to_en') loop
    insert into public.model_evaluations(model_version_id,direction,sacrebleu,chrf,sample_count,latency_ms_p50,latency_ms_p95,human_review,reviewed_by)
      values(model_id,metric->>'direction',(metric->>'sacrebleu')::numeric,(metric->>'chrf')::numeric,(metric->>'sample_count')::integer,
      (metric->>'latency_ms_p50')::numeric,(metric->>'latency_ms_p95')::numeric,jsonb_build_object('notes',p_data->>'review_notes'),auth.uid());
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'trained_model_registered','model_version',model_id);
  return model_id;
end $$;
create function public.register_trained_model(p_data jsonb) returns uuid language sql security invoker set search_path='' as $$select private.register_trained_model(p_data)$$;

create function private.approve_trained_model(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_active_administrator() then raise exception 'Administrator access required' using errcode='42501';end if;
  perform 1 from public.model_versions where id=p_id and state='candidate' for update;
  if not found then raise exception 'Only candidate models can be approved';end if;
  if (select count(*) from public.model_evaluations where model_version_id=p_id and sample_count>0 and sacrebleu between 0 and 100 and chrf between 0 and 100 and length(btrim(human_review->>'notes'))>=3)<>2 then raise exception 'Both directions need evaluation and human review';end if;
  update public.model_versions set state='approved',approved_by=auth.uid(),approved_at=now() where id=p_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'trained_model_approved','model_version',p_id);
end $$;
create function public.approve_trained_model(p_id uuid) returns void language sql security invoker set search_path='' as $$select private.approve_trained_model(p_id)$$;

-- Client mutations use the checked RPCs; administrator permissions never come from metadata.
revoke insert,update,delete on public.model_versions,public.model_evaluations from authenticated;
do $$ declare f record; begin
  for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname in ('workspace_snapshot','save_learning_material','save_workspace_record','set_material_favorite','review_learning_material','register_trained_model','approve_trained_model') loop
    execute format('revoke all on function %I.%I(%s) from public,anon',f.nspname,f.proname,f.args);
    execute format('grant execute on function %I.%I(%s) to authenticated',f.nspname,f.proname,f.args);
  end loop;
end $$;

-- Legacy resource details must inherit the parent's visibility boundary.
do $$ declare t text; begin
  foreach t in array array['resource_competencies','lessons','lesson_steps','stories','story_pages'] loop
    execute format('drop policy %I on public.%I',t||'_read',t);
    execute format('create policy %I on public.%I for select to authenticated using (private.current_account_role() is not null and exists(select 1 from public.resources r where r.id=resource_id))',t||'_read',t);
  end loop;
end $$;
drop policy teaching_storage_read on storage.objects;
create policy teaching_storage_read on storage.objects for select to authenticated using(
  bucket_id='teaching-resources' and private.current_account_role() is not null and
  ((storage.foldername(name))[1]=auth.uid()::text or private.is_active_administrator()));
notify pgrst,'reload schema';
