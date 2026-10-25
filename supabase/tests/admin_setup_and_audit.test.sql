-- Every fixture and simulated event is rolled back; no test accounts remain.
begin;

do $$
begin
  if has_function_privilege('anon','public.claim_initial_administrator()','EXECUTE') then
    raise exception 'Anonymous callers can claim administrator access';
  end if;
  if has_table_privilege('authenticated','private.initial_administrator_invitation','SELECT') then
    raise exception 'Invitation table is exposed to signed-in accounts';
  end if;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    ('b7130000-0000-4000-8000-000000000001','admin-setup-test@example.invalid',null,'{"name":"Setup Test","role":"administrator"}'),
    ('b7130000-0000-4000-8000-000000000002','educator-setup-test@example.invalid',now(),'{"name":"Educator Test","role":"administrator"}');
  if exists(select 1 from public.profiles where id in (
    'b7130000-0000-4000-8000-000000000001','b7130000-0000-4000-8000-000000000002') and role<>'educator') then
    raise exception 'Signup metadata can select a privileged role';
  end if;
  update private.initial_administrator_invitation
  set email='admin-setup-test@example.invalid',claimed_by=null,claimed_at=null,expires_at=now()+interval '1 hour';
end $$;

select set_config('request.jwt.claim.sub','b7130000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"b7130000-0000-4000-8000-000000000002","role":"authenticated","session_id":"b7130000-0000-4000-8000-000000000003"}',true);
set local role authenticated;
do $$
declare denied boolean;
begin
  if public.claim_initial_administrator() then raise exception 'Wrong email claimed administrator'; end if;
  if (select count(*) from public.audit_logs)<>0 then raise exception 'Educator can read audit logs'; end if;
  denied:=false;
  begin insert into public.audit_logs(action,entity_type) values('forged','test');
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Client can forge audit records'; end if;
  denied:=false;
  begin perform public.record_account_event('initial_administrator_created');
  exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'Client can choose a privileged audit event'; end if;
  denied:=false;
  begin update public.profiles set role='administrator' where id=auth.uid();
  exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Educator can promote its profile'; end if;
  perform public.record_account_event('session_started');
  perform public.record_account_event('session_started');
end $$;
reset role;

select set_config('request.jwt.claim.sub','b7130000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b7130000-0000-4000-8000-000000000001","role":"authenticated","session_id":"b7130000-0000-4000-8000-000000000004"}',true);
set local role authenticated;
do $$ begin
  if public.claim_initial_administrator() then raise exception 'Unverified email claimed administrator'; end if;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id='b7130000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
declare denied boolean;
begin
  if not public.claim_initial_administrator() then raise exception 'Verified invitation did not activate administrator'; end if;
  if public.claim_initial_administrator() then raise exception 'Invitation was used twice'; end if;
  if public.current_account_role()<>'administrator' then raise exception 'Account role did not update'; end if;
  if (select count(*) from public.audit_logs where action='initial_administrator_created')<>1 then
    raise exception 'Administrator creation was not audited exactly once';
  end if;
  if (select count(*) from public.audit_logs where action='session_started'
    and actor_id='b7130000-0000-4000-8000-000000000002')<>1 then
    raise exception 'Session events are not owner-derived and duplicate-safe';
  end if;
  denied:=false;
  begin update public.audit_logs set action='rewritten';
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Administrator client can rewrite audit history'; end if;
end $$;
reset role;
do $$
declare denied boolean;
begin
  denied:=false;
  begin update public.audit_logs set action='rewritten' where action='initial_administrator_created';
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Audit mutation trigger did not reject a server-side rewrite'; end if;
end $$;
rollback;
