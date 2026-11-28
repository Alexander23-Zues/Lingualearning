-- Gender is optional for existing and new profiles.
alter table public.child_profiles
  add column gender text constraint child_profiles_gender_check check (gender in ('male', 'female'));

-- Keep the existing ownership, role, and audit checks in the save workflow.
create or replace function private.save_child_profile(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
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
end $$;

-- Gender is for the educator roster and is excluded from student session responses.

create or replace function private.open_child_session(p_child_id uuid) returns jsonb
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
  return jsonb_build_object('token',v_token,'child',to_jsonb(v_child)-'adult_id'-'created_at'-'updated_at'-'gender','expires_in',7200);
end $$;

create or replace function private.student_learning_state(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_child public.child_profiles:=private.resolve_child_session(p_token); v_stars integer; v_done integer; v_vocab integer;
begin
  select coalesce(sum(stars),0),count(distinct (material_id,material_version)) into v_stars,v_done from public.learning_attempts where child_id=v_child.id;
  select count(*) into v_vocab from public.saved_child_vocabulary where child_id=v_child.id;
  return jsonb_build_object(
    'child',to_jsonb(v_child)-'adult_id'-'created_at'-'updated_at'-'gender',
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
