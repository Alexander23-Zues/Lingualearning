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
 v_i integer;v_j integer;v_denied boolean;v_count integer;v_material record;v_case jsonb;v_decision text;
begin
 if current_database()<>'linguakids_final_placement' then raise exception 'Use the isolated synthetic test database';end if;
 perform set_config('session_replication_role','replica',true);
 insert into auth.users(id,email,email_confirmed_at) values(v_owner,'guided-review@fixture.invalid',now());
 insert into public.profiles(id,email,name,role,status,account_kind,grade_levels)
 values(v_owner,'guided-review@fixture.invalid','Synthetic review teacher','educator','active','review',array[1]::smallint[]);
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
 -- A browser/exported flag cannot call the service-only evidence writer.
 v_denied:=false;
 begin perform public.adventure_record_reading(v_token,v_materials[3]::text||':1:read',0,0,'{"speech_detected":true}');exception when insufficient_privilege then v_denied:=true;end;
 if not v_denied then raise exception 'Client could write trusted reading evidence';end if;
 v_result:=public.student_adventure_complete(v_token,v_materials[1]::text||':1:read',(v_definition->>'revision')::int,gen_random_uuid(),'{}');
 v_result:=public.student_adventure_complete(v_token,v_materials[2]::text||':1:matching',(v_definition->>'revision')::int,gen_random_uuid(),'{"bird":"ibon"}');
 v_denied:=false;
 begin perform public.student_adventure_complete(v_token,v_materials[3]::text||':1:read',(v_definition->>'revision')::int,v_story_submission,'{}');exception when raise_exception then v_denied:=true;end;
 if not v_denied then raise exception 'Story completed before reading review';end if;
 execute 'set local role service_role';
 -- Optional Python-generated cases verify evaluator/SQL agreement. Each inner
 -- transaction rolls back its temporary evidence, including a successful pass.
 for v_case in select value from jsonb_array_elements(coalesce(nullif(current_setting('test.reading_policy_cases',true),''),'[]')::jsonb) loop
  begin
   v_result:=public.adventure_record_reading(v_token,v_materials[3]::text||':1:read',0,0,v_case->'result');
   v_decision:=case when not (v_result->>'recorded')::boolean then 'no_evidence' when (v_result->>'part_passed')::boolean then 'auto_pass' else 'teacher_review' end;
   if v_decision<>v_case->>'decision' then raise exception 'Reading evaluator differs from SQL for case %',v_case->>'id';end if;
   raise no_data_found using message='Rollback only this synthetic reading case';
  exception when no_data_found then null;
  end;
 end loop;
 v_result:=public.adventure_record_reading(v_token,v_materials[3]::text||':1:read',0,0,'{"recognition_status":"no_speech","speech_detected":false,"expected_word_count":5,"matched_words":[]}');
 if (v_result->>'recorded')::boolean then raise exception 'Silence created reading evidence';end if;
 execute 'set local role authenticated';
 v_denied:=false;
 begin perform public.approve_adventure_reading(v_child,v_materials[3]::text||':1:read','Synthetic observation before any voiced attempt.');exception when raise_exception then v_denied:=true;end;
 if not v_denied then raise exception 'Silence alone enabled teacher approval';end if;
 execute 'set local role service_role';
 v_result:=public.adventure_record_reading(v_token,v_materials[3]::text||':1:read',0,0,'{"recognition_status":"unclear","speech_detected":true,"expected_word_count":5,"matched_words":["the","bird","blue"],"extra_words":[]}');
 if v_result->'adventure'->'stages'->0->'steps'->2->>'status'<>'needs_review' then raise exception 'Uncertain reading did not reach teacher review';end if;
 execute 'set local role authenticated';
 v_state:=public.approve_adventure_reading(v_child,v_materials[3]::text||':1:read','Teacher observed this synthetic full-story reading.');
 if not (v_state->'stages'->0->'steps'->2->>'teacher_approved')::boolean then raise exception 'Teacher approval was not reflected in the mission';end if;
 execute 'reset role';
 select count(*) into v_count from public.learning_attempts where child_id=v_child;
 if v_count<>2 then raise exception 'Teacher approval invented a learning grade';end if;
 execute 'set local role anon';
 v_result:=public.student_adventure_complete(v_token,v_materials[3]::text||':1:read',(v_definition->>'revision')::int,v_story_submission,'{}');
 v_result:=public.student_adventure_complete(v_token,v_materials[3]::text||':1:read',(v_definition->>'revision')::int,v_story_submission,'{}');
 for v_j in 1..5 loop v_answers:=v_answers||jsonb_build_object(v_question_ids[v_j]::text,case when v_j<=3 then v_correct[v_j] else v_wrong[v_j] end);end loop;
 v_result:=public.student_adventure_complete(v_token,v_materials[4]::text||':1:read',(v_definition->>'revision')::int,gen_random_uuid(),v_answers);
 if (v_result->>'correct_count')::int<>3 or (v_result->>'adventure_passed')::boolean or v_result->'adventure'->'stages'->1->>'status'<>'locked' then raise exception 'A 60 percent quiz unlocked the next mission';end if;
 v_answers:=jsonb_set(v_answers,array[v_question_ids[4]::text],to_jsonb(v_correct[4]::text));
 v_result:=public.student_adventure_complete(v_token,v_materials[4]::text||':1:read',(v_definition->>'revision')::int,v_quiz_submission,v_answers);
 if (v_result->>'correct_count')::int<>4 or not (v_result->>'adventure_passed')::boolean or v_result->'adventure'->'stages'->0->>'status'<>'completed' or v_result->'adventure'->'stages'->1->>'status'<>'active' then raise exception 'Verified 80 percent did not complete the mission';end if;
 v_result:=public.student_adventure_complete(v_token,v_materials[4]::text||':1:read',(v_definition->>'revision')::int,v_quiz_submission,v_answers);
 execute 'set local role authenticated';
 v_progress:=public.educator_adventure_progress(1);
 if jsonb_array_length(v_progress->0->'quiz_attempts')<>2 then raise exception 'Teacher did not retain both quiz attempts';end if;
 execute 'reset role';
 select count(*) into v_count from public.learning_attempts where child_id=v_child;
 if v_count<>5 then raise exception 'Retried saved responses produced duplicate grades';end if;
 raise notice 'PASS: lesson/game -> silent/uncertain reading -> teacher review -> story -> quiz retake -> mission unlock and teacher results; no duplicate attempts';
end $test$;
rollback;
