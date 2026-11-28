-- Retain starting mission identities needed to reconfirm an already-started
-- learner after a curriculum revision. Removing one would strand the learner.
do $patch$
declare definition text; anchor text:='  update private.adventure_paths set definition=normalized';
begin
 definition:=pg_get_functiondef('private.save_adventure(integer,integer,jsonb)'::regprocedure);
 if strpos(definition,anchor)=0 then raise exception 'Unexpected save_adventure definition; review before patching';end if;
 definition:=replace(definition,anchor,$guard$
  if exists(select 1 from private.adventure_placements p join public.child_profiles c on c.id=p.child_id
    where c.adult_id=auth.uid() and c.grade_level=p_grade
    and exists(select 1 from private.adventure_submissions s where s.child_id=c.id)
    and (not(p.approved_stage_id=any(stage_ids)) or not(p.selected_stage_id=any(stage_ids))))
  then raise exception 'Keep the starting mission IDs of learners who already began. Update activities without deleting their approved or selected starting mission.';end if;
$guard$||anchor);
 execute definition;
end $patch$;
notify pgrst,'reload schema';

