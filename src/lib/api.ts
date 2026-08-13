import { supabase } from './supabase';
import type { Announcement, BulletinPost, Conversation, ConversationType, Message, Session } from '../types';
import { isBulletinAdmin } from './constants';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function isMissingReadColumn(error: { message?: string } | null) {
  return /last_read_at/i.test(error?.message ?? '');
}

function isMissingRpc(error: { message?: string } | null) {
  const message = error?.message ?? '';
  return (
    /get_or_create_private_conversation/i.test(message) ||
    /delete_conversation_for_me/i.test(message) ||
    /function.*does not exist/i.test(message) ||
    /could not find the function/i.test(message)
  );
}

function isMissingAnnouncementsTable(error: { message?: string } | null) {
  return /public\.announcements|'announcements'/i.test(error?.message ?? '');
}

function isMissingBulletinTable(error: { message?: string } | null) {
  return /public\.bulletin_posts|'bulletin_posts'/i.test(error?.message ?? '');
}

function mapError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? '';
  if (isMissingAnnouncementsTable(error)) {
    return 'טבלת העידכונים לא קיימת ב-Supabase. הריצו את הקובץ supabase/announcements.sql ב-SQL Editor ואז רעננו את הדף.';
  }
  if (isMissingBulletinTable(error)) {
    return 'טבלת לוח המודעות לא קיימת ב-Supabase. הריצו את הקובץ supabase/bulletin-board.sql ב-SQL Editor ואז רעננו את הדף.';
  }
  if (/row-level security|violates row-level/i.test(message)) {
    return 'הרשאות מסד הנתונים חוסמות את הפעולה. הריצו מחדש את schema.sql ב-Supabase → SQL Editor.';
  }
  return message || fallback;
}

function isMissingImageColumn(error: { message?: string } | null) {
  return /image_url/i.test(error?.message ?? '');
}

function mapMessage(row: {
  id: string;
  conversation_id: string;
  sender_email: string;
  sender_name: string;
  body: string;
  image_url?: string | null;
  created_at: string;
}): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderEmail: row.sender_email,
    senderName: row.sender_name,
    text: row.body ?? '',
    imageUrl: row.image_url ?? null,
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

  let memberships: { conversation_id: string; last_read_at?: string }[] | null = null;

  const withReadState = await supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at')
    .eq('member_email', normalized);

  if (withReadState.error) {
    if (!isMissingReadColumn(withReadState.error)) {
      return { ok: false, error: mapError(withReadState.error, 'שגיאה בטעינת שיחות') };
    }

    const legacy = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('member_email', normalized);

    if (legacy.error) {
      return { ok: false, error: mapError(legacy.error, 'שגיאה בטעינת שיחות') };
    }

    memberships = legacy.data;
  } else {
    memberships = withReadState.data;
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
      membership.last_read_at ? new Date(membership.last_read_at).getTime() : 0,
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

  const withImages = await supabase
    .from('messages')
    .select('id, conversation_id, sender_email, sender_name, body, image_url, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true });

  if (withImages.error) {
    if (!isMissingImageColumn(withImages.error)) {
      return { ok: false, error: mapError(withImages.error, 'שגיאה בטעינת הודעות') };
    }

    const legacy = await supabase
      .from('messages')
      .select('id, conversation_id, sender_email, sender_name, body, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true });

    if (legacy.error) {
      return { ok: false, error: mapError(legacy.error, 'שגיאה בטעינת הודעות') };
    }

    return { ok: true, data: (legacy.data ?? []).map(mapMessage) };
  }

  return { ok: true, data: (withImages.data ?? []).map(mapMessage) };
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
    if (isMissingRpc(error)) {
      return createPrivateConversationFallback({
        userId: input.userId,
        myEmail,
        peerEmail,
        peerName: input.peerName,
      });
    }
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

async function createPrivateConversationFallback(input: {
  userId: string;
  myEmail: string;
  peerEmail: string;
  peerName: string;
}): Promise<Result<Conversation>> {
  const existing = await loadConversationsForUser(input.myEmail);
  if (!existing.ok) return existing;

  const found = existing.data.find(
    (c) =>
      c.type === 'private' &&
      c.members.length === 2 &&
      c.members.includes(input.myEmail) &&
      c.members.includes(input.peerEmail),
  );
  if (found) return { ok: true, data: found };

  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({
      type: 'private',
      name: input.peerName,
      created_by: input.userId,
    })
    .select('id, type, name, created_at')
    .single();

  if (convError || !conv) {
    return { ok: false, error: mapError(convError, 'לא ניתן ליצור שיחה') };
  }

  const { error: membersError } = await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, member_email: input.myEmail },
    { conversation_id: conv.id, member_email: input.peerEmail },
  ]);

  if (membersError) {
    await supabase.from('conversations').delete().eq('id', conv.id);
    return { ok: false, error: mapError(membersError, 'לא ניתן להוסיף משתתפים') };
  }

  return {
    ok: true,
    data: {
      id: conv.id,
      type: 'private',
      name: input.peerName,
      members: [input.myEmail, input.peerEmail],
      createdAt: new Date(conv.created_at).getTime(),
      lastReadAt: 0,
    },
  };
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
    if (isMissingReadColumn(error)) {
      return { ok: true, data: new Date(readAt).getTime() };
    }
    return { ok: false, error: mapError(error, 'לא ניתן לעדכן סטטוס קריאה') };
  }

  return { ok: true, data: new Date(readAt).getTime() };
}

