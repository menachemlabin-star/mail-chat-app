-- MailChat schema for Supabase
-- Run this entire script in: Supabase Dashboard → SQL Editor → New query → Run

-- Profiles (linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Conversations (private / group)
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('private', 'group')),
  name text not null,
  private_key text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.conversations
  add column if not exists private_key text;

-- Members identified by email (works even before the peer registers)
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  member_email text not null,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, member_email)
);

alter table public.conversation_members
  add column if not exists last_read_at timestamptz not null default now();

create index if not exists conversation_members_email_idx
  on public.conversation_members (lower(member_email));

-- Give each existing private pair one canonical conversation. Older duplicate
-- rows remain readable, but all future starts reuse the canonical row.
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

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_email text not null,
  sender_name text not null,
  body text not null default '',
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.messages
  add column if not exists image_url text;

alter table public.messages
  alter column body set default '';

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

-- Normalize emails on insert/update
create or replace function public.normalize_member_email()
returns trigger
language plpgsql
as $$
begin
  new.member_email := lower(trim(new.member_email));
  return new;
end;
$$;

drop trigger if exists trg_normalize_member_email on public.conversation_members;
create trigger trg_normalize_member_email
before insert or update on public.conversation_members
for each row execute function public.normalize_member_email();

-- Auto-create profile after signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(
          nullif(trim(excluded.display_name), ''),
          public.profiles.display_name
        );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Helper: current auth email
create or replace function public.auth_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- Helper: membership check (SECURITY DEFINER to avoid RLS recursion)
create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = conv_id
      and lower(cm.member_email) = public.auth_email()
  );
$$;

-- Atomically reuse one private conversation for the same two users,
-- regardless of who starts it or how many times they click "new chat".
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

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Profiles policies
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Conversations policies
drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member"
on public.conversations for select
to authenticated
using (created_by = auth.uid() or public.is_conversation_member(id));

drop policy if exists "conversations_insert_own" on public.conversations;
create policy "conversations_insert_own"
on public.conversations for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "conversations_delete_own" on public.conversations;
create policy "conversations_delete_own"
on public.conversations for delete
to authenticated
using (created_by = auth.uid());
-- Members policies
drop policy if exists "members_select_visible" on public.conversation_members;
create policy "members_select_visible"
on public.conversation_members for select
to authenticated
using (
  lower(member_email) = public.auth_email()
  or public.is_conversation_member(conversation_id)
);

drop policy if exists "members_insert_creator_or_member" on public.conversation_members;
create policy "members_insert_creator_or_member"
on public.conversation_members for insert
to authenticated
with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.created_by = auth.uid()
  )
  or public.is_conversation_member(conversation_id)
);

drop policy if exists "members_update_own_read_status" on public.conversation_members;
create policy "members_update_own_read_status"
on public.conversation_members for update
to authenticated
using (lower(member_email) = public.auth_email())
with check (lower(member_email) = public.auth_email());

drop policy if exists "members_delete_own" on public.conversation_members;
create policy "members_delete_own"
on public.conversation_members for delete
to authenticated
using (lower(member_email) = public.auth_email());

drop policy if exists "conversations_delete_member" on public.conversations;
create policy "conversations_delete_member"
on public.conversations for delete
to authenticated
using (public.is_conversation_member(id));

create or replace function public.delete_conversation_for_me(conv_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := public.auth_email();
  conv_type text;
  remaining integer;
begin
  if auth.uid() is null or me = '' then
    raise exception 'Not authenticated';
  end if;

  if not public.is_conversation_member(conv_id) then
    raise exception 'Not a conversation member';
  end if;

  select type into conv_type
  from public.conversations
  where id = conv_id;

  if conv_type is null then
    return;
  end if;

  if conv_type = 'private' then
    delete from public.conversations where id = conv_id;
    return;
  end if;

  delete from public.conversation_members
  where conversation_id = conv_id
    and lower(member_email) = me;

  select count(*) into remaining
  from public.conversation_members
  where conversation_id = conv_id;

  if remaining = 0 then
    delete from public.conversations where id = conv_id;
  end if;
end;
$$;

revoke all on function public.delete_conversation_for_me(uuid) from public;
grant execute on function public.delete_conversation_for_me(uuid) to authenticated;

-- Messages policies
drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member"
on public.messages for select
to authenticated
using (public.is_conversation_member(conversation_id));

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
on public.messages for insert
to authenticated
with check (
  public.is_conversation_member(conversation_id)
  and lower(sender_email) = public.auth_email()
);

-- Realtime for live chat (safe if already added)
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.conversation_members;
exception
  when duplicate_object then null;
end $$;
