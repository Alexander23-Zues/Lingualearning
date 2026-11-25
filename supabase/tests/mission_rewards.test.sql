-- Synthetic integration fixtures only. No model accuracy is asserted here.
-- The transaction must be rolled back, and this must never run on hosted data.
begin;
do $test$
declare
 v_owner uuid:=gen_random_uuid();v_child uuid;v_token text;v_materials uuid[]:='{}';
 v_lesson uuid;v_game uuid;v_story uuid;v_quiz uuid;v_question uuid;v_a uuid;v_b uuid;
 v_questions jsonb;v_stages jsonb:='[]';v_definition jsonb;v_result jsonb;v_state jsonb;v_progress jsonb;
 v_question_ids uuid[]:='{}';v_correct uuid[]:='{}';v_wrong uuid[]:='{}';v_answers jsonb:='{}';
 v_story_submission uuid:=gen_random_uuid();v_quiz_submission uuid:=gen_random_uuid();
 v_rewards jsonb;v_peer uuid;v_advanced uuid;v_hidden uuid;v_other_owner uuid:=gen_random_uuid();v_assessment uuid;v_denied_rewards boolean;v_teacher_rows jsonb;v_original_title text;v_i integer;v_j integer;v_denied boolean;v_count integer;v_material record;v_case jsonb;v_decision text;
