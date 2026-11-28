-- Restore the original protected workspace reader. Preserve existing ACLs and records.
create or replace function public.workspace_snapshot()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.workspace_snapshot();
$$;
notify pgrst, 'reload schema';
