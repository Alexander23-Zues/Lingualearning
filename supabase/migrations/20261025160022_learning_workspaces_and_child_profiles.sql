create table public.learning_materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id),
  kind text not null check(kind in ('lesson','dictionary','game','quiz','story','vocabulary')),
  title text not null check(length(btrim(title)) between 1 and 160),
  grade_level smallint not null check(grade_level between 1 and 6),
  learning_level text not null default 'beginner' check(learning_level in ('beginner','developing','independent')),
  summary text not null default '' check(length(summary)<=600),
  source_label text not null default 'Original supplemental enrichment',
  body jsonb not null default '{}',
  status text not null default 'draft' check(status in ('draft','classroom','submitted','published','archived')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table private.material_answers (
  material_id uuid primary key references public.learning_materials(id) on delete cascade,
  answers jsonb not null default '{}'
);
create table public.workspace_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  kind text not null check(kind in ('plan','session','curriculum','dataset','training','announcement')),
  title text not null check(length(btrim(title)) between 1 and 180),
  data jsonb not null default '{}',
  status text not null default 'draft' check(status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.child_profiles (
  id uuid primary key default gen_random_uuid(),
  adult_id uuid not null references public.profiles(id),
  nickname text not null check(length(btrim(nickname)) between 1 and 40),
  avatar_key text not null check(avatar_key in ('tarsier','owl','turtle','butterfly','cat','star')),
  grade_level smallint not null check(grade_level between 1 and 6),
  learning_level text not null check(learning_level in ('beginner','developing','independent')),
  preferences jsonb not null default '{"language":"bilingual","sound":true,"reduced_motion":false}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minimal_child_preferences check (
    jsonb_typeof(preferences)='object'
    and preferences - array['language','sound','reduced_motion'] = '{}'::jsonb
    and coalesce(preferences->>'language','bilingual') in ('en','fil','bilingual')
    and (not preferences?'sound' or jsonb_typeof(preferences->'sound')='boolean')
    and (not preferences?'reduced_motion' or jsonb_typeof(preferences->'reduced_motion')='boolean')
  )
);
create table private.child_learning_sessions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.child_profiles(id),
  token_hash text not null unique,
  expires_at timestamptz not null default now()+interval '2 hours',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.learning_attempts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique,
  child_id uuid not null references public.child_profiles(id),
  material_id uuid not null references public.learning_materials(id),
  material_version integer not null,
  correct_count integer not null,
  total_count integer not null,
  stars integer not null check(stars between 0 and 3),
  completed_at timestamptz not null default now()
);
create table public.saved_child_vocabulary (
  child_id uuid not null references public.child_profiles(id),
  material_id uuid not null references public.learning_materials(id),
  saved_at timestamptz not null default now(),
  primary key(child_id,material_id)
);
create index learning_materials_browse on public.learning_materials(status,grade_level,kind);
create index child_profiles_adult on public.child_profiles(adult_id);
create index learning_attempts_child on public.learning_attempts(child_id,completed_at desc);
create index learning_attempts_material on public.learning_attempts(material_id);
create index workspace_records_owner on public.workspace_records(owner_id,kind);

alter table public.learning_materials enable row level security;
alter table public.workspace_records enable row level security;
alter table public.child_profiles enable row level security;
alter table public.learning_attempts enable row level security;
alter table public.saved_child_vocabulary enable row level security;
alter table private.material_answers enable row level security;
alter table private.child_learning_sessions enable row level security;
revoke all on public.learning_materials,public.workspace_records,public.child_profiles,
  public.learning_attempts,public.saved_child_vocabulary from anon,authenticated;
revoke all on private.material_answers,private.child_learning_sessions from public,anon,authenticated;
grant select on public.learning_materials,public.workspace_records,public.child_profiles,
  public.learning_attempts,public.saved_child_vocabulary to authenticated;
create policy materials_adult_read on public.learning_materials for select to authenticated
using(private.current_account_role() is not null and
  (owner_id=auth.uid() or private.is_active_administrator() or status='published'));
create policy records_adult_read on public.workspace_records for select to authenticated
using(private.current_account_role() is not null and (owner_id=auth.uid()
  or private.is_active_administrator() or (kind in ('curriculum','announcement') and status='published')));
create policy children_authorized_adult on public.child_profiles for select to authenticated
using(private.current_account_role() is not null and (adult_id=auth.uid() or private.is_active_administrator()));
create policy attempts_authorized_adult on public.learning_attempts for select to authenticated
using(exists(select 1 from public.child_profiles c where c.id=child_id
  and private.current_account_role() is not null and (c.adult_id=auth.uid() or private.is_active_administrator())));
