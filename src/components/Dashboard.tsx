import { useEffect, useRef, useState } from 'react';
import {
  LogOut,
  Mail,
  MessageSquarePlus,
  Plus,
  Send,
  Users,
  UsersRound,
} from 'lucide-react';
import type { ActionResult, Conversation, ConversationType, Message, Session } from '../types';
import { NewChatModal, NewGroupModal } from './Modals';

interface ConversationRow extends Conversation {
  lastMessage: Message | null;
}

interface DashboardProps {
  session: Session;
  tab: ConversationType;
  setTab: (tab: ConversationType) => void;
  conversations: ConversationRow[];
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
  onSend: (text: string) => void | Promise<void>;
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
}: DashboardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<'private' | 'group' | null>(null);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeId]);

  useEffect(() => {
    setDraft('');
  }, [activeId]);

  const send = () => {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
  };

  const peerOnline = peerEmail ? onlineEmails.has(peerEmail) : false;

  return (
    <div className="dashboard">
      <aside className="sidebar sidebar-relative">
        <div className="profile">
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

        <div className="sidebar-toolbar">
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
          <button
            className="icon-btn primary"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="פעולה מהירה"
            title="פעולה מהירה"
          >
            <Plus size={20} />
          </button>
        </div>

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
                  onClick={() => setActiveId(c.id)}
                >
                  <div className="avatar sm" aria-hidden>
                    {initials(c.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="title">{c.name}</div>
                    <div className="preview">
                      {c.lastMessage?.text ?? 'עדיין אין הודעות'}
                    </div>
                  </div>
                  <span className="time">
                    {c.lastMessage ? formatTime(c.lastMessage.timestamp) : ''}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      <section className="chat-panel">
        {!activeConversation ? (
          <div className="chat-empty">
            <div>
              <div className="badge">
                <Mail size={30} />
              </div>
              <h2>בחרו שיחה</h2>
              <p>או פתחו שיחה חדשה לפי כתובת מייל מהכפתור +</p>
            </div>
          </div>
        ) : (
          <>
            <header className="chat-header">
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
                    <div className="bubble">
                      {activeConversation.type === 'group' && !mine && (
                        <div className="sender">
                          {m.senderName}{' '}
                          <span className="sender-email">· {m.senderEmail}</span>
                        </div>
                      )}
                      <p>{m.text}</p>
                      <span className="timestamp">{formatTime(m.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="composer">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="כתבו הודעה…"
                aria-label="הודעה חדשה"
              />
              <button className="btn btn-primary" type="button" onClick={send} disabled={!draft.trim()}>
                <Send size={18} />
                שליחה
              </button>
            </div>
          </>
        )}
      </section>

      {modal === 'private' && (
        <NewChatModal onClose={() => setModal(null)} onSubmit={onStartPrivate} />
      )}
      {modal === 'group' && (
        <NewGroupModal onClose={() => setModal(null)} onSubmit={onCreateGroup} />
      )}
    </div>
  );
}
