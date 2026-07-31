import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

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

interface NewChatModalProps {
  onClose: () => void;
  onSubmit: (email: string) => { ok: true } | { ok: false; error: string };
}

export function NewChatModal({ onClose, onSubmit }: NewChatModalProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handle = (e: FormEvent) => {
    e.preventDefault();
    const result = onSubmit(email);
    if (!result.ok) setError(result.error);
    else onClose();
  };

  return (
    <ModalShell
      title="שיחה חדשה"
      subtitle="הזינו כתובת מייל של נמען לפתיחת שיחה פרטית."
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
            placeholder="friend@email.com"
            autoFocus
            required
          />
        </div>
        {error && <div className="auth-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" className="btn btn-primary">
            פתיחת שיחה
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

interface NewGroupModalProps {
  onClose: () => void;
  onSubmit: (
    name: string,
    emails: string[],
  ) => { ok: true } | { ok: false; error: string };
}

export function NewGroupModal({ onClose, onSubmit }: NewGroupModalProps) {
  const [name, setName] = useState('');
  const [emails, setEmails] = useState('');
  const [error, setError] = useState('');

  const handle = (e: FormEvent) => {
    e.preventDefault();
    const list = emails
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const result = onSubmit(name, list);
    if (!result.ok) setError(result.error);
    else onClose();
  };

  return (
    <ModalShell
      title="קבוצה חדשה"
      subtitle="בחרו שם לקבוצה והוסיפו חברים לפי כתובות מייל."
      onClose={onClose}
    >
      <form onSubmit={handle}>
        <div className="field">
          <label htmlFor="group-name">שם הקבוצה</label>
          <input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="למשל: צוות עיצוב"
            autoFocus
            required
          />
        </div>
        <div className="field">
          <label htmlFor="group-emails">חברים (מיילים מופרדים בפסיק)</label>
          <input
            id="group-emails"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="a@mail.com, b@mail.com"
          />
        </div>
        {error && <div className="auth-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" className="btn btn-primary">
            יצירת קבוצה
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