create policy vocabulary_authorized_adult on public.saved_child_vocabulary for select to authenticated
using(exists(select 1 from public.child_profiles c where c.id=child_id
  and private.current_account_role() is not null and (c.adult_id=auth.uid() or private.is_active_administrator())));

create function private.workspace_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_admin boolean:=private.is_active_administrator();
begin
  if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501'; end if;
  return jsonb_build_object(
    'materials',coalesce((select jsonb_agg(to_jsonb(m) order by m.updated_at desc) from public.learning_materials m
      where m.owner_id=v_uid or v_admin or m.status='published'),'[]'::jsonb),
    'records',coalesce((select jsonb_agg(to_jsonb(r) order by r.updated_at desc) from public.workspace_records r
      where r.owner_id=v_uid or v_admin or (r.kind in ('curriculum','announcement') and r.status='published')),'[]'::jsonb),
    'children',coalesce((select jsonb_agg(to_jsonb(c) order by c.nickname) from public.child_profiles c
      where c.adult_id=v_uid or v_admin),'[]'::jsonb),
    'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.completed_at desc) from public.learning_attempts a
      join public.child_profiles c on c.id=a.child_id where c.adult_id=v_uid or v_admin),'[]'::jsonb),
    'educators',case when v_admin then coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'email',p.email,'role',p.role,'status',p.status,'created_at',p.created_at)
      order by p.created_at desc) from public.profiles p),'[]'::jsonb) else '[]'::jsonb end,
    'models',case when v_admin then coalesce((select jsonb_agg(to_jsonb(m)) from public.model_versions m),'[]'::jsonb) else '[]'::jsonb end,
    'active_model',(select jsonb_build_object('name',name,'version',version) from public.model_versions where state='active' limit 1)
  );
end $$;

create function private.save_learning_material(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_admin boolean:=private.is_active_administrator();
  v_id uuid:=coalesce(p_id,gen_random_uuid()); v_old public.learning_materials;
  v_body jsonb:=coalesce(p_data->'body','{}'); v_clean jsonb; v_answers jsonb:='{}';
  v_q jsonb; v_kind text:=p_data->>'kind'; v_status text:=coalesce(p_data->>'status','draft');
begin
  if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501'; end if;
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
  insert into public.learning_materials(id,owner_id,kind,title,grade_level,learning_level,summary,body,status)
  values(v_id,coalesce(v_old.owner_id,v_uid),v_kind,btrim(p_data->>'title'),(p_data->>'grade_level')::smallint,
    coalesce(p_data->>'learning_level','beginner'),coalesce(p_data->>'summary',''),v_body,v_status)
  on conflict(id) do update set kind=excluded.kind,title=excluded.title,grade_level=excluded.grade_level,
    learning_level=excluded.learning_level,summary=excluded.summary,body=excluded.body,status=excluded.status,
    version=public.learning_materials.version+1,updated_at=now();
  insert into private.material_answers(material_id,answers) values(v_id,v_answers)
    on conflict(material_id) do update set answers=excluded.answers;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_uid,'learning_material_saved','learning_material',v_id,jsonb_build_object('kind',v_kind,'status',v_status));
  return v_id;
end $$;

