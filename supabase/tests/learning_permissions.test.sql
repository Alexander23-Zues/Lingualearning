-- The inner exception block rolls back ALL fixture rows and simulated events.
do $$
declare
  teacher_a uuid:='fbfa0000-0000-4000-8000-000000000001';
  teacher_b uuid:='fbfa0000-0000-4000-8000-000000000002';
  child_a uuid; child_b uuid; token_a text; token_b text; material uuid; version_no integer;
  question_id uuid:=gen_random_uuid();option_a uuid:=gen_random_uuid();option_b uuid:=gen_random_uuid();record_id uuid;word_set uuid; material_data jsonb;
  submission uuid:=gen_random_uuid(); key_json jsonb; state_json jsonb; result_json jsonb;
  denied boolean; forbidden text; profile_data jsonb;
begin
  begin
    if exists(select 1 from auth.users where id in(teacher_a,teacher_b)) then raise exception 'Reserved fixture identifiers are already in use'; end if;
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
      (teacher_a,'learning-fixture-a@example.invalid',now(),'{"name":"Fixture Adult A","role":"administrator"}'),
      (teacher_b,'learning-fixture-b@example.invalid',now(),'{"name":"Fixture Adult B"}');
    if exists(select 1 from public.profiles where id=teacher_a and role<>'educator') then raise exception 'Signup metadata selected a privileged role'; end if;
    perform set_config('request.jwt.claim.sub',teacher_a::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_a,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    material_data:=jsonb_build_object('kind','quiz','title','Fixture classroom quiz','grade_level',1,'learning_level','beginner','status','classroom',
      'body',jsonb_build_object('questions',jsonb_build_array(jsonb_build_object('id',question_id,'prompt','Which word means book?',
        'options',jsonb_build_array(jsonb_build_object('id',option_a,'text','aklat'),jsonb_build_object('id',option_b,'text','tubig')),'correct_option_id',option_a))));
    material:=public.save_learning_material(null,material_data);version_no:=1;key_json:=jsonb_build_object(question_id::text,option_a::text);
    if public.learning_material_editor(material)->'body'->'questions'->0->>'correct_option_id'<>option_a::text then raise exception 'Adult quiz editor did not preserve its private answer key'; end if;
    denied:=false;
    begin perform public.save_learning_material(material,material_data||'{"status":"published"}');exception when insufficient_privilege then denied:=true;end;
    if not denied then raise exception 'An educator published content globally without administrator review'; end if;
    record_id:=public.save_workspace_record(null,'{"kind":"plan","title":"Fixture private teaching plan","data":{"details":"Fixture only"},"status":"published"}');
    profile_data:='{"nickname":"Fixture Fox","avatar_key":"owl","grade_level":1,"learning_level":"beginner","preferences":{"language":"bilingual","sound":false,"reduced_motion":true}}';
    child_a:=public.save_child_profile(null,profile_data);
    foreach forbidden in array array['email','exact_birth_date','address','phone_number','photograph','pin'] loop
      denied:=false;
      begin perform public.save_child_profile(null,profile_data||jsonb_build_object(forbidden,'not accepted'));
      exception when raise_exception then denied:=true; end;
      if not denied then raise exception 'Forbidden child field accepted: %',forbidden; end if;
    end loop;
    denied:=false;
    begin perform public.save_child_profile(null,profile_data||'{"avatar_key":"https://example.invalid/photo.jpg"}');
    exception when check_violation then denied:=true; end;
    if not denied then raise exception 'Custom child photograph/avatar accepted'; end if;
    denied:=false;
    begin perform public.save_child_profile(null,profile_data||'{"preferences":{"email":"not-accepted@example.invalid"}}');
    exception when check_violation then denied:=true; end;
    if not denied then raise exception 'Personal information accepted through preferences'; end if;
    token_a:=public.open_child_session(child_a)->>'token';

    perform set_config('request.jwt.claim.sub',teacher_b::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_b,'role','authenticated')::text,true);
    denied:=false;
    begin perform public.open_child_session(child_a); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Another educator opened a foreign child profile'; end if;
    if exists(select 1 from public.child_profiles where id=child_a) then raise exception 'RLS exposed another adult''s child profile'; end if;
    if exists(select 1 from public.workspace_records where id=record_id) then raise exception 'Another educator read a private teaching plan';end if;
    child_b:=public.save_child_profile(null,profile_data||'{"nickname":"Fixture Owl"}');
    token_b:=public.open_child_session(child_b)->>'token';

    execute 'reset role';
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claim.role','anon',true);
    perform set_config('request.jwt.claims','{"role":"anon"}',true);
    execute 'set local role anon';
    denied:=false;
    begin perform public.workspace_snapshot(); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Child/anonymous session accessed the adult workspace'; end if;
    state_json:=public.student_learning_state(token_a);
    if state_json->'child'->>'id'<>child_a::text then raise exception 'Wrong child session scope'; end if;
    if state_json::text like '%correct_option_id%' or state_json::text like '%learning-fixture-%@example.invalid%' then raise exception 'Child payload leaked an answer key or adult email'; end if;
    if (state_json->'child')?'adult_id' then raise exception 'Child payload exposed adult ownership data'; end if;
    select (value->>'id')::uuid into word_set from jsonb_array_elements(state_json->'materials') where value->>'kind'='dictionary' limit 1;
    perform public.student_save_vocabulary(token_a,word_set);
    state_json:=public.student_learning_state(token_a);
    if not (state_json->'saved_vocabulary')?word_set::text then raise exception 'Child vocabulary was not saved';end if;
    denied:=false;
    begin perform public.student_learning_state(repeat('0',64)); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Invalid learning token was accepted'; end if;
    result_json:=public.student_complete_material(token_a,material,version_no,submission,key_json);
    if (result_json->>'stars')::integer<>3 or (result_json->>'correct_count')::integer<>1 then raise exception 'Server quiz grading failed'; end if;
    if public.student_complete_material(token_a,material,version_no,submission,'{"stars":999}')->>'id'<>result_json->>'id' then raise exception 'Submission replay was not idempotent'; end if;
    denied:=false;
    begin perform public.student_complete_material(token_b,material,version_no,submission,key_json); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Another child accessed an existing submission'; end if;
    state_json:=public.student_learning_state(token_b);
    if exists(select 1 from jsonb_array_elements(state_json->'materials') where value->>'id'=material::text) then raise exception 'Private classroom materials leaked to another adult''s child';end if;
    if jsonb_array_length(state_json->'attempts')<>0 or (state_json->>'stars')::integer<>0 then raise exception 'Progress leaked between child profiles'; end if;
    perform public.close_child_session(token_a);
    denied:=false;
    begin perform public.student_learning_state(token_a); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Closed child session remained usable'; end if;
    execute 'reset role';
    perform set_config('app.allow_security_profile_update','true',true);
    update public.profiles set status='suspended' where id=teacher_b;
    perform set_config('app.allow_security_profile_update','false',true);
    denied:=false;
    begin perform public.student_learning_state(token_b); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Suspended adult''s child session remained usable'; end if;
    raise sqlstate 'LX001' using message='All learning permission assertions passed';
  exception when sqlstate 'LX001' then null;
  end;
end $$;
select 'All learning permission assertions passed; fixture accounts and progress rolled back.' as verification,
  (select count(*) from auth.users where id in ('fbfa0000-0000-4000-8000-000000000001','fbfa0000-0000-4000-8000-000000000002')) as remaining_fixture_accounts;
