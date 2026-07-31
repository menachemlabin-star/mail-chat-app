-- Run once in Supabase Dashboard -> SQL Editor.
-- Adds canonical private chats, incoming-chat realtime, and unread tracking.

alter table public.conversations
  add column if not exists private_key text;

alter table public.conversation_members
  add column if not exists last_read_at timestamptz not null default now();

with paired as (
  select
    c.id,
    c.created_at,
    string_agg(lower(cm.member_email), '::' order by lower(cm.member_email)) as pair_key
  from public.conversations c
  join public.conversation_members cm on cm.conversation_id = c.id
  where c.type = 'private'
  group by c.id, c.created_at
  having count(*) = 2
),
ranked as (
  select
    id,
    pair_key,
    row_number() over (partition by pair_key order by created_at, id) as pair_rank
  from paired
)
update public.conversations c
set private_key = r.pair_key
from ranked r
where c.id = r.id
  and r.pair_rank = 1
  and c.private_key is null;

create unique index if not exists conversations_private_key_unique_idx
  on public.conversations (private_key)
  where private_key is not null;

create or replace function public.get_or_create_private_conversation(peer_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := public.auth_email();
  peer text := lower(trim(peer_email));
  pair_key text;
  v_conversation_id uuid;
  peer_name text;
begin
  if auth.uid() is null or me = '' then
    raise exception 'Not authenticated';
  end if;

  if peer = me then
    raise exception 'Cannot create a conversation with yourself';
  end if;

  select display_name
  into peer_name
  from public.profiles
  where lower(email) = peer;

  if peer_name is null then
    raise exception 'Recipient is not registered';
  end if;

  pair_key := case
    when me < peer then me || '::' || peer
    else peer || '::' || me
  end;

  insert into public.conversations (type, name, private_key, created_by)
  values ('private', peer_name, pair_key, auth.uid())
  on conflict (private_key) where private_key is not null
  do update set private_key = excluded.private_key
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, member_email)
  values
    (v_conversation_id, me),
    (v_conversation_id, peer)
  on conflict (conversation_id, member_email) do nothing;

  return v_conversation_id;
end;
$$;

revoke all on function public.get_or_create_private_conversation(text) from public;
grant execute on function public.get_or_create_private_conversation(text) to authenticated;

drop policy if exists "members_update_own_read_status" on public.conversation_members;
create policy "members_update_own_read_status"
on public.conversation_members for update
to authenticated
using (lower(member_email) = public.auth_email())
with check (lower(member_email) = public.auth_email());

do $$
begin
  alter publication supabase_realtime add table public.conversation_members;
exception
  when duplicate_object then null;
end $$;
