import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  ImagePlus,
  LogOut,
  Mail,
  Menu,
  MessageSquarePlus,
  Plus,
  Send,
  Trash2,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import type { ActionResult, Conversation, ConversationType, Message, Session } from '../types';
import { ChatImage } from './ChatImage';
import { NewChatModal, NewGroupModal } from './Modals';

interface ConversationRow extends Conversation {
  lastMessage: Message | null;
  unreadCount: number;
}

type MobilePane = 'updates' | 'chats' | 'chat';

interface DashboardProps {
  session: Session;
  tab: ConversationType;
  setTab: (tab: ConversationType) => void;
  conversations: ConversationRow[];
  updates: ConversationRow[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  activeConversation: Conversation | null;
  activeMessages: Message[];
  onlineEmails: Set<string>;
  peerEmail: string | null;
  dataLoading?: boolean;
  error?: string | null;
  onLogout: () => void | Promise<void>;
  onStartPrivate: (email: string) => Promise<ActionResult>;
  onCreateGroup: (name: string, emails: string[]) => Promise<ActionResult>;
  onSend: (text: string, imageFile?: File | null) => Promise<ActionResult | void>;
  onDeleteConversation: (conversationId: string) => Promise<ActionResult>;
}

function messagePreview(message: Message | null) {
  if (!message) return 'עדיין אין הודעות';
  if (message.imageUrl && !message.text) return 'תמונה';
  if (message.imageUrl) return message.text;
  return message.text;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export function Dashboard({
  session,
  tab,
  setTab,
  conversations,
  updates,
  activeId,
  setActiveId,
  activeConversation,
  activeMessages,
  onlineEmails,
  peerEmail,
  dataLoading,
  error,
  onLogout,
  onStartPrivate,
  onCreateGroup,
  onSend,
  onDeleteConversation,
}: DashboardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePane>('chats');
  const [modal, setModal] = useState<'private' | 'group' | null>(null);
  const [draft, setDraft] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    conversationId: string;
    x: number;
    y: number;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeId]);

