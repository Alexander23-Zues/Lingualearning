create or replace function private.set_material_favorite(p_id uuid,p_saved boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501';end if;
 if not exists(select 1 from public.learning_materials where id=p_id and private.grade_allowed(grade_level)
   and (status='published' or owner_id=auth.uid() or private.is_active_administrator())) then raise exception 'Material is not available for your assigned grade' using errcode='42501';end if;
 if p_saved then insert into public.material_favorites(educator_id,material_id) values(auth.uid(),p_id) on conflict do nothing;
 else delete from public.material_favorites where educator_id=auth.uid() and material_id=p_id;end if;
end $$;
