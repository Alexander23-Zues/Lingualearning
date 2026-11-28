-- Isolated synthetic fixtures only; every change rolls back.
begin;
do $test$
declare
 ids uuid[]:='{}'; u uuid; admin_id uuid:=gen_random_uuid(); retired_id uuid:=gen_random_uuid();
 archived_child uuid:=gen_random_uuid(); own_child uuid; second_child uuid;
 second_teacher uuid:=gen_random_uuid(); g integer; denied boolean;
 invalid jsonb; snapshot jsonb; roster jsonb; total_attempts integer;
begin
 if current_database() not like 'linguakids_self_registration_%' then
  raise exception 'Use the isolated self-registration test database';end if;
 perform set_config('session_replication_role','replica',true);
 insert into auth.users(id,email,email_confirmed_at) values
  (admin_id,'admin-self-signup@fixture.invalid',now()),(retired_id,'retired-self-signup@fixture.invalid',now());
 insert into public.profiles(id,email,name,role,grade_levels) values
  (admin_id,'admin-self-signup@fixture.invalid','Synthetic admin','administrator','{}');
 insert into public.profiles(id,email,name,role,grade_levels,registered_grade,retired_at,status) values
  (retired_id,'retired-self-signup@fixture.invalid','Retired synthetic teacher','educator',array[1]::smallint[],1,now(),'suspended');
 insert into public.child_profiles(id,adult_id,nickname,avatar_key,grade_level,learning_level)
 values(archived_child,retired_id,'Archived synthetic learner','owl',1,'beginner');
 perform set_config('session_replication_role','origin',true);
 select count(*) into total_attempts from public.learning_attempts;

 -- No invitation, pre-approval, or administrator session is supplied.
 for g in 1..6 loop
  u:=gen_random_uuid();ids:=array_append(ids,u);
  insert into auth.users(id,email,raw_user_meta_data) values(u,u::text||'@fixture.invalid',
   jsonb_build_object('grade_levels',jsonb_build_array(g),'name','Synthetic teacher',
    'role','administrator','account_kind','review','teacher_approved_by',admin_id,'invitation_code','forged'));
  if not exists(select 1 from public.profiles where id=u and role='educator' and account_kind='teacher'
   and registered_grade=g and grade_levels=array[g]::smallint[] and teacher_approved_by is null) then
   raise exception 'Self signup trusted privileges or failed to fix grade %',g;end if;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  if private.current_account_role() is not null or private.adventure_can_manage(u,g) then
   raise exception 'Unverified account gained classroom access';end if;
 end loop;
 insert into auth.users(id,email,raw_user_meta_data)
 values(second_teacher,'second-teacher@fixture.invalid','{"grade_levels":[1]}');
 if not exists(select 1 from public.profiles where id=second_teacher and registered_grade=1
  and grade_levels=array[1]::smallint[] and account_kind='teacher') then
  raise exception 'Second signup did not get its own Grade 1 profile';end if;
 if exists(select 1 from public.educator_grade_availability where occupied) then
  raise exception 'Older registration clients would still see a reserved grade';end if;

 for invalid in select value from jsonb_array_elements('[[],[0],[7],[1,2],null,{},[null],[1.5],["Other"]]') loop
  denied:=false;
  begin insert into auth.users(email,raw_user_meta_data) values(gen_random_uuid()::text||'@fixture.invalid',jsonb_build_object('grade_levels',invalid));
  exception when invalid_parameter_value then denied:=true;end;
  if not denied then raise exception 'Invalid grade input accepted: %',invalid;end if;
 end loop;

 for g in 1..6 loop
  update auth.users set email_confirmed_at=now() where id=ids[g];
  perform set_config('request.jwt.claim.sub',ids[g]::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ids[g],'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if private.current_account_role() is distinct from 'educator'::public.account_role then
   raise exception 'Verified signup cannot manage its own grade';end if;
  perform public.educator_adventure(g);
  snapshot:=public.workspace_snapshot();
  if jsonb_array_length(snapshot->'children')<>0 then raise exception 'Signup inherited another classroom';end if;
  if not exists(select 1 from jsonb_array_elements(snapshot->'materials') m where (m->>'grade_level')::int=g) then
   raise exception 'Missing published material for grade %',g;end if;
  if exists(select 1 from jsonb_array_elements(snapshot->'materials') m where (m->>'grade_level')::int<>g) then
   raise exception 'Signup can see another grade';end if;
  if exists(select 1 from public.child_profiles where id=archived_child) then raise exception 'Archived student exposed through RLS';end if;
  denied:=false;
  begin update public.profiles set registered_grade=case when g=6 then 1 else g+1 end,
   grade_levels=array[case when g=6 then 1 else g+1 end]::smallint[] where id=ids[g];
  exception when raise_exception then denied:=true;end;
  if not denied then raise exception 'Teacher changed fixed grade';end if;
  denied:=false;
  begin perform public.admin_grade_roster();exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Teacher read admin roster';end if;
  execute 'reset role';
 end loop;
 if (select adult_id from public.child_profiles where id=archived_child)<>retired_id then
  raise exception 'Self signup took archived classroom ownership';end if;
 if (select count(*) from public.learning_attempts)<>total_attempts then raise exception 'Signup changed learning results';end if;

 -- A suspended account cannot use its grade.
 perform set_config('app.allow_security_profile_update','true',true);
 update public.profiles set status='suspended' where id=ids[6];
 perform set_config('app.allow_security_profile_update','false',true);
 perform set_config('request.jwt.claim.sub',ids[6]::text,true);
 if private.current_account_role() is not null then raise exception 'Suspended teacher retains access';end if;

 perform set_config('request.jwt.claim.sub',ids[1]::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids[1],'role','authenticated')::text,true);
 execute 'set local role authenticated';
 own_child:=public.save_child_profile(null,'{"nickname":"New synthetic learner","grade_level":1,"learning_level":"beginner","avatar_key":"owl"}');
 if not exists(select 1 from jsonb_array_elements(public.workspace_snapshot()->'children') c where c->>'id'=own_child::text) then
  raise exception 'Self registered teacher cannot track its own learner';end if;
 execute 'reset role';

 update auth.users set email_confirmed_at=now() where id=second_teacher;
 perform set_config('request.jwt.claim.sub',second_teacher::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',second_teacher,'role','authenticated')::text,true);
 if private.current_account_role() is distinct from 'educator'::public.account_role
   or not private.adventure_can_manage(second_teacher,1)
   or private.adventure_can_manage(ids[1],1) then
  raise exception 'Same-grade account does not have an independent mission workspace';end if;
 execute 'set local role authenticated';
 perform public.educator_adventure(1);
 if jsonb_array_length(public.workspace_snapshot()->'children')<>0
   or exists(select 1 from public.child_profiles where id=own_child) then
  raise exception 'Second teacher can see the first teacher’s classroom';end if;
 second_child:=public.save_child_profile(null,'{"nickname":"Second synthetic learner","grade_level":1,"learning_level":"beginner","avatar_key":"owl"}');
 if not exists(select 1 from jsonb_array_elements(public.workspace_snapshot()->'children') c where c->>'id'=second_child::text) then
  raise exception 'Second teacher could not manage their own classroom';end if;
 execute 'reset role';

 perform set_config('request.jwt.claim.sub',ids[1]::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids[1],'role','authenticated')::text,true);
 if private.adventure_can_manage(second_teacher,1) then
  raise exception 'First teacher can manage the second teacher’s missions';end if;
 execute 'set local role authenticated';
 if exists(select 1 from public.child_profiles where id=second_child)
   or exists(select 1 from jsonb_array_elements(public.workspace_snapshot()->'children') c where c->>'id'=second_child::text) then
  raise exception 'First teacher can see the second teacher’s classroom';end if;
 execute 'reset role';

 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 roster:=public.admin_grade_roster();
 if jsonb_array_length(roster)<>7
   or (select count(*) from jsonb_array_elements(roster) r where r->>'grade_level'='1'
     and (r->>'profile_id')::uuid in (ids[1],second_teacher) and (r->>'owned_student_count')::int=1)<>2
   or roster->0 ? 'approved_email' or roster->0 ? 'invitation_ready' then
  raise exception 'Admin roster did not list both Grade 1 accounts separately';end if;
 execute 'reset role';
 if has_function_privilege('authenticated','public.admin_authorize_grade(integer,text,integer,text)','execute')
  or has_function_privilege('anon','public.teacher_invitation_valid(integer,text,text)','execute') then
  raise exception 'Retired approval endpoint remains callable';end if;
 raise notice 'Self-registration checks passed: all grades, email confirmation, same-grade accounts, classroom isolation, immutable grade and admin roster.';
end $test$;
rollback;
