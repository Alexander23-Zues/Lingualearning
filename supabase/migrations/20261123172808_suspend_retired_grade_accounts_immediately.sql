create or replace function private.auth_grade_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
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
end $$;
