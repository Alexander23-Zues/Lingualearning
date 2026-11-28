-- One permanent educator per grade. Historical student IDs and attempts are retained.
alter table public.profiles add column registered_grade smallint;
alter table public.profiles add column retired_at timestamptz;
alter table public.profiles add constraint registered_grade_matches_profile
  check(registered_grade is null or (registered_grade between 1 and 6 and grade_levels=array[registered_grade]::smallint[]));
update public.profiles p set retired_at=u.deleted_at from auth.users u where u.id=p.id and u.deleted_at is not null;
update public.profiles set registered_grade=grade_levels[1]
  where role='educator' and retired_at is null and cardinality(grade_levels)=1;
create unique index one_educator_per_registered_grade on public.profiles(registered_grade)
  where role='educator' and retired_at is null and registered_grade is not null;

-- Only six non-personal availability flags are public; accounts and emails stay private.
create table public.educator_grade_availability (
  grade_level smallint primary key check(grade_level between 1 and 6),
  occupied boolean not null default false
);
alter table public.educator_grade_availability enable row level security;
revoke all on public.educator_grade_availability from public,anon,authenticated;
grant select(grade_level,occupied) on public.educator_grade_availability to anon,authenticated;
grant all on public.educator_grade_availability to service_role;
create policy registration_grade_flags on public.educator_grade_availability for select to anon,authenticated using(true);
insert into public.educator_grade_availability(grade_level,occupied)
select g,exists(select 1 from public.profiles p where p.registered_grade=g and p.role='educator' and p.retired_at is null)
from generate_series(1,6) g;

create function private.grade_allowed(p_grade integer) returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.retired_at is null
    and (p.role='administrator' or p_grade=any(p.grade_levels)))
$$;
revoke all on function private.grade_allowed(integer) from public,anon;
grant execute on function private.grade_allowed(integer) to authenticated;

-- Internal triggers only: clients cannot write availability flags or transfer classrooms.
create function private.refresh_grade_flags() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform grade_level from public.educator_grade_availability order by grade_level for update;
  update public.educator_grade_availability a set occupied=exists(
    select 1 from public.profiles p where p.registered_grade=a.grade_level and p.role='educator' and p.retired_at is null);
  return null;
end $$;
revoke all on function private.refresh_grade_flags() from public,anon,authenticated;
create trigger refresh_registration_grades after insert or update of registered_grade,retired_at,role or delete on public.profiles
  for each row execute function private.refresh_grade_flags();

create function private.assign_retired_classroom(p_teacher uuid) returns void language plpgsql security invoker set search_path='' as $$
declare g smallint; moved integer;
begin
  select p.registered_grade into g from public.profiles p join auth.users u on u.id=p.id
    where p.id=p_teacher and p.role='educator' and p.status='active' and p.retired_at is null
      and u.deleted_at is null and u.email_confirmed_at is not null;
  if g is null then return;end if;
  update private.child_learning_sessions s set revoked_at=now() from public.child_profiles c join public.profiles p on p.id=c.adult_id
    where s.child_id=c.id and c.grade_level=g and p.role='educator' and p.retired_at is not null and s.revoked_at is null;
  update public.child_profiles c set adult_id=p_teacher,updated_at=now() from public.profiles p
    where p.id=c.adult_id and p.role='educator' and p.retired_at is not null and c.grade_level=g;
  get diagnostics moved=row_count;
  update public.workspace_records r set owner_id=p_teacher,updated_at=now() from public.profiles p
    where p.id=r.owner_id and p.role='educator' and p.retired_at is not null
      and r.kind in ('plan','session') and r.data->>'grade_level'=g::text;
  update public.learning_materials m set owner_id=p_teacher,updated_at=now() from public.profiles p
    where p.id=m.owner_id and p.role='educator' and p.retired_at is not null and m.grade_level=g;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(p_teacher,'grade_classroom_assigned','profile',p_teacher,jsonb_build_object('grade',g,'retained_students',moved));
end $$;
revoke all on function private.assign_retired_classroom(uuid) from public,anon,authenticated;

