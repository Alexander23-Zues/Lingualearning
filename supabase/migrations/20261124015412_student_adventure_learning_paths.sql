-- Guided student adventures. No historical attempts or student identities are removed.
create table private.adventure_paths (
  owner_id uuid not null references public.profiles(id),
  grade_level smallint not null check (grade_level between 1 and 6),
  revision integer not null default 1,
  definition jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(owner_id,grade_level)
);
create table private.adventure_progress (
  child_id uuid not null references public.child_profiles(id),
  step_id text not null,
  passed boolean not null default false,
  status text not null default 'current',
  last_attempt_id uuid references public.learning_attempts(id),
  teacher_approved_by uuid references public.profiles(id),
  teacher_note text,
  updated_at timestamptz not null default now(),
  primary key(child_id,step_id)
);
create table private.adventure_submissions (
  submission_id uuid primary key references public.learning_attempts(submission_id),
  child_id uuid not null references public.child_profiles(id),
  step_id text not null,
  stage_id text not null
);
create index adventure_submission_child on private.adventure_submissions(child_id);
create table private.adventure_reading_checks (
  child_id uuid not null references public.child_profiles(id),
  step_id text not null,
  page_index integer not null check(page_index>=0),
  part_index integer not null check(part_index>=0),
  passed boolean not null,
  matched_count integer not null check(matched_count>=0),
  expected_count integer not null check(expected_count>0),
  recognition_status text not null,
  checked_at timestamptz not null default now(),
  primary key(child_id,step_id,page_index,part_index)
);
alter table private.adventure_paths enable row level security;
alter table private.adventure_progress enable row level security;
alter table private.adventure_submissions enable row level security;
alter table private.adventure_reading_checks enable row level security;
revoke all on private.adventure_paths,private.adventure_progress,private.adventure_submissions,private.adventure_reading_checks from public,anon,authenticated;

create function private.adventure_can_manage(p_owner uuid,p_grade integer) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_administrator() or exists(select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.id=p_owner and p.role='educator' and p.status='active'
    and p.retired_at is null and p_grade=any(p.grade_levels)
    and (p.account_kind='review' or p.teacher_approved_at is not null));
$$;

