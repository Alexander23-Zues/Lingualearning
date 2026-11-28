-- Keep large AI pair arrays out of the shared workspace response.
-- Full rows remain readable on demand through their existing RLS policies.
-- Preserve all teaching content, ownership checks, grades and function grants.
CREATE OR REPLACE FUNCTION private.workspace_snapshot_core()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_admin boolean:=private.is_active_administrator();
begin
  if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501'; end if;
  return jsonb_build_object(
    'materials',coalesce((select jsonb_agg(to_jsonb(m) order by m.updated_at desc) from public.learning_materials m
      where m.owner_id=v_uid or v_admin or m.status='published'),'[]'::jsonb),
    'records',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'owner_id',r.owner_id,'kind',r.kind,'title',r.title,
      'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at,
      'details_deferred',r.kind in ('dataset','training'),
      'data',case
        when r.kind='dataset' then (r.data-'pairs')||jsonb_build_object(
          'pair_count',case when jsonb_typeof(r.data->'pairs')='array'
            then jsonb_array_length(r.data->'pairs') else 0 end)
        when r.kind='training' and jsonb_typeof(r.data->'dataset')='object' then
          jsonb_set(r.data,'{dataset}',((r.data->'dataset')-'pairs')||jsonb_build_object(
            'pair_count',case when jsonb_typeof(r.data#>'{dataset,pairs}')='array'
              then jsonb_array_length(r.data#>'{dataset,pairs}') else 0 end))
        else r.data end
      ) order by r.updated_at desc) from public.workspace_records r
      where r.owner_id=v_uid or v_admin or (r.kind in ('curriculum','announcement') and r.status='published')),'[]'::jsonb),
    'children',coalesce((select jsonb_agg(to_jsonb(c) order by c.nickname) from public.child_profiles c
      where c.adult_id=v_uid or v_admin),'[]'::jsonb),
    'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.completed_at desc) from public.learning_attempts a
      join public.child_profiles c on c.id=a.child_id where c.adult_id=v_uid or v_admin),'[]'::jsonb),
    'educators',case when v_admin then coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'email',p.email,'role',p.role,'status',p.status,'created_at',p.created_at)
      order by p.created_at desc) from public.profiles p),'[]'::jsonb) else '[]'::jsonb end,
    'models',case when v_admin then coalesce((select jsonb_agg(to_jsonb(m)) from public.model_versions m),'[]'::jsonb) else '[]'::jsonb end,
    'active_model',(select jsonb_build_object('name',name,'version',version) from public.model_versions where state='active' limit 1)
  );
end $function$;

notify pgrst, 'reload schema';

