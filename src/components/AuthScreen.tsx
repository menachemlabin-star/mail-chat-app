import { useState, type FormEvent } from 'react';
import { Mail } from 'lucide-react';
import type { ActionResult } from '../types';

type AuthView = 'login' | 'register';

interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<ActionResult>;
  onRegister: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<ActionResult>;
}

export function AuthScreen({ onLogin, onRegister }: AuthScreenProps) {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.includes('@')) {
      setError('נא להזין כתובת מייל תקינה');
      return;
    }

    setBusy(true);
    try {
      if (password.length < 6) {
        setError('הסיסמה חייבת להכיל לפחות 6 תווים');
        return;
      }

      if (view === 'register') {
        if (!displayName.trim()) {
          setError('נא להזין שם תצוגה');
          return;
        }
        const result = await onRegister(email, password, displayName);
        if (!result.ok) setError(result.error);
        return;
      }

      const result = await onLogin(email, password);
      if (!result.ok) setError(result.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-orb one" />
      <div className="auth-orb two" />

      <div className="auth-card">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <Mail size={22} />
          </div>
          <h1 className="brand-name">Chat</h1>
        </div>

        <div className="mode-toggle" role="tablist" aria-label="התחברות או הרשמה">
          <button
            type="button"
            className={view === 'login' ? 'active' : ''}
            onClick={() => {
              setView('login');
              setError('');
            }}
          >
            התחברות
          </button>
          <button
            type="button"
            className={view === 'register' ? 'active' : ''}
            onClick={() => {
              setView('register');
              setError('');
            }}
          >
            הרשמה
          </button>
        </div>

        <form onSubmit={submit}>
          {view === 'register' && (
            <div className="field">
              <label htmlFor="displayName">שם תצוגה</label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="איך לקרוא לך?"
                autoComplete="nickname"
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="email">כתובת מייל</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">סיסמה</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={view === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {view === 'login' ? (
              busy ? 'מתחבר…' : 'התחברות'
            ) : busy ? (
              'נרשם…'
            ) : (
              'הרשמה'
            )}
          </button>
        </form>

        <div className="auth-switch">
          {view === 'login' ? (
            <>
              אין חשבון?
              <button type="button" onClick={() => setView('register')}>
                הרשמה
              </button>
            </>
          ) : (
            <>
              כבר רשומים?
              <button type="button" onClick={() => setView('login')}>
                התחברות
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
