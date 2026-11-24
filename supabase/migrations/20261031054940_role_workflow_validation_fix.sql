-- Qualify dataset columns against the record kind variable.
create or replace function private.save_workspace_record(p_id uuid,p_data jsonb) returns uuid
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
    select * into dataset from public.workspace_records r where r.id=(content->>'dataset_id')::uuid and r.kind='dataset' and r.status='published';
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

notify pgrst,'reload schema';
