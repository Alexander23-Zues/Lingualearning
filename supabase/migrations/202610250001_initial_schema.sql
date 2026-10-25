create extension if not exists pgcrypto with schema extensions;

create type public.account_role as enum ('administrator', 'educator');
create type public.account_status as enum ('active', 'suspended');
create type public.mapping_status as enum ('verified', 'pending_review', 'supplemental_enrichment');
create type public.content_state as enum ('draft', 'submitted', 'changes_requested', 'approved', 'published', 'archived');
create type public.review_state as enum ('pending', 'approved', 'rejected');
create type public.model_state as enum ('candidate', 'approved', 'active', 'archived', 'rejected');
create type public.split_name as enum ('train', 'validation', 'test');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null check (char_length(name) between 1 and 160),
  role public.account_role not null default 'educator',
  status public.account_status not null default 'active',
  school_name text,
  grade_levels smallint[] not null default '{}',
  suspended_at timestamptz,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_grade_levels check (grade_levels <@ array[1,2,3,4,5,6]::smallint[])
);

create table public.educator_preferences (
  educator_id uuid primary key references public.profiles(id) on delete cascade,
  locale text not null default 'en' check (locale in ('en', 'fil')),
  text_scale numeric(3,2) not null default 1 check (text_scale between 0.8 and 2),
  reduced_motion boolean not null default false,
  muted boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  version_label text not null,
  school_year_start smallint,
  school_year_end smallint,
  official_source_url text,
  status public.review_state not null default 'pending',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (title, version_label)
);

create table public.curriculum_source_documents (
  id uuid primary key default gen_random_uuid(),
  curriculum_version_id uuid not null references public.curriculum_versions(id) on delete cascade,
  title text not null,
  source_url text,
  storage_path text,
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (source_url is not null or storage_path is not null)
);

create table public.learning_areas (
  id uuid primary key default gen_random_uuid(),
  curriculum_version_id uuid not null references public.curriculum_versions(id) on delete cascade,
  official_name text not null,
  teaching_language text not null check (teaching_language in ('English', 'Filipino', 'Bilingual', 'Other')),
  grade_level smallint not null check (grade_level between 1 and 6),
  unique (curriculum_version_id, official_name, grade_level)
);

create table public.competencies (
  id uuid primary key default gen_random_uuid(),
  learning_area_id uuid not null references public.learning_areas(id) on delete cascade,
  quarter smallint check (quarter between 1 and 4),
  content_standard text,
  performance_standard text,
  competency_text text not null,
  competency_code text,
  source_document_id uuid not null references public.curriculum_source_documents(id),
  page_reference text not null,
  reviewer_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  verified boolean not null default false,
  unique nulls not distinct (learning_area_id, competency_code, competency_text)
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete restrict,
  title text not null,
  resource_type text not null check (resource_type in ('lesson','activity','game','story','quiz','worksheet','media','vocabulary_set')),
  grade_level smallint not null check (grade_level between 1 and 6),
  learning_area_id uuid references public.learning_areas(id),
  mapping_status public.mapping_status not null default 'supplemental_enrichment',
  visibility text not null default 'private' check (visibility in ('private','review','published')),
  state public.content_state not null default 'draft',
  active_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content jsonb not null default '{}',
  authorship text,
  source_references jsonb not null default '[]',
  permissions text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (resource_id, version_number)
);

alter table public.resources
  add constraint resources_active_version_fk
  foreign key (active_version_id) references public.content_versions(id);

create table public.resource_competencies (
  resource_id uuid not null references public.resources(id) on delete cascade,
  competency_id uuid not null references public.competencies(id) on delete cascade,
  mapping_status public.mapping_status not null default 'pending_review',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  primary key (resource_id, competency_id)
);

create table public.lessons (
  resource_id uuid primary key references public.resources(id) on delete cascade,
  objective text not null,
  materials_needed text not null,
  estimated_minutes integer not null check (estimated_minutes between 1 and 480),
  introduction text not null,
  assessment text not null,
  answer_explanations text not null,
  extension_suggestions text,
  remediation_suggestions text
);

