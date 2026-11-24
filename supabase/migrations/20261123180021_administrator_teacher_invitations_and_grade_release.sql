-- Administrator-approved teacher invitations, private review accounts, and grade lifecycle.
alter table public.profiles add column account_kind text not null default 'teacher' check(account_kind in ('teacher','review'));
alter table public.profiles add column teacher_approved_at timestamptz;
alter table public.profiles add column teacher_approved_by uuid references public.profiles(id);
create index profiles_approval_actor on public.profiles(teacher_approved_by);
alter table public.profiles add constraint review_has_no_grade_slot check(account_kind<>'review' or registered_grade is null);
alter table public.child_profiles add column is_demo boolean not null default false;

create table private.teacher_grade_invitations(
 grade_level smallint primary key check(grade_level between 1 and 6),
 approved_email text not null, token_hash text, expires_at timestamptz not null,
 profile_id uuid references public.profiles(id), approved_by uuid not null references public.profiles(id),
 approved_at timestamptz not null default now(), reason text not null check(length(btrim(reason))>=3)
);
create index teacher_invite_profile on private.teacher_grade_invitations(profile_id);
create index teacher_invite_approver on private.teacher_grade_invitations(approved_by);
alter table private.teacher_grade_invitations enable row level security;
revoke all on private.teacher_grade_invitations from public,anon,authenticated;
create table private.review_account_provisioning(
 email text primary key, authorized_by uuid not null references public.profiles(id),
 expires_at timestamptz not null, consumed_at timestamptz
);
create index review_account_authorizer on private.review_account_provisioning(authorized_by);
alter table private.review_account_provisioning enable row level security;
revoke all on private.review_account_provisioning from public,anon,authenticated;

-- Anonymous callers receive one boolean only, and must prove possession of the secret invitation.
create function private.teacher_invitation_valid(p_grade integer,p_email text,p_code text) returns boolean
language sql stable security definer set search_path='' as $$
 select (auth.uid() is null or private.is_active_administrator()) and length(coalesce(p_code,''))=64 and exists(
  select 1 from private.teacher_grade_invitations i where i.grade_level=p_grade
   and i.approved_email=lower(btrim(p_email)) and i.profile_id is null and i.expires_at>now()
   and i.token_hash=encode(extensions.digest(p_code,'sha256'),'hex'))
$$;
revoke all on function private.teacher_invitation_valid(integer,text,text) from public,anon,authenticated;
grant execute on function private.teacher_invitation_valid(integer,text,text) to anon,authenticated;
create function public.teacher_invitation_valid(p_grade integer,p_email text,p_code text) returns boolean
language sql security invoker set search_path='' as $$select private.teacher_invitation_valid(p_grade,p_email,p_code)$$;
revoke all on function public.teacher_invitation_valid(integer,text,text) from public;
grant execute on function public.teacher_invitation_valid(integer,text,text) to anon,authenticated;

