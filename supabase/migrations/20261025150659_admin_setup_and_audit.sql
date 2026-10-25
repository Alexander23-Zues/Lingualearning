-- Admin invitations are provisioned by the database owner, never by signup metadata.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Keep privileged RLS helpers outside the exposed REST schema.
alter function public.current_account_role() set schema private;
alter function public.is_active_educator() set schema private;
alter function public.is_active_administrator() set schema private;
alter function public.handle_new_user() set schema private;
alter function public.sync_classroom_session(uuid,uuid,jsonb) set schema private;

revoke all on function private.current_account_role() from public, anon;
revoke all on function private.is_active_educator() from public, anon;
revoke all on function private.is_active_administrator() from public, anon;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.sync_classroom_session(uuid,uuid,jsonb) from public, anon;
grant execute on function private.current_account_role(), private.is_active_educator(),
  private.is_active_administrator() to authenticated, service_role;
grant execute on function private.sync_classroom_session(uuid,uuid,jsonb) to authenticated, service_role;

create function public.current_account_role() returns public.account_role
language sql stable security invoker set search_path = ''
as $$ select private.current_account_role() $$;
create function public.is_active_educator() returns boolean
language sql stable security invoker set search_path = ''
as $$ select private.is_active_educator() $$;
create function public.is_active_administrator() returns boolean
language sql stable security invoker set search_path = ''
as $$ select private.is_active_administrator() $$;
create function public.sync_classroom_session(p_educator_id uuid,p_event_id uuid,p_payload jsonb)
returns uuid language sql security invoker set search_path = ''
as $$ select private.sync_classroom_session(p_educator_id,p_event_id,p_payload) $$;

revoke all on function public.current_account_role(), public.is_active_educator(),
  public.is_active_administrator(), public.sync_classroom_session(uuid,uuid,jsonb) from public, anon;
grant execute on function public.current_account_role(), public.is_active_educator(),
  public.is_active_administrator(), public.sync_classroom_session(uuid,uuid,jsonb) to authenticated, service_role;

create table private.initial_administrator_invitation (
  singleton boolean primary key default true check (singleton),
  email text not null check (email = lower(btrim(email))),
  expires_at timestamptz not null default now() + interval '7 days',
  claimed_by uuid references public.profiles(id),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table private.initial_administrator_invitation enable row level security;
revoke all on private.initial_administrator_invitation from public, anon, authenticated;

create function private.claim_initial_administrator() returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- This lock also serializes the original server-side bootstrap path.
  perform pg_catalog.pg_advisory_xact_lock(824014910);
  if exists (select 1 from public.profiles where role='administrator') then return false; end if;

  select lower(email) into v_email from auth.users
  where id=v_user_id and email_confirmed_at is not null;
  if v_email is null then return false; end if;
  perform 1 from private.initial_administrator_invitation
  where singleton and email=v_email and claimed_at is null and expires_at>now()
  for update;
  if not found then return false; end if;
  if not exists (select 1 from public.profiles where id=v_user_id and status='active') then
    raise exception 'Active account required' using errcode='42501';
  end if;

  perform set_config('app.allow_security_profile_update','true',true);
  update public.profiles set role='administrator', updated_at=now() where id=v_user_id;
  perform set_config('app.allow_security_profile_update','false',true);
  update private.initial_administrator_invitation set claimed_by=v_user_id, claimed_at=now()
  where singleton;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_user_id,'initial_administrator_created','profile',v_user_id,
    jsonb_build_object('method','verified_email_invitation'));
  return true;
end;
$$;
revoke all on function private.claim_initial_administrator() from public, anon;
grant execute on function private.claim_initial_administrator() to authenticated;
create function public.claim_initial_administrator() returns boolean
language sql security invoker set search_path = ''
as $$ select private.claim_initial_administrator() $$;
revoke all on function public.claim_initial_administrator() from public, anon;
grant execute on function public.claim_initial_administrator() to authenticated;

-- Session events describe requests made by a currently authenticated account.
-- Authoritative authentication failures remain in Supabase Auth's own logs.
create unique index audit_session_start_unique
on public.audit_logs(actor_id,action,(metadata->>'session_id'))
where action='session_started' and metadata->>'session_id' is not null;

create function private.record_account_event(p_event text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles where id=v_user_id and status='active'
  ) then raise exception 'Active account required' using errcode='42501'; end if;
  if p_event not in ('session_started','session_ended') or p_event is null then
    raise exception 'Unsupported account event' using errcode='22023';
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_user_id,p_event,'profile',v_user_id,
    jsonb_strip_nulls(jsonb_build_object('session_id',auth.jwt()->>'session_id','source','application')))
  on conflict do nothing;
end;
$$;
revoke all on function private.record_account_event(text) from public, anon;
grant execute on function private.record_account_event(text) to authenticated;
create function public.record_account_event(p_event text) returns void
language sql security invoker set search_path = ''
as $$ select private.record_account_event(p_event) $$;
revoke all on function public.record_account_event(text) from public, anon;
grant execute on function public.record_account_event(text) to authenticated;

create function private.reject_audit_mutation() returns trigger
language plpgsql security invoker set search_path = ''
as $$ begin raise exception 'Audit records are append-only' using errcode='42501'; end $$;
revoke all on function private.reject_audit_mutation() from public, anon, authenticated;
create trigger audit_logs_append_only before update or delete on public.audit_logs
for each row execute function private.reject_audit_mutation();
revoke insert,update,delete,truncate on public.audit_logs from anon,authenticated;
grant select on public.audit_logs to authenticated;

-- Serialize legacy administrator bootstrap with the verified-invitation flow.
create or replace function public.bootstrap_administrator(p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(824014910);
  if exists(select 1 from public.profiles where role='administrator') then
    raise exception 'An administrator already exists';
  end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Profile not found'; end if;
  perform set_config('app.allow_security_profile_update','true',true);
  update public.profiles set role='administrator',status='active',updated_at=now() where id=p_user_id;
  perform set_config('app.allow_security_profile_update','false',true);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(p_user_id,'initial_administrator_created','profile',p_user_id,jsonb_build_object('method','server_bootstrap'));
end;
$$;
revoke all on function public.bootstrap_administrator(uuid) from public,anon,authenticated;
grant execute on function public.bootstrap_administrator(uuid) to service_role;

notify pgrst, 'reload schema';
