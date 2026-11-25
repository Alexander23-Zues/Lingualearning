-- English assessment evidence is private and never awards quiz or mission credit.
alter table public.workspace_records drop constraint workspace_records_kind_check;
alter table public.workspace_records add constraint workspace_records_kind_check check(kind in
 ('plan','session','curriculum','dataset','training','announcement','question_bank','reading_assessment','english_assessment'));
create unique index english_assessment_source_key on public.workspace_records(owner_id,(data->>'source_key')) where kind='english_assessment';

create table private.adventure_placements(
 child_id uuid primary key references public.child_profiles(id),
 evidence_id uuid not null references public.workspace_records(id),
 approved_by uuid not null references public.profiles(id),
 approved_stage_id text not null,selected_stage_id text not null,
 path_revision integer not null,reason text not null check(length(reason) between 10 and 1000),
 confirmed_at timestamptz not null default now(),chosen_at timestamptz
);
alter table private.adventure_placements enable row level security;
revoke all on private.adventure_placements from public,anon,authenticated;

create function private.mission_difficulty(p_position integer,p_count integer) returns text
language sql immutable set search_path='' as $$select (array['beginner','intermediate','advanced'])[least(3,greatest(1,1+((p_position-1)*3/greatest(p_count,1))))]$$;
create function private.english_recommendation(p_profile text) returns text
language sql immutable set search_path='' as $$select case p_profile when 'Low Emerging Reader' then 'beginner' when 'High Emerging Reader' then 'beginner' when 'Developing Reader' then 'intermediate' when 'Transitioning Reader' then 'advanced' when 'Reading At Grade Level' then 'advanced' else null end$$;

create function private.save_english_assessment(p_child_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles; body jsonb; previous public.workspace_records; result uuid;
begin
 if private.current_account_role() is distinct from 'educator' then raise exception 'Active educator required' using errcode='42501';end if;
 select * into child from public.child_profiles where id=p_child_id and adult_id=auth.uid() for update;
 if child.id is null or not private.adventure_can_manage(child.adult_id,child.grade_level) then raise exception 'Choose your assigned learner' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>6000 or p_data-array['source_key','source_title','assessment_date','reading_profile','language','notes']<>'{}'::jsonb
  or exists(select 1 from jsonb_each(p_data) item where jsonb_typeof(item.value)<>'string')
  or coalesce(p_data->>'source_key','')!~'^[a-zA-Z0-9:_-]{1,100}$' or length(btrim(coalesce(p_data->>'source_title',''))) not between 3 and 180
  or coalesce(p_data->>'language','')<>'en' or coalesce(p_data->>'assessment_date','')!~'^\d{4}-\d{2}-\d{2}$'
  or coalesce(p_data->>'reading_profile','') not in ('Low Emerging Reader','High Emerging Reader','Developing Reader','Transitioning Reader','Reading At Grade Level','Other / teacher review')
  or length(coalesce(p_data->>'notes',''))>1000 then raise exception 'Enter the English source assessment, date and reading category' using errcode='22023';end if;
 if (p_data->>'assessment_date')::date>(now() at time zone 'Asia/Manila')::date then raise exception 'Use the date the assessment was actually taken';end if;
 body:=p_data||jsonb_build_object('child_id',child.id,'grade_level',child.grade_level,'is_demo',child.is_demo,'schema_version',1,'recommended_difficulty',private.english_recommendation(p_data->>'reading_profile'),'requires_teacher_confirmation',true);
 perform pg_advisory_xact_lock(hashtextextended('english-assessment:'||auth.uid()::text||':'||(body->>'source_key'),0));
 select * into previous from public.workspace_records where owner_id=auth.uid() and kind='english_assessment' and data->>'source_key'=body->>'source_key';
 if found then if previous.data<>body then raise exception 'Source already recorded; use a new assessment version' using errcode='23505';end if;return previous.id;end if;
 insert into public.workspace_records(owner_id,kind,title,status,data) values(auth.uid(),'english_assessment',left('English assessment Ã‚Â· '||(body->>'source_title'),180),'draft',body) returning id into result;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'english_assessment_recorded','child_profile',child.id,jsonb_build_object('evidence_id',result));
 return result;
