import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Mail } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLocked, setPasswordLocked] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const switchView = (next: AuthView) => {
    setView(next);
    setError('');
    setShowPassword(false);
    setPasswordLocked(true);
  };

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
          setError('נא להזין שם ומשפחה');
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
          <h1 className="brand-name">צ׳אט כנסת הגדולה</h1>
        </div>

        <form onSubmit={submit} autoComplete="off">
          {/* Hidden decoys reduce Chrome password-manager interference */}
          <input
            type="text"
            name="fake-username"
            autoComplete="username"
            tabIndex={-1}
            aria-hidden="true"
            className="autofill-decoy"
          />
          <input
            type="password"
            name="fake-password"
            autoComplete="new-password"
            tabIndex={-1}
            aria-hidden="true"
            className="autofill-decoy"
          />

          {view === 'register' && (
            <div className="field">
              <label htmlFor="displayName">שם ומשפחה</label>
              <input
                id="displayName"
                name="full-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="email">כתובת מייל</label>
            <input
              id="email"
              name="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">סיסמה</label>
            <div className="password-field">
              <input
                id="password"
                name="user-secret"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordLocked(false)}
                readOnly={passwordLocked}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                title={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
              <button type="button" onClick={() => switchView('register')}>
                הרשמה
              </button>
            </>
          ) : (
            <>
              כבר רשומים?
              <button type="button" onClick={() => switchView('login')}>
                התחברות
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