create function private.auth_grade_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.profiles set retired_at=new.deleted_at where id=new.id;
    update private.child_learning_sessions s set revoked_at=now() from public.child_profiles c
      where c.id=s.child_id and c.adult_id=new.id and s.revoked_at is null;
  end if;
  if new.email_confirmed_at is not null and old.email_confirmed_at is null and new.deleted_at is null then
    perform private.assign_retired_classroom(new.id);
  end if;
  return new;
end $$;
revoke all on function private.auth_grade_lifecycle() from public,anon,authenticated;
create trigger auth_grade_lifecycle after update of deleted_at,email_confirmed_at on auth.users
  for each row execute function private.auth_grade_lifecycle();


CREATE OR REPLACE FUNCTION public.prevent_profile_security_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if coalesce(current_setting('app.allow_security_profile_update', true), 'false') <> 'true'
     and (new.role is distinct from old.role or new.status is distinct from old.status
       or new.grade_levels is distinct from old.grade_levels or new.registered_grade is distinct from old.registered_grade
       or new.retired_at is distinct from old.retired_at) then
    raise exception 'Role, status, and assigned grade changes require an administrator workflow';
  end if;
  new.id := old.id;
  new.email := old.email;
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare selected jsonb:=coalesce(new.raw_user_meta_data->'grade_levels','[]'::jsonb); g smallint; invitation boolean;
begin
  select exists(select 1 from private.initial_administrator_invitation i where lower(i.email)=lower(new.email)
    and i.claimed_by is null and i.expires_at>now()) into invitation;
  if not invitation then
    if jsonb_typeof(selected) is distinct from 'array' or jsonb_array_length(selected)<>1 then
      raise exception 'Choose exactly one permanent grade for this educator account' using errcode='22023';end if;
    g:=(selected->>0)::smallint;
    if g not between 1 and 6 then raise exception 'Choose Grade 1 to 6' using errcode='22023';end if;
  else selected:='[]'::jsonb;end if;
  insert into public.profiles(id,email,name,role,school_name,grade_levels,registered_grade)
  values(new.id,coalesce(new.email,''),coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),'Educator'),'educator',
    nullif(btrim(new.raw_user_meta_data->>'school_name'),''),
    case when invitation then '{}'::smallint[] else array[g]::smallint[] end,g);
  insert into public.educator_preferences(educator_id) values(new.id);
  if new.email_confirmed_at is not null then perform private.assign_retired_classroom(new.id);end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION private.open_child_session(p_child_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_child public.child_profiles; v_token text:=encode(extensions.gen_random_bytes(32),'hex');
begin
  select * into v_child from public.child_profiles where id=p_child_id and active;
  if private.current_account_role() is null or v_child.id is null or
    (v_child.adult_id<>auth.uid() and not private.is_active_administrator()) or not private.grade_allowed(v_child.grade_level) then
    raise exception 'An authorized adult must open this learning profile' using errcode='42501'; end if;
  insert into private.child_learning_sessions(child_id,token_hash)
  values(v_child.id,encode(extensions.digest(v_token,'sha256'),'hex'));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'student_session_opened','child_profile',v_child.id,'{}');
  return jsonb_build_object('token',v_token,'child',to_jsonb(v_child)-'adult_id'-'created_at'-'updated_at'-'gender','expires_in',7200);
end $function$;

CREATE OR REPLACE FUNCTION private.resolve_child_session(p_token text)
 RETURNS child_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_child public.child_profiles;
begin
  if p_token is null or length(p_token)<>64 then raise exception 'Ask an adult to reopen your learning profile' using errcode='42501'; end if;
  select c.* into v_child from private.child_learning_sessions s join public.child_profiles c on c.id=s.child_id
    join public.profiles p on p.id=c.adult_id where s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and s.revoked_at is null and s.expires_at>now() and c.active and p.status='active' and p.retired_at is null
    and (p.role='administrator' or c.grade_level=any(p.grade_levels));
  if v_child.id is null then raise exception 'Ask an adult to reopen your learning profile' using errcode='42501'; end if;
  return v_child;
end $function$;

