-- Extend the existing administrator-only dataset workflow to 50,000 pairs.
-- Keep its role, ownership, publication, and immutable-package checks.
do $migration$
declare
  definition text;
begin
  definition := pg_get_functiondef('private.save_workspace_record(uuid,jsonb)'::regprocedure);
  if position('not between 1 and 10000' in definition) = 0 then
    raise exception 'Unexpected dataset validation definition. Review before migration.';
  end if;
  execute replace(definition, 'not between 1 and 10000', 'not between 1 and 50000');
  definition := pg_get_functiondef('private.save_workspace_record_content(uuid,jsonb)'::regprocedure);
  if position('pg_column_size(p_data->''data'')>300000' in definition) = 0 then
    raise exception 'Unexpected record size check. Review before migration.';
  end if;
  execute replace(definition, 'pg_column_size(p_data->''data'')>300000',
    'pg_column_size(p_data->''data'') > (case when v_kind in (''dataset'',''training'') then 10000000 else 300000 end)');
end
$migration$;
notify pgrst, 'reload schema';