create table public.lesson_steps (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.lessons(resource_id) on delete cascade,
  position integer not null check (position >= 0),
  step_type text not null check (step_type in ('guided_example','interactive_practice','instruction','assessment')),
  content jsonb not null,
  unique (resource_id, position)
);

create table public.dictionary_entries (
  id uuid primary key default gen_random_uuid(),
  english_term text not null,
  filipino_term text not null,
  part_of_speech text,
  definitions jsonb not null default '[]',
  examples jsonb not null default '[]',
  categories text[] not null default '{}',
  min_grade smallint check (min_grade between 1 and 6),
  max_grade smallint check (max_grade between 1 and 6),
  image_path text,
  pronunciation_paths jsonb not null default '{}',
  state public.content_state not null default 'draft',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (min_grade is null or max_grade is null or min_grade <= max_grade)
);

create table public.vocabulary_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  grade_level smallint not null check (grade_level between 1 and 6),
  created_at timestamptz not null default now()
);

create table public.vocabulary_set_items (
  vocabulary_set_id uuid not null references public.vocabulary_sets(id) on delete cascade,
  dictionary_entry_id uuid not null references public.dictionary_entries(id) on delete cascade,
  position integer not null default 0,
  primary key (vocabulary_set_id, dictionary_entry_id)
);

create table public.stories (
  resource_id uuid primary key references public.resources(id) on delete cascade,
  license_name text not null,
  license_source text,
  english_title text not null,
  filipino_title text not null,
  narration_available boolean not null default false
);

