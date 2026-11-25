-- Mission rewards are server-derived. No browser may create or edit an award.
create table private.mission_awards (
 child_id uuid not null references public.child_profiles(id) on delete cascade,
 mission_id text not null check(length(mission_id) between 1 and 80),
 grade_level smallint not null check(grade_level between 1 and 6),
 title text not null,
 difficulty text not null check(difficulty in ('beginner','intermediate','advanced')),
 definition_revision integer not null,
 evidence_step_ids jsonb not null check(jsonb_typeof(evidence_step_ids)='array' and jsonb_array_length(evidence_step_ids)>0),
 awarded_at timestamptz not null,
 primary key(child_id,grade_level,mission_id)
);
alter table private.mission_awards enable row level security;
revoke all on private.mission_awards from public,anon,authenticated;

create function private.sync_mission_awards(p_child uuid,p_state jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles; state jsonb; stage jsonb; earned_at timestamptz;
begin
 select * into child from public.child_profiles where id=p_child and active;
 if child.id is null then return;end if;
 if not exists(select 1 from private.adventure_paths where owner_id=child.adult_id and grade_level=child.grade_level) then return;end if;
 state:=coalesce(p_state,private.adventure_state(child.id));
 for stage in select value from jsonb_array_elements(state->'stages') loop
  if stage->>'status'<>'completed' or coalesce((stage->>'total')::int,0)=0 then continue;end if;
  if exists(select 1 from jsonb_array_elements(stage->'steps') s where not exists(
    select 1 from private.adventure_progress p where p.child_id=child.id and p.step_id=s->>'id' and p.passed)) then continue;end if;
  select max(p.updated_at) into earned_at from private.adventure_progress p
    where p.child_id=child.id and exists(select 1 from jsonb_array_elements(stage->'steps') s where s->>'id'=p.step_id);
  insert into private.mission_awards(child_id,mission_id,grade_level,title,difficulty,definition_revision,evidence_step_ids,awarded_at)
  values(child.id,stage->>'id',child.grade_level,stage->>'title',stage->>'difficulty',(state->>'revision')::int,
    (select jsonb_agg(s->>'id') from jsonb_array_elements(stage->'steps') s),coalesce(earned_at,now()))
  on conflict(child_id,grade_level,mission_id) do nothing;
 end loop;
end $$;

create function private.mission_award_after_progress() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.passed then perform private.sync_mission_awards(new.child_id);end if;
 return new;
end $$;
create trigger mission_award_after_progress after insert or update on private.adventure_progress
for each row execute function private.mission_award_after_progress();

-- This private board contains IDs for teacher-side joins. Student output below
-- uses a whitelist and never includes another child's ID, name or other records.
create function private.mission_class_board(p_owner uuid,p_grade integer,p_demo boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles; state jsonb; assigned integer; completed integer; rows jsonb:='[]';
begin
 for child in select * from public.child_profiles where adult_id=p_owner and grade_level=p_grade and active and is_demo=p_demo order by id loop
  state:=private.adventure_state(child.id);
  select count(*) filter(where s->>'status'<>'not-assigned'),count(*) filter(where s->>'status'='completed')
    into assigned,completed from jsonb_array_elements(state->'stages') s;
  rows:=rows||jsonb_build_array(jsonb_build_object('child_id',child.id,
    'alias','Explorer '||upper(substr(md5(child.id::text||child.adult_id::text),1,8)),
    'completed_missions',completed,'assigned_missions',assigned,
    'completion_percent',case when assigned>0 then round(100.0*completed/assigned,2) else 0 end,
    'placement_review_required',coalesce((state#>>'{placement,requires_review}')::boolean,false)));
 end loop;
 return coalesce((with items as(select * from jsonb_to_recordset(rows) as r(child_id uuid,alias text,completed_missions int,assigned_missions int,completion_percent numeric,placement_review_required boolean)),
 ranked as(select child_id,rank() over(order by completed_missions desc,completion_percent desc) as position,
   count(*) over(partition by completed_missions,completion_percent)>1 as tied
   from items where completed_missions>0 and not placement_review_required)
 select jsonb_agg(to_jsonb(i)||jsonb_build_object('rank',r.position,'tied',coalesce(r.tied,false))
   order by r.position nulls last,i.alias) from items i left join ranked r using(child_id)),'[]'::jsonb);
end $$;

create function private.mission_reward_summary(p_child uuid,p_board jsonb,p_include_board boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles; own jsonb; badges jsonb; milestones jsonb; earned integer; payload jsonb;
begin
 select * into child from public.child_profiles where id=p_child and active;
 if child.id is null then raise exception 'Choose an active learner' using errcode='42501';end if;
 select value into own from jsonb_array_elements(p_board) where value->>'child_id'=child.id::text;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.mission_id,'title',a.title,'difficulty',a.difficulty,
   'grade_level',a.grade_level,'awarded_at',a.awarded_at,'verification','verified') order by a.awarded_at,a.mission_id),'[]'),count(*)
   into badges,earned from private.mission_awards a where a.child_id=child.id and a.grade_level=child.grade_level;
 select jsonb_agg(jsonb_build_object('id','missions-'||target,'target',target,'earned',earned>=target,
   'progress',least(earned,target))) into milestones from unnest(array[1,3,5,10]) target;
 payload:=coalesce(own-'child_id','{}')||jsonb_build_object('grade_level',child.grade_level,'source','cloud_verified',
   'class_size',jsonb_array_length(p_board),'earned_count',earned,'mission_badges',badges,'milestones',milestones,
   'ranking_basis','completed_missions_then_assigned_percent','is_demo',child.is_demo);
 if p_include_board then
  payload:=payload||jsonb_build_object('leaderboard',coalesce((select jsonb_agg(jsonb_build_object(
   'alias',row->>'alias','rank',row->'rank','tied',row->'tied','completed_missions',row->'completed_missions',
   'assigned_missions',row->'assigned_missions','completion_percent',row->'completion_percent',
   'placement_review_required',row->'placement_review_required','is_you',row->>'child_id'=child.id::text))
    from jsonb_array_elements(p_board) row),'[]'));
 end if;
 return payload;
end $$;

create function private.student_mission_rewards(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles:=private.resolve_child_session(p_token); board jsonb;
begin
 perform private.sync_mission_awards(child.id);
 board:=private.mission_class_board(child.adult_id,child.grade_level,child.is_demo);
 return private.mission_reward_summary(child.id,board,true);
end $$;
create function public.student_mission_rewards(p_token text) returns jsonb
language sql security invoker set search_path='' as $$select private.student_mission_rewards(p_token)$$;

create or replace function private.student_adventure_state(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles:=private.resolve_child_session(p_token);
begin
 return private.student_learning_state(p_token)||jsonb_build_object('adventure',private.adventure_state(child.id),'rewards',private.student_mission_rewards(p_token));
end $$;

create or replace function private.educator_adventure_progress(p_grade integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child public.child_profiles; board_real jsonb; board_demo jsonb; state jsonb; result jsonb:='[]';
begin
 if not private.adventure_can_manage(auth.uid(),p_grade) then raise exception 'Assigned educator required' using errcode='42501';end if;
 for child in select * from public.child_profiles where adult_id=auth.uid() and grade_level=p_grade and active order by id loop
  perform private.sync_mission_awards(child.id);
 end loop;
 board_real:=private.mission_class_board(auth.uid(),p_grade,false);
 board_demo:=private.mission_class_board(auth.uid(),p_grade,true);
 for child in select * from public.child_profiles where adult_id=auth.uid() and grade_level=p_grade and active order by nickname,id loop
  state:=private.adventure_state(child.id);
  result:=result||jsonb_build_array(jsonb_build_object('child_id',child.id,'nickname',child.nickname,'adventure',state,
    'rewards',private.mission_reward_summary(child.id,case when child.is_demo then board_demo else board_real end),
    'quiz_attempts',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('stage_id',s.stage_id,'step_id',s.step_id) order by a.completed_at desc)
      from private.adventure_submissions s join public.learning_attempts a on a.submission_id=s.submission_id where s.child_id=child.id and a.activity_kind='quiz'),'[]')));
 end loop;
 return result;
end $$;

-- New private helpers and the ledger remain inaccessible to browser roles.
revoke all on function private.sync_mission_awards(uuid,jsonb) from public,anon,authenticated;
revoke all on function private.mission_award_after_progress() from public,anon,authenticated;
revoke all on function private.mission_class_board(uuid,integer,boolean) from public,anon,authenticated;
revoke all on function private.mission_reward_summary(uuid,jsonb,boolean) from public,anon,authenticated;
revoke all on function private.student_mission_rewards(text) from public,anon,authenticated;
revoke all on function public.student_mission_rewards(text) from public,anon,authenticated;
grant execute on function private.student_mission_rewards(text),public.student_mission_rewards(text) to anon,authenticated;
-- Existing wrapper grants and ownership remain unchanged.
do $$declare child_id uuid;begin
 for child_id in select distinct p.child_id from private.adventure_progress p where p.passed order by p.child_id loop
  perform private.sync_mission_awards(child_id);
 end loop;
end $$;
notify pgrst,'reload schema';

