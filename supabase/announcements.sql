-- Global announcements board (visible to every logged-in user)
-- Run in: Supabase Dashboard → SQL Editor → New query → Run

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  author_email text not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists announcements_created_at_idx
  on public.announcements (created_at desc);

alter table public.announcements enable row level security;

drop policy if exists "announcements_select_authenticated" on public.announcements;
create policy "announcements_select_authenticated"
  on public.announcements
  for select
  to authenticated
  using (true);

drop policy if exists "announcements_insert_authenticated" on public.announcements;
create policy "announcements_insert_authenticated"
  on public.announcements
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and author_id = auth.uid()
  );

drop policy if exists "announcements_delete_own" on public.announcements;
create policy "announcements_delete_own"
  on public.announcements
  for delete
  to authenticated
  using (author_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.announcements;
exception
  when duplicate_object then null;
end $$;
