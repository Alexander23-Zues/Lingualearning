create function private.close_child_session(p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare v_child public.child_profiles:=private.resolve_child_session(p_token);
begin
  update private.child_learning_sessions set revoked_at=now()
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null;
end $$;
create function public.close_child_session(p_token text) returns void
language sql security invoker set search_path='' as $$select private.close_child_session(p_token)$$;
revoke all on function private.close_child_session(text),public.close_child_session(text) from public;
grant execute on function private.close_child_session(text),public.close_child_session(text) to anon,authenticated;

create function private.active_learning_model() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501'; end if;
  return(select jsonb_build_object('id',id,'name',name,'version',version) from public.model_versions where state='active' limit 1);
end $$;
create function public.active_learning_model() returns jsonb language sql security invoker set search_path='' as $$select private.active_learning_model()$$;
revoke all on function private.active_learning_model(),public.active_learning_model() from public,anon;
grant execute on function private.active_learning_model(),public.active_learning_model() to authenticated;

create function private.workspace_model_action(p_id uuid,p_checksum text,p_rollback boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_active_administrator() then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_rollback then return public.rollback_model_activation(auth.uid()); end if;
  return public.activate_model_version(p_id,p_checksum,auth.uid());
end $$;
create function public.workspace_model_action(p_id uuid,p_checksum text,p_rollback boolean) returns jsonb
language sql security invoker set search_path='' as $$select private.workspace_model_action(p_id,p_checksum,p_rollback)$$;
revoke all on function private.workspace_model_action(uuid,text,boolean),public.workspace_model_action(uuid,text,boolean) from public,anon;
grant execute on function private.workspace_model_action(uuid,text,boolean),public.workspace_model_action(uuid,text,boolean) to authenticated;

create function private.audit_saved_vocabulary() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  select adult_id,'student_vocabulary_saved','child_profile',new.child_id,jsonb_build_object('material_id',new.material_id)
  from public.child_profiles where id=new.child_id;
  return new;
end $$;
revoke all on function private.audit_saved_vocabulary() from public,anon,authenticated;
create trigger audit_saved_child_vocabulary after insert on public.saved_child_vocabulary for each row execute function private.audit_saved_vocabulary();

create function private.reject_learning_history_mutation() returns trigger
language plpgsql security invoker set search_path='' as $$begin raise exception 'Learning history is append-only' using errcode='42501'; end$$;
revoke all on function private.reject_learning_history_mutation() from public,anon,authenticated;
create trigger learning_attempts_append_only before update or delete on public.learning_attempts for each row execute function private.reject_learning_history_mutation();
notify pgrst,'reload schema';
