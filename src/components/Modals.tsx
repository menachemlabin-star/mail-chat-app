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
  const [email, setEmail] = useState('');
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
    const q = email.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q),
    );
  }, [users, email]);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await onSubmit(email);
      if (!result.ok) setError(result.error);
      else onClose();
    } finally {
      setBusy(false);
    }
  };

  const pickUser = async (userEmail: string) => {
    setEmail(userEmail);
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

  return (
    <ModalShell
      title="שיחה חדשה"
      subtitle="בחרו משתמש מהרשימה, או הזינו כתובת מייל."
      onClose={onClose}
    >
      <form onSubmit={handle}>
        <div className="field">
          <label htmlFor="peer-email">מייל הנמען</label>
          <input
            id="peer-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>

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
                    className={`user-picker-item ${email === u.email ? 'selected' : ''}`}
                    onClick={() => void pickUser(u.email)}
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
          <button type="submit" className="btn btn-primary" disabled={busy || !email.trim()}>
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
      subtitle="בחרו שם לקבוצה והוסיפו חברים מהרשימה."
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
