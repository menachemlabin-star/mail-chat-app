import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Conversation, ConversationType, Message, Session } from '../types';
import {
  createGroupConversation,
  createPrivateConversation,
  ensureProfile,
  findProfileByEmail,
  insertMessage,
  loadConversationsForUser,
  loadMessages,
  mapMessage,
} from '../lib/api';
import { supabase } from '../lib/supabase';

function describeAuthError(error: { message?: string }): string {
  const message = error.message ?? '';

  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'אין חיבור לשרת Supabase. בדקו שכתובת ה-URL ב-.env.local נכונה.';
  }
  if (/invalid login credentials/i.test(message)) {
    return 'מייל או סיסמה שגויים';
  }
  if (/email not confirmed/i.test(message)) {
    return 'המייל לא אומת. בדקו את תיבת הדואר שלכם.';
  }
  if (/already registered|already exists/i.test(message)) {
    return 'כתובת המייל כבר רשומה. עברו להתחברות.';
  }
  if (/invalid api key|api key/i.test(message)) {
    return 'מפתח ה-API לא תקין. בדקו את VITE_SUPABASE_ANON_KEY.';
  }

  return message || 'ההתחברות נכשלה';
}

export function useMailChat() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<ConversationType>('private');
  const [onlineEmails, setOnlineEmails] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const refreshData = useCallback(async (email: string) => {
    setDataLoading(true);
    setError(null);

    const convResult = await loadConversationsForUser(email);
    if (!convResult.ok) {
      setError(convResult.error);
      setDataLoading(false);
      return;
    }

    setConversations(convResult.data);
    const msgResult = await loadMessages(convResult.data.map((c) => c.id));
    if (!msgResult.ok) {
      setError(msgResult.error);
      setDataLoading(false);
      return;
    }

    setMessages(msgResult.data);
    setDataLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user?.email) {
        if (mounted) {
          setSession(null);
          setAuthLoading(false);
        }
        return;
      }

      const profile = await ensureProfile(
        user.id,
        user.email,
        typeof user.user_metadata?.display_name === 'string'
          ? user.user_metadata.display_name
          : undefined,
      );

      if (!mounted) return;
      setSession(profile);
      setAuthLoading(false);
      await refreshData(profile.email);
    };

    void bootstrap();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void (async () => {
        const user = nextSession?.user;
        if (!user?.email) {
          setSession(null);
          setConversations([]);
          setMessages([]);
          setActiveId(null);
          setAuthLoading(false);
          return;
        }

        const profile = await ensureProfile(
          user.id,
          user.email,
          typeof user.user_metadata?.display_name === 'string'
            ? user.user_metadata.display_name
            : undefined,
        );
        setSession(profile);
        setAuthLoading(false);
        await refreshData(profile.email);
      })();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [refreshData]);

  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel(`messages-feed:${session.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            sender_email: string;
            sender_name: string;
            body: string;
            created_at: string;
          };

          setConversations((prev) => {
            if (!prev.some((c) => c.id === row.conversation_id)) return prev;
            setMessages((msgs) => {
              if (msgs.some((m) => m.id === row.id)) return msgs;
              return [...msgs, mapMessage(row)];
            });
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      setOnlineEmails(new Set());
      return;
    }

    const channel = supabase.channel('mailchat-online', {
      config: { presence: { key: session.email } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ email?: string }>();
      const next = new Set<string>();
      Object.values(state).forEach((presences) => {
        presences.forEach((p) => {
          if (p.email) next.add(p.email.toLowerCase());
        });
      });
      setOnlineEmails(next);
    });

    void channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          email: session.email,
          displayName: session.displayName,
          online_at: new Date().toISOString(),
        });
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session]);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const normalized = email.trim().toLowerCase();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalized,
      password,
      options: {
        data: { display_name: displayName.trim() },
      },
    });

    if (signUpError) {
      return { ok: false as const, error: describeAuthError(signUpError) };
    }

    if (!data.session) {
      return {
        ok: false as const,
        error: 'נשלח מייל אימות. אשרו את החשבון ואז התחברו.',
      };
    }

    return { ok: true as const };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      return { ok: false as const, error: describeAuthError(signInError) };
    }

    return { ok: true as const };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setConversations([]);
    setMessages([]);
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
        return { ...c, lastMessage: convMessages[0] ?? null };
      })
      .sort(
        (a, b) =>
          (b.lastMessage?.timestamp ?? b.createdAt) - (a.lastMessage?.timestamp ?? a.createdAt),
      );
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
    async (peerEmail: string) => {
      if (!session) return { ok: false as const, error: 'לא מחובר' };
      const peer = peerEmail.trim().toLowerCase();
      if (!peer.includes('@')) return { ok: false as const, error: 'כתובת מייל לא תקינה' };
      if (peer === session.email) return { ok: false as const, error: 'לא ניתן לפתוח שיחה עם עצמך' };

      const known = await findProfileByEmail(peer);
      const result = await createPrivateConversation({
        userId: session.id,
        myEmail: session.email,
        peerEmail: peer,
        peerName: known?.display_name ?? peer.split('@')[0],
      });

      if (!result.ok) return result;

      setConversations((prev) => {
        if (prev.some((c) => c.id === result.data.id)) return prev;
        return [...prev, result.data];
      });
      setTab('private');
      setActiveId(result.data.id);
      return { ok: true as const };
    },
    [session],
  );

  const createGroup = useCallback(
    async (name: string, memberEmails: string[]) => {
      if (!session) return { ok: false as const, error: 'לא מחובר' };
      if (!name.trim()) return { ok: false as const, error: 'נא להזין שם קבוצה' };

      const result = await createGroupConversation({
        userId: session.id,
        myEmail: session.email,
        name,
        memberEmails,
      });

      if (!result.ok) return result;

      setConversations((prev) => [...prev, result.data]);
      setTab('group');
      setActiveId(result.data.id);
      return { ok: true as const };
    },
    [session],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!session || !activeId) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      const result = await insertMessage({
        conversationId: activeId,
        senderEmail: session.email,
        senderName: session.displayName,
        text: trimmed,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessages((prev) => {
        if (prev.some((m) => m.id === result.data.id)) return prev;
        return [...prev, result.data];
      });
    },
    [session, activeId],
  );

  const peerEmail = useMemo(() => {
    if (!session || !activeConversation || activeConversation.type !== 'private') return null;
    return activeConversation.members.find((m) => m !== session.email) ?? null;
  }, [session, activeConversation]);

  return {
    session,
    authLoading,
    dataLoading,
    error,
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
    logout,
    startPrivateChat,
    createGroup,
    sendMessage,
  };
}
