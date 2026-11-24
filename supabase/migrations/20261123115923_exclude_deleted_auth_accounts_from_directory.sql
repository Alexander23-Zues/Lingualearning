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
    'id',id,'name',name,'email',email,'role',role,'status',status,'grade_levels',grade_levels,'created_at',created_at))
    from public.profiles where exists (select 1 from auth.users u where u.id=profiles.id and u.deleted_at is null)),'[]'::jsonb));end if;
  return result;
end $function$

