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
    where s.child_id=c.id and c.grade_level=g and p.role='educator' and p.account_kind='teacher' and p.retired_at is not null and s.revoked_at is null;
  update public.child_profiles c set adult_id=p_teacher,updated_at=now() from public.profiles p
    where p.id=c.adult_id and p.role='educator' and p.account_kind='teacher' and p.retired_at is not null and c.grade_level=g;
  get diagnostics moved=row_count;
  update public.workspace_records r set owner_id=p_teacher,updated_at=now() from public.profiles p
    where p.id=r.owner_id and p.role='educator' and p.account_kind='teacher' and p.retired_at is not null
      and r.kind in ('plan','session') and r.data->>'grade_level'=g::text;
  update public.learning_materials m set owner_id=p_teacher,updated_at=now() from public.profiles p
    where p.id=m.owner_id and p.role='educator' and p.account_kind='teacher' and p.retired_at is not null and m.grade_level=g;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(p_teacher,'grade_classroom_assigned','profile',p_teacher,jsonb_build_object('grade',g,'retained_students',moved));
end $function$;

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
  if admin then
    result:=result||jsonb_build_object('demo_students_hidden',(select count(*) from public.child_profiles where is_demo),
      'children',coalesce((select jsonb_agg(c) from jsonb_array_elements(result->'children') c where not coalesce((c->>'is_demo')::boolean,false)),'[]'::jsonb),
      'attempts',coalesce((select jsonb_agg(a) from jsonb_array_elements(result->'attempts') a join public.child_profiles c on c.id=(a->>'child_id')::uuid where not c.is_demo),'[]'::jsonb),
      'records',coalesce((select jsonb_agg(r) from jsonb_array_elements(result->'records') r join public.profiles p on p.id=(r->>'owner_id')::uuid where p.account_kind<>'review'),'[]'::jsonb));
  end if;
  return result;
end $function$;