create table public.story_pages (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.stories(resource_id) on delete cascade,
  page_number integer not null check (page_number > 0),
  english_text text not null,
  filipino_text text not null,
  illustration_path text,
  narration_paths jsonb not null default '{}',
  vocabulary_entry_ids uuid[] not null default '{}',
  unique (resource_id, page_number)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  question_type text not null check (question_type in ('multiple_choice','matching','fill_blank','sentence_arrangement','short_answer')),
  prompt jsonb not null,
  answer_explanation text,
  answer_data jsonb not null default '{}',
  grade_level smallint not null check (grade_level between 1 and 6),
  state public.content_state not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  position integer not null,
  unique (question_id, position)
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  grade_level smallint not null check (grade_level between 1 and 6),
  instructions text,
  state public.content_state not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.quiz_items (
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  position integer not null,
  points numeric(6,2) not null default 1 check (points > 0),
  primary key (quiz_id, question_id),
  unique (quiz_id, position)
);

create table public.teaching_plans (
  id uuid primary key default gen_random_uuid(),
  educator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  teaching_date date,
  class_label text,
  grade_level smallint not null check (grade_level between 1 and 6),
  learning_objectives text not null default '',
  vocabulary jsonb not null default '[]',
  educator_notes text,
  reflection text,
  state text not null default 'draft' check (state in ('draft','planned','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teaching_plan_items (
  id uuid primary key default gen_random_uuid(),
  teaching_plan_id uuid not null references public.teaching_plans(id) on delete cascade,
  resource_id uuid references public.resources(id) on delete restrict,
  quiz_id uuid references public.quizzes(id) on delete restrict,
  competency_id uuid references public.competencies(id) on delete restrict,
  position integer not null,
  notes text,
  check (num_nonnulls(resource_id, quiz_id, competency_id) = 1),
  unique (teaching_plan_id, position)
);

create table public.class_labels (
  id uuid primary key default gen_random_uuid(),
  educator_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  grade_level smallint not null check (grade_level between 1 and 6),
  archived boolean not null default false,
  unique (educator_id, label)
);

create table public.classroom_sessions (
  id uuid primary key default gen_random_uuid(),
  educator_id uuid not null references public.profiles(id) on delete cascade,
  class_label_id uuid references public.class_labels(id) on delete set null,
  class_label_snapshot text not null,
  grade_level smallint not null check (grade_level between 1 and 6),
  session_date date not null,
  participant_count integer check (participant_count between 0 and 500),
  observations text,
  created_at timestamptz not null default now()
);

create table public.session_resources (
  session_id uuid not null references public.classroom_sessions(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete restrict,
  primary key (session_id, resource_id)
);

create table public.session_competencies (
  session_id uuid not null references public.classroom_sessions(id) on delete cascade,
  competency_id uuid not null references public.competencies(id) on delete restrict,
  primary key (session_id, competency_id)
);

create table public.session_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.classroom_sessions(id) on delete cascade,
  scope text not null check (scope in ('class','temporary_team')),
  temporary_team_label text,
  activity_label text not null,
  total_items integer check (total_items >= 0),
  correct_count integer check (correct_count >= 0),
  summary jsonb not null default '{}',
  check (scope <> 'temporary_team' or temporary_team_label is not null)
);

create table public.downloads (
  id uuid primary key default gen_random_uuid(),
  educator_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  content_version text not null,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('queued','downloading','available','failed','cancelled')),
  downloaded_at timestamptz,
  unique (educator_id, entity_type, entity_id, content_version)
);

create table public.sync_events (
  event_id uuid primary key,
  educator_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  payload_checksum text not null,
  received_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create table public.resource_submissions (
  id uuid primary key default gen_random_uuid(),
  source_resource_id uuid not null references public.resources(id),
  submitted_version_id uuid not null references public.content_versions(id),
  submitted_by uuid not null references public.profiles(id),
  state public.content_state not null default 'submitted',
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  check (state in ('submitted','changes_requested','approved','published'))
);

create table public.resource_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.resource_submissions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  decision public.content_state not null,
  notes text,
  created_at timestamptz not null default now(),
  check (decision in ('changes_requested','approved','published'))
);

create table public.translation_datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  source_file_path text,
  source_checksum text check (source_checksum is null or source_checksum ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.translation_pair_revisions (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.translation_datasets(id) on delete cascade,
  pair_key uuid not null default gen_random_uuid(),
  revision_number integer not null check (revision_number > 0),
  english text not null check (btrim(english) <> ''),
  filipino text not null check (btrim(filipino) <> ''),
  source text,
  license text,
  category text,
  reviewer_notes text,
  review_state public.review_state not null default 'pending',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (pair_key, revision_number)
);

create table public.translation_pair_reviews (
  id uuid primary key default gen_random_uuid(),
  pair_revision_id uuid not null references public.translation_pair_revisions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  decision public.review_state not null,
  notes text,
  reviewed_at timestamptz not null default now(),
  unique (pair_revision_id, reviewer_id)
);

create table public.dataset_snapshots (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.translation_datasets(id),
  version integer not null,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  random_seed integer not null,
  train_ratio numeric(4,3) not null,
  validation_ratio numeric(4,3) not null,
  test_ratio numeric(4,3) not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (dataset_id, version),
  check (train_ratio + validation_ratio + test_ratio = 1)
);

create table public.dataset_snapshot_pairs (
  snapshot_id uuid not null references public.dataset_snapshots(id) on delete restrict,
  pair_revision_id uuid not null references public.translation_pair_revisions(id) on delete restrict,
  primary key (snapshot_id, pair_revision_id)
);

create table public.dataset_split_membership (
  snapshot_id uuid not null,
  pair_revision_id uuid not null,
  related_group_key text not null,
  split public.split_name not null,
  primary key (snapshot_id, pair_revision_id),
  foreign key (snapshot_id, pair_revision_id)
    references public.dataset_snapshot_pairs(snapshot_id, pair_revision_id) on delete cascade
);

create table public.training_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.dataset_snapshots(id),
  foundation_model text not null default 'google/mt5-small',
  configuration jsonb not null,
  status text not null check (status in ('queued','running','stopped','failed','completed')),
  checkpoint_uri text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.model_versions (
  id uuid primary key default gen_random_uuid(),
  training_run_id uuid not null references public.training_runs(id),
  name text not null,
  version text not null,
  state public.model_state not null default 'candidate',
  artifact_uri text not null,
  artifact_checksum text not null check (artifact_checksum ~ '^[a-f0-9]{64}$'),
  dataset_snapshot_id uuid not null references public.dataset_snapshots(id),
  training_configuration jsonb not null,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (name, version)
);

create unique index only_one_active_model on public.model_versions ((state)) where state = 'active';

create table public.model_evaluations (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null references public.model_versions(id) on delete cascade,
  direction text not null check (direction in ('en_to_fil','fil_to_en')),
  sacrebleu numeric,
  chrf numeric,
  validation_loss numeric,
  sample_count integer not null check (sample_count >= 0),
  latency_ms_p50 numeric,
  latency_ms_p95 numeric,
  human_review jsonb not null default '{}',
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (model_version_id, direction)
);

create table public.model_activations (
  id bigint generated always as identity primary key,
  model_version_id uuid not null references public.model_versions(id),
  previous_model_version_id uuid references public.model_versions(id),
  activated_by uuid not null references public.profiles(id),
  activated_at timestamptz not null default now(),
  rolled_back_at timestamptz
);

create index profiles_role_status_idx on public.profiles(role, status);
create index resources_owner_idx on public.resources(owner_id, state);
create index resources_browse_idx on public.resources(grade_level, resource_type, mapping_status, visibility);
create index competencies_browse_idx on public.competencies(learning_area_id, quarter, verified);
create index dictionary_english_idx on public.dictionary_entries using gin (to_tsvector('simple', english_term));
create index dictionary_filipino_idx on public.dictionary_entries using gin (to_tsvector('simple', filipino_term));
create index sessions_educator_date_idx on public.classroom_sessions(educator_id, session_date desc);
create index plans_educator_date_idx on public.teaching_plans(educator_id, teaching_date desc);
create index pair_dataset_state_idx on public.translation_pair_revisions(dataset_id, review_state);
create index audit_time_idx on public.audit_logs(occurred_at desc);

create or replace function public.current_account_role()
returns public.account_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid()) and status = 'active'
$$;

create or replace function public.is_active_educator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'educator' and status = 'active'
  )
$$;

create or replace function public.is_active_administrator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'administrator' and status = 'active'
  )
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, role, school_name, grade_levels)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), 'Educator'),
    'educator',
    nullif(btrim(new.raw_user_meta_data ->> 'school_name'), ''),
    coalesce(
      array(select value::smallint from jsonb_array_elements_text(coalesce(new.raw_user_meta_data -> 'grade_levels', '[]'::jsonb))),
      '{}'::smallint[]
    )
  );
  insert into public.educator_preferences (educator_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.prevent_profile_security_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_security_profile_update', true), 'false') <> 'true'
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'Role and status changes require an administrator workflow';
  end if;
  new.id := old.id;
  new.email := old.email;
  new.updated_at := now();
  return new;
end;
$$;

create trigger protect_profile_security_fields
before update on public.profiles
for each row
when (pg_trigger_depth() = 0)
execute function public.prevent_profile_security_changes();

create or replace function public.admin_set_educator_status(
  p_educator_id uuid,
  p_status public.account_status,
  p_reason text,
  p_actor_id uuid default auth.uid()
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'administrator' and status = 'active'
  ) then raise exception 'Administrator access required'; end if;
  if not exists (
    select 1 from public.profiles where id = p_educator_id and role = 'educator'
  ) then raise exception 'Educator not found'; end if;

  perform set_config('app.allow_security_profile_update', 'true', true);
  update public.profiles
  set status = p_status,
      suspended_at = case when p_status = 'suspended' then now() else null end,
      suspended_reason = case when p_status = 'suspended' then p_reason else null end,
      updated_at = now()
  where id = p_educator_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'educator_status_changed', 'profile', p_educator_id,
          jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

create or replace function public.bootstrap_administrator(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if exists (select 1 from public.profiles where role = 'administrator') then
    raise exception 'An administrator already exists';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile not found';
  end if;
  perform set_config('app.allow_security_profile_update', 'true', true);
  update public.profiles set role = 'administrator', status = 'active', updated_at = now()
  where id = p_user_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (p_user_id, 'initial_administrator_created', 'profile', p_user_id, '{}');
end;
$$;

create or replace function public.sync_classroom_session(
  p_educator_id uuid,
  p_event_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if p_educator_id <> auth.uid() and auth.role() <> 'service_role' then
    raise exception 'Ownership mismatch';
  end if;
  if not exists (select 1 from public.profiles where id = p_educator_id and role = 'educator' and status = 'active') then
    raise exception 'Active educator required';
  end if;
  select entity_id into v_session_id from public.sync_events where event_id = p_event_id;
  if v_session_id is not null then return v_session_id; end if;

  insert into public.classroom_sessions(
    educator_id, class_label_snapshot, grade_level, session_date,
    participant_count, observations
  ) values (
    p_educator_id,
    p_payload ->> 'class_label',
    (p_payload ->> 'grade_level')::smallint,
    (p_payload ->> 'session_date')::date,
    nullif(p_payload ->> 'participant_count', '')::integer,
    p_payload ->> 'observations'
  ) returning id into v_session_id;

  insert into public.sync_events(event_id, educator_id, entity_type, entity_id, payload_checksum)
  values (p_event_id, p_educator_id, 'classroom_session', v_session_id,
          encode(extensions.digest(p_payload::text, 'sha256'), 'hex'));
  return v_session_id;
end;
$$;

create or replace function public.activate_model_version(
  p_model_version_id uuid,
  p_expected_checksum text,
  p_actor_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_previous uuid;
  v_candidate public.model_versions%rowtype;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'administrator' and status = 'active'
  ) then raise exception 'Administrator access required'; end if;

  select * into v_candidate from public.model_versions where id = p_model_version_id for update;
  if v_candidate.state <> 'approved' then raise exception 'Only approved models can be activated'; end if;
  if v_candidate.artifact_checksum <> lower(p_expected_checksum) then raise exception 'Artifact checksum mismatch'; end if;
  if not exists (select 1 from public.model_evaluations where model_version_id = p_model_version_id and direction = 'en_to_fil')
     or not exists (select 1 from public.model_evaluations where model_version_id = p_model_version_id and direction = 'fil_to_en')
  then raise exception 'Both translation directions require evaluation'; end if;

  select id into v_previous from public.model_versions where state = 'active' for update;
  update public.model_versions set state = 'archived' where id = v_previous;
  update public.model_versions set state = 'active' where id = p_model_version_id;
  insert into public.model_activations(model_version_id, previous_model_version_id, activated_by)
  values (p_model_version_id, v_previous, p_actor_id);
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'model_activated', 'model_version', p_model_version_id,
          jsonb_build_object('previous_model_version_id', v_previous));
  return jsonb_build_object('activated', p_model_version_id, 'previous', v_previous);
end;
$$;

create or replace function public.rollback_model_activation(p_actor_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_activation public.model_activations%rowtype;
  v_current uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'administrator' and status = 'active'
  ) then raise exception 'Administrator access required'; end if;

  select * into v_activation
  from public.model_activations
  where rolled_back_at is null and previous_model_version_id is not null
  order by activated_at desc
  limit 1
  for update;
  if v_activation.id is null then raise exception 'No model activation is available for rollback'; end if;

  select id into v_current from public.model_versions where state = 'active' for update;
  if v_current <> v_activation.model_version_id then
    raise exception 'Active model changed after this activation';
  end if;
  update public.model_versions set state = 'archived' where id = v_current;
  update public.model_versions set state = 'active' where id = v_activation.previous_model_version_id;
  update public.model_activations set rolled_back_at = now() where id = v_activation.id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'model_rolled_back', 'model_version', v_activation.previous_model_version_id,
          jsonb_build_object('replaced_model_version_id', v_current));
  return jsonb_build_object('active', v_activation.previous_model_version_id, 'archived', v_current);
end;
$$;

grant execute on function public.current_account_role() to authenticated;
grant execute on function public.is_active_educator() to authenticated;
grant execute on function public.is_active_administrator() to authenticated;
grant execute on function public.sync_classroom_session(uuid, uuid, jsonb) to authenticated, service_role;
revoke all on function public.bootstrap_administrator(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_administrator(uuid) to service_role;
revoke all on function public.admin_set_educator_status(uuid, public.account_status, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_educator_status(uuid, public.account_status, text, uuid) to service_role;
revoke all on function public.activate_model_version(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.activate_model_version(uuid, text, uuid) to service_role;
revoke all on function public.rollback_model_activation(uuid) from public, anon, authenticated;
grant execute on function public.rollback_model_activation(uuid) to service_role;
