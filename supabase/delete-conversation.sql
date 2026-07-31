-- Run once in Supabase Dashboard -> SQL Editor.
-- Enables right-click delete chat for members.

drop policy if exists "members_delete_own" on public.conversation_members;
create policy "members_delete_own"
on public.conversation_members for delete
to authenticated
using (lower(member_email) = public.auth_email());

-- Allow any member to delete a private conversation (not only creator).
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