CREATE OR REPLACE FUNCTION private.learning_material_editor(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_m public.learning_materials; v_a jsonb;
begin
  select * into v_m from public.learning_materials where id=p_id;
  if private.current_account_role() is null or (v_m.owner_id is distinct from auth.uid() and not private.is_active_administrator()) or not private.grade_allowed(v_m.grade_level) then
    raise exception 'Material owner or administrator required' using errcode='42501'; end if;
  select answers into v_a from private.material_answers where material_id=p_id;
  if v_m.kind='quiz' then
    v_m.body:=jsonb_build_object('questions',(select jsonb_agg(q||jsonb_build_object('correct_option_id',v_a->>(q->>'id')))
      from jsonb_array_elements(v_m.body->'questions') q));
  end if;
  return to_jsonb(v_m);
end $function$;

CREATE OR REPLACE FUNCTION private.save_child_profile(p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); v_old public.child_profiles; v_gender text;
begin
  if private.current_account_role() is null then raise exception 'An authorized adult must create child profiles' using errcode='42501'; end if;
  if p_data-array['nickname','avatar_key','grade_level','learning_level','preferences','active','gender']<>'{}'::jsonb then
    raise exception 'Only nickname, preset avatar, grade, gender, learning level, and preferences are accepted'; end if;
  if p_id is not null then
    select * into v_old from public.child_profiles where id=p_id for update;
    if v_old.id is null or (v_old.adult_id<>auth.uid() and not private.is_active_administrator()) then
      raise exception 'This child profile belongs to another adult' using errcode='42501'; end if;
  end if;
  if not private.grade_allowed((p_data->>'grade_level')::integer) then raise exception 'This account can use only its assigned grade' using errcode='42501';end if;
  v_gender := case when p_data ? 'gender' then p_data->>'gender' else v_old.gender end;
  if v_gender is not null and v_gender not in ('male', 'female') then
    raise exception 'Choose Male, Female, or Not specified' using errcode='22023';
  end if;
  insert into public.child_profiles(id,adult_id,nickname,avatar_key,grade_level,learning_level,preferences,active,gender)
  values(v_id,coalesce(v_old.adult_id,auth.uid()),btrim(p_data->>'nickname'),p_data->>'avatar_key',
    (p_data->>'grade_level')::smallint,p_data->>'learning_level',coalesce(p_data->'preferences','{}'),coalesce((p_data->>'active')::boolean,true),v_gender)
  on conflict(id) do update set nickname=excluded.nickname,avatar_key=excluded.avatar_key,grade_level=excluded.grade_level,
    learning_level=excluded.learning_level,preferences=excluded.preferences,active=excluded.active,gender=excluded.gender,updated_at=now();
  if not coalesce((p_data->>'active')::boolean,true) then
    update private.child_learning_sessions set revoked_at=now() where child_id=v_id and revoked_at is null;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),case when p_id is null then 'child_profile_created' else 'child_profile_updated' end,'child_profile',v_id,'{}');
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION private.save_learning_material_content(p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_admin boolean:=private.is_active_administrator();
  v_id uuid:=coalesce(p_id,gen_random_uuid()); v_old public.learning_materials;
  v_body jsonb:=coalesce(p_data->'body','{}'); v_clean jsonb; v_answers jsonb:='{}';
  v_q jsonb; v_kind text:=p_data->>'kind'; v_status text:=coalesce(p_data->>'status','draft');
begin
  if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501'; end if;
  if not private.grade_allowed((p_data->>'grade_level')::integer) then raise exception 'This account can use only its assigned grade' using errcode='42501';end if;
  if p_id is not null then
    select * into v_old from public.learning_materials where id=p_id for update;
    if v_old.id is null or (v_old.owner_id is distinct from v_uid and not v_admin) then
      raise exception 'You can edit only your own materials' using errcode='42501'; end if;
    if v_old.status='published' and not v_admin then raise exception 'Published resources are read-only for educators' using errcode='42501'; end if;
  end if;
  if not v_admin and v_status='published' then raise exception 'Administrator review is required before public publication' using errcode='42501'; end if;
  if pg_column_size(v_body)>150000 then raise exception 'Learning content is too large'; end if;
  if v_kind='quiz' then
    if jsonb_typeof(v_body->'questions') is distinct from 'array' or jsonb_array_length(v_body->'questions') not between 1 and 50 then
      raise exception 'A quiz needs 1 to 50 questions'; end if;
    v_clean:='[]';
    for v_q in select value from jsonb_array_elements(v_body->'questions') loop
      perform (v_q->>'id')::uuid;
      if length(btrim(coalesce(v_q->>'prompt','')))=0 or jsonb_typeof(v_q->'options') is distinct from 'array'
        or jsonb_array_length(v_q->'options') not between 2 and 4 then raise exception 'Each question needs a prompt and 2 to 4 options'; end if;
      if not exists(select 1 from jsonb_array_elements(v_q->'options') o where o->>'id'=v_q->>'correct_option_id') then
        raise exception 'A correct option is required'; end if;
      v_answers:=v_answers||jsonb_build_object(v_q->>'id',v_q->>'correct_option_id');
      v_clean:=v_clean||jsonb_build_array(v_q-'correct_option_id');
    end loop;
    v_body:=jsonb_build_object('questions',v_clean);
  elsif v_kind in ('dictionary','vocabulary','game') then
    if jsonb_typeof(v_body->'pairs') is distinct from 'array' or jsonb_array_length(v_body->'pairs') not between 1 and 100 then
      raise exception 'Add between 1 and 100 English–Filipino word pairs'; end if;
    if exists(select 1 from jsonb_array_elements(v_body->'pairs') p where length(btrim(coalesce(p->>'en','')))=0 or length(btrim(coalesce(p->>'fil','')))=0) then
      raise exception 'Every pair needs an English and Filipino word'; end if;
  elsif v_kind='story' then
    if jsonb_typeof(v_body->'pages') is distinct from 'array' or jsonb_array_length(v_body->'pages') not between 1 and 30 then raise exception 'Add 1 to 30 story pages'; end if;
  elsif v_kind='lesson' then
    if length(btrim(coalesce(v_body->>'english','')||coalesce(v_body->>'filipino','')))=0 then raise exception 'Add lesson content'; end if;
  else raise exception 'Unsupported learning material'; end if;
  if v_old.id is null then
    insert into public.learning_materials(id,owner_id,kind,title,grade_level,learning_level,summary,body,status)
    values(v_id,v_uid,v_kind,btrim(p_data->>'title'),(p_data->>'grade_level')::smallint,
      coalesce(p_data->>'learning_level','beginner'),coalesce(p_data->>'summary',''),v_body,v_status);
  else
    update public.learning_materials set kind=v_kind,title=btrim(p_data->>'title'),
      grade_level=(p_data->>'grade_level')::smallint,learning_level=coalesce(p_data->>'learning_level','beginner'),
      summary=coalesce(p_data->>'summary',''),body=v_body,status=v_status,version=version+1,updated_at=now()
      where id=v_id;
  end if;
  insert into private.material_answers(material_id,answers) values(v_id,v_answers)
    on conflict(material_id) do update set answers=excluded.answers;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_uid,'learning_material_saved','learning_material',v_id,jsonb_build_object('kind',v_kind,'status',v_status));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION private.save_workspace_record_content(p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); v_old public.workspace_records; v_kind text:=p_data->>'kind';