create function private.learning_material_editor(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_m public.learning_materials; v_a jsonb;
begin
  select * into v_m from public.learning_materials where id=p_id;
  if private.current_account_role() is null or (v_m.owner_id is distinct from auth.uid() and not private.is_active_administrator()) then
    raise exception 'Material owner or administrator required' using errcode='42501'; end if;
  select answers into v_a from private.material_answers where material_id=p_id;
  if v_m.kind='quiz' then
    v_m.body:=jsonb_build_object('questions',(select jsonb_agg(q||jsonb_build_object('correct_option_id',v_a->>(q->>'id')))
      from jsonb_array_elements(v_m.body->'questions') q));
  end if;
  return to_jsonb(v_m);
end $$;

create function private.save_workspace_record(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
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
  if pg_column_size(p_data->'data')>300000 then raise exception 'Record is too large'; end if;
  insert into public.workspace_records(id,owner_id,kind,title,data,status)
  values(v_id,coalesce(v_old.owner_id,auth.uid()),v_kind,btrim(p_data->>'title'),coalesce(p_data->'data','{}'),coalesce(p_data->>'status','draft'))
  on conflict(id) do update set title=excluded.title,data=excluded.data,status=excluded.status,updated_at=now();
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'workspace_record_saved',v_kind,v_id,jsonb_build_object('status',coalesce(p_data->>'status','draft')));
  return v_id;
end $$;

create function private.save_child_profile(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); v_old public.child_profiles;
begin
  if private.current_account_role() is null then raise exception 'An authorized adult must create child profiles' using errcode='42501'; end if;
  if p_data-array['nickname','avatar_key','grade_level','learning_level','preferences','active']<>'{}'::jsonb then
    raise exception 'Only nickname, preset avatar, grade, learning level, and preferences are accepted'; end if;
  if p_id is not null then
    select * into v_old from public.child_profiles where id=p_id for update;
    if v_old.id is null or (v_old.adult_id<>auth.uid() and not private.is_active_administrator()) then
      raise exception 'This child profile belongs to another adult' using errcode='42501'; end if;
  end if;
  insert into public.child_profiles(id,adult_id,nickname,avatar_key,grade_level,learning_level,preferences,active)
  values(v_id,coalesce(v_old.adult_id,auth.uid()),btrim(p_data->>'nickname'),p_data->>'avatar_key',
    (p_data->>'grade_level')::smallint,p_data->>'learning_level',coalesce(p_data->'preferences','{}'),coalesce((p_data->>'active')::boolean,true))
  on conflict(id) do update set nickname=excluded.nickname,avatar_key=excluded.avatar_key,grade_level=excluded.grade_level,
    learning_level=excluded.learning_level,preferences=excluded.preferences,active=excluded.active,updated_at=now();
  if not coalesce((p_data->>'active')::boolean,true) then
    update private.child_learning_sessions set revoked_at=now() where child_id=v_id and revoked_at is null;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),case when p_id is null then 'child_profile_created' else 'child_profile_updated' end,'child_profile',v_id,'{}');
  return v_id;
end $$;

create function private.open_child_session(p_child_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_child public.child_profiles; v_token text:=encode(extensions.gen_random_bytes(32),'hex');
begin
  select * into v_child from public.child_profiles where id=p_child_id and active;
  if private.current_account_role() is null or v_child.id is null or
    (v_child.adult_id<>auth.uid() and not private.is_active_administrator()) then
    raise exception 'An authorized adult must open this learning profile' using errcode='42501'; end if;
  insert into private.child_learning_sessions(child_id,token_hash)
  values(v_child.id,encode(extensions.digest(v_token,'sha256'),'hex'));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'student_session_opened','child_profile',v_child.id,'{}');
  return jsonb_build_object('token',v_token,'child',to_jsonb(v_child)-'adult_id'-'created_at'-'updated_at','expires_in',7200);
end $$;

create function private.resolve_child_session(p_token text) returns public.child_profiles
language plpgsql security definer set search_path='' as $$
declare v_child public.child_profiles;
begin
  if p_token is null or length(p_token)<>64 then raise exception 'Ask an adult to reopen your learning profile' using errcode='42501'; end if;
  select c.* into v_child from private.child_learning_sessions s join public.child_profiles c on c.id=s.child_id
    join public.profiles p on p.id=c.adult_id where s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and s.revoked_at is null and s.expires_at>now() and c.active and p.status='active';
  if v_child.id is null then raise exception 'Ask an adult to reopen your learning profile' using errcode='42501'; end if;
  return v_child;
end $$;

