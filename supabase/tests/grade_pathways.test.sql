-- Temporary adult, child, and progress fixtures are rolled back.
do $$
declare teacher uuid:=gen_random_uuid(); child_id uuid; token text; g integer;
  m record; q jsonb; result jsonb; chosen jsonb; snapshot jsonb; expected integer;
begin
  begin
    if (select count(*) from public.learning_materials where source_label='LinguaKids grade pathways · original supplemental enrichment v3')<>54 then raise exception 'Missing grade activities';end if;
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
      values(teacher,'grade-pathway-fixture@example.invalid',now(),'{"name":"Grade Fixture","grade_levels":[1,2,3,4,5,6],"role":"administrator"}');
    if (select role from public.profiles where id=teacher)<>'educator' then raise exception 'Client metadata changed registration privileges';end if;
    for g in 1..6 loop
      for m in select kind,count(*) as n from public.learning_materials where grade_level=g and source_label='LinguaKids grade pathways · original supplemental enrichment v3' group by kind loop
        if m.n<>3 then raise exception 'Grade % is missing % activities',g,m.kind;end if;
      end loop;
      perform set_config('request.jwt.claim.sub',teacher::text,true);
      perform set_config('request.jwt.claim.role','authenticated',true);
      perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher,'role','authenticated')::text,true);
      execute 'set local role authenticated';
      child_id:=public.save_child_profile(null,jsonb_build_object('nickname','Explorer '||g,'avatar_key','owl','grade_level',g,'learning_level','beginner','preferences',jsonb_build_object('sound',false)));
      token:=public.open_child_session(child_id)->>'token';
      execute 'reset role';
      snapshot:=public.student_learning_state(token);
      if snapshot::text like '%answer_key%' or snapshot::text like '%correct_option_id%' then raise exception 'Private answers leaked';end if;
      if exists(select 1 from jsonb_array_elements(snapshot->'materials') x where (x->>'grade_level')::integer<>g) then raise exception 'Wrong grade delivered';end if;
      for m in select * from public.learning_materials where grade_level=g and source_label='LinguaKids grade pathways · original supplemental enrichment v3' loop
        chosen:='{}'; expected:=1;
        if m.kind='lesson' then
          if jsonb_array_length(m.body->'pages')<>4 then raise exception 'Lesson incomplete';end if;
        elsif m.kind='quiz' then
          expected:=6;
          if jsonb_array_length(m.body->'questions')<>6 then raise exception 'Quiz incomplete';end if;
          for q in select value from jsonb_array_elements(m.body->'questions') loop
            if jsonb_array_length(q->'options')<>4 then raise exception 'Choices incomplete';end if;
          end loop;
          select answers into chosen from private.material_answers where material_id=m.id;
        elsif m.kind='game' then
          expected:=4;
          select jsonb_object_agg(p->>'en',p->>'fil') into chosen from jsonb_array_elements(m.body->'pairs') p;
        end if;
        result:=public.student_complete_material(token,m.id,m.version,gen_random_uuid(),chosen);
        if (result->>'correct_count')::integer<>expected then raise exception 'Incorrect scoring for %',m.title;end if;
      end loop;
      perform public.close_child_session(token);
    end loop;
    raise sqlstate 'LX003' using message='Grade assertions passed';
  exception when sqlstate 'LX003' then null;
  end;
end $$;
select 'All 54 grade activities delivered and graded; educator registration remained scoped; fixtures rolled back.' as verification;