begin
  if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501'; end if;
  if v_kind in ('curriculum','dataset','training','announcement') and not private.is_active_administrator() then
    raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_id is not null then
    select * into v_old from public.workspace_records where id=p_id for update;
    if v_old.id is null or (v_old.owner_id<>auth.uid() and not private.is_active_administrator()) then
      raise exception 'Record ownership mismatch' using errcode='42501'; end if;
  end if;
  if v_kind in ('plan','session') and not private.grade_allowed((p_data#>>'{data,grade_level}')::integer) then raise exception 'This account can use only its assigned grade' using errcode='42501';end if;
  if pg_column_size(p_data->'data') > (case when v_kind in ('dataset','training') then 10000000 else 300000 end) then raise exception 'Record is too large'; end if;
  insert into public.workspace_records(id,owner_id,kind,title,data,status)
  values(v_id,coalesce(v_old.owner_id,auth.uid()),v_kind,btrim(p_data->>'title'),coalesce(p_data->'data','{}'),coalesce(p_data->>'status','draft'))
  on conflict(id) do update set title=excluded.title,data=excluded.data,status=excluded.status,updated_at=now();
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'workspace_record_saved',v_kind,v_id,jsonb_build_object('status',coalesce(p_data->>'status','draft')));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION private.workspace_snapshot_core()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_admin boolean:=private.is_active_administrator();
begin
  if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501'; end if;
  return jsonb_build_object(
    'materials',coalesce((select jsonb_agg(to_jsonb(m) order by m.updated_at desc) from public.learning_materials m
      where (m.owner_id=v_uid or v_admin or m.status='published') and private.grade_allowed(m.grade_level)),'[]'::jsonb),
    'records',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'owner_id',r.owner_id,'kind',r.kind,'title',r.title,
      'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at,
      'details_deferred',r.kind in ('dataset','training'),
      'data',case
        when r.kind='dataset' then (r.data-'pairs')||jsonb_build_object(
          'pair_count',case when jsonb_typeof(r.data->'pairs')='array'
            then jsonb_array_length(r.data->'pairs') else 0 end)
        when r.kind='training' and jsonb_typeof(r.data->'dataset')='object' then
          jsonb_set(r.data,'{dataset}',((r.data->'dataset')-'pairs')||jsonb_build_object(
            'pair_count',case when jsonb_typeof(r.data#>'{dataset,pairs}')='array'
              then jsonb_array_length(r.data#>'{dataset,pairs}') else 0 end))
        else r.data end
      ) order by r.updated_at desc) from public.workspace_records r
      where (r.owner_id=v_uid or v_admin or (r.kind in ('curriculum','announcement') and r.status='published'))
      and (not(r.data?'grade_level') or private.grade_allowed((r.data->>'grade_level')::integer))),'[]'::jsonb),
    'children',coalesce((select jsonb_agg(to_jsonb(c) order by c.nickname) from public.child_profiles c
      where (c.adult_id=v_uid or v_admin) and private.grade_allowed(c.grade_level)),'[]'::jsonb),
    'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.completed_at desc) from public.learning_attempts a
      join public.child_profiles c on c.id=a.child_id where (c.adult_id=v_uid or v_admin) and private.grade_allowed(c.grade_level) and private.grade_allowed(a.grade_level)),'[]'::jsonb),
    'educators',case when v_admin then coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'email',p.email,'role',p.role,'status',p.status,'created_at',p.created_at)
      order by p.created_at desc) from public.profiles p),'[]'::jsonb) else '[]'::jsonb end,
    'models',case when v_admin then coalesce((select jsonb_agg(to_jsonb(m)) from public.model_versions m),'[]'::jsonb) else '[]'::jsonb end,
    'active_model',(select jsonb_build_object('name',name,'version',version) from public.model_versions where state='active' limit 1)
  );
