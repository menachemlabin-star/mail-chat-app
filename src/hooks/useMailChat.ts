import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Announcement, Conversation, ConversationType, Message, Session } from '../types';
import {
  createAnnouncement,
  createGroupConversation,
  createPrivateConversation,
  ensureProfile,
  findProfileByEmail,
  insertMessage,
  loadAnnouncements,
  loadConversationsForUser,
  loadMessages,
  markConversationRead,
  deleteConversationForMe,
  uploadChatImage,
  mapAnnouncement,
  mapMessage,
} from '../lib/api';
import { supabase, supabaseUrl } from '../lib/supabase';

function describeAuthError(error: { message?: string }): string {
  const message = error.message ?? '';

  if (/failed to fetch|network|load failed/i.test(message)) {
    return `אין חיבור לשרת. הדפדפן מנסה לפנות אל: ${supabaseUrl}`;
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
  if (/signups? (are )?disabled|signup is disabled/i.test(message)) {
    return 'הרשמה חסומה בהגדרות Supabase. הפעילו Allow new users to sign up.';
  }
  if (/password should be at least/i.test(message)) {
    return 'הסיסמה קצרה מדי. נדרשים לפחות 6 תווים.';
  }
  if (/invalid api key|api key/i.test(message)) {
    return 'מפתח ה-API לא תקין. בדקו את VITE_SUPABASE_ANON_KEY.';
  }
  if (/rate limit|too many requests|over_email_send_rate/i.test(message)) {
    return 'נשלחו יותר מדי מיילים בזמן קצר. המתינו כשעה ונסו שוב, או הגדירו SMTP משלכם ב-Supabase.';
  }
  if (/for security purposes|after \d+ seconds/i.test(message)) {
    return 'נא להמתין מספר שניות לפני ניסיון נוסף.';
  }
  if (/row-level security|violates row-level/i.test(message)) {
    return 'הרשאות מסד הנתונים חוסמות את הפעולה. הריצו מחדש את קובץ ה-SQL (schema.sql) ב-Supabase.';
  }

  return message || 'ההתחברות נכשלה';
}

export function useMailChat() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<ConversationType>('private');
  const [onlineEmails, setOnlineEmails] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const refreshData = useCallback(async (email: string) => {
    setDataLoading(true);
    setError(null);

    const [convResult, announcementsResult] = await Promise.all([
      loadConversationsForUser(email),
      loadAnnouncements(),
    ]);

    if (!convResult.ok) {
      setError(convResult.error);
      setDataLoading(false);
      return null;
    }

    setConversations(convResult.data);

    if (announcementsResult.ok) {
      setAnnouncements(announcementsResult.data);
    } else {
      setAnnouncements([]);
    }

    const msgResult = await loadMessages(convResult.data.map((c) => c.id));
    if (!msgResult.ok) {
      setError(msgResult.error);
      setDataLoading(false);
      return null;
    }

    setMessages(msgResult.data);
    setDataLoading(false);
    return convResult.data;
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

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      void (async () => {
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecovery(true);
        }

        const user = nextSession?.user;
        if (!user?.email) {
          setSession(null);
          setPasswordRecovery(false);
          setConversations([]);
          setMessages([]);
          setAnnouncements([]);
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

        if (event !== 'PASSWORD_RECOVERY') {
          await refreshData(profile.email);
        }
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
            image_url?: string | null;
            created_at: string;
          };

          setConversations((prev) => {
            if (!prev.some((c) => c.id === row.conversation_id)) {
              void refreshData(session.email);
              return prev;
            }
            setMessages((msgs) => {
              if (msgs.some((m) => m.id === row.id)) return msgs;
              return [...msgs, mapMessage(row)];
            });
            return prev;
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_members',
          filter: `member_email=eq.${session.email}`,
        },
        (payload) => {
          const row = payload.new as { conversation_id: string };
          void (async () => {
            const loaded = await refreshData(session.email);
            const incoming = loaded?.find(
              (conversation) => conversation.id === row.conversation_id,
            );
            if (!incoming) return;

            setActiveId((current) => {
              if (current) return current;
              setTab(incoming.type);
              return incoming.id;
            });
          })();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements' },
        (payload) => {
          const row = payload.new as {
            id: string;
            author_id: string | null;
            author_email: string;
            author_name: string;
            body: string;
            created_at: string;
          };
          setAnnouncements((prev) => {
            if (prev.some((item) => item.id === row.id)) return prev;
            return [mapAnnouncement(row), ...prev];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session, refreshData]);

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

  const resetPassword = useCallback(async (email: string) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@')) {
      return { ok: false as const, error: 'נא להזין כתובת מייל תקינה' };
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo: window.location.origin,
    });

    if (resetError) {
      return { ok: false as const, error: describeAuthError(resetError) };
    }

    return { ok: true as const };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (password.length < 6) {
      return { ok: false as const, error: 'הסיסמה חייבת להכיל לפחות 6 תווים' };
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      return { ok: false as const, error: describeAuthError(updateError) };
    }

    setPasswordRecovery(false);
    if (session) {
      await refreshData(session.email);
    }
    return { ok: true as const };
  }, [session, refreshData]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setPasswordRecovery(false);
    setConversations([]);
    setMessages([]);
    setAnnouncements([]);
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
        const unreadCount = convMessages.filter(
          (message) =>
            message.senderEmail !== session.email && message.timestamp > c.lastReadAt,
        ).length;
        return { ...c, lastMessage: convMessages[0] ?? null, unreadCount };
      })
      .sort(
        (a, b) =>
          (b.lastMessage?.timestamp ?? b.createdAt) - (a.lastMessage?.timestamp ?? a.createdAt),
      );
  }, [conversations, messages, session, tab]);

  const allConversations = useMemo(() => {
    if (!session) return [];
    return conversations
      .filter((c) => c.members.includes(session.email))
      .map((c) => {
        const convMessages = messages
          .filter((m) => m.conversationId === c.id)
          .sort((a, b) => b.timestamp - a.timestamp);
        const unreadCount = convMessages.filter(
          (message) =>
            message.senderEmail !== session.email && message.timestamp > c.lastReadAt,
        ).length;
        return { ...c, lastMessage: convMessages[0] ?? null, unreadCount };
      })
      .sort(
        (a, b) =>
          (b.lastMessage?.timestamp ?? b.createdAt) - (a.lastMessage?.timestamp ?? a.createdAt),
      );
  }, [conversations, messages, session]);

  const updates = useMemo(
    () => allConversations.filter((c) => c.unreadCount > 0),
    [allConversations],
  );

  const unreadTotal = useMemo(
    () => updates.reduce((sum, c) => sum + c.unreadCount, 0),
    [updates],
  );

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

  useEffect(() => {
    if (!session || !activeConversation) return;

    const newestIncoming = activeMessages
      .filter((message) => message.senderEmail !== session.email)
      .at(-1);

    if (!newestIncoming || newestIncoming.timestamp <= activeConversation.lastReadAt) return;

    void (async () => {
      const result = await markConversationRead(activeConversation.id, session.email);
      if (!result.ok) return;

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeConversation.id
            ? { ...conversation, lastReadAt: result.data }
            : conversation,
        ),
      );
    })();
  }, [activeConversation, activeMessages, session]);

  const startPrivateChat = useCallback(
    async (peerEmail: string) => {
      if (!session) return { ok: false as const, error: 'לא מחובר' };
      const peer = peerEmail.trim().toLowerCase();
      if (!peer.includes('@')) return { ok: false as const, error: 'כתובת מייל לא תקינה' };
      if (peer === session.email) return { ok: false as const, error: 'לא ניתן לפתוח שיחה עם עצמך' };

      const known = await findProfileByEmail(peer);
      if (!known) {
        return { ok: false as const, error: 'ניתן לפתוח שיחה רק עם משתמשים רשומים באתר' };
      }

      const result = await createPrivateConversation({
        userId: session.id,
        myEmail: session.email,
        peerEmail: peer,
        peerName: known.display_name,
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
      if (memberEmails.length === 0) {
        return { ok: false as const, error: 'נא לבחור לפחות חבר אחד מהרשימה' };
      }

      for (const memberEmail of memberEmails) {
        const known = await findProfileByEmail(memberEmail);
        if (!known) {
          return {
            ok: false as const,
            error: 'ניתן להוסיף לקבוצה רק משתמשים רשומים באתר',
          };
        }
      }

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
    async (text: string, imageFile?: File | null) => {
      if (!session || !activeId) return { ok: false as const, error: 'לא מחובר' };
      const trimmed = text.trim();
      if (!trimmed && !imageFile) {
        return { ok: false as const, error: 'נא לכתוב הודעה או לבחור תמונה' };
      }

      let imageUrl: string | null = null;
      if (imageFile) {
        const uploaded = await uploadChatImage({
          userId: session.id,
          conversationId: activeId,
          file: imageFile,
        });
        if (!uploaded.ok) {
          setError(uploaded.error);
          return uploaded;
        }
        imageUrl = uploaded.data;
      }

      const result = await insertMessage({
        conversationId: activeId,
        senderEmail: session.email,
        senderName: session.displayName,
        text: trimmed,
        imageUrl,
      });

      if (!result.ok) {
        setError(result.error);
        return result;
      }

      setMessages((prev) => {
        if (prev.some((m) => m.id === result.data.id)) return prev;
        return [...prev, result.data];
      });
      return { ok: true as const };
    },
    [session, activeId],
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!session) return { ok: false as const, error: 'לא מחובר' };

      const result = await deleteConversationForMe(conversationId, session.email);
      if (!result.ok) return result;

      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      setMessages((prev) => prev.filter((m) => m.conversationId !== conversationId));
      setActiveId((current) => (current === conversationId ? null : current));
      return { ok: true as const };
    },
    [session],
  );

  const postAnnouncement = useCallback(
    async (body: string) => {
      if (!session) return { ok: false as const, error: 'לא מחובר' };

      const result = await createAnnouncement({
        userId: session.id,
        email: session.email,
        displayName: session.displayName,
        body,
      });

      if (!result.ok) return result;

      setAnnouncements((prev) => {
        if (prev.some((item) => item.id === result.data.id)) return prev;
        return [result.data, ...prev];
      });
      return { ok: true as const };
    },
    [session],
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
    passwordRecovery,
    tab,
    setTab,
    activeId,
    setActiveId,
    filteredConversations,
    announcements,
    unreadTotal,
    activeConversation,
    activeMessages,
    onlineEmails,
    peerEmail,
    register,
    login,
    resetPassword,
    updatePassword,
    logout,
    startPrivateChat,
    createGroup,
    sendMessage,
    deleteConversation,
    postAnnouncement,
  };
}
