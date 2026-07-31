import { supabase } from './supabase';
import type { Conversation, ConversationType, Message, Session } from '../types';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function mapError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? '';
  if (/row-level security|violates row-level/i.test(message)) {
    return 'הרשאות מסד הנתונים חוסמות את הפעולה. הריצו מחדש את schema.sql ב-Supabase → SQL Editor.';
  }
  return message || fallback;
}

function mapMessage(row: {
  id: string;
  conversation_id: string;
  sender_email: string;
  sender_name: string;
  body: string;
  created_at: string;
}): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderEmail: row.sender_email,
    senderName: row.sender_name,
    text: row.body,
    timestamp: new Date(row.created_at).getTime(),
  };
}

export async function fetchProfile(userId: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name,
  };
}

export async function ensureProfile(
  userId: string,
  email: string,
  displayName?: string,
): Promise<Session> {
  const existing = await fetchProfile(userId);
  if (existing) {
    if (displayName && displayName.trim() && displayName.trim() !== existing.displayName) {
      await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', userId);
      return { ...existing, displayName: displayName.trim() };
    }
    return existing;
  }

  const name = displayName?.trim() || email.split('@')[0];
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: email.toLowerCase(),
        display_name: name,
      },
      { onConflict: 'id' },
    )
    .select('id, email, display_name')
    .single();

  if (error || !data) {
    return { id: userId, email: email.toLowerCase(), displayName: name };
  }

  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name,
  };
}

export async function findProfileByEmail(email: string) {
  const { data } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  return data;
}

export async function listRegisteredUsers(excludeEmail?: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .order('display_name', { ascending: true });

  if (error || !data) return [];

  const exclude = excludeEmail?.toLowerCase();
  return data
    .filter((u) => !exclude || u.email.toLowerCase() !== exclude)
    .map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name,
    }));
}

export async function loadConversationsForUser(email: string): Promise<Result<Conversation[]>> {
  const normalized = email.toLowerCase();

  const { data: memberships, error: membershipError } = await supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at')
    .eq('member_email', normalized);

  if (membershipError) {
    return { ok: false, error: mapError(membershipError, 'שגיאה בטעינת שיחות') };
  }

  const ids = (memberships ?? []).map((m) => m.conversation_id);
  if (ids.length === 0) return { ok: true, data: [] };

  const { data: rows, error } = await supabase
    .from('conversations')
    .select('id, type, name, created_at, conversation_members(member_email)')
    .in('id', ids)
    .order('created_at', { ascending: false });

  if (error) {
    return { ok: false, error: mapError(error, 'שגיאה בטעינת שיחות') };
  }

  const memberEmails = Array.from(
    new Set(
      (rows ?? []).flatMap((row) => {
        const membersRaw = row.conversation_members as { member_email: string }[] | null;
        return (membersRaw ?? []).map((member) => member.member_email.toLowerCase());
      }),
    ),
  );

  const { data: profiles } =
    memberEmails.length > 0
      ? await supabase
          .from('profiles')
          .select('email, display_name')
          .in('email', memberEmails)
      : { data: [] };

  const namesByEmail = new Map(
    (profiles ?? []).map((profile) => [profile.email.toLowerCase(), profile.display_name]),
  );
  const readAtByConversation = new Map(
    (memberships ?? []).map((membership) => [
      membership.conversation_id,
      new Date(membership.last_read_at).getTime(),
    ]),
  );

  const conversations: Conversation[] = (rows ?? []).map((row) => {
    const membersRaw = row.conversation_members as { member_email: string }[] | null;
    const members = (membersRaw ?? []).map((m) => m.member_email.toLowerCase());
    const peerEmail =
      row.type === 'private' ? members.find((member) => member !== normalized) : undefined;

    return {
      id: row.id,
      type: row.type as ConversationType,
      name: peerEmail ? (namesByEmail.get(peerEmail) ?? row.name) : row.name,
      members,
      createdAt: new Date(row.created_at).getTime(),
      lastReadAt: readAtByConversation.get(row.id) ?? 0,
    };
  });

  return { ok: true, data: conversations };
}

export async function loadMessages(conversationIds: string[]): Promise<Result<Message[]>> {
  if (conversationIds.length === 0) return { ok: true, data: [] };

  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_email, sender_name, body, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true });

  if (error) {
    return { ok: false, error: mapError(error, 'שגיאה בטעינת הודעות') };
  }

  return { ok: true, data: (data ?? []).map(mapMessage) };
}

export async function createPrivateConversation(input: {
  userId: string;
  myEmail: string;
  peerEmail: string;
  peerName: string;
}): Promise<Result<Conversation>> {
  const myEmail = input.myEmail.toLowerCase();
  const peerEmail = input.peerEmail.toLowerCase();

  const { data: conversationId, error } = await supabase.rpc(
    'get_or_create_private_conversation',
    { peer_email: peerEmail },
  );

  if (error || !conversationId) {
    return { ok: false, error: mapError(error, 'לא ניתן ליצור שיחה') };
  }

  const refreshed = await loadConversationsForUser(myEmail);
  if (!refreshed.ok) return refreshed;

  const conversation = refreshed.data.find((item) => item.id === conversationId);
  if (!conversation) {
    return { ok: false, error: 'השיחה נוצרה אך לא ניתן היה לטעון אותה' };
  }

  return { ok: true, data: conversation };
}

export async function createGroupConversation(input: {
  userId: string;
  myEmail: string;
  name: string;
  memberEmails: string[];
}): Promise<Result<Conversation>> {
  const myEmail = input.myEmail.toLowerCase();
  const members = Array.from(
    new Set([
      myEmail,
      ...input.memberEmails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')),
    ]),
  );

  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({
      type: 'group',
      name: input.name.trim(),
      created_by: input.userId,
    })
    .select('id, type, name, created_at')
    .single();

  if (convError || !conv) {
    return { ok: false, error: mapError(convError, 'לא ניתן ליצור קבוצה') };
  }

  const { error: membersError } = await supabase.from('conversation_members').insert(
    members.map((member_email) => ({
      conversation_id: conv.id,
      member_email,
    })),
  );

  if (membersError) {
    await supabase.from('conversations').delete().eq('id', conv.id);
    return { ok: false, error: mapError(membersError, 'לא ניתן להוסיף חברים לקבוצה') };
  }

  return {
    ok: true,
    data: {
      id: conv.id,
      type: 'group',
      name: conv.name,
      members,
      createdAt: new Date(conv.created_at).getTime(),
      lastReadAt: Date.now(),
    },
  };
}

export async function markConversationRead(
  conversationId: string,
  memberEmail: string,
): Promise<Result<number>> {
  const readAt = new Date().toISOString();
  const { error } = await supabase
    .from('conversation_members')
    .update({ last_read_at: readAt })
    .eq('conversation_id', conversationId)
    .eq('member_email', memberEmail.toLowerCase());

  if (error) {
    return { ok: false, error: mapError(error, 'לא ניתן לעדכן סטטוס קריאה') };
  }

  return { ok: true, data: new Date(readAt).getTime() };
}

export async function insertMessage(input: {
  conversationId: string;
  senderEmail: string;
  senderName: string;
  text: string;
}): Promise<Result<Message>> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: input.conversationId,
      sender_email: input.senderEmail.toLowerCase(),
      sender_name: input.senderName,
      body: input.text.trim(),
    })
    .select('id, conversation_id, sender_email, sender_name, body, created_at')
    .single();

  if (error || !data) {
    return { ok: false, error: mapError(error, 'שליחת ההודעה נכשלה') };
  }

  return { ok: true, data: mapMessage(data) };
}

export { mapMessage };
