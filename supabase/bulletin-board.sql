-- Bulletin board: everyone reads, only admin may post
-- Run in: Supabase Dashboard → SQL Editor → New query → Run

create table if not exists public.bulletin_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  author_email text not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

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
    and lower(author_email) = 'menachemlabib@gmail.com'
  );

drop policy if exists "bulletin_delete_admin" on public.bulletin_posts;
create policy "bulletin_delete_admin"
  on public.bulletin_posts
  for delete
  to authenticated
  using (
    author_id = auth.uid()
    and lower(author_email) = 'menachemlabib@gmail.com'
  );

do $$
begin
  alter publication supabase_realtime add table public.bulletin_posts;
exception
  when duplicate_object then null;
end $$;
