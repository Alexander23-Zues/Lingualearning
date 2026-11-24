-- Baselines are private workspace records, separate from learning attempts and mission credit.
alter table public.workspace_records drop constraint workspace_records_kind_check;
alter table public.workspace_records add constraint workspace_records_kind_check check
  (kind in ('plan','session','curriculum','dataset','training','announcement','question_bank','reading_assessment'));

create unique index reading_assessment_source_key on public.workspace_records
  (owner_id,(data->>'source_key')) where kind='reading_assessment';

create function private.validate_reading_assessment(p_data jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare field text; upper_bound integer; number integer; flags jsonb:='[]'; story boolean;
begin
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>16000 then
    raise exception 'Enter a bounded reading assessment object' using errcode='22023';
  end if;
  if p_data-array['source_key','source_title','source_row','source_notes','language','assessment_type','assessment_date',
    'letter_sounds','rhymes','sentences','part1_total','part1_level','story_number','total_story_words',
    'miscues','words_read','reading_seconds','wpm','accuracy_percent','comprehension_correct','comprehension_total',
    'experience_rating','observation_level','reading_profile']<>'{}'::jsonb then
    raise exception 'Only reading baseline fields are accepted; do not include names or LRNs' using errcode='22023';
  end if;
  if coalesce(p_data->>'source_key','')!~'^[a-zA-Z0-9:_-]{1,100}$'
    or length(btrim(coalesce(p_data->>'source_title',''))) not between 1 and 180
    or length(coalesce(p_data->>'source_notes',''))>1000
    or length(btrim(coalesce(p_data->>'assessment_type',''))) not between 1 and 40
    or coalesce(p_data->>'assessment_date','')!~'^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Enter the assessment source, type and date' using errcode='22023';
  end if;
  perform (p_data->>'assessment_date')::date;
  if coalesce(p_data->>'language','') not in ('en','fil') then raise exception 'Choose English or Filipino assessment language' using errcode='22023';end if;
  if coalesce(p_data->>'reading_profile','') not in ('Low Emerging Reader','High Emerging Reader','Developing Reader','Transitioning Reader','Reading At Grade Level')
    or coalesce(p_data->>'part1_level','') not in ('Full Refresher','Moderate Refresher','Light Refresher','Grade Ready') then
    raise exception 'Retain the reading categories recorded on the source assessment' using errcode='22023';
  end if;
  for field,upper_bound in select key,value::integer from jsonb_each_text('{"source_row":2000,"letter_sounds":10,"rhymes":10,"sentences":10,"part1_total":30,"story_number":2,"total_story_words":10000,"miscues":10000,"words_read":10000,"reading_seconds":3600,"wpm":10000,"accuracy_percent":100,"comprehension_correct":5,"comprehension_total":5,"experience_rating":5,"observation_level":4}') loop
    if p_data ? field and p_data->field<>'null'::jsonb then
      if jsonb_typeof(p_data->field)<>'number' or (p_data->>field)!~'^\d+$' then raise exception 'Assessment counts must be whole numbers' using errcode='22023';end if;
      number:=(p_data->>field)::integer;
      if number<0 or number>upper_bound then raise exception 'Assessment value for % is out of range',field using errcode='22023';end if;
    end if;
  end loop;
  if coalesce((p_data->>'source_row')::integer,0)<1 or p_data->>'letter_sounds' is null or p_data->>'part1_total' is null
    or coalesce((p_data->>'total_story_words')::integer,0)<1 or (p_data->>'comprehension_total')::integer is distinct from 5 then
    raise exception 'Enter the source row and required assessment totals' using errcode='22023';
  end if;
  if (p_data->>'letter_sounds')::integer<=6 then
    if p_data->>'rhymes' is null or p_data->>'sentences' is not null or (p_data->>'part1_total')::integer<>((p_data->>'letter_sounds')::integer+(p_data->>'rhymes')::integer) then
      raise exception 'Check the letter-sound and rhyme route against the source sheet' using errcode='22023';end if;
  else
    if p_data->>'sentences' is null or p_data->>'rhymes' is not null or (p_data->>'part1_total')::integer<>((p_data->>'letter_sounds')::integer+10+(p_data->>'sentences')::integer) then
      raise exception 'Check the sentence route; the form gives 10 rhyme credits without administering that task' using errcode='22023';end if;
  end if;
  story:=p_data->>'story_number' is not null;
  if story then
    if (p_data->>'story_number')::integer not in (1,2) or p_data->>'words_read' is null or p_data->>'miscues' is null
      or coalesce((p_data->>'reading_seconds')::integer,0)<1 or p_data->>'wpm' is null or p_data->>'accuracy_percent' is null
      or (p_data->>'words_read')::integer>(p_data->>'total_story_words')::integer then
      raise exception 'Enter the recorded story, time and reading counts' using errcode='22023';end if;
    if (p_data->>'reading_seconds')::integer>60 then flags:=flags||jsonb_build_array('duration_exceeds_form_one_minute');end if;
    if p_data->>'comprehension_correct' is null then flags:=flags||jsonb_build_array('comprehension_not_recorded');end if;
  else
    foreach field in array array['miscues','words_read','reading_seconds','wpm','accuracy_percent','comprehension_correct','experience_rating','observation_level'] loop
      if p_data->>field is not null then raise exception 'Not-administered reading fields must remain blank' using errcode='22023';end if;
    end loop;
  end if;
  return p_data||jsonb_build_object('schema_version',1,'requires_teacher_review',true,'quality_flags',flags,'english_placement_applied',false);
end $$;

create function private.save_reading_assessment(p_child_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles; body jsonb; previous public.workspace_records; result uuid;
begin
  if private.current_account_role() is distinct from 'educator' then raise exception 'Active educator required' using errcode='42501';end if;
  select * into child from public.child_profiles where id=p_child_id and adult_id=auth.uid() for update;
  if child.id is null or not private.grade_allowed(child.grade_level) then raise exception 'Choose a learner in your assigned classroom' using errcode='42501';end if;
  body:=private.validate_reading_assessment(p_data)||jsonb_build_object('child_id',child.id,'grade_level',child.grade_level,'is_demo',child.is_demo);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||(body->>'source_key'),0));
  select * into previous from public.workspace_records where owner_id=auth.uid() and kind='reading_assessment' and data->>'source_key'=body->>'source_key';
  if previous.id is not null then
    if previous.data<>body then raise exception 'This source row is already recorded. Use a new assessment version to preserve its history' using errcode='23505';end if;
    return previous.id;
  end if;
  insert into public.workspace_records(owner_id,kind,title,status,data)
    values(auth.uid(),'reading_assessment',left('Reading baseline · '||(body->>'source_title'),180),'draft',body) returning id into result;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),'reading_baseline_recorded','workspace_record',result,jsonb_build_object('child_id',child.id,'grade_level',child.grade_level,'language',body->>'language'));
  return result;
end $$;

create function public.save_reading_assessment(p_child_id uuid,p_data jsonb) returns uuid
language sql security invoker set search_path='' as $$select private.save_reading_assessment(p_child_id,p_data)$$;
revoke all on function private.validate_reading_assessment(jsonb) from public,anon,authenticated;
revoke all on function private.save_reading_assessment(uuid,jsonb) from public,anon;
revoke all on function public.save_reading_assessment(uuid,jsonb) from public,anon;
grant execute on function private.save_reading_assessment(uuid,jsonb) to authenticated;
grant execute on function public.save_reading_assessment(uuid,jsonb) to authenticated;


