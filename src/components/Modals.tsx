import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { ActionResult } from '../types';
import { listRegisteredUsers } from '../lib/api';

interface ModalProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}

function ModalShell({ title, subtitle, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="modal-title">{title}</h3>
        <p className="subtitle">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

interface RegisteredUser {
  id: string;
  email: string;
  displayName: string;
}

interface NewChatModalProps {
  onClose: () => void;
  onSubmit: (email: string) => Promise<ActionResult>;
  currentEmail: string;
}

export function NewChatModal({ onClose, onSubmit, currentEmail }: NewChatModalProps) {
  const [query, setQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoadingUsers(true);
      const list = await listRegisteredUsers(currentEmail);
      if (alive) {
        setUsers(list);
        setLoadingUsers(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentEmail]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q),
    );
  }, [users, query]);

  const openWith = async (userEmail: string) => {
    setSelectedEmail(userEmail);
    setBusy(true);
    setError('');
    try {
      const result = await onSubmit(userEmail);
      if (!result.ok) setError(result.error);
      else onClose();
    } finally {
      setBusy(false);
    }
  };

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEmail) {
      setError('נא לבחור משתמש רשום מהרשימה');
      return;
    }
    await openWith(selectedEmail);
  };

  return (
    <ModalShell
      title="שיחה חדשה"
      subtitle="אפשר לפתוח שיחה רק עם משתמשים שרשומים באתר."
      onClose={onClose}
    >
      <form onSubmit={handle}>
        {users.length > 0 && (
          <div className="field">
            <label htmlFor="user-search">חיפוש משתמש</label>
            <input
              id="user-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="user-picker">
          <div className="user-picker-label">משתמשים רשומים באתר</div>
          {loadingUsers ? (
            <p className="user-picker-empty">טוען רשימה…</p>
          ) : filteredUsers.length === 0 ? (
            <p className="user-picker-empty">
              {users.length === 0
                ? 'עדיין אין משתמשים אחרים רשומים.'
                : 'אין התאמה לחיפוש.'}
            </p>
          ) : (
            <ul className="user-picker-list">
              {filteredUsers.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={`user-picker-item ${selectedEmail === u.email ? 'selected' : ''}`}
                    onClick={() => void openWith(u.email)}
                    disabled={busy}
                  >
                    <span className="user-picker-name">{u.displayName}</span>
                    <span className="user-picker-email">{u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <div className="auth-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            ביטול
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !selectedEmail || users.length === 0}
          >
            {busy ? 'יוצר…' : 'פתיחת שיחה'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

interface NewGroupModalProps {
  onClose: () => void;
  onSubmit: (name: string, emails: string[]) => Promise<ActionResult>;
  currentEmail: string;
}

export function NewGroupModal({ onClose, onSubmit, currentEmail }: NewGroupModalProps) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoadingUsers(true);
      const list = await listRegisteredUsers(currentEmail);
      if (alive) {
        setUsers(list);
        setLoadingUsers(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentEmail]);

  const toggle = (email: string) => {
    setSelected((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  };

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await onSubmit(name, selected);
      if (!result.ok) setError(result.error);
      else onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="קבוצה חדשה"
      subtitle="אפשר להוסיף לקבוצה רק משתמשים שרשומים באתר."
      onClose={onClose}
    >
      <form onSubmit={handle}>
        <div className="field">
          <label htmlFor="group-name">שם הקבוצה</label>
          <input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="user-picker">
          <div className="user-picker-label">בחירת חברים</div>
          {loadingUsers ? (
            <p className="user-picker-empty">טוען רשימה…</p>
          ) : users.length === 0 ? (
            <p className="user-picker-empty">עדיין אין משתמשים אחרים רשומים.</p>
          ) : (
            <ul className="user-picker-list">
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={`user-picker-item ${selected.includes(u.email) ? 'selected' : ''}`}
                    onClick={() => toggle(u.email)}
                    disabled={busy}
                  >
                    <span className="user-picker-name">{u.displayName}</span>
                    <span className="user-picker-email">{u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <div className="auth-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            ביטול
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'יוצר…' : 'יצירת קבוצה'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

interface NewAnnouncementModalProps {
  onClose: () => void;
  onSubmit: (body: string) => Promise<ActionResult>;
}

export function NewAnnouncementModal({ onClose, onSubmit }: NewAnnouncementModalProps) {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await onSubmit(body);
      if (!result.ok) setError(result.error);
      else onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="עידכון חדש"
      subtitle="העידכון יופיע אצל כל המשתמשים המחוברים לאתר."
      onClose={onClose}
    >
      <form onSubmit={handle}>
        <div className="field">
          <label htmlFor="announcement-body">תוכן העידכון</label>
          <textarea
            id="announcement-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            autoFocus
            required
          />
        </div>
        {error && <div className="auth-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            ביטול
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !body.trim()}>
            {busy ? 'מפרסם…' : 'פרסום לכלם'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
