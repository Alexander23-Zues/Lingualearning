do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','educator_preferences','curriculum_versions','curriculum_source_documents',
    'learning_areas','competencies','resources','content_versions','resource_competencies',
    'lessons','lesson_steps','dictionary_entries','vocabulary_sets','vocabulary_set_items',
    'stories','story_pages','questions','question_options','quizzes','quiz_items',
    'teaching_plans','teaching_plan_items','class_labels','classroom_sessions',
    'session_resources','session_competencies','session_results','downloads','sync_events',
    'announcements','audit_logs','resource_submissions','resource_reviews',
    'translation_datasets','translation_pair_revisions','translation_pair_reviews',
    'dataset_snapshots','dataset_snapshot_pairs','dataset_split_membership','training_runs',
    'model_versions','model_evaluations','model_activations'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
  end loop;
end $$;

create policy profiles_self_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_active_administrator()));
create policy profiles_self_update on public.profiles for update to authenticated
using (id = (select auth.uid()) and status = 'active')
with check (id = (select auth.uid()));

create policy preferences_owner on public.educator_preferences for all to authenticated
using (educator_id = (select auth.uid()) and (select public.is_active_educator()))
with check (educator_id = (select auth.uid()) and (select public.is_active_educator()));

create policy curriculum_read on public.curriculum_versions for select to authenticated
using ((select public.current_account_role()) is not null);
create policy curriculum_admin on public.curriculum_versions for all to authenticated
using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()));
create policy source_read on public.curriculum_source_documents for select to authenticated
using ((select public.current_account_role()) is not null);
create policy source_admin on public.curriculum_source_documents for all to authenticated
using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()));
create policy learning_area_read on public.learning_areas for select to authenticated
using ((select public.current_account_role()) is not null);
create policy learning_area_admin on public.learning_areas for all to authenticated
using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()));
create policy competency_read on public.competencies for select to authenticated
using ((select public.current_account_role()) is not null);
create policy competency_admin on public.competencies for all to authenticated
using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()));

create policy resources_read on public.resources for select to authenticated
using (
  (visibility = 'published' and state = 'published' and (select public.current_account_role()) is not null)
  or owner_id = (select auth.uid())
  or (select public.is_active_administrator())
);
create policy resources_owner_insert on public.resources for insert to authenticated
with check (owner_id = (select auth.uid()) and visibility = 'private' and state = 'draft' and (select public.is_active_educator()));
create policy resources_owner_update on public.resources for update to authenticated
using (owner_id = (select auth.uid()) and state in ('draft','changes_requested') and (select public.is_active_educator()))
with check (owner_id = (select auth.uid()) and visibility <> 'published');
create policy resources_admin on public.resources for all to authenticated
using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()));

create policy content_versions_read on public.content_versions for select to authenticated
using (exists (select 1 from public.resources r where r.id = resource_id));
create policy content_versions_owner_insert on public.content_versions for insert to authenticated
with check (created_by = (select auth.uid()) and exists (
  select 1 from public.resources r where r.id = resource_id and r.owner_id = (select auth.uid()) and r.state in ('draft','changes_requested')
));
create policy content_versions_admin on public.content_versions for all to authenticated
using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'resource_competencies','lessons','lesson_steps','stories','story_pages'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.current_account_role()) is not null)',
      table_name || '_read', table_name
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()))',
      table_name || '_admin', table_name
    );
  end loop;
end $$;

create policy dictionary_read on public.dictionary_entries for select to authenticated
using (state = 'published' or created_by = (select auth.uid()) or (select public.is_active_administrator()));
create policy dictionary_admin on public.dictionary_entries for all to authenticated
using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()));

create policy vocabulary_owner on public.vocabulary_sets for all to authenticated
using (owner_id = (select auth.uid()) or (select public.is_active_administrator()))
with check (owner_id = (select auth.uid()) and (select public.is_active_educator()));
create policy vocabulary_items_owner on public.vocabulary_set_items for all to authenticated
using (exists (select 1 from public.vocabulary_sets v where v.id = vocabulary_set_id and (v.owner_id = (select auth.uid()) or (select public.is_active_administrator()))))
with check (exists (select 1 from public.vocabulary_sets v where v.id = vocabulary_set_id and v.owner_id = (select auth.uid())));

create policy questions_read on public.questions for select to authenticated
using (state = 'published' or owner_id = (select auth.uid()) or (select public.is_active_administrator()));
create policy questions_owner on public.questions for all to authenticated
using (owner_id = (select auth.uid()) and (select public.is_active_educator()))
with check (owner_id = (select auth.uid()) and state <> 'published');
create policy questions_admin on public.questions for all to authenticated
using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()));
create policy options_read on public.question_options for select to authenticated
using (exists (select 1 from public.questions q where q.id = question_id));
create policy options_write on public.question_options for all to authenticated
using (exists (select 1 from public.questions q where q.id = question_id and (q.owner_id = (select auth.uid()) or (select public.is_active_administrator()))))
with check (exists (select 1 from public.questions q where q.id = question_id and (q.owner_id = (select auth.uid()) or (select public.is_active_administrator()))));
create policy quizzes_owner on public.quizzes for all to authenticated
using (owner_id = (select auth.uid()) or (select public.is_active_administrator()))
with check (owner_id = (select auth.uid()) or (select public.is_active_administrator()));
create policy quiz_items_owner on public.quiz_items for all to authenticated
using (exists (select 1 from public.quizzes q where q.id = quiz_id and (q.owner_id = (select auth.uid()) or (select public.is_active_administrator()))))
with check (exists (select 1 from public.quizzes q where q.id = quiz_id and (q.owner_id = (select auth.uid()) or (select public.is_active_administrator()))));