end $$;

create function private.confirm_adventure_placement(p_child_id uuid,p_evidence_id uuid,p_stage_id text,p_revision integer,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles; path private.adventure_paths; evidence public.workspace_records; previous private.adventure_placements; started boolean;
begin
 select * into child from public.child_profiles where id=p_child_id and adult_id=auth.uid();
 if child.id is null or not child.active or private.current_account_role() is distinct from 'educator' or not private.adventure_can_manage(child.adult_id,child.grade_level) then raise exception 'Assigned educator required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('adventure:'||child.id::text,0));
 path:=private.adventure_path(child.adult_id,child.grade_level);
 if path.revision is distinct from p_revision then raise exception 'The mission sequence changed. Reload before confirming.';end if;
 if not exists(select 1 from jsonb_array_elements(path.definition) s where s->>'id'=p_stage_id) then raise exception 'Choose a mission in this learner''s grade';end if;
 select * into evidence from public.workspace_records where id=p_evidence_id and kind='english_assessment' and owner_id=auth.uid() and data->>'child_id'=child.id::text and data->>'language'='en';
 if evidence.id is null then raise exception 'Record the separate English assessment first' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'Explain the teacher-confirmed starting point';end if;
 select * into previous from private.adventure_placements where child_id=child.id;
 started:=exists(select 1 from private.adventure_submissions where child_id=child.id);
 if started and (previous.child_id is null or previous.approved_stage_id<>p_stage_id) then raise exception 'This learner already started. Starting placement cannot be moved past unfinished work.';end if;
 insert into private.adventure_placements(child_id,evidence_id,approved_by,approved_stage_id,selected_stage_id,path_revision,reason)
 values(child.id,evidence.id,auth.uid(),p_stage_id,coalesce(previous.selected_stage_id,p_stage_id),path.revision,btrim(p_reason))
 on conflict(child_id) do update set evidence_id=excluded.evidence_id,approved_by=excluded.approved_by,approved_stage_id=excluded.approved_stage_id,
 selected_stage_id=case when started then private.adventure_placements.selected_stage_id else excluded.approved_stage_id end,path_revision=excluded.path_revision,reason=excluded.reason,confirmed_at=now(),chosen_at=case when started then private.adventure_placements.chosen_at else null end;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'english_placement_confirmed','child_profile',child.id,jsonb_build_object('stage_id',p_stage_id,'evidence_id',evidence.id,'revision',path.revision));
 return private.adventure_state(child.id);
end $$;

