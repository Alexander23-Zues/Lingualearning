-- Private offline backups. Only the authenticated owner can list metadata;
-- only the application server may store archives or update transfer progress.
create table public.offline_collection_archives (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 checksum text not null check(checksum ~ '^[a-f0-9]{64}$'),
 object_path text not null,
 device_id uuid not null,
 status text not null default 'saved' check(status in ('saved','transferring','complete','needs_review')),
 result jsonb not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,checksum)
);
create index offline_archive_owner on public.offline_collection_archives(owner_id);
alter table public.offline_collection_archives enable row level security;
revoke all on public.offline_collection_archives from public,anon,authenticated;
grant select on public.offline_collection_archives to authenticated;
grant all on public.offline_collection_archives to service_role;
create policy "Educators can list their own collection backups" on public.offline_collection_archives
 for select to authenticated using(owner_id=(select auth.uid()) and (select private.current_account_role())='educator');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('offline-collections','offline-collections',false,157286400,array['application/zip']) on conflict(id) do nothing;
-- No Storage client policy: raw child audio requires the owner-authenticated API.