  useEffect(() => {
    setDraft('');
    setImageFile(null);
    setImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [activeId]);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.action-menu-wrap')) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown);
      document.addEventListener('touchstart', onPointerDown);
    }, 0);
    window.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  useEffect(() => {
    if (activeId) setMobilePane('chat');
  }, [activeId]);

  const clearImage = () => {
    setImageFile(null);
    setImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const pickImage = (file: File | null) => {
    if (!file) {
      clearImage();
      return;
    }
    setImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setImageFile(file);
  };

  const send = async () => {
    if ((!draft.trim() && !imageFile) || sending) return;
    setSending(true);
    const result = await onSend(draft, imageFile);
    setSending(false);
    if (result && !result.ok) return;
    setDraft('');
    clearImage();
  };

  const deleteFromMenu = async () => {
    if (!contextMenu || deleting) return;
    const confirmed = window.confirm('למחוק את השיחה מהרשימה?');
    if (!confirmed) {
      setContextMenu(null);
      return;
    }

    setDeleting(true);
    const result = await onDeleteConversation(contextMenu.conversationId);
    setDeleting(false);
    setContextMenu(null);
    if (!result.ok) {
      window.alert(result.error);
    }
  };

  const openConversation = (id: string, type?: ConversationType) => {
    if (type) setTab(type);
    setActiveId(id);
    setMobilePane('chat');
    setNavOpen(false);
  };

  const peerOnline = peerEmail ? onlineEmails.has(peerEmail) : false;
  const unreadTotal = updates.reduce((sum, c) => sum + c.unreadCount, 0);

  const renderUpdatesList = () => (
    <ul className="conversation-list updates-list">
      {updates.length === 0 ? (
        <li className="empty-list">
          <Bell size={28} />
          <p>אין עידכונים חדשים</p>
        </li>
      ) : (
        updates.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={`conversation-item ${activeId === c.id ? 'active' : ''}`}
              onClick={() => openConversation(c.id, c.type)}
            >
              {c.lastMessage?.imageUrl ? (
                <div className="conversation-thumb">
                  <ChatImage src={c.lastMessage.imageUrl} className="conversation-thumb-img" />
                </div>
              ) : (
                <div className="avatar sm" aria-hidden>
                  {initials(c.name)}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div className="title">{c.name}</div>
                <div className="preview">{messagePreview(c.lastMessage)}</div>
              </div>
              <div className="conversation-meta">
                <span className="time">
                  {c.lastMessage ? formatTime(c.lastMessage.timestamp) : ''}
                </span>
                {c.unreadCount > 0 && (
                  <span className="unread-badge" aria-label={`${c.unreadCount} הודעות שלא נקראו`}>
                    {c.unreadCount > 99 ? '99+' : c.unreadCount}
                  </span>
                )}
              </div>
            </button>
          </li>
        ))
      )}
    </ul>
  );

  return (
    <div
      className={`dashboard mobile-pane-${mobilePane}${activeConversation ? ' has-active-chat' : ''}`}
    >
      <header className="mobile-topbar">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setNavOpen(true)}
          aria-label="תפריט"
          title="תפריט"
        >
          <Menu size={20} />
          {unreadTotal > 0 && <span className="mobile-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}
        </button>
        <strong className="mobile-brand">צ׳אט כנסת הגדולה</strong>
        <div className="action-menu-wrap mobile-plus-wrap">
          <button
            type="button"
            className="icon-btn primary"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="פעולה מהירה"
            aria-expanded={menuOpen}
          >
            <Plus size={20} />
          </button>
          {menuOpen && (
            <div className="action-menu">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setModal('private');
                }}
              >
                <MessageSquarePlus size={16} />
                פתח שיחה חדשה
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setModal('group');
                }}
              >
                <UsersRound size={16} />
                צור קבוצה חדשה
              </button>
            </div>
          )}
        </div>
      </header>

      {navOpen && (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="סגירת תפריט"
          onClick={() => setNavOpen(false)}
        />
      )}

      <nav className={`mobile-drawer${navOpen ? ' open' : ''}`} aria-label="תפריט ניווט">
        <div className="mobile-drawer-header">
          <div className="avatar" aria-hidden>
            {initials(session.displayName)}
          </div>
          <div className="profile-meta">
            <strong>{session.displayName}</strong>
            <span title={session.email}>{session.email}</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setNavOpen(false)}
            aria-label="סגירה"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mobile-drawer-nav">
          <button
            type="button"
            className={mobilePane === 'updates' ? 'active' : ''}
            onClick={() => {
              setMobilePane('updates');
              setNavOpen(false);
            }}
          >
            <Bell size={18} />
            עידכונים
            {unreadTotal > 0 && (
              <span className="unread-badge drawer-badge">
                {unreadTotal > 99 ? '99+' : unreadTotal}
              </span>
            )}
          </button>
          <button
            type="button"
            className={mobilePane === 'chats' && tab === 'private' ? 'active' : ''}
            onClick={() => {
              setTab('private');
              setMobilePane('chats');
              setNavOpen(false);
            }}
          >
            <Mail size={18} />
            שיחות פרטיות
          </button>
          <button
            type="button"
            className={mobilePane === 'chats' && tab === 'group' ? 'active' : ''}
            onClick={() => {
              setTab('group');
              setMobilePane('chats');
              setNavOpen(false);
            }}
          >
            <Users size={18} />
            קבוצות
          </button>
          <button
            type="button"
            onClick={() => {
              setNavOpen(false);
              setModal('private');
            }}
          >
            <MessageSquarePlus size={18} />
            שיחה חדשה
          </button>
          <button
            type="button"
            onClick={() => {
              setNavOpen(false);
              setModal('group');
            }}
          >
            <UsersRound size={18} />
            קבוצה חדשה
          </button>
        </div>

        <button type="button" className="mobile-drawer-logout" onClick={() => void onLogout()}>
          <LogOut size={18} />
          התנתקות
        </button>
      </nav>

      <aside className="sidebar sidebar-relative panel-card">
        <div className="profile desktop-only">
          <div className="avatar" aria-hidden>
            {initials(session.displayName)}
          </div>
          <div className="profile-meta">
            <strong>{session.displayName}</strong>
            <span title={session.email}>{session.email}</span>
          </div>
          <button className="icon-btn" onClick={onLogout} title="התנתקות" aria-label="התנתקות">
            <LogOut size={18} />
          </button>
        </div>

        <div className="mobile-section-title">
          <h2>{tab === 'private' ? 'שיחות פרטיות' : 'קבוצות'}</h2>
        </div>

        <div className="sidebar-toolbar desktop-only">
          <div className="tabs" role="tablist">
            <button
              type="button"
              className={tab === 'private' ? 'active' : ''}
              onClick={() => setTab('private')}
            >
              שיחות פרטיות
            </button>
            <button
              type="button"
              className={tab === 'group' ? 'active' : ''}
              onClick={() => setTab('group')}
            >
              קבוצות
            </button>
          </div>
          <div className="action-menu-wrap">
            <button
              className="icon-btn primary"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="פעולה מהירה"
              title="פעולה מהירה"
              aria-expanded={menuOpen}
            >
              <Plus size={20} />
            </button>
            {menuOpen && (
              <div className="action-menu">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setModal('private');
                  }}
                >
                  <MessageSquarePlus size={16} />
                  פתח שיחה חדשה
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setModal('group');
                  }}
                >
                  <UsersRound size={16} />
                  צור קבוצה חדשה
                </button>
              </div>
            )}
          </div>
        </div>

        <ul className="conversation-list">
          {error && (
            <li className="empty-list">
              <p style={{ color: 'var(--danger)' }}>{error}</p>
            </li>
          )}
          {dataLoading && conversations.length === 0 ? (
            <li className="empty-list">
              <p>טוען שיחות מ-Supabase…</p>
            </li>
          ) : conversations.length === 0 ? (
            <li className="empty-list">
              {tab === 'private' ? <Mail size={28} /> : <Users size={28} />}
              <p>
                {tab === 'private'
                  ? 'אין עדיין שיחות פרטיות. לחצו + כדי להתחיל.'
                  : 'אין עדיין קבוצות. צרו קבוצה חדשה מהכפתור +.'}
              </p>
            </li>
          ) : (
            conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`conversation-item ${activeId === c.id ? 'active' : ''}`}
                  onClick={() => openConversation(c.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuOpen(false);
                    setContextMenu({
                      conversationId: c.id,
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                >
                  {c.lastMessage?.imageUrl ? (
                    <div className="conversation-thumb">
                      <ChatImage src={c.lastMessage.imageUrl} className="conversation-thumb-img" />
                    </div>
                  ) : (
                    <div className="avatar sm" aria-hidden>
                      {initials(c.name)}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="title">{c.name}</div>
                    <div className="preview">{messagePreview(c.lastMessage)}</div>
                  </div>
                  <div className="conversation-meta">
                    <span className="time">
                      {c.lastMessage ? formatTime(c.lastMessage.timestamp) : ''}
                    </span>
                    {c.unreadCount > 0 && (
                      <span
                        className="unread-badge"
                        aria-label={`${c.unreadCount} הודעות שלא נקראו`}
                      >
                        {c.unreadCount > 99 ? '99+' : c.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>

        {contextMenu && (
          <div
            className="context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
            role="menu"
          >
            <button type="button" onClick={() => void deleteFromMenu()} disabled={deleting}>
              <Trash2 size={16} />
              {deleting ? 'מוחק…' : 'מחק שיחה'}
            </button>
          </div>
        )}
      </aside>

      <section className="chat-panel panel-card">
        {!activeConversation ? (
          <div className="chat-empty">
            <div>
              <div className="badge">
                <Mail size={30} />
              </div>
              <h2>בחרו שיחה</h2>
              <p>או פתחו שיחה עם משתמש רשום מהכפתור +</p>
            </div>
          </div>
        ) : (
          <>
            <header className="chat-header">
              <button
                type="button"
                className="icon-btn mobile-back"
                onClick={() => {
                  setMobilePane('chats');
                  setActiveId(null);
                }}
                aria-label="חזרה לרשימה"
              >
                <ArrowRight size={18} />
              </button>
              <div className="chat-header-main">
                <div className="avatar" aria-hidden>
                  {initials(activeConversation.name)}
                </div>
                <div>
                  <h2>{activeConversation.name}</h2>
                  {activeConversation.type === 'private' ? (
                    <div className="status-row">
                      <span className={`dot ${peerOnline ? 'online' : ''}`} />
                      {peerOnline ? 'מחובר/ת עכשיו' : 'לא מחובר/ת'}
                      {peerEmail && <span>· {peerEmail}</span>}
                    </div>
                  ) : (
                    <div className="status-row">
                      {activeConversation.members.length} חברים בקבוצה
                    </div>
                  )}
                </div>
              </div>
              {activeConversation.type === 'group' && (
                <div className="members-chip" title={activeConversation.members.join(', ')}>
                  <Users size={14} style={{ marginLeft: 6, verticalAlign: -2 }} />
                  {activeConversation.members.slice(0, 3).join(' · ')}
                  {activeConversation.members.length > 3
                    ? ` +${activeConversation.members.length - 3}`
                    : ''}
                </div>
              )}
            </header>

            <div className="messages" aria-live="polite">
              {activeMessages.map((m) => {
                const mine = m.senderEmail === session.email;
                return (
                  <div key={m.id} className={`message-row ${mine ? 'mine' : 'theirs'}`}>
                    <div className={`bubble ${m.imageUrl ? 'has-image' : ''}`}>
                      {activeConversation.type === 'group' && !mine && (
                        <div className="sender">
                          {m.senderName}{' '}
                          <span className="sender-email">· {m.senderEmail}</span>
                        </div>
                      )}
                      {m.imageUrl && (
                        <ChatImage
                          src={m.imageUrl}
                          className="message-image"
                          onClick={() => {
                            if (m.imageUrl) setLightbox(m.imageUrl);
                          }}
                        />
                      )}
                      {m.text ? <p>{m.text}</p> : null}
                      <span className="timestamp">{formatTime(m.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {imagePreview && (
              <div className="composer-preview">
                <img src={imagePreview} alt="תצוגה מקדימה" />
                <button
                  type="button"
                  className="composer-preview-remove"
                  onClick={clearImage}
                  aria-label="הסרת תמונה"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="composer">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                hidden
                onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => fileInputRef.current?.click()}
                title="הוספת תמונה"
                aria-label="הוספת תמונה"
                disabled={sending}
              >
                <ImagePlus size={18} />
              </button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="כתבו הודעה…"
                aria-label="הודעה חדשה"
                disabled={sending}
              />
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void send()}
                disabled={sending || (!draft.trim() && !imageFile)}
              >
                <Send size={18} />
                {sending ? 'שולח…' : 'שליחה'}
              </button>
            </div>
          </>
        )}
      </section>

      <aside className="updates-panel panel-card">
        <div className="panel-heading">
          <Bell size={18} />
          <h2>עידכונים</h2>
          {unreadTotal > 0 && (
            <span className="unread-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
          )}
        </div>
        {renderUpdatesList()}
      </aside>

      <aside className="mobile-updates panel-card">
        <div className="panel-heading">
          <Bell size={18} />
          <h2>עידכונים</h2>
          {unreadTotal > 0 && (
            <span className="unread-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
          )}
        </div>
        {renderUpdatesList()}
      </aside>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="presentation">
          <ChatImage src={lightbox} className="lightbox-image" />
          <button
            type="button"
            className="lightbox-close"
            onClick={() => setLightbox(null)}
            aria-label="סגירה"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {modal === 'private' && (
        <NewChatModal
          onClose={() => setModal(null)}
          onSubmit={onStartPrivate}
          currentEmail={session.email}
        />
      )}
      {modal === 'group' && (
        <NewGroupModal
          onClose={() => setModal(null)}
          onSubmit={onCreateGroup}
          currentEmail={session.email}
        />
      )}
    </div>
  );
}
