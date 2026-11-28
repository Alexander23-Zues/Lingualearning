-- Additive AI metadata only. Existing accounts, content and grades are untouched.
create table public.ai_translation_history (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  source_text text not null check(length(source_text) between 1 and 2000),
  translation text not null check(length(translation) between 1 and 10000),
  source_language text not null check(source_language in ('en','fil')),
  target_language text not null check(target_language in ('en','fil') and target_language<>source_language),
  model_version text not null,
  created_at timestamptz not null default now()
);
create index ai_history_owner on public.ai_translation_history(created_by,created_at desc);
alter table public.ai_translation_history enable row level security;
revoke all on public.ai_translation_history from public,anon,authenticated;
grant select,insert,delete on public.ai_translation_history to authenticated;
create policy history_read on public.ai_translation_history for select to authenticated
 using(created_by=(select auth.uid()) and private.current_account_role() is not null);
create policy history_insert on public.ai_translation_history for insert to authenticated
 with check(created_by=(select auth.uid()) and private.current_account_role() is not null);
create policy history_delete on public.ai_translation_history for delete to authenticated
 using(created_by=(select auth.uid()) and private.current_account_role() is not null);

-- Counts only: no recording, transcript, child identity, or pronunciation score.
create table public.ai_reading_attempts (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references public.profiles(id),
 language text not null check(language in ('en','fil')),
 expected_word_count integer not null check(expected_word_count between 1 and 300),
 matched_word_count integer not null check(matched_word_count between 0 and expected_word_count),
 missing_word_count integer not null check(missing_word_count=expected_word_count-matched_word_count),
 created_at timestamptz not null default now()
);
create index ai_reading_owner on public.ai_reading_attempts(created_by,created_at desc);
alter table public.ai_reading_attempts enable row level security;
revoke all on public.ai_reading_attempts from public,anon,authenticated;
grant select,insert on public.ai_reading_attempts to authenticated;
create policy reading_read on public.ai_reading_attempts for select to authenticated
 using(created_by=(select auth.uid()) and private.current_account_role() is not null);
create policy reading_insert on public.ai_reading_attempts for insert to authenticated
 with check(created_by=(select auth.uid()) and private.current_account_role() is not null);

-- Reuse approved workspace dataset records and the existing model/evaluation registry.
create table public.ai_training_jobs (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references public.profiles(id),
 dataset_record_id uuid not null references public.workspace_records(id),
 dataset_snapshot jsonb not null check(pg_column_size(dataset_snapshot)<=10000000),
 configuration jsonb not null default '{}',
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 progress jsonb not null default '{}', metrics jsonb not null default '{}', artifact jsonb not null default '{}',
 error text, created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
 lease_expires_at timestamptz
);
create index ai_jobs_queue on public.ai_training_jobs(status,created_at);
alter table public.ai_training_jobs enable row level security;
revoke all on public.ai_training_jobs from public,anon,authenticated;
grant select,insert on public.ai_training_jobs to authenticated;
grant all on public.ai_training_jobs to service_role;
create policy jobs_read on public.ai_training_jobs for select to authenticated
 using(private.is_active_administrator());
create policy jobs_queue on public.ai_training_jobs for insert to authenticated with check(
 private.is_active_administrator() and created_by=(select auth.uid()) and status='queued'
 and progress='{}'::jsonb and metrics='{}'::jsonb and artifact='{}'::jsonb and error is null
 and started_at is null and completed_at is null and lease_expires_at is null
 and exists(select 1 from public.workspace_records r where r.id=dataset_record_id and r.kind='dataset' and r.status='published'));

create function private.claim_ai_training_job() returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.ai_training_jobs;
begin
 update public.ai_training_jobs set status='failed',completed_at=now(),error='Worker lease expired. Review the run before starting a new job.'
 where status='running' and lease_expires_at<now();
 select * into job from public.ai_training_jobs where status='queued' order by created_at for update skip locked limit 1;
 if job.id is null then return null;end if;
 update public.ai_training_jobs set status='running',started_at=now(),lease_expires_at=now()+interval '2 minutes'
 where id=job.id returning * into job;
 return to_jsonb(job);
end $$;
create function public.claim_ai_training_job() returns jsonb language sql security invoker set search_path=''
 as $$ select private.claim_ai_training_job() $$;
revoke all on function private.claim_ai_training_job() from public,anon,authenticated;
revoke all on function public.claim_ai_training_job() from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.claim_ai_training_job(),public.claim_ai_training_job() to service_role;
notify pgrst,'reload schema';

-- Imported upstream checkpoints have no local training run or local dataset snapshot.
-- Preserve all existing references; represent this provenance without fake run records.
alter table public.model_versions alter column training_run_id drop not null;
alter table public.model_versions alter column dataset_snapshot_id drop not null;
alter table public.model_versions add constraint model_training_provenance check(
 (training_run_id is not null and dataset_snapshot_id is not null) or
 (coalesce(training_configuration->>'provenance'='upstream_pretrained',false)));

