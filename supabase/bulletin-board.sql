-- Bulletin board: everyone reads, only admin may post/edit
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- (Safe to re-run; upgrades existing bulletin_posts if already created)

create table if not exists public.bulletin_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  author_email text not null,
  author_name text not null,
  body text not null default '',
  image_url text,
  file_url text,
  file_name text,
  file_type text,
  created_at timestamptz not null default now()
);

alter table public.bulletin_posts add column if not exists body text not null default '';
alter table public.bulletin_posts add column if not exists image_url text;
alter table public.bulletin_posts add column if not exists file_url text;
alter table public.bulletin_posts add column if not exists file_name text;
alter table public.bulletin_posts add column if not exists file_type text;

create index if not exists bulletin_posts_created_at_idx
  on public.bulletin_posts (created_at desc);

alter table public.bulletin_posts enable row level security;

drop policy if exists "bulletin_select_authenticated" on public.bulletin_posts;
create policy "bulletin_select_authenticated"
  on public.bulletin_posts
  for select
  to authenticated
  using (true);

drop policy if exists "bulletin_insert_admin" on public.bulletin_posts;
create policy "bulletin_insert_admin"
  on public.bulletin_posts
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and author_id = auth.uid()
    and lower(author_email) = 'menachemlabin@gmail.com'
  );

drop policy if exists "bulletin_update_admin" on public.bulletin_posts;
create policy "bulletin_update_admin"
  on public.bulletin_posts
  for update
  to authenticated
  using (
    author_id = auth.uid()
    and lower(author_email) = 'menachemlabin@gmail.com'
  )
  with check (
    author_id = auth.uid()
    and lower(author_email) = 'menachemlabin@gmail.com'
  );

drop policy if exists "bulletin_delete_admin" on public.bulletin_posts;
create policy "bulletin_delete_admin"
  on public.bulletin_posts
  for delete
  to authenticated
  using (
    author_id = auth.uid()
    and lower(author_email) = 'menachemlabin@gmail.com'
  );

-- Storage for bulletin images + PDFs (admin upload folder = auth.uid())
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bulletin-files',
  'bulletin-files',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bulletin_files_select" on storage.objects;
create policy "bulletin_files_select"
on storage.objects for select
to public
using (bucket_id = 'bulletin-files');

drop policy if exists "bulletin_files_select_authenticated" on storage.objects;
create policy "bulletin_files_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'bulletin-files');

drop policy if exists "bulletin_files_insert" on storage.objects;
create policy "bulletin_files_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'bulletin-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "bulletin_files_delete" on storage.objects;
create policy "bulletin_files_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'bulletin-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

do $$
begin
  alter publication supabase_realtime add table public.bulletin_posts;
exception
  when duplicate_object then null;
end $$;