end $function$;

CREATE OR REPLACE FUNCTION private.save_workspace_record(p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if jsonb_typeof(content->'pairs') is distinct from 'array' or jsonb_array_length(content->'pairs') not between 1 and 50000
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
end $function$;

CREATE OR REPLACE FUNCTION private.save_learning_material(p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;

create or replace function private.current_account_role() returns public.account_role language sql stable security definer set search_path='' as $$
  select role from public.profiles where id=(select auth.uid()) and status='active' and retired_at is null
$$;
create policy material_assigned_grade on public.learning_materials as restrictive for select to authenticated using(private.grade_allowed(grade_level));
create policy child_assigned_grade on public.child_profiles as restrictive for select to authenticated using(private.grade_allowed(grade_level));
create policy attempts_assigned_grade on public.learning_attempts as restrictive for select to authenticated using(private.grade_allowed(grade_level));
create policy records_assigned_grade on public.workspace_records as restrictive for select to authenticated
  using(not(data?'grade_level') or private.grade_allowed((data->>'grade_level')::integer));
create policy resources_assigned_grade on public.resources as restrictive for all to authenticated
  using(private.grade_allowed(grade_level)) with check(private.grade_allowed(grade_level));
create policy plans_assigned_grade on public.teaching_plans as restrictive for all to authenticated
  using(private.grade_allowed(grade_level)) with check(private.grade_allowed(grade_level));
create policy sessions_assigned_grade on public.classroom_sessions as restrictive for all to authenticated
  using(private.grade_allowed(grade_level)) with check(private.grade_allowed(grade_level));


