-- Run once in Supabase Dashboard → SQL Editor
-- Enables image messages + Storage bucket for chat uploads

alter table public.messages
  add column if not exists image_url text;

alter table public.messages
  alter column body set default '';

-- Public bucket for chat images (authenticated upload, public read)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat_images_select" on storage.objects;
create policy "chat_images_select"
on storage.objects for select
to public
using (bucket_id = 'chat-images');

drop policy if exists "chat_images_insert" on storage.objects;
create policy "chat_images_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "chat_images_delete" on storage.objects;
create policy "chat_images_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
