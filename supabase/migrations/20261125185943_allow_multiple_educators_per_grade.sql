-- Multiple educators can teach the same grade. Each account retains its grade and classroom.
drop index public.one_educator_per_registered_grade;

-- Older cached clients expect these six flags. None represents a reserved grade anymore.
drop trigger refresh_registration_grades on public.profiles;
drop function private.refresh_grade_flags();
update public.educator_grade_availability set occupied=false where occupied;

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
declare selected jsonb:=coalesce(new.raw_user_meta_data->'grade_levels','[]');
 g smallint; admin_invitation boolean; review private.review_account_provisioning;
begin
 perform pg_advisory_xact_lock(85943201);
 select exists(select 1 from private.initial_administrator_invitation i
  where lower(i.email)=lower(new.email) and i.claimed_by is null and i.expires_at>now())
 into admin_invitation;
 select * into review from private.review_account_provisioning
  where email=lower(new.email) and expires_at>now() and consumed_at is null for update;
 if admin_invitation then
  insert into public.profiles(id,email,name,role,grade_levels)
  values(new.id,new.email,coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),'Administrator'),'educator','{}');
 elsif review.email is not null then
  insert into public.profiles(id,email,name,role,school_name,grade_levels,account_kind,teacher_approved_at,teacher_approved_by)
  values(new.id,new.email,coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),'LinguaKids Reviewer'),
   'educator','Review / demonstration',array[1,2,3,4,5,6]::smallint[],'review',now(),review.authorized_by);
  update private.review_account_provisioning set consumed_at=now() where email=review.email;
 else
  if jsonb_typeof(selected) is distinct from 'array' then
   raise exception 'Choose exactly one permanent grade' using errcode='22023';end if;
  if jsonb_array_length(selected)<>1 or coalesce(selected->>0,'')!~'^[1-6]$' then
   raise exception 'Choose exactly one permanent grade from 1 to 6' using errcode='22023';end if;
  g:=(selected->>0)::smallint;
  -- Legacy approval timestamp is an automatic enrollment timestamp for compatibility
  -- with the previous API deployment. It never represents administrator approval.
  insert into public.profiles(id,email,name,role,school_name,grade_levels,registered_grade,teacher_approved_at)
  values(new.id,new.email,coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),'Educator'),
   'educator',nullif(btrim(new.raw_user_meta_data->>'school_name'),''),array[g]::smallint[],g,now());
  -- Never bind a self-registered account to a prior invitation. The legacy
  -- retired-classroom transfer requires that private binding and cannot run here.
 end if;
 insert into public.educator_preferences(educator_id) values(new.id);
 return new;
end $$;
revoke all on function private.handle_new_user() from public,anon,authenticated;

create or replace function private.admin_grade_roster() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_active_administrator() then
  raise exception 'Administrator required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'grade_level',g,'profile_id',p.id,'name',p.name,'email',p.email,'status',p.status,
  'email_confirmed',u.email_confirmed_at is not null,'registration_created_at',p.created_at,
  'registration_open',true,
  'student_count',(select count(*) from public.child_profiles c where c.grade_level=g and not c.is_demo),
  'owned_student_count',(select count(*) from public.child_profiles c where c.adult_id=p.id),
  'owned_attempt_count',(select count(*) from public.learning_attempts a join public.child_profiles c
   on c.id=a.child_id where c.adult_id=p.id)
 ) order by g,p.created_at,p.id) from generate_series(1,6) g
 left join public.profiles p on p.registered_grade=g and p.retired_at is null and p.role='educator'
 left join auth.users u on u.id=p.id),'[]'::jsonb);
end $$;