create function private.admin_authorize_grade(p_grade integer,p_email text,p_days integer,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare code text:=encode(extensions.gen_random_bytes(32),'hex'); deadline timestamptz; existing private.teacher_grade_invitations;
begin
 if auth.uid() is null or not private.is_active_administrator() then raise exception 'Administrator required' using errcode='42501';end if;
 if p_grade not between 1 and 6 or p_days not between 1 and 30 or length(btrim(coalesce(p_reason,'')))<3
  or lower(btrim(p_email))!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a grade, real teacher email, expiry, and reason' using errcode='22023';end if;
 perform pg_advisory_xact_lock(85943201);
 if exists(select 1 from public.profiles where registered_grade=p_grade and role='educator' and retired_at is null) then
  raise exception 'Release the existing grade registration before inviting a replacement' using errcode='23505';end if;
 select * into existing from private.teacher_grade_invitations where grade_level=p_grade for update;
 if existing.profile_id is not null and exists(select 1 from auth.users where id=existing.profile_id and deleted_at is null) then
  raise exception 'Finish releasing the previous registration first' using errcode='23505';end if;
 deadline:=now()+make_interval(days=>p_days);
 insert into private.teacher_grade_invitations(grade_level,approved_email,token_hash,expires_at,profile_id,approved_by,reason)
 values(p_grade,lower(btrim(p_email)),encode(extensions.digest(code,'sha256'),'hex'),deadline,null,auth.uid(),btrim(p_reason))
 on conflict(grade_level) do update set approved_email=excluded.approved_email,token_hash=excluded.token_hash,
  expires_at=excluded.expires_at,profile_id=null,approved_by=excluded.approved_by,approved_at=now(),reason=excluded.reason;
 insert into public.audit_logs(actor_id,action,entity_type,metadata) values(auth.uid(),'grade_teacher_invited','grade',jsonb_build_object('grade',p_grade,'reason',btrim(p_reason)));
 return jsonb_build_object('grade_level',p_grade,'email',lower(btrim(p_email)),'invitation_code',code,'expires_at',deadline);
end $$;

create function private.admin_grade_roster() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_active_administrator() then raise exception 'Administrator required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('grade_level',g,'approved_email',i.approved_email,
  'expires_at',i.expires_at,'profile_id',p.id,'name',p.name,'email',p.email,'status',p.status,
  'email_confirmed',u.email_confirmed_at is not null,'registration_created_at',p.created_at,
  'invitation_ready',i.token_hash is not null and i.profile_id is null and i.expires_at>now(),
  'student_count',(select count(*) from public.child_profiles c where c.grade_level=g and not c.is_demo),
  'owned_student_count',(select count(*) from public.child_profiles c where c.adult_id=p.id),
  'owned_attempt_count',(select count(*) from public.learning_attempts a join public.child_profiles c on c.id=a.child_id where c.adult_id=p.id)
 ) order by g) from generate_series(1,6) g
 left join private.teacher_grade_invitations i on i.grade_level=g
 left join public.profiles p on p.registered_grade=g and p.retired_at is null and p.role='educator'
 left join auth.users u on u.id=p.id),'[]'::jsonb);
end $$;

create function private.admin_begin_grade_release(p_grade integer,p_user uuid,p_mode text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; verified boolean; removed boolean;
begin
 if auth.uid() is null or not private.is_active_administrator() then raise exception 'Administrator required' using errcode='42501';end if;
 if p_grade not between 1 and 6 or p_mode not in ('pending','replace') or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Choose a grade, release type, and reason' using errcode='22023';end if;
 perform pg_advisory_xact_lock(85943201);
 select * into p from public.profiles where id=p_user for update;
 if p.id is null or p.role<>'educator' or p.account_kind<>'teacher' or p.registered_grade<>p_grade then raise exception 'The selected grade account changed. Refresh and try again' using errcode='42501';end if;
 select email_confirmed_at is not null,deleted_at is not null into verified,removed from auth.users where id=p_user;
 if p_mode='pending' and verified and not removed then raise exception 'This account is verified. Use Replace teacher instead' using errcode='22023';end if;
 perform set_config('app.allow_security_profile_update','true',true);
 update public.profiles set status='suspended',suspended_at=coalesce(suspended_at,now()),suspended_reason=btrim(p_reason) where id=p_user;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'grade_release_started','profile',p_user,jsonb_build_object('grade',p_grade,'mode',p_mode,'reason',btrim(p_reason)));
 return jsonb_build_object('user_id',p_user,'already_removed',coalesce(removed,false));
end $$;

create function private.admin_finish_grade_release(p_grade integer,p_user uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_active_administrator() then raise exception 'Administrator required' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Give a reason' using errcode='22023';end if;
 perform pg_advisory_xact_lock(85943201);
 if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=p_user and u.deleted_at is not null and p.registered_grade=p_grade) then
  raise exception 'Account removal is not complete. Retry the release' using errcode='42501';end if;
 update private.teacher_grade_invitations set profile_id=null,token_hash=null,expires_at=now() where grade_level=p_grade and profile_id=p_user;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'grade_registration_released','profile',p_user,jsonb_build_object('grade',p_grade,'reason',btrim(p_reason)));
 return jsonb_build_object('released',true,'grade_level',p_grade,'students_retained',(select count(*) from public.child_profiles where adult_id=p_user),
  'attempts_retained',(select count(*) from public.learning_attempts a join public.child_profiles c on c.id=a.child_id where c.adult_id=p_user));
end $$;

