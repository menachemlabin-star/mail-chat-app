-- Allow announcement authors OR admin to delete
-- Run in Supabase SQL Editor if announcements table already exists

drop policy if exists "announcements_delete_own" on public.announcements;
drop policy if exists "announcements_delete_author_or_admin" on public.announcements;
create policy "announcements_delete_author_or_admin"
  on public.announcements
  for delete
  to authenticated
  using (
    author_id = auth.uid()
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'menachemlabin@gmail.com'
  );