create function private.student_learning_state(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_child public.child_profiles:=private.resolve_child_session(p_token); v_stars integer; v_done integer; v_vocab integer;
begin
  select coalesce(sum(stars),0),count(distinct (material_id,material_version)) into v_stars,v_done from public.learning_attempts where child_id=v_child.id;
  select count(*) into v_vocab from public.saved_child_vocabulary where child_id=v_child.id;
  return jsonb_build_object(
    'child',to_jsonb(v_child)-'adult_id'-'created_at'-'updated_at',
    'materials',coalesce((select jsonb_agg(to_jsonb(m)-'owner_id' order by m.kind,m.title) from public.learning_materials m
      where m.grade_level=v_child.grade_level and (m.status='published' or (m.owner_id=v_child.adult_id and m.status='classroom'))),'[]'::jsonb),
    'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.completed_at desc) from public.learning_attempts a where child_id=v_child.id),'[]'::jsonb),
    'saved_vocabulary',coalesce((select jsonb_agg(material_id) from public.saved_child_vocabulary where child_id=v_child.id),'[]'::jsonb),
    'stars',v_stars,'completed',v_done,
    'badges',to_jsonb(array_remove(array[
      case when v_done>=1 then 'First steps' end,
      case when v_done>=5 then 'Learning explorer' end,
      case when v_stars>=15 then 'Star collector' end,
      case when v_vocab>=3 then 'Word collector' end],null)),
    'active_model',(select jsonb_build_object('name',name,'version',version) from public.model_versions where state='active' limit 1));
end $$;

create function private.student_complete_material(p_token text,p_material_id uuid,p_version integer,p_submission_id uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_child public.child_profiles:=private.resolve_child_session(p_token); v_m public.learning_materials;
  v_key jsonb; v_correct integer:=0; v_total integer:=1; v_stars integer:=1; v_result public.learning_attempts;
begin
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended(v_child.id::text||p_material_id::text,0));
  select * into v_result from public.learning_attempts where submission_id=p_submission_id;
  if found then
    if v_result.child_id<>v_child.id or v_result.material_id<>p_material_id then raise exception 'Submission ownership mismatch' using errcode='42501'; end if;
    return to_jsonb(v_result);
  end if;
  select * into v_m from public.learning_materials where id=p_material_id and grade_level=v_child.grade_level
    and (status='published' or (owner_id=v_child.adult_id and status='classroom'));
  if v_m.id is null then raise exception 'This activity is not available for your profile' using errcode='42501'; end if;
  if v_m.version<>p_version then raise exception 'A newer activity is available. Download it again before submitting.'; end if;
  if v_m.kind='quiz' then
    select answers into v_key from private.material_answers where material_id=v_m.id;
    select count(*),count(*) filter(where p_answers->>key=value) into v_total,v_correct from jsonb_each_text(v_key);
    if v_total=0 then raise exception 'Quiz answer key is not ready'; end if;
    v_stars:=case when v_correct=v_total then 3 when v_correct*2>=v_total then 2 else 1 end;
  elsif v_m.kind='game' then
    select count(*),count(*) filter(where p_answers->>(p->>'en')=p->>'fil') into v_total,v_correct from jsonb_array_elements(v_m.body->'pairs') p;
    if v_correct<>v_total then raise exception 'Match every word pair before completing the game'; end if;
    v_stars:=2;
  else v_correct:=1;
  end if;
  -- Replays may be practice, but the same material version earns stars once.
  if exists(select 1 from public.learning_attempts where child_id=v_child.id and material_id=v_m.id and material_version=v_m.version) then v_stars:=0; end if;
  insert into public.learning_attempts(submission_id,child_id,material_id,material_version,correct_count,total_count,stars)
  values(p_submission_id,v_child.id,v_m.id,v_m.version,v_correct,v_total,v_stars) returning * into v_result;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_child.adult_id,'student_material_completed','learning_attempt',v_result.id,jsonb_build_object('child_id',v_child.id,'material_id',v_m.id,'stars',v_stars));
  return to_jsonb(v_result);
end $$;