create function private.admin_prepare_review_account(p_email text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_active_administrator() then raise exception 'Administrator required' using errcode='42501';end if;
 if btrim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter the review account email';end if;
 if exists(select 1 from public.profiles where lower(email)=lower(btrim(p_email)) and retired_at is null) then raise exception 'This email already has an active account';end if;
 insert into private.review_account_provisioning(email,authorized_by,expires_at) values(lower(btrim(p_email)),auth.uid(),now()+interval '10 minutes')
 on conflict(email) do update set authorized_by=excluded.authorized_by,expires_at=excluded.expires_at,consumed_at=null;
 insert into public.audit_logs(actor_id,action,entity_type,metadata) values(auth.uid(),'review_account_authorized','profile','{}');
end $$;

create function private.mark_demo_child() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.is_demo:=exists(select 1 from public.profiles p where p.id=new.adult_id and p.account_kind='review');
 return new;
end $$;
revoke all on function private.mark_demo_child() from public,anon,authenticated;
create trigger mark_demo_child before insert or update of adult_id,is_demo on public.child_profiles for each row execute function private.mark_demo_child();

CREATE OR REPLACE FUNCTION public.prevent_profile_security_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if coalesce(current_setting('app.allow_security_profile_update', true), 'false') <> 'true'
     and (new.role is distinct from old.role or new.status is distinct from old.status
       or new.grade_levels is distinct from old.grade_levels or new.registered_grade is distinct from old.registered_grade
       or new.retired_at is distinct from old.retired_at or new.account_kind is distinct from old.account_kind
       or new.teacher_approved_at is distinct from old.teacher_approved_at or new.teacher_approved_by is distinct from old.teacher_approved_by) then
    raise exception 'Role, status, and assigned grade changes require an administrator workflow';
  end if;
  new.id := old.id;
  new.email := old.email;
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare selected jsonb:=coalesce(new.raw_user_meta_data->'grade_levels','[]');g smallint;admin_invitation boolean;
 review private.review_account_provisioning; invitation private.teacher_grade_invitations;
begin
 perform pg_advisory_xact_lock(85943201);
 select exists(select 1 from private.initial_administrator_invitation i where lower(i.email)=lower(new.email) and i.claimed_by is null and i.expires_at>now()) into admin_invitation;
 select * into review from private.review_account_provisioning where email=lower(new.email) and expires_at>now() and consumed_at is null for update;
 if admin_invitation then
  insert into public.profiles(id,email,name,role,grade_levels) values(new.id,new.email,coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),'Administrator'),'educator','{}');
 elsif review.email is not null then
  insert into public.profiles(id,email,name,role,school_name,grade_levels,account_kind,teacher_approved_at,teacher_approved_by)
  values(new.id,new.email,coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),'LinguaKids Reviewer'),'educator','Review / demonstration',array[1,2,3,4,5,6]::smallint[],'review',now(),review.authorized_by);
  update private.review_account_provisioning set consumed_at=now() where email=review.email;
 else
  if jsonb_typeof(selected) is distinct from 'array' or jsonb_array_length(selected)<>1 then raise exception 'Choose exactly one permanent grade' using errcode='22023';end if;
  g:=(selected->>0)::smallint;
  select * into invitation from private.teacher_grade_invitations where grade_level=g for update;
  if invitation.grade_level is null or invitation.approved_email is distinct from lower(new.email) or invitation.profile_id is not null or invitation.expires_at<=now()
   or invitation.token_hash is distinct from encode(extensions.digest(coalesce(new.raw_user_meta_data->>'invitation_code',''),'sha256'),'hex') then
   raise exception 'A valid administrator invitation is required for this grade and email' using errcode='42501';end if;
  insert into public.profiles(id,email,name,role,school_name,grade_levels,registered_grade,teacher_approved_at,teacher_approved_by)
  values(new.id,new.email,coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),'Educator'),'educator',nullif(btrim(new.raw_user_meta_data->>'school_name'),''),array[g]::smallint[],g,now(),invitation.approved_by);
  update private.teacher_grade_invitations set profile_id=new.id where grade_level=g;
 end if;
 insert into public.educator_preferences(educator_id) values(new.id);
 if new.email_confirmed_at is not null then perform private.assign_retired_classroom(new.id);end if;
 return new;
end $$;

create or replace function private.current_account_role() returns public.account_role language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=(select auth.uid()) and status='active' and retired_at is null
  and (role='administrator' or account_kind='review' or (teacher_approved_at is not null and registered_grade is not null))