export async function deleteConversationForMe(
  conversationId: string,
  memberEmail: string,
): Promise<Result<true>> {
  const { error: rpcError } = await supabase.rpc('delete_conversation_for_me', {
    conv_id: conversationId,
  });

  if (!rpcError) {
    return { ok: true, data: true };
  }

  if (!isMissingRpc(rpcError) && !/delete_conversation_for_me/i.test(rpcError.message ?? '')) {
    return { ok: false, error: mapError(rpcError, 'לא ניתן למחוק את השיחה') };
  }

  // Fallback before SQL migration: remove my membership, then try delete if I created it.
  const { error: leaveError } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('member_email', memberEmail.toLowerCase());

  if (leaveError) {
    const { error: deleteError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (deleteError) {
      return {
        ok: false,
        error: mapError(
          leaveError,
          'לא ניתן למחוק את השיחה. הריצו את עדכון ה-SQL ב-Supabase.',
        ),
      };
    }
  }

  return { ok: true, data: true };
}

export async function uploadChatImage(input: {
  userId: string;
  conversationId: string;
  file: File;
}): Promise<Result<string>> {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowed.includes(input.file.type)) {
    return { ok: false, error: 'ניתן לשלוח רק תמונות (JPG, PNG, GIF, WEBP)' };
  }
  if (input.file.size > 5 * 1024 * 1024) {
    return { ok: false, error: 'התמונה גדולה מדי. הגודל המרבי הוא 5MB' };
  }

  const ext = input.file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${input.userId}/${input.conversationId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('chat-images')
    .upload(path, input.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: input.file.type,
    });

  if (uploadError) {
    return {
      ok: false,
      error: mapError(
        uploadError,
        'העלאת התמונה נכשלה. ודאו שהרצתם את chat-images.sql ב-Supabase.',
      ),
    };
  }

  // Prefer a long-lived signed URL so images work even if the bucket is private.
  const signed = await supabase.storage.from('chat-images').createSignedUrl(path, 60 * 60 * 24 * 365);
  if (!signed.error && signed.data?.signedUrl) {
    return { ok: true, data: signed.data.signedUrl };
  }

  const { data } = supabase.storage.from('chat-images').getPublicUrl(path);
  return { ok: true, data: data.publicUrl };
}

export async function resolveChatImageUrl(imageUrlOrPath: string): Promise<string> {
  const value = imageUrlOrPath.trim();
  if (!value) return value;

  let path = value;
  const marker = '/storage/v1/object/public/chat-images/';
  const signedMarker = '/storage/v1/object/sign/chat-images/';

  if (value.includes(marker)) {
    path = decodeURIComponent(value.split(marker)[1]?.split('?')[0] ?? value);
  } else if (value.includes(signedMarker)) {
    path = decodeURIComponent(value.split(signedMarker)[1]?.split('?')[0] ?? value);
  } else if (value.startsWith('http')) {
    return value;
  }

  const signed = await supabase.storage.from('chat-images').createSignedUrl(path, 60 * 60 * 24 * 7);
  if (!signed.error && signed.data?.signedUrl) {
    return signed.data.signedUrl;
  }

  return supabase.storage.from('chat-images').getPublicUrl(path).data.publicUrl;
}