begin
 if current_database()<>'linguakids_final_placement' then raise exception 'Use the isolated synthetic test database';end if;
 perform set_config('session_replication_role','replica',true);
 insert into auth.users(id,email,email_confirmed_at) values(v_owner,'guided-review@fixture.invalid',now());
 insert into public.profiles(id,email,name,role,status,account_kind,grade_levels)
 values(v_owner,'guided-review@fixture.invalid','Synthetic review teacher','educator','active','review',array[1,2]::smallint[]);
 perform set_config('session_replication_role','origin',true);
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 v_child:=public.save_child_profile(null,'{"nickname":"Synthetic review learner","grade_level":1,"learning_level":"beginner","avatar_key":"owl"}');
 for v_i in 1..2 loop
  v_lesson:=public.save_learning_material(null,jsonb_build_object('kind','lesson','title','Synthetic lesson '||v_i,'grade_level',1,'status','classroom','body','{"english":"The bird is blue.","filipino":"Asul ang ibon."}'::jsonb));
  v_game:=public.save_learning_material(null,jsonb_build_object('kind','game','title','Synthetic game '||v_i,'grade_level',1,'status','classroom','body','{"pairs":[{"en":"bird","fil":"ibon"}]}'::jsonb));
  v_story:=public.save_learning_material(null,jsonb_build_object('kind','story','title','Synthetic story '||v_i,'grade_level',1,'status','classroom','body','{"pages":[{"english":"The small bird is blue.","filipino":"Asul ang maliit na ibon."}]}'::jsonb));
  v_questions:='[]';
  for v_j in 1..5 loop
   v_question:=gen_random_uuid();v_a:=gen_random_uuid();v_b:=gen_random_uuid();
   v_questions:=v_questions||jsonb_build_array(jsonb_build_object('id',v_question,'prompt','Which word means bird?','options',jsonb_build_array(jsonb_build_object('id',v_a,'text','ibon'),jsonb_build_object('id',v_b,'text','pusa')),'correct_option_id',v_a));
   if v_i=1 then v_question_ids:=array_append(v_question_ids,v_question);v_correct:=array_append(v_correct,v_a);v_wrong:=array_append(v_wrong,v_b);end if;
  end loop;
  v_quiz:=public.save_learning_material(null,jsonb_build_object('kind','quiz','title','Synthetic quiz '||v_i,'grade_level',1,'status','classroom','body',jsonb_build_object('questions',v_questions)));
  v_materials:=v_materials||array[v_lesson,v_game,v_story,v_quiz];
  v_stages:=v_stages||jsonb_build_array(jsonb_build_object('id','review-mission-'||v_i,'title','Synthetic mission '||v_i,'difficulty',case when v_i=1 then 'beginner' else 'intermediate' end,'steps',jsonb_build_array(jsonb_build_object('material_id',v_lesson),jsonb_build_object('material_id',v_game,'mode','matching'),jsonb_build_object('material_id',v_story),jsonb_build_object('material_id',v_quiz))));
 end loop;
 -- Keep all seeded published content represented, after this fixture's first mission.
 for v_material in select * from public.learning_materials where grade_level=1 and (status='published' or owner_id=v_owner and status='classroom') and not(id=any(v_materials)) loop
  v_stages:=jsonb_set(v_stages,'{1,steps}',v_stages#>'{1,steps}'||jsonb_build_array(jsonb_build_object('material_id',v_material.id,'mode','matching')));
 end loop;
 v_definition:=public.educator_adventure(1);
 v_definition:=public.save_adventure(1,(v_definition->>'revision')::int,v_stages);
 v_token:=public.open_child_session(v_child)->>'token';
 execute 'set local role anon';

 execute 'set local role authenticated';
 v_peer:=public.save_child_profile(null,'{"nickname":"PRIVATE PEER NAME","grade_level":1,"learning_level":"beginner","avatar_key":"owl"}');
 v_advanced:=public.save_child_profile(null,'{"nickname":"PRIVATE ADVANCED NAME","grade_level":1,"learning_level":"beginner","avatar_key":"owl"}');
 v_hidden:=public.save_child_profile(null,'{"nickname":"OTHER GRADE NAME","grade_level":2,"learning_level":"beginner","avatar_key":"owl"}');
 v_hidden:=public.save_child_profile(null,'{"nickname":"INACTIVE PEER NAME","grade_level":1,"learning_level":"beginner","avatar_key":"owl","active":false}');
 v_hidden:=public.save_child_profile(null,'{"nickname":"REAL GROUP NAME","grade_level":1,"learning_level":"beginner","avatar_key":"owl"}');
 execute 'reset role';
 perform set_config('session_replication_role','replica',true);
 update public.child_profiles set is_demo=false where id=v_hidden;
 insert into auth.users(id,email,email_confirmed_at) values(v_other_owner,'other-rewards@fixture.invalid',now());
 insert into public.profiles(id,email,name,role,status,account_kind,grade_levels)
 values(v_other_owner,'other-rewards@fixture.invalid','Foreign synthetic teacher','educator','active','review',array[1]::smallint[]);
 insert into public.child_profiles(adult_id,nickname,grade_level,learning_level,avatar_key,active,is_demo)
 values(v_other_owner,'FOREIGN CLASS NAME',1,'beginner','owl',true,true);
 perform set_config('session_replication_role','origin',true);
 execute 'set local role anon';
 v_rewards:=public.student_mission_rewards(v_token);
 if jsonb_array_length(v_rewards->'leaderboard')<>3 then raise exception 'Rankings mixed grades, owners, inactive students or real/demo groups';end if;
 if (v_rewards->>'earned_count')::int<>0 or v_rewards->>'rank' is not null then raise exception 'A zero-completion learner received a reward or rank';end if;
 if v_rewards::text like '%PRIVATE%' or v_rewards::text like '%FOREIGN CLASS%' or v_rewards::text like '%OTHER GRADE%' or v_rewards::text like '%REAL GROUP%' then raise exception 'Student ranking exposed names or another scope';end if;
 if jsonb_path_exists(v_rewards,'$.leaderboard[*].child_id') or jsonb_path_exists(v_rewards,'$.leaderboard[*].nickname') then raise exception 'Student ranking exposed peer identifiers';end if;
 v_denied_rewards:=false;
 begin perform private.sync_mission_awards(v_child);exception when insufficient_privilege then v_denied_rewards:=true;end;
 if not v_denied_rewards then raise exception 'Browser could forge a mission award';end if;
 v_denied_rewards:=false;
 begin perform count(*) from private.mission_awards;exception when insufficient_privilege then v_denied_rewards:=true;end;
 if not v_denied_rewards then raise exception 'Browser could read the private award ledger';end if;
 v_denied_rewards:=false;
 begin perform public.student_mission_rewards(repeat('0',64));exception when sqlstate '42501' then v_denied_rewards:=true;end;
 if not v_denied_rewards then raise exception 'Invalid student session reached rewards';end if;
 -- Complete a real guided mission using the existing grader and evidence writer.
 v_result:=public.student_adventure_complete(v_token,v_materials[1]::text||':1:read',(v_definition->>'revision')::int,gen_random_uuid(),'{}');
 v_result:=public.student_adventure_complete(v_token,v_materials[2]::text||':1:matching',(v_definition->>'revision')::int,gen_random_uuid(),'{"bird":"ibon"}');
 execute 'set local role service_role';
 v_result:=public.adventure_record_reading(v_token,v_materials[3]::text||':1:read',0,0,'{"recognition_status":"recognized","speech_detected":true,"expected_word_count":5,"matched_words":["the","small","bird","is","blue"],"extra_words":[]}');
 execute 'set local role anon';
 v_result:=public.student_adventure_complete(v_token,v_materials[3]::text||':1:read',(v_definition->>'revision')::int,v_story_submission,'{}');
 v_rewards:=public.student_mission_rewards(v_token);
 if (v_rewards->>'earned_count')::int<>0 then raise exception 'Partial mission received a badge';end if;
 for v_j in 1..5 loop v_answers:=v_answers||jsonb_build_object(v_question_ids[v_j]::text,case when v_j<=4 then v_correct[v_j] else v_wrong[v_j] end);end loop;
 v_result:=public.student_adventure_complete(v_token,v_materials[4]::text||':1:read',(v_definition->>'revision')::int,v_quiz_submission,v_answers);
 v_result:=public.student_adventure_complete(v_token,v_materials[4]::text||':1:read',(v_definition->>'revision')::int,v_quiz_submission,v_answers);
 v_rewards:=public.student_mission_rewards(v_token);
 if (v_rewards->>'earned_count')::int<>1 or (v_rewards->>'completed_missions')::int<>1 or (v_rewards->>'completion_percent')::numeric<>50 then raise exception 'Verified completion did not award exactly one badge at 1/2 missions';end if;
 v_original_title:=v_rewards->'mission_badges'->0->>'title';
 -- Independent synthetic peer states exercise ties and approved skipped missions.
 execute 'set local role authenticated';
 v_assessment:=public.save_english_assessment(v_advanced,'{"source_key":"synthetic-rewards","source_title":"Synthetic English fixture only","assessment_date":"2026-01-01","reading_profile":"Other / teacher review","language":"en","notes":"Synthetic test only"}');
 perform public.confirm_adventure_placement(v_advanced,v_assessment,'review-mission-2',(v_definition->>'revision')::int,'Synthetic teacher reviewed the English fixture.');
 execute 'reset role';
 insert into private.adventure_progress(child_id,step_id,passed,status)
 select v_peer,s->>'id',true,'completed' from jsonb_array_elements(v_definition->'stages'->0->'steps') s;
 insert into private.adventure_progress(child_id,step_id,passed,status)
 select v_advanced,s->>'id',true,'completed' from jsonb_array_elements(v_definition->'stages'->1->'steps') s;
 execute 'set local role authenticated';
 v_teacher_rows:=public.educator_adventure_progress(1);
 if not exists(select 1 from jsonb_array_elements(v_teacher_rows) r where r->>'child_id'=v_peer::text and (r#>>'{rewards,rank}')::int=2 and (r#>>'{rewards,tied}')::boolean) then raise exception 'Teacher tie ranking did not reflect student missions';end if;
 execute 'set local role anon';
 v_rewards:=public.student_mission_rewards(v_token);
 if (v_rewards->>'rank')::int<>2 or not (v_rewards->>'tied')::boolean then raise exception 'Equal completed/assigned mission results did not tie';end if;
 if not exists(select 1 from jsonb_array_elements(v_rewards->'leaderboard') r where (r->>'rank')::int=1 and (r->>'completed_missions')::int=1 and (r->>'completion_percent')::numeric=100) then raise exception 'Assigned completion percentage did not break a mission-count tie';end if;
 execute 'reset role';
 if (select count(*) from private.mission_awards where child_id=v_advanced)<>1 or exists(select 1 from private.mission_awards where child_id=v_advanced and mission_id='review-mission-1') then raise exception 'Skipped beginner mission received an achievement';end if;
 if (select count(*) from public.learning_attempts where child_id=v_child)<>4 then raise exception 'Rewards created or duplicated quiz grades';end if;
 update private.adventure_paths set definition=jsonb_set(definition,'{0,title}','"Renamed mission fixture"') where owner_id=v_owner and grade_level=1;
 execute 'set local role anon';
 v_rewards:=public.student_mission_rewards(v_token);
 if (v_rewards->>'earned_count')::int<>1 or v_rewards->'mission_badges'->0->>'title'<>v_original_title then raise exception 'Mission rename duplicated or rewrote earned badge history';end if;
 execute 'set local role authenticated';
 v_denied_rewards:=false;
 begin perform public.educator_adventure_progress(3);exception when insufficient_privilege then v_denied_rewards:=true;end;
 if not v_denied_rewards then raise exception 'Teacher accessed an unassigned grade';end if;
 execute 'reset role';
 if not (select relrowsecurity from pg_class where oid='private.mission_awards'::regclass) then raise exception 'Reward ledger RLS is disabled';end if;
 raise notice 'PASS: mission badges, no duplicates, private aliases, grade/owner/demo isolation, percentage tiebreaks, teacher integration, skipped missions and immutable history';
end $test$;
rollback;