create function private.student_save_vocabulary(p_token text,p_material_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_child public.child_profiles:=private.resolve_child_session(p_token);
begin
  if not exists(select 1 from public.learning_materials where id=p_material_id and kind in ('dictionary','vocabulary')
    and grade_level=v_child.grade_level and (status='published' or (owner_id=v_child.adult_id and status='classroom'))) then
    raise exception 'Vocabulary is unavailable' using errcode='42501'; end if;
  insert into public.saved_child_vocabulary(child_id,material_id) values(v_child.id,p_material_id) on conflict do nothing;
end $$;

create function private.admin_update_educator(p_id uuid,p_status public.account_status,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_active_administrator() then raise exception 'Administrator required' using errcode='42501'; end if;
  if length(btrim(p_reason))<3 then raise exception 'Give a reason for the change'; end if;
  perform public.admin_set_educator_status(p_id,p_status,p_reason,auth.uid());
end $$;

-- Public endpoints are invokers; only private implementations can cross RLS.
create function public.workspace_snapshot() returns jsonb language sql security invoker set search_path='' as $$select private.workspace_snapshot()$$;
create function public.save_learning_material(p_id uuid,p_data jsonb) returns uuid language sql security invoker set search_path='' as $$select private.save_learning_material(p_id,p_data)$$;
create function public.learning_material_editor(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.learning_material_editor(p_id)$$;
create function public.save_workspace_record(p_id uuid,p_data jsonb) returns uuid language sql security invoker set search_path='' as $$select private.save_workspace_record(p_id,p_data)$$;
create function public.save_child_profile(p_id uuid,p_data jsonb) returns uuid language sql security invoker set search_path='' as $$select private.save_child_profile(p_id,p_data)$$;
create function public.open_child_session(p_child_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.open_child_session(p_child_id)$$;
create function public.student_learning_state(p_token text) returns jsonb language sql security invoker set search_path='' as $$select private.student_learning_state(p_token)$$;
create function public.student_complete_material(p_token text,p_material_id uuid,p_version integer,p_submission_id uuid,p_answers jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.student_complete_material(p_token,p_material_id,p_version,p_submission_id,p_answers)$$;
create function public.student_save_vocabulary(p_token text,p_material_id uuid) returns void language sql security invoker set search_path='' as $$select private.student_save_vocabulary(p_token,p_material_id)$$;
create function public.admin_update_educator(p_id uuid,p_status public.account_status,p_reason text) returns void
language sql security invoker set search_path='' as $$select private.admin_update_educator(p_id,p_status,p_reason)$$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname in ('workspace_snapshot','save_learning_material','learning_material_editor',
      'save_workspace_record','save_child_profile','open_child_session','student_learning_state','student_complete_material',
      'student_save_vocabulary','admin_update_educator','resolve_child_session') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.proname<>'resolve_child_session' then execute format('grant execute on function %s to authenticated',f.signature); end if;
    if f.proname in ('student_learning_state','student_complete_material','student_save_vocabulary') then
      execute format('grant execute on function %s to anon',f.signature);
    end if;
  end loop;
end $$;
grant usage on schema private to anon;

-- Own preferences apply to both authenticated adult roles.
drop policy preferences_owner on public.educator_preferences;
create policy preferences_owner on public.educator_preferences for all to authenticated
using(educator_id=auth.uid() and private.current_account_role() is not null)
with check(educator_id=auth.uid() and private.current_account_role() is not null);

-- Original starter content, clearly supplemental rather than official curriculum.
do $$ declare g integer; qid uuid; aid uuid; bid uuid; mid uuid; pairs jsonb;
begin
  pairs:='[{"en":"sun","fil":"araw"},{"en":"book","fil":"aklat"},{"en":"water","fil":"tubig"},{"en":"tree","fil":"puno"}]';
  for g in 1..6 loop
    insert into public.learning_materials(kind,title,grade_level,summary,source_label,body,status) values
      ('lesson','Hello, learning friends!',g,'Practice greetings and kind words in English and Filipino.','LinguaKids original starter · supplemental enrichment',
        '{"english":"Hello! My name is ____. We say thank you when someone helps us. We say please when we ask for something. Practice saying hello, please, and thank you with your teacher.","filipino":"Kumusta! Ang pangalan ko ay ____. Sinasabi natin ang salamat kapag may tumutulong sa atin. Sinasabi natin ang pakiusap kapag may hinihiling tayo. Magsanay kasama ang iyong guro."}','published'),
      ('dictionary','My first everyday words',g,'Four useful words to read, save, and practice.','LinguaKids original starter · supplemental enrichment',jsonb_build_object('pairs',pairs),'published'),
      ('game','Match the everyday words',g,'Match each English word to its Filipino partner.','LinguaKids original starter · supplemental enrichment',jsonb_build_object('pairs',pairs),'published'),
      ('story','A book under the tree',g,'A short bilingual story about learning together.','LinguaKids original starter · supplemental enrichment',
        '{"pages":[{"english":"The sun is bright. A friend brings a book.","filipino":"Maliwanag ang araw. May dalang aklat ang isang kaibigan.","illustration":"sun"},{"english":"We sit under a tree and read together.","filipino":"Umupo kami sa ilalim ng puno at sabay na nagbasa.","illustration":"tree"},{"english":"We share water and say thank you.","filipino":"Nagbahagi kami ng tubig at nagsabi ng salamat.","illustration":"friends"}]}','published');
    qid:=gen_random_uuid();aid:=gen_random_uuid();bid:=gen_random_uuid();
    insert into public.learning_materials(kind,title,grade_level,summary,source_label,body,status)
    values('quiz','Everyday word check',g,'Choose the Filipino word for book.','LinguaKids original starter · supplemental enrichment',
      jsonb_build_object('questions',jsonb_build_array(jsonb_build_object('id',qid,'prompt','Which word means book?',
        'options',jsonb_build_array(jsonb_build_object('id',aid,'text','aklat'),jsonb_build_object('id',bid,'text','tubig'))))),'published') returning id into mid;
    insert into private.material_answers(material_id,answers) values(mid,jsonb_build_object(qid::text,aid::text));
  end loop;
  insert into public.audit_logs(action,entity_type,metadata) values('starter_collection_installed','learning_material',jsonb_build_object('materials',30,'source','original supplemental enrichment'));
end $$;
notify pgrst,'reload schema';
