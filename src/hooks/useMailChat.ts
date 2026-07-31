import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Conversation, ConversationType, Message, Session } from '../types';
import {
  findUser,
  getConversations,
  getMessages,
  getSession,
  saveConversations,
  saveMessages,
  saveUser,
  seedDemoData,
  setSession,
  uid,
} from '../storage';

function privateKey(a: string, b: string) {
  return [a.toLowerCase(), b.toLowerCase()].sort().join('::');
}

export function useMailChat() {
  const [session, setSessionState] = useState<Session | null>(() => getSession());
  const [conversations, setConversations] = useState<Conversation[]>(() => getConversations());
  const [messages, setMessages] = useState<Message[]>(() => getMessages());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<ConversationType>('private');
  const [onlineEmails, setOnlineEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!session) return;
    const seeded = seedDemoData(session.email, session.displayName);
    setConversations(seeded.conversations);
    setMessages(seeded.messages);
  }, [session?.email]);

  useEffect(() => {
    const tick = () => {
      const pool = [
        'dana@studio.co.il',
        'yonatan@mailchat.app',
        'maya@design.io',
        ...(session ? [session.email] : []),
      ];
      const next = new Set<string>();
      pool.forEach((email) => {
        if (email === session?.email || Math.random() > 0.35) next.add(email);
      });
      setOnlineEmails(next);
    };
    tick();
    const id = window.setInterval(tick, 8000);
    return () => window.clearInterval(id);
  }, [session?.email]);

  const register = useCallback(
    (email: string, password: string, displayName: string) => {
      const normalized = email.trim().toLowerCase();
      if (findUser(normalized)) {
        return { ok: false as const, error: 'כתובת המייל כבר רשומה במערכת' };
      }
      saveUser({ email: normalized, password, displayName: displayName.trim() });
      const next: Session = { email: normalized, displayName: displayName.trim() };
      setSession(next);
      setSessionState(next);
      return { ok: true as const };
    },
    [],
  );

  const login = useCallback((email: string, password: string) => {
    const normalized = email.trim().toLowerCase();
    const user = findUser(normalized);
    if (!user || user.password !== password) {
      return { ok: false as const, error: 'מייל או סיסמה שגויים' };
    }
    const next: Session = { email: user.email, displayName: user.displayName };
    setSession(next);
    setSessionState(next);
    return { ok: true as const };
  }, []);

  const magicLink = useCallback((email: string, displayName: string) => {
    const normalized = email.trim().toLowerCase();
    const existing = findUser(normalized);
    const name = displayName.trim() || existing?.displayName || normalized.split('@')[0];
    if (!existing) {
      saveUser({ email: normalized, password: uid('magic'), displayName: name });
    }
    const next: Session = { email: normalized, displayName: name };
    setSession(next);
    setSessionState(next);
    return { ok: true as const };
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    setSessionState(null);
    setActiveId(null);
  }, []);

  const filteredConversations = useMemo(() => {
    if (!session) return [];
    return conversations
      .filter((c) => c.type === tab && c.members.includes(session.email))
      .map((c) => {
        const convMessages = messages
          .filter((m) => m.conversationId === c.id)
          .sort((a, b) => b.timestamp - a.timestamp);
        const last = convMessages[0];
        return { ...c, lastMessage: last ?? null };
      })
      .sort((a, b) => (b.lastMessage?.timestamp ?? b.createdAt) - (a.lastMessage?.timestamp ?? a.createdAt));
  }, [conversations, messages, session, tab]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const activeMessages = useMemo(
    () =>
      messages
        .filter((m) => m.conversationId === activeId)
        .sort((a, b) => a.timestamp - b.timestamp),
    [messages, activeId],
  );

  const startPrivateChat = useCallback(
    (peerEmail: string) => {
      if (!session) return { ok: false as const, error: 'לא מחובר' };
      const peer = peerEmail.trim().toLowerCase();
      if (!peer.includes('@')) return { ok: false as const, error: 'כתובת מייל לא תקינה' };
      if (peer === session.email) return { ok: false as const, error: 'לא ניתן לפתוח שיחה עם עצמך' };

      const existing = conversations.find(
        (c) =>
          c.type === 'private' &&
          c.members.length === 2 &&
          privateKey(c.members[0], c.members[1]) === privateKey(session.email, peer),
      );

      if (existing) {
        setTab('private');
        setActiveId(existing.id);
        return { ok: true as const };
      }

      const known = findUser(peer);
      const conv: Conversation = {
        id: uid('conv'),
        type: 'private',
        name: known?.displayName ?? peer.split('@')[0],
        members: [session.email, peer],
        createdAt: Date.now(),
      };
      const next = [...conversations, conv];
      setConversations(next);
      saveConversations(next);
      setTab('private');
      setActiveId(conv.id);
      return { ok: true as const };
    },
    [conversations, session],
  );

  const createGroup = useCallback(
    (name: string, memberEmails: string[]) => {
      if (!session) return { ok: false as const, error: 'לא מחובר' };
      const cleaned = memberEmails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@') && e !== session.email);
      if (!name.trim()) return { ok: false as const, error: 'נא להזין שם קבוצה' };

      const conv: Conversation = {
        id: uid('conv'),
        type: 'group',
        name: name.trim(),
        members: [session.email, ...Array.from(new Set(cleaned))],
        createdAt: Date.now(),
      };
      const next = [...conversations, conv];
      setConversations(next);
      saveConversations(next);
      setTab('group');
      setActiveId(conv.id);
      return { ok: true as const };
    },
    [conversations, session],
  );

  const sendMessage = useCallback(
    (text: string) => {
      if (!session || !activeId) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      const msg: Message = {
        id: uid('msg'),
        conversationId: activeId,
        senderEmail: session.email,
        senderName: session.displayName,
        text: trimmed,
        timestamp: Date.now(),
      };
      const next = [...messages, msg];
      setMessages(next);
      saveMessages(next);
    },
    [session, activeId, messages],
  );

  const peerEmail = useMemo(() => {
    if (!session || !activeConversation || activeConversation.type !== 'private') return null;
    return activeConversation.members.find((m) => m !== session.email) ?? null;
  }, [session, activeConversation]);

  return {
    session,
    tab,
    setTab,
    activeId,
    setActiveId,
    filteredConversations,
    activeConversation,
    activeMessages,
    onlineEmails,
    peerEmail,
    register,
    login,
    magicLink,
    logout,
    startPrivateChat,
    createGroup,
    sendMessage,
  };
}