do $$
declare table_name text; owner_column text;
begin
  for table_name, owner_column in values
    ('teaching_plans','educator_id'), ('class_labels','educator_id'),
    ('classroom_sessions','educator_id'), ('downloads','educator_id'), ('sync_events','educator_id')
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (%I = (select auth.uid()) or (select public.is_active_administrator())) with check (%I = (select auth.uid()) and (select public.is_active_educator()))',
      table_name || '_owner', table_name, owner_column, owner_column
    );
  end loop;
end $$;

create policy plan_items_owner on public.teaching_plan_items for all to authenticated
using (exists (select 1 from public.teaching_plans p where p.id = teaching_plan_id and (p.educator_id = (select auth.uid()) or (select public.is_active_administrator()))))
with check (exists (select 1 from public.teaching_plans p where p.id = teaching_plan_id and p.educator_id = (select auth.uid())));
create policy session_resources_owner on public.session_resources for all to authenticated
using (exists (select 1 from public.classroom_sessions s where s.id = session_id and (s.educator_id = (select auth.uid()) or (select public.is_active_administrator()))))
with check (exists (select 1 from public.classroom_sessions s where s.id = session_id and s.educator_id = (select auth.uid())));
create policy session_competencies_owner on public.session_competencies for all to authenticated
using (exists (select 1 from public.classroom_sessions s where s.id = session_id and (s.educator_id = (select auth.uid()) or (select public.is_active_administrator()))))
with check (exists (select 1 from public.classroom_sessions s where s.id = session_id and s.educator_id = (select auth.uid())));
create policy session_results_owner on public.session_results for all to authenticated
using (exists (select 1 from public.classroom_sessions s where s.id = session_id and (s.educator_id = (select auth.uid()) or (select public.is_active_administrator()))))
with check (exists (select 1 from public.classroom_sessions s where s.id = session_id and s.educator_id = (select auth.uid())));

create policy announcements_read on public.announcements for select to authenticated
using (published_at is not null and archived_at is null and (select public.current_account_role()) is not null);
create policy announcements_admin on public.announcements for all to authenticated
using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()));
create policy audit_admin_read on public.audit_logs for select to authenticated
using ((select public.is_active_administrator()));

create policy submissions_owner_read on public.resource_submissions for select to authenticated
using (submitted_by = (select auth.uid()) or (select public.is_active_administrator()));
create policy submissions_owner_insert on public.resource_submissions for insert to authenticated
with check (submitted_by = (select auth.uid()) and state = 'submitted' and (select public.is_active_educator()));
create policy submissions_admin on public.resource_submissions for all to authenticated
using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()));
create policy reviews_submitter_or_admin on public.resource_reviews for select to authenticated
using ((select public.is_active_administrator()) or exists (
  select 1 from public.resource_submissions s where s.id = submission_id and s.submitted_by = (select auth.uid())
));
create policy reviews_admin_write on public.resource_reviews for all to authenticated
using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'translation_datasets','translation_pair_revisions','translation_pair_reviews',
    'dataset_snapshots','dataset_snapshot_pairs','dataset_split_membership','training_runs',
    'model_versions','model_evaluations','model_activations'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_active_administrator())) with check ((select public.is_active_administrator()))',
      table_name || '_admin', table_name
    );
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('teaching-resources', 'teaching-resources', false, 52428800, array['application/pdf','image/png','image/jpeg','audio/mpeg','audio/ogg']),
  ('curriculum-sources', 'curriculum-sources', false, 52428800, array['application/pdf']),
  ('translation-datasets', 'translation-datasets', false, 104857600, array['text/csv','application/zip']),
  ('model-packages', 'model-packages', false, 2147483648, array['application/zip','application/octet-stream'])
on conflict (id) do nothing;

create policy teaching_storage_read on storage.objects for select to authenticated
using (bucket_id = 'teaching-resources' and (select public.current_account_role()) is not null);
create policy teaching_storage_owner_write on storage.objects for insert to authenticated
with check (
  bucket_id = 'teaching-resources'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_active_educator())
);
create policy admin_storage_all on storage.objects for all to authenticated
using (
  bucket_id in ('curriculum-sources','translation-datasets','model-packages')
  and (select public.is_active_administrator())
)
with check (
  bucket_id in ('curriculum-sources','translation-datasets','model-packages')
  and (select public.is_active_administrator())
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'educator_preferences','curriculum_versions','curriculum_source_documents',
    'learning_areas','competencies','resources','content_versions','resource_competencies',
    'lessons','lesson_steps','dictionary_entries','vocabulary_sets','vocabulary_set_items',
    'stories','story_pages','questions','question_options','quizzes','quiz_items',
    'teaching_plans','teaching_plan_items','class_labels','classroom_sessions',
    'session_resources','session_competencies','session_results','downloads','sync_events',
    'announcements','audit_logs','resource_submissions','resource_reviews',
    'translation_datasets','translation_pair_revisions','translation_pair_reviews',
    'dataset_snapshots','dataset_snapshot_pairs','dataset_split_membership','training_runs',
    'model_versions','model_evaluations','model_activations'
  ] loop
    execute format(
      'create policy active_account_gate on public.%I as restrictive for all to authenticated using ((select public.current_account_role()) is not null) with check ((select public.current_account_role()) is not null)',
      table_name
    );
  end loop;
end $$;
