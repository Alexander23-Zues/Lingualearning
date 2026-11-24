-- Stable quiz references and immutable metadata on each newly recorded result.
-- Scores/history are never rewritten. Existing adult/child access policies stay in force.
alter table public.learning_materials add column quiz_number integer;

with numbered as (
  select id,row_number() over(partition by grade_level order by
    case
      when source_label like 'LinguaKids grade pathways%' then 0
      when source_label like 'LinguaKids original animal adventures%' then 1
      when title='Everyday word check' and owner_id is null then 9
      else 2 end,
    lower(title) collate "C",id)::integer as number
  from public.learning_materials where kind='quiz'
)
update public.learning_materials m set quiz_number=n.number from numbered n where n.id=m.id;

alter table public.learning_materials add constraint quiz_number_required
  check((kind='quiz' and quiz_number is not null and quiz_number>0) or (kind<>'quiz' and quiz_number is null));
create unique index quiz_number_per_grade on public.learning_materials(grade_level,quiz_number) where kind='quiz';

create table private.quiz_number_counters (
  grade_level smallint primary key check(grade_level between 1 and 6),
  last_number integer not null check(last_number>0)
);
alter table private.quiz_number_counters enable row level security;
revoke all on private.quiz_number_counters from public,anon,authenticated;
insert into private.quiz_number_counters(grade_level,last_number)
  select grade_level,max(quiz_number) from public.learning_materials where kind='quiz' group by grade_level;

create function private.assign_quiz_number() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.kind<>'quiz' then new.quiz_number:=null;return new;end if;
  if tg_op='UPDATE' and old.kind='quiz' and old.grade_level=new.grade_level then
    new.quiz_number:=old.quiz_number;
    return new;
  end if;
  insert into private.quiz_number_counters(grade_level,last_number) values(new.grade_level,1)
    on conflict(grade_level) do update set last_number=private.quiz_number_counters.last_number+1
    returning last_number into new.quiz_number;
  return new;
end $$;
revoke all on function private.assign_quiz_number() from public,anon,authenticated;
create trigger assign_quiz_number before insert or update of kind,grade_level,quiz_number
  on public.learning_materials for each row execute function private.assign_quiz_number();

alter table public.learning_attempts
  add column material_title text,
  add column activity_kind text,
  add column grade_level smallint,
  add column quiz_number integer;
alter table public.learning_attempts add constraint valid_recorded_score
  check(total_count>0 and correct_count between 0 and total_count);

create function private.snapshot_learning_attempt() returns trigger
language plpgsql security definer set search_path='' as $$
declare material public.learning_materials;
begin
  select * into material from public.learning_materials where id=new.material_id for share;
  if material.id is null or new.material_version<>material.version then
    raise exception 'The quiz or activity changed. Reopen it before submitting.';
  end if;
  -- These labels come from the same server material as the score, never from a client.
  new.material_title:=material.title;
  new.activity_kind:=material.kind;
  new.grade_level:=material.grade_level;
  new.quiz_number:=material.quiz_number;
  return new;
end $$;
revoke all on function private.snapshot_learning_attempt() from public,anon,authenticated;
create trigger snapshot_learning_attempt before insert on public.learning_attempts
  for each row execute function private.snapshot_learning_attempt();

-- The editor already locks an existing material. Update it directly instead of
-- an INSERT/upsert, so an ordinary edit does not consume another quiz number.
do $patch$
declare source text;
  old_sql text:=$old$  insert into public.learning_materials(id,owner_id,kind,title,grade_level,learning_level,summary,body,status)
  values(v_id,coalesce(v_old.owner_id,v_uid),v_kind,btrim(p_data->>'title'),(p_data->>'grade_level')::smallint,
    coalesce(p_data->>'learning_level','beginner'),coalesce(p_data->>'summary',''),v_body,v_status)
  on conflict(id) do update set kind=excluded.kind,title=excluded.title,grade_level=excluded.grade_level,
    learning_level=excluded.learning_level,summary=excluded.summary,body=excluded.body,status=excluded.status,
    version=public.learning_materials.version+1,updated_at=now();$old$;
  new_sql text:=$new$  if v_old.id is null then
    insert into public.learning_materials(id,owner_id,kind,title,grade_level,learning_level,summary,body,status)
    values(v_id,v_uid,v_kind,btrim(p_data->>'title'),(p_data->>'grade_level')::smallint,
      coalesce(p_data->>'learning_level','beginner'),coalesce(p_data->>'summary',''),v_body,v_status);
  else
    update public.learning_materials set kind=v_kind,title=btrim(p_data->>'title'),
      grade_level=(p_data->>'grade_level')::smallint,learning_level=coalesce(p_data->>'learning_level','beginner'),
      summary=coalesce(p_data->>'summary',''),body=v_body,status=v_status,version=version+1,updated_at=now()
      where id=v_id;
  end if;$new$;
begin
  source:=replace(pg_get_functiondef('private.save_learning_material(uuid,jsonb)'::regprocedure),E'\r','');
  if position(old_sql in source)=0 then raise exception 'The material editor changed; review the migration before applying';end if;
  execute replace(source,old_sql,new_sql);
end $patch$;

-- Hold a share lock while grading and recording so an edit cannot switch the
-- question key or recorded title/version partway through a submission.
do $patch$
declare source text;
  old_sql text:=$old$and (status='published' or (owner_id=v_child.adult_id and status='classroom'));$old$;
  new_sql text:=$new$and (status='published' or (owner_id=v_child.adult_id and status='classroom')) for share;$new$;
begin
  source:=replace(pg_get_functiondef('private.student_complete_material(text,uuid,integer,uuid,jsonb)'::regprocedure),E'\r','');
  if position(old_sql in source)=0 then raise exception 'The grading function changed; review the migration before applying';end if;
  execute replace(source,old_sql,new_sql);
end $patch$;

insert into public.audit_logs(action,entity_type,metadata)
  values('quiz_gradebook_installed','learning_material','{"stable_quiz_numbers":true,"result_metadata_snapshots":true}');
notify pgrst,'reload schema';
