create or replace function private.student_adventure_complete(p_token text,p_step_id text,p_revision integer,p_submission_id uuid,p_answers jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles:=private.resolve_child_session(p_token); step jsonb; result jsonb; passed boolean; material public.learning_materials;
  previous private.adventure_submissions; state jsonb; page jsonb; page_number integer:=0; part_number integer; part text;
begin
  perform pg_advisory_xact_lock(hashtextextended('adventure:'||child.id::text,0));
  select * into previous from private.adventure_submissions where submission_id=p_submission_id;
  if found then
    if previous.child_id<>child.id or previous.step_id<>p_step_id then raise exception 'Submission belongs to another activity' using errcode='42501';end if;
    return (select to_jsonb(a) from public.learning_attempts a where submission_id=p_submission_id)||jsonb_build_object('adventure',private.adventure_state(child.id),'adventure_passed',(select p.passed from private.adventure_progress p where p.child_id=child.id and p.step_id=p_step_id));
  end if;
  step:=private.adventure_current_step(child.id,p_step_id,p_revision);
  select * into material from public.learning_materials where id=(step->>'material_id')::uuid and version=(step->>'material_version')::int for share;
  if material.id is null then raise exception 'The learning material changed. Ask your teacher to update this adventure.';end if;
  if material.kind='story' and not exists(select 1 from private.adventure_progress where child_id=child.id and step_id=p_step_id and teacher_approved_by is not null) then
    for page in select value from jsonb_array_elements(coalesce(material.body->'pages',jsonb_build_array(material.body))) loop
      part_number:=0;
      for part in select jsonb_array_elements_text(private.adventure_parts(page->>'english')) loop
        if not exists(select 1 from private.adventure_reading_checks r where r.child_id=child.id and r.step_id=p_step_id and r.page_index=page_number and r.part_index=part_number and r.passed) then
          raise exception 'Read and check every English story part first, or ask your teacher to review your reading.';
        end if;
        part_number:=part_number+1;
      end loop;
      if part_number=0 then raise exception 'The story needs English reading text. Ask your teacher to update it.';end if;
      page_number:=page_number+1;
    end loop;
  end if;
  if material.kind='quiz' then
    if jsonb_typeof(p_answers)<>'object' or (select count(*) from jsonb_object_keys(p_answers))<>jsonb_array_length(material.body->'questions') or exists(
      select 1 from jsonb_array_elements(material.body->'questions') q where not exists(select 1 from jsonb_array_elements(q->'options') o where o->>'id'=p_answers->>(q->>'id'))
    ) then raise exception 'Answer every quiz question before submitting.';end if;
  end if;
  result:=private.student_complete_material_legacy(p_token,material.id,material.version,p_submission_id,p_answers);
  passed:=material.kind<>'quiz' or (result->>'correct_count')::int*100 >= (result->>'total_count')::int*80;
  insert into private.adventure_submissions values(p_submission_id,child.id,p_step_id,(select s->>'id' from jsonb_array_elements(private.adventure_state(child.id)->'stages') s where exists(select 1 from jsonb_array_elements(s->'steps') a where a->>'id'=p_step_id)));
  insert into private.adventure_progress(child_id,step_id,passed,status,last_attempt_id) values(child.id,p_step_id,passed,case when passed then 'completed' else 'current' end,(result->>'id')::uuid)
    on conflict(child_id,step_id) do update set passed=private.adventure_progress.passed or excluded.passed,status=case when private.adventure_progress.passed or excluded.passed then 'completed' else 'current' end,last_attempt_id=excluded.last_attempt_id,updated_at=now();
  return result||jsonb_build_object('adventure_passed',passed,'adventure',private.adventure_state(child.id));
end $$;


