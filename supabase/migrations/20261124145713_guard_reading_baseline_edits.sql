-- General-purpose record editing must not bypass baseline validation or source history.
do $guard$
declare definition text; marker text:='  if private.current_account_role()';
begin
 definition:=pg_get_functiondef('private.save_workspace_record_content(uuid,jsonb)'::regprocedure);
 if position('Use the dedicated reading baseline action' in definition)=0 then
  if position(marker in definition)=0 then raise exception 'Workspace record function changed; review baseline guard';end if;
  definition:=replace(definition,marker,
   '  if v_kind=''reading_assessment'' or exists(select 1 from public.workspace_records where id=p_id and kind=''reading_assessment'') then raise exception ''Use the dedicated reading baseline action; source history is retained'' using errcode=''42501'';end if;'||chr(10)||marker);
  execute definition;
 end if;
end $guard$;