export async function insertMessage(input: {
  conversationId: string;
  senderEmail: string;
  senderName: string;
  text: string;
  imageUrl?: string | null;
}): Promise<Result<Message>> {
  const body = input.text.trim();
  const imageUrl = input.imageUrl?.trim() || null;

  if (!body && !imageUrl) {
    return { ok: false, error: 'נא לכתוב הודעה או לבחור תמונה' };
  }

  const payload = {
    conversation_id: input.conversationId,
    sender_email: input.senderEmail.toLowerCase(),
    sender_name: input.senderName,
    body,
    image_url: imageUrl,
  };

  const withImage = await supabase
    .from('messages')
    .insert(payload)
    .select('id, conversation_id, sender_email, sender_name, body, image_url, created_at')
    .single();

  if (withImage.error) {
    if (!isMissingImageColumn(withImage.error)) {
      return { ok: false, error: mapError(withImage.error, 'שליחת ההודעה נכשלה') };
    }

    if (imageUrl) {
      return {
        ok: false,
        error: 'שליחת תמונות דורשת הרצת chat-images.sql ב-Supabase.',
      };
    }

    const legacy = await supabase
      .from('messages')
      .insert({
        conversation_id: input.conversationId,
        sender_email: input.senderEmail.toLowerCase(),
        sender_name: input.senderName,
        body,
      })
      .select('id, conversation_id, sender_email, sender_name, body, created_at')
      .single();

    if (legacy.error || !legacy.data) {
      return { ok: false, error: mapError(legacy.error, 'שליחת ההודעה נכשלה') };
    }

    return { ok: true, data: mapMessage(legacy.data) };
  }

  if (!withImage.data) {
    return { ok: false, error: 'שליחת ההודעה נכשלה' };
  }

  return { ok: true, data: mapMessage(withImage.data) };
}

function mapAnnouncement(row: {
  id: string;
  author_id: string | null;
  author_email: string;
  author_name: string;
  body: string;
  created_at: string;
}): Announcement {
  return {
    id: row.id,
    authorId: row.author_id,
    authorEmail: row.author_email,
    authorName: row.author_name,
    body: row.body,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function loadAnnouncements(): Promise<Result<Announcement[]>> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, author_id, author_email, author_name, body, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return { ok: false, error: mapError(error, 'טעינת העידכונים נכשלה') };
  }

  return { ok: true, data: (data ?? []).map(mapAnnouncement) };
}

export async function createAnnouncement(input: {
  userId: string;
  email: string;
  displayName: string;
  body: string;
}): Promise<Result<Announcement>> {
  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: 'נא לכתוב תוכן לעידכון' };
  }

  const { data, error } = await supabase
    .from('announcements')
    .insert({
      author_id: input.userId,
      author_email: input.email.toLowerCase(),
      author_name: input.displayName,
      body,
    })
    .select('id, author_id, author_email, author_name, body, created_at')
    .single();

  if (error || !data) {
    return { ok: false, error: mapError(error, 'פרסום העידכון נכשל') };
  }

  return { ok: true, data: mapAnnouncement(data) };
}

function mapBulletinPost(row: {
  id: string;
  author_id: string | null;
  author_email: string;
  author_name: string;
  body: string;
  created_at: string;
}): BulletinPost {
  return mapAnnouncement(row);
}

export async function loadBulletinPosts(): Promise<Result<BulletinPost[]>> {
  const { data, error } = await supabase
    .from('bulletin_posts')
    .select('id, author_id, author_email, author_name, body, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return { ok: false, error: mapError(error, 'טעינת לוח המודעות נכשלה') };
  }

  return { ok: true, data: (data ?? []).map(mapBulletinPost) };
}

export async function createBulletinPost(input: {
  userId: string;
  email: string;
  displayName: string;
  body: string;
}): Promise<Result<BulletinPost>> {
  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: 'נא לכתוב תוכן למודעה' };
  }

  if (!isBulletinAdmin(input.email)) {
    return { ok: false, error: 'רק מנהל לוח המודעות יכול לפרסם כאן' };
  }

  const { data, error } = await supabase
    .from('bulletin_posts')
    .insert({
      author_id: input.userId,
      author_email: input.email.toLowerCase(),
      author_name: input.displayName,
      body,
    })
    .select('id, author_id, author_email, author_name, body, created_at')
    .single();

  if (error || !data) {
    return { ok: false, error: mapError(error, 'פרסום המודעה נכשל') };
  }

  return { ok: true, data: mapBulletinPost(data) };
}

export { mapMessage, mapAnnouncement, mapBulletinPost };