create function private.educator_placement(p_child_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles; value private.adventure_placements;
begin
 select * into child from public.child_profiles where id=p_child_id and adult_id=auth.uid();
 if child.id is null or not private.adventure_can_manage(child.adult_id,child.grade_level) then raise exception 'Assigned educator required' using errcode='42501';end if;
 select * into value from private.adventure_placements where child_id=child.id;
 return jsonb_build_object('placement',case when value.child_id is not null then to_jsonb(value) end,'has_started',exists(select 1 from private.adventure_submissions where child_id=child.id),'adventure',private.adventure_state(child.id));
end $$;

create function private.student_choose_adventure_start(p_token text,p_stage_id text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles:=private.resolve_child_session(p_token); placement private.adventure_placements; path private.adventure_paths; target integer; maximum integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('adventure:'||child.id::text,0));
 select * into placement from private.adventure_placements where child_id=child.id for update;
 path:=private.adventure_path(child.adult_id,child.grade_level);
 if placement.child_id is null or placement.path_revision<>path.revision or p_revision is distinct from path.revision then raise exception 'Ask your teacher to confirm your starting mission';end if;
 if exists(select 1 from private.adventure_submissions where child_id=child.id) then raise exception 'Your adventure has started. Finish the current mission first.' using errcode='42501';end if;
 select ordinal::integer into target from jsonb_array_elements(path.definition) with ordinality s(value,ordinal) where value->>'id'=p_stage_id;
 select ordinal::integer into maximum from jsonb_array_elements(path.definition) with ordinality s(value,ordinal) where value->>'id'=placement.approved_stage_id;
 if target is null or maximum is null or target>maximum then raise exception 'Choose your assigned starting mission or an earlier one' using errcode='42501';end if;
 update private.adventure_placements set selected_stage_id=p_stage_id,chosen_at=now() where child_id=child.id;
 return private.adventure_state(child.id);
end $$;

create function public.save_english_assessment(p_child_id uuid,p_data jsonb) returns uuid language sql security invoker set search_path='' as $$select private.save_english_assessment(p_child_id,p_data)$$;
create function public.confirm_adventure_placement(p_child_id uuid,p_evidence_id uuid,p_stage_id text,p_revision integer,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select private.confirm_adventure_placement(p_child_id,p_evidence_id,p_stage_id,p_revision,p_reason)$$;
create function public.educator_placement(p_child_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.educator_placement(p_child_id)$$;
create function public.student_choose_adventure_start(p_token text,p_stage_id text,p_revision integer) returns jsonb language sql security invoker set search_path='' as $$select private.student_choose_adventure_start(p_token,p_stage_id,p_revision)$$;
revoke all on function private.mission_difficulty(integer,integer),private.english_recommendation(text) from public,anon,authenticated;
revoke all on function private.save_english_assessment(uuid,jsonb),private.confirm_adventure_placement(uuid,uuid,text,integer,text),private.educator_placement(uuid),private.student_choose_adventure_start(text,text,integer) from public,anon,authenticated;
revoke all on function public.save_english_assessment(uuid,jsonb),public.confirm_adventure_placement(uuid,uuid,text,integer,text),public.educator_placement(uuid),public.student_choose_adventure_start(text,text,integer) from public,anon,authenticated;
grant execute on function private.save_english_assessment(uuid,jsonb),private.confirm_adventure_placement(uuid,uuid,text,integer,text),private.educator_placement(uuid) to authenticated;
grant execute on function public.save_english_assessment(uuid,jsonb),public.confirm_adventure_placement(uuid,uuid,text,integer,text),public.educator_placement(uuid) to authenticated;
grant execute on function private.student_choose_adventure_start(text,text,integer),public.student_choose_adventure_start(text,text,integer) to anon,authenticated;

do $guard$
declare definition text;
begin
 definition:=pg_get_functiondef('private.save_workspace_record_content(uuid,jsonb)'::regprocedure);
 definition:=replace(definition,'v_kind=''reading_assessment''','v_kind in (''reading_assessment'',''english_assessment'')');
 definition:=replace(definition,'kind=''reading_assessment''','kind in (''reading_assessment'',''english_assessment'')');
 execute definition;
end $guard$;

CREATE OR REPLACE FUNCTION private.save_adventure(p_grade integer, p_revision integer, p_stages jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare path private.adventure_paths; stage jsonb; step jsonb; normalized jsonb:='[]'; steps jsonb; material public.learning_materials;
  ids text[]:='{}'; key text; mode text; ordinal integer:=0; represented uuid[]:='{}'; stage_ids text[]:='{}'; stage_key text; band text; band_rank integer; previous_rank integer:=0;
begin
  if not private.adventure_can_manage(auth.uid(),p_grade) then raise exception 'Assigned educator required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('adventure-path:'||auth.uid()::text||':'||p_grade,0));
  path:=private.adventure_path(auth.uid(),p_grade);
  if p_revision<>path.revision then raise exception 'Another edit changed the adventure. Reload before saving.';end if;
  if jsonb_typeof(p_stages)<>'array' or jsonb_array_length(p_stages) not between 1 and 30 then raise exception 'Use one to thirty complete learning missions.';end if;
  for stage in select value from jsonb_array_elements(p_stages) loop
    ordinal:=ordinal+1;steps:='[]';
    stage_key:=coalesce(stage->>'id','stage-'||ordinal);
    band:=coalesce(stage->>'difficulty',private.mission_difficulty(ordinal,jsonb_array_length(p_stages)));
    band_rank:=array_position(array['beginner','intermediate','advanced'],band);
    if stage_key!~'^[a-zA-Z0-9_-]{1,80}$' or stage_key=any(stage_ids) or band_rank is null or band_rank<previous_rank then raise exception 'Use unique mission IDs ordered Beginner, Intermediate, Advanced';end if;
    previous_rank:=band_rank;stage_ids:=array_append(stage_ids,stage_key);
    if length(btrim(stage->>'title')) not between 3 and 70 or jsonb_typeof(stage->'steps')<>'array' or jsonb_array_length(stage->'steps') not between 4 and 200 then raise exception 'Each level needs a title and its learning activities.';end if;
    for step in select value from jsonb_array_elements(stage->'steps') loop
      select * into material from public.learning_materials where id=(step->>'material_id')::uuid and grade_level=p_grade and (status='published' or owner_id=auth.uid() and status='classroom');
      if material.id is null then raise exception 'Use available materials from the assigned grade only.' using errcode='42501';end if;
      if material.kind='story' and exists(select 1 from jsonb_array_elements(coalesce(material.body->'pages',jsonb_build_array(material.body))) p where coalesce(length(btrim(p->>'english')),0)=0) then raise exception 'Every story page needs English text for the required reading check.';end if;
      mode:=case when material.kind='game' then coalesce(step->>'mode','matching') else 'read' end;
      if mode not in ('read','matching','word-builder') or (mode='word-builder' and exists(select 1 from jsonb_array_elements(material.body->'pairs') p where length(regexp_replace(p->>'en','[^[:alpha:]]','','g')) not between 2 and 16)) then raise exception 'Choose a supported game mode.';end if;
      key:=material.id::text||':'||material.version||':'||mode;
      if key=any(ids) then raise exception 'Each activity/mode belongs to one level only.';end if;
      ids:=array_append(ids,key);represented:=array_append(represented,material.id);
      steps:=steps||jsonb_build_array(jsonb_build_object('id',key,'material_id',material.id,'material_version',material.version,'title',material.title,'kind',material.kind)||case when material.kind='game' then jsonb_build_object('mode',mode) else '{}'::jsonb end);
    end loop;
    if exists(select 1 from unnest(array['lesson','game','story','quiz']) k where not exists(select 1 from jsonb_array_elements(steps) s where s->>'kind'=k)) then raise exception 'Every level must include a lesson, game, story and quiz.';end if;
    normalized:=normalized||jsonb_build_array(jsonb_build_object('id',stage_key,'difficulty',band,'title',btrim(stage->>'title'),'subtitle',left(coalesce(stage->>'subtitle',''),70),'steps',steps));
  end loop;
  if exists(select 1 from public.learning_materials m where m.grade_level=p_grade and (m.status='published' or m.owner_id=auth.uid() and m.status='classroom') and not(m.id=any(represented))) then raise exception 'Include every available grade material in the adventure. Add any newly published material before saving.';end if;
  update private.adventure_paths set definition=normalized,revision=revision+1,updated_at=now() where owner_id=auth.uid() and grade_level=p_grade;
  insert into public.audit_logs(actor_id,action,entity_type,metadata) values(auth.uid(),'adventure_path_updated','learning_path',jsonb_build_object('grade',p_grade,'revision',path.revision+1));
  return private.educator_adventure(p_grade);
end $function$
;
CREATE OR REPLACE FUNCTION private.adventure_state(p_child uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare child public.child_profiles; path private.adventure_paths; stage jsonb; step jsonb; stages jsonb:='[]'; steps jsonb;
  progress private.adventure_progress; attempt public.learning_attempts; first_step text; stage_done integer; blocked boolean:=false; stage_blocked boolean;
  checks integer; total_checks integer; page jsonb;
  placement private.adventure_placements; position integer:=0; chosen integer:=1; maximum integer; started boolean; stale boolean:=false;
begin
  select * into strict child from public.child_profiles where id=p_child;
  path:=private.adventure_path(child.adult_id,child.grade_level);
  select * into placement from private.adventure_placements where child_id=p_child;
  started:=exists(select 1 from private.adventure_submissions where child_id=p_child);
  if placement.child_id is not null then
    select ordinal::integer into chosen from jsonb_array_elements(path.definition) with ordinality s(value,ordinal) where value->>'id'=placement.selected_stage_id;
    select ordinal::integer into maximum from jsonb_array_elements(path.definition) with ordinality s(value,ordinal) where value->>'id'=placement.approved_stage_id;
    stale:=placement.path_revision<>path.revision or chosen is null or maximum is null;
    if stale then blocked:=true;end if;
  end if;
  for stage in select value from jsonb_array_elements(path.definition) loop
    position:=position+1;
    stage:=stage||jsonb_build_object('difficulty',coalesce(stage->>'difficulty',private.mission_difficulty(position,jsonb_array_length(path.definition))));
    if not stale and position<chosen then
      select jsonb_agg(value||jsonb_build_object('status','not-assigned','score',null)) into steps from jsonb_array_elements(stage->'steps');
      stages:=stages||jsonb_build_array(stage||jsonb_build_object('steps',steps,'completed',0,'total',0,'status','not-assigned'));
      continue;
    end if;
    steps:='[]';stage_done:=0;stage_blocked:=blocked;
    for step in select value from jsonb_array_elements(stage->'steps') loop
      select * into progress from private.adventure_progress where child_id=p_child and step_id=step->>'id';
      select * into attempt from public.learning_attempts where id=progress.last_attempt_id;
      total_checks:=0;checks:=0;
      if step->>'kind'='story' then
        for page in select value from public.learning_materials m cross join lateral jsonb_array_elements(coalesce(m.body->'pages',jsonb_build_array(m.body))) where m.id=(step->>'material_id')::uuid loop
          total_checks:=total_checks+jsonb_array_length(private.adventure_parts(page->>'english'));
        end loop;
        select count(*) into checks from private.adventure_reading_checks where child_id=p_child and step_id=step->>'id' and passed;
      end if;
      step:=step||jsonb_build_object('status',case when progress.passed then 'completed' when blocked then 'locked' else coalesce(progress.status,'current') end,
        'score',case when attempt.id is not null then jsonb_build_object('correct',attempt.correct_count,'total',attempt.total_count) end,
        'reading_checked',checks,'reading_total',total_checks,'teacher_approved',progress.teacher_approved_by is not null);
      if progress.passed then stage_done:=stage_done+1;
      elsif not blocked then first_step:=step->>'id';blocked:=true;
      end if;
      steps:=steps||jsonb_build_array(step);
    end loop;
    stages:=stages||jsonb_build_array(stage||jsonb_build_object('steps',steps,'completed',stage_done,'total',jsonb_array_length(steps),'status',case when stage_done=jsonb_array_length(steps) and stage_done>0 then 'completed' when stage_blocked then 'locked' else 'active' end));
  end loop;
  return jsonb_build_object('revision',path.revision,'stages',stages,'current_step_id',first_step,'quiz_pass_percent',80,'placement',case when placement.child_id is null then null else jsonb_build_object('approved_stage_id',placement.approved_stage_id,'selected_stage_id',placement.selected_stage_id,'can_choose_start',not started and not stale,'requires_review',stale,'maximum_start_index',maximum-1) end);
end $function$
;
-- Existing owner-only storage policies remain unchanged. Playback objects are
-- fetched by the authenticated API after checking archive and learner ownership.
update storage.buckets set allowed_mime_types=array(select distinct mime from unnest(coalesce(allowed_mime_types,array['application/zip'])||array['audio/wav']) mime) where id='offline-collections';
notify pgrst,'reload schema';