$$;

CREATE OR REPLACE FUNCTION private.workspace_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'id',id,'name',name,'email',email,'role',role,'status',status,'grade_levels',grade_levels,'account_kind',account_kind,'teacher_approved_at',teacher_approved_at,'created_at',created_at))
    from public.profiles where exists (select 1 from auth.users u where u.id=profiles.id and u.deleted_at is null)),'[]'::jsonb));end if;
  return result;
end $function$;

CREATE OR REPLACE FUNCTION private.assign_retired_classroom(p_teacher uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare g smallint; moved integer;
begin
  select p.registered_grade into g from public.profiles p join auth.users u on u.id=p.id
    where p.id=p_teacher and p.role='educator' and p.status='active' and p.retired_at is null
      and u.deleted_at is null and u.email_confirmed_at is not null
      and p.account_kind='teacher' and p.teacher_approved_at is not null and exists(select 1 from private.teacher_grade_invitations i where i.grade_level=p.registered_grade and i.profile_id=p.id and i.approved_email=lower(u.email));
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
end $function$;

CREATE OR REPLACE FUNCTION private.auth_grade_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.deleted_at is not null and old.deleted_at is null then
  update public.profiles set retired_at=new.deleted_at,status='suspended',
    suspended_at=coalesce(suspended_at,new.deleted_at),
    suspended_reason=coalesce(suspended_reason,'Account removed; classroom history retained') where id=new.id;
  update private.child_learning_sessions s set revoked_at=now() from public.child_profiles c
    where c.id=s.child_id and c.adult_id=new.id and s.revoked_at is null;
 end if;
 if new.email_confirmed_at is not null and old.email_confirmed_at is null and new.deleted_at is null then
  perform private.assign_retired_classroom(new.id);
 end if;
 return new;
end $function$;
revoke all on function private.admin_authorize_grade(integer,text,integer,text) from public,anon,authenticated;
grant execute on function private.admin_authorize_grade(integer,text,integer,text) to authenticated;
create function public.admin_authorize_grade(p_grade integer,p_email text,p_days integer,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select private.admin_authorize_grade(p_grade,p_email,p_days,p_reason)$$;
revoke all on function public.admin_authorize_grade(integer,text,integer,text) from public,anon;
grant execute on function public.admin_authorize_grade(integer,text,integer,text) to authenticated;
revoke all on function private.admin_grade_roster() from public,anon,authenticated;
grant execute on function private.admin_grade_roster() to authenticated;
create function public.admin_grade_roster() returns jsonb language sql security invoker set search_path='' as $$select private.admin_grade_roster()$$;
revoke all on function public.admin_grade_roster() from public,anon;
grant execute on function public.admin_grade_roster() to authenticated;
revoke all on function private.admin_begin_grade_release(integer,uuid,text,text) from public,anon,authenticated;
grant execute on function private.admin_begin_grade_release(integer,uuid,text,text) to authenticated;
create function public.admin_begin_grade_release(p_grade integer,p_user uuid,p_mode text,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select private.admin_begin_grade_release(p_grade,p_user,p_mode,p_reason)$$;
revoke all on function public.admin_begin_grade_release(integer,uuid,text,text) from public,anon;
grant execute on function public.admin_begin_grade_release(integer,uuid,text,text) to authenticated;
revoke all on function private.admin_finish_grade_release(integer,uuid,text) from public,anon,authenticated;
grant execute on function private.admin_finish_grade_release(integer,uuid,text) to authenticated;
create function public.admin_finish_grade_release(p_grade integer,p_user uuid,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select private.admin_finish_grade_release(p_grade,p_user,p_reason)$$;
revoke all on function public.admin_finish_grade_release(integer,uuid,text) from public,anon;
grant execute on function public.admin_finish_grade_release(integer,uuid,text) to authenticated;
revoke all on function private.admin_prepare_review_account(text) from public,anon,authenticated;
grant execute on function private.admin_prepare_review_account(text) to authenticated;
create function public.admin_prepare_review_account(p_email text) returns void language sql security invoker set search_path='' as $$select private.admin_prepare_review_account(p_email)$$;
revoke all on function public.admin_prepare_review_account(text) from public,anon;
grant execute on function public.admin_prepare_review_account(text) to authenticated;