create function private.register_pretrained_model(p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare manifest jsonb:=p_data->'manifest'; evaluations jsonb:=p_data->'evaluations'; metric jsonb; model_id uuid;
begin
 if not private.is_active_administrator() then raise exception 'Administrator access required' using errcode='42501';end if;
 if pg_column_size(p_data)>1000000 or length(btrim(coalesce(p_data->>'review_notes','')))<20
 or length(btrim(coalesce(p_data->>'name','')))=0
 or manifest->>'model_version' is distinct from p_data->>'version'
 or manifest->>'architecture' is distinct from 'marian-pair'
 or manifest->>'provenance' is distinct from 'upstream_pretrained'
 or manifest->'foundation_models'->>'en_to_fil' is distinct from 'Helsinki-NLP/opus-mt-en-tl'
 or manifest->'foundation_models'->>'fil_to_en' is distinct from 'Helsinki-NLP/opus-mt-tl-en'
 or coalesce(manifest->'upstream_revisions'->>'Helsinki-NLP/opus-mt-en-tl','') !~ '^[a-f0-9]{40}$'
 or coalesce(manifest->'upstream_revisions'->>'Helsinki-NLP/opus-mt-tl-en','') !~ '^[a-f0-9]{40}$'
 or coalesce(p_data->>'artifact_checksum','') !~ '^[a-f0-9]{64}$'
 or coalesce(p_data->>'artifact_uri','') !~ '^(https://|supabase://)'
 or jsonb_typeof(manifest->'files') is distinct from 'object' or manifest->'files'='{}'::jsonb
 then raise exception 'Provide pinned upstream provenance, checksum, hosted artifact, and substantive human review';end if;
 if exists(select 1 from jsonb_each_text(manifest->'files') where value !~ '^[a-f0-9]{64}$' or key like '%..%' or key like '/%') then raise exception 'Invalid artifact file manifest';end if;
 foreach metric in array array[evaluations->'en_to_fil',evaluations->'fil_to_en'] loop
  if metric is null or coalesce((metric->>'sample_count')::integer,0)<=0
   or (metric->>'sacrebleu') is null or (metric->>'sacrebleu')::numeric not between 0 and 100
   or (metric->>'chrf') is null or (metric->>'chrf')::numeric not between 0 and 100
  then raise exception 'Both directions require measured evaluation';end if;
 end loop;
 insert into public.model_versions(name,version,artifact_uri,artifact_checksum,training_configuration)
 values(p_data->>'name',p_data->>'version',p_data->>'artifact_uri',p_data->>'artifact_checksum',
 jsonb_build_object('provenance','upstream_pretrained','manifest',manifest)) returning id into model_id;
 for metric in select value||jsonb_build_object('direction',key) from jsonb_each(evaluations) where key in ('en_to_fil','fil_to_en') loop
  insert into public.model_evaluations(model_version_id,direction,sacrebleu,chrf,sample_count,latency_ms_p50,latency_ms_p95,human_review,reviewed_by)
  values(model_id,metric->>'direction',(metric->>'sacrebleu')::numeric,(metric->>'chrf')::numeric,(metric->>'sample_count')::integer,
   (metric->>'latency_ms_p50')::numeric,(metric->>'latency_ms_p95')::numeric,jsonb_build_object('notes',p_data->>'review_notes'),auth.uid());
 end loop;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'pretrained_model_registered','model_version',model_id);
 return model_id;
end $$;
create function public.register_pretrained_model(p_data jsonb) returns uuid language sql security invoker set search_path=''
 as $$select private.register_pretrained_model(p_data)$$;
revoke all on function private.register_pretrained_model(jsonb),public.register_pretrained_model(jsonb) from public,anon;
grant execute on function private.register_pretrained_model(jsonb),public.register_pretrained_model(jsonb) to authenticated;
notify pgrst,'reload schema';

-- Let the trusted inference gateway compare the activated package's external digest.
create or replace function private.active_learning_model() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if private.current_account_role() is null then raise exception 'Active adult account required' using errcode='42501';end if;
 return(select jsonb_build_object('id',id,'name',name,'version',version,'artifact_checksum',artifact_checksum)
 from public.model_versions where state='active' limit 1);
end $$;

-- Record the actual foundation of a locally fine-tuned Marian pair, retaining the existing registration flow.
do $patch$
declare definition text; marker text:='  insert into public.model_versions(id,training_run_id';
begin
 definition:=pg_get_functiondef('private.register_trained_model(jsonb)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Model registration changed; review this migration';end if;
 execute replace(definition,marker,
  '  update public.training_runs set foundation_model=case when manifest->>''architecture''=''marian-pair'' then ''Helsinki-NLP/opus-mt-en-tl + Helsinki-NLP/opus-mt-tl-en'' else coalesce(manifest->>''foundation_model'',''google/mt5-small'') end where id=run_id;'||chr(10)||marker);
end $patch$;