create function private.adventure_parts(p_text text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb:='[]'; part text:=''; item text; words integer:=0;
begin
  foreach item in array regexp_split_to_array(btrim(coalesce(p_text,'')),'\s+') loop
    if item='' then continue;end if;
    if words>0 and (words>=8 or length(part)+1+length(item)>72) then
      result:=result||jsonb_build_array(part);part:='';words:=0;
    end if;
    part:=part||case when words>0 then ' ' else '' end||item;words:=words+1;
  end loop;
  if part<>'' then result:=result||jsonb_build_array(part);end if;
  return result;
end $$;

create function private.adventure_default(p_owner uuid,p_grade integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare stages jsonb:='[]'; steps jsonb; i integer; n integer; row record; mode text;
  titles text[]:=array['Arko ng Simula','Gubat ng Salita','Lawa ng Pagsubok','Bundok ng Karunungan','Karagatan ng Kuwento'];
  subtitles text[]:=array['Unang tuklas','Mga bagong salita','Subok at pagsasanay','Tuloy sa pagkatuto','Kuwento ng tagumpay'];
begin
  select least(5,coalesce(min(c),0)) into n from (
    select k,count(m.id)::integer c from unnest(array['lesson','game','story','quiz']) k
    left join public.learning_materials m on m.kind=k and m.grade_level=p_grade
      and (m.status='published' or (m.owner_id=p_owner and m.status='classroom')) group by k) counts;
  if n=0 then return '[]'::jsonb;end if;
  for i in 0..n-1 loop
    steps:='[]';
    for row in select * from (
      select m.*,row_number() over(partition by m.kind order by m.quiz_number nulls last,m.title,m.id)-1 ordinal
      from public.learning_materials m where m.grade_level=p_grade
        and (m.status='published' or (m.owner_id=p_owner and m.status='classroom'))
    ) a where mod(a.ordinal,n)=i order by case kind when 'lesson' then 0 when 'dictionary' then 1 when 'vocabulary' then 1 when 'game' then 2 when 'story' then 3 else 4 end,ordinal loop
      if row.kind='game' and jsonb_array_length(coalesce(row.body->'pairs','[]'))>0 and not exists(
        select 1 from jsonb_array_elements(row.body->'pairs') p where length(regexp_replace(p->>'en','[^[:alpha:]]','','g')) not between 2 and 16) then
        foreach mode in array array['word-builder','matching'] loop
          steps:=steps||jsonb_build_array(jsonb_build_object('id',row.id::text||':'||row.version||':'||mode,'material_id',row.id,'material_version',row.version,'kind',row.kind,'title',row.title,'mode',mode));
        end loop;
      else
        steps:=steps||jsonb_build_array(jsonb_build_object('id',row.id::text||':'||row.version||':read','material_id',row.id,'material_version',row.version,'kind',row.kind,'title',row.title));
      end if;
    end loop;
    stages:=stages||jsonb_build_array(jsonb_build_object('id','stage-'||(i+1),'title',titles[i+1],'subtitle',subtitles[i+1],'steps',steps));
  end loop;
  return stages;
end $$;

create function private.adventure_path(p_owner uuid,p_grade integer) returns private.adventure_paths
language plpgsql security definer set search_path='' as $$
declare result private.adventure_paths;
begin
  select * into result from private.adventure_paths where owner_id=p_owner and grade_level=p_grade;
  if not found then
    insert into private.adventure_paths(owner_id,grade_level,definition) values(p_owner,p_grade,private.adventure_default(p_owner,p_grade)) on conflict do nothing;
    select * into result from private.adventure_paths where owner_id=p_owner and grade_level=p_grade;
  end if;
  return result;
end $$;

create function private.adventure_state(p_child uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles; path private.adventure_paths; stage jsonb; step jsonb; stages jsonb:='[]'; steps jsonb;
  progress private.adventure_progress; attempt public.learning_attempts; first_step text; stage_done integer; blocked boolean:=false; stage_blocked boolean;
  checks integer; total_checks integer; page jsonb;
begin
  select * into strict child from public.child_profiles where id=p_child;
  path:=private.adventure_path(child.adult_id,child.grade_level);
  for stage in select value from jsonb_array_elements(path.definition) loop
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
  return jsonb_build_object('revision',path.revision,'stages',stages,'current_step_id',first_step,'quiz_pass_percent',80);
end $$;

create function private.student_adventure_state(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles:=private.resolve_child_session(p_token);
begin return private.student_learning_state(p_token)||jsonb_build_object('adventure',private.adventure_state(child.id));end $$;

create function private.adventure_current_step(p_child uuid,p_step text,p_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare state jsonb:=private.adventure_state(p_child); step jsonb;
begin
  if p_revision is not null and (state->>'revision')::int<>p_revision then raise exception 'Your teacher updated the adventure. Reopen the map before continuing.';end if;
  if state->>'current_step_id' is distinct from p_step then raise exception 'Finish the current adventure activity first.' using errcode='42501';end if;
  select item into step from jsonb_array_elements(state->'stages') s cross join lateral jsonb_array_elements(s->'steps') item where item->>'id'=p_step;
  if step is null then raise exception 'Adventure activity unavailable';end if;
  return step;
end $$;

-- Retain the existing server grader, snapshots, retry deduplication and star rules.
alter function private.student_complete_material(text,uuid,integer,uuid,jsonb) rename to student_complete_material_legacy;
revoke all on function private.student_complete_material_legacy(text,uuid,integer,uuid,jsonb) from public,anon,authenticated;
create function private.student_complete_material(p_token text,p_material_id uuid,p_version integer,p_submission_id uuid,p_answers jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles:=private.resolve_child_session(p_token);
begin
  if exists(select 1 from private.adventure_paths where owner_id=child.adult_id and grade_level=child.grade_level) then
    raise exception 'Open this activity through your guided adventure.' using errcode='42501';
  end if;
  return private.student_complete_material_legacy(p_token,p_material_id,p_version,p_submission_id,p_answers);
end $$;

create function private.student_adventure_complete(p_token text,p_step_id text,p_revision integer,p_submission_id uuid,p_answers jsonb) returns jsonb
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
        if not exists(select 1 from private.adventure_reading_checks where child_id=child.id and step_id=p_step_id and page_index=page_number and part_index=part_number and passed) then
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

create function private.adventure_reading_context(p_token text,p_step_id text,p_page integer,p_part integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles:=private.resolve_child_session(p_token); step jsonb; material public.learning_materials; text text;
begin
  step:=private.adventure_current_step(child.id,p_step_id);
  if step->>'kind'<>'story' or p_page<0 or p_part<0 then raise exception 'Choose the current story reading part.';end if;
  select * into material from public.learning_materials where id=(step->>'material_id')::uuid and version=(step->>'material_version')::int;
  text:=private.adventure_parts(coalesce(material.body->'pages',jsonb_build_array(material.body))->p_page->>'english')->>p_part;
  if text is null or length(text)=0 or length(text)>300 then raise exception 'This reading part is unavailable. Ask your teacher for help.';end if;
  return jsonb_build_object('text',text,'language','en','child_id',child.id);
end $$;

create function private.adventure_record_reading(p_token text,p_step_id text,p_page integer,p_part integer,p_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb:=private.adventure_reading_context(p_token,p_step_id,p_page,p_part); v_child_id uuid:=(context->>'child_id')::uuid; v_passed boolean; expected integer; matched integer;
begin
  if p_result->>'recognition_status'='no_speech' or coalesce((p_result->>'speech_detected')::boolean,false)=false then
    return jsonb_build_object('recorded',false,'reason','no_speech');
  end if;
  expected:=greatest(1,(p_result->>'expected_word_count')::int);
  matched:=least(expected,jsonb_array_length(coalesce(p_result->'matched_words','[]')));
  v_passed:=p_result->>'recognition_status'='recognized' and matched=expected and jsonb_array_length(coalesce(p_result->'extra_words','[]'))<=greatest(1,expected/4);
  insert into private.adventure_reading_checks values(v_child_id,p_step_id,p_page,p_part,v_passed,matched,expected,p_result->>'recognition_status',now())
    on conflict(child_id,step_id,page_index,part_index) do update set passed=private.adventure_reading_checks.passed or excluded.passed,matched_count=greatest(private.adventure_reading_checks.matched_count,excluded.matched_count),recognition_status=excluded.recognition_status,checked_at=now();
  insert into private.adventure_progress(child_id,step_id,status) values(v_child_id,p_step_id,case when v_passed then 'current' else 'needs_review' end)
    on conflict(child_id,step_id) do update set status=case when private.adventure_progress.passed then 'completed' when excluded.status='needs_review' then 'needs_review' else private.adventure_progress.status end,updated_at=now();
  return jsonb_build_object('recorded',true,'part_passed',v_passed,'adventure',private.adventure_state(v_child_id));
end $$;

create function private.educator_adventure(p_grade integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare path private.adventure_paths;
begin
  if not private.adventure_can_manage(auth.uid(),p_grade) then raise exception 'Assigned educator required' using errcode='42501';end if;
  path:=private.adventure_path(auth.uid(),p_grade);
  return jsonb_build_object('revision',path.revision,'stages',path.definition,'quiz_pass_percent',80);
end $$;

create function private.save_adventure(p_grade integer,p_revision integer,p_stages jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare path private.adventure_paths; stage jsonb; step jsonb; normalized jsonb:='[]'; steps jsonb; material public.learning_materials;
  ids text[]:='{}'; key text; mode text; ordinal integer:=0; represented uuid[]:='{}';
begin
  if not private.adventure_can_manage(auth.uid(),p_grade) then raise exception 'Assigned educator required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('adventure-path:'||auth.uid()::text||':'||p_grade,0));
  path:=private.adventure_path(auth.uid(),p_grade);
  if p_revision<>path.revision then raise exception 'Another edit changed the adventure. Reload before saving.';end if;
  if jsonb_typeof(p_stages)<>'array' or jsonb_array_length(p_stages) not between 1 and 5 then raise exception 'Use one to five complete learning levels.';end if;
  for stage in select value from jsonb_array_elements(p_stages) loop
    ordinal:=ordinal+1;steps:='[]';
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
    normalized:=normalized||jsonb_build_array(jsonb_build_object('id','stage-'||ordinal,'title',btrim(stage->>'title'),'subtitle',left(coalesce(stage->>'subtitle',''),70),'steps',steps));
  end loop;
  if exists(select 1 from public.learning_materials m where m.grade_level=p_grade and (m.status='published' or m.owner_id=auth.uid() and m.status='classroom') and not(m.id=any(represented))) then raise exception 'Include every available grade material in the adventure. Add any newly published material before saving.';end if;
  update private.adventure_paths set definition=normalized,revision=revision+1,updated_at=now() where owner_id=auth.uid() and grade_level=p_grade;
  insert into public.audit_logs(actor_id,action,entity_type,metadata) values(auth.uid(),'adventure_path_updated','learning_path',jsonb_build_object('grade',p_grade,'revision',path.revision+1));
  return private.educator_adventure(p_grade);
end $$;

create function private.educator_adventure_progress(p_grade integer) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not private.adventure_can_manage(auth.uid(),p_grade) then raise exception 'Assigned educator required' using errcode='42501';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('child_id',c.id,'nickname',c.nickname,'adventure',private.adventure_state(c.id),
    'quiz_attempts',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('stage_id',s.stage_id,'step_id',s.step_id) order by a.completed_at desc) from private.adventure_submissions s join public.learning_attempts a on a.submission_id=s.submission_id where s.child_id=c.id and a.activity_kind='quiz'),'[]'::jsonb))) from public.child_profiles c where c.adult_id=auth.uid() and c.grade_level=p_grade and c.active),'[]');
end $$;

create function private.approve_adventure_reading(p_child_id uuid,p_step_id text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles; step jsonb;
begin
  select * into child from public.child_profiles where id=p_child_id and active;
  if child.id is null or not private.adventure_can_manage(child.adult_id,child.grade_level) then raise exception 'Assigned educator required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('adventure:'||child.id::text,0));
  step:=private.adventure_current_step(child.id,p_step_id);
  if step->>'kind'<>'story' or length(btrim(p_reason)) not between 10 and 1000 then raise exception 'Select the current story and explain your observed reading review.';end if;
  if not exists(select 1 from private.adventure_reading_checks where child_id=child.id and step_id=p_step_id) then raise exception 'The learner needs a voiced AI reading attempt before teacher review.';end if;
  insert into private.adventure_progress(child_id,step_id,teacher_approved_by,teacher_note,status) values(child.id,p_step_id,auth.uid(),btrim(p_reason),'current')
    on conflict(child_id,step_id) do update set teacher_approved_by=auth.uid(),teacher_note=btrim(p_reason),status='current',updated_at=now();
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'adventure_reading_teacher_approved','child_profile',child.id,jsonb_build_object('step_id',p_step_id,'reason',btrim(p_reason)));
  return private.adventure_state(child.id);
end $$;

-- Public entry points use the existing scoped child token or an authenticated teacher.
create function public.student_adventure_state(p_token text) returns jsonb language sql security invoker set search_path='' as $$select private.student_adventure_state(p_token)$$;
create function public.student_adventure_complete(p_token text,p_step_id text,p_revision integer,p_submission_id uuid,p_answers jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.student_adventure_complete(p_token,p_step_id,p_revision,p_submission_id,p_answers)$$;
create function public.educator_adventure(p_grade integer) returns jsonb language sql security invoker set search_path='' as $$select private.educator_adventure(p_grade)$$;
create function public.save_adventure(p_grade integer,p_revision integer,p_stages jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.save_adventure(p_grade,p_revision,p_stages)$$;
create function public.educator_adventure_progress(p_grade integer) returns jsonb language sql security invoker set search_path='' as $$select private.educator_adventure_progress(p_grade)$$;
create function public.approve_adventure_reading(p_child_id uuid,p_step_id text,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select private.approve_adventure_reading(p_child_id,p_step_id,p_reason)$$;
create function public.adventure_reading_context(p_token text,p_step_id text,p_page integer,p_part integer) returns jsonb language sql security invoker set search_path='' as $$select private.adventure_reading_context(p_token,p_step_id,p_page,p_part)$$;
create function public.adventure_record_reading(p_token text,p_step_id text,p_page integer,p_part integer,p_result jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.adventure_record_reading(p_token,p_step_id,p_page,p_part,p_result)$$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and (p.proname like '%adventure%' or p.proname='student_complete_material') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.proname in ('student_adventure_state','student_adventure_complete','student_complete_material') then execute format('grant execute on function %s to anon,authenticated',f.signature);
    elsif f.proname in ('educator_adventure','save_adventure','educator_adventure_progress','approve_adventure_reading') then execute format('grant execute on function %s to authenticated',f.signature);
    elsif f.proname in ('adventure_reading_context','adventure_record_reading') then execute format('grant execute on function %s to service_role',f.signature);end if;
  end loop;
end $$;
notify pgrst,'reload schema';


