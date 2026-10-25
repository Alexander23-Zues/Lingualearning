-- All temporary accounts, sessions, and activity results roll back together.
do $$
declare teacher uuid:=gen_random_uuid(); child_id uuid; session_token text;
  m record; q jsonb; answer_key jsonb; result jsonb; chosen jsonb; public_state jsonb; expected integer;
begin
  begin
    if (select count(*) from public.learning_materials where source_label='LinguaKids original animal adventures · supplemental enrichment v2')<>72 then raise exception 'The full collection was not installed';end if;
    for m in select * from public.learning_materials where source_label='LinguaKids original animal adventures · supplemental enrichment v2' loop
      if m.kind='story' and jsonb_array_length(m.body->'pages')<>10 then raise exception 'A story is missing pages';end if;
      if m.kind='quiz' then
        if jsonb_array_length(m.body->'questions')<>6 then raise exception 'A quiz is incomplete';end if;
        for q in select value from jsonb_array_elements(m.body->'questions') loop
          if jsonb_array_length(q->'options')<>4 or q?'correct_option_id' then raise exception 'A–D choices or private keys are incorrect';end if;
        end loop;
      end if;
    end loop;
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(teacher,'animal-fixture@example.invalid',now(),'{"name":"Animal Collection Fixture"}');
    perform set_config('request.jwt.claim.sub',teacher::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    child_id:=public.save_child_profile(null,'{"nickname":"Animal Explorer","avatar_key":"owl","grade_level":1,"learning_level":"beginner","preferences":{"sound":false}}');
    session_token:=public.open_child_session(child_id)->>'token';
    execute 'reset role';
    public_state:=public.student_learning_state(session_token);
    if public_state::text like '%correct_option_id%' or public_state::text like '%answer_key%' then raise exception 'The student payload exposes answer keys';end if;
    for m in select * from public.learning_materials where grade_level=1 and source_label='LinguaKids original animal adventures · supplemental enrichment v2' loop
      chosen:='{}';expected:=1;
      if m.kind='quiz' then
        select answers into chosen from private.material_answers where material_id=m.id;
        expected:=6;
      elsif m.kind='game' then
        select jsonb_object_agg(p->>'en',p->>'fil') into chosen from jsonb_array_elements(m.body->'pairs') p;
        expected:=4;
      end if;
      result:=public.student_complete_material(session_token,m.id,m.version,gen_random_uuid(),chosen);
      if (result->>'correct_count')::integer<>expected then raise exception 'Collection scoring failed for %',m.title;end if;
      if m.kind='quiz' and (result->>'stars')::integer<>3 then raise exception 'Perfect quiz stars not awarded';end if;
      if m.kind='game' and (result->>'stars')::integer<>2 then raise exception 'Matching game stars not awarded';end if;
    end loop;
    perform public.close_child_session(session_token);
    raise sqlstate 'LX002' using message='Animal collection assertions passed';
  exception when sqlstate 'LX002' then null;
  end;
end $$;
select 'All 72 materials validated; every Grade 1 quiz, game, and story scored correctly; temporary records rolled back.' as verification;
