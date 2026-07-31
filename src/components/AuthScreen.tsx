import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Mail } from 'lucide-react';
import type { ActionResult } from '../types';

type AuthView = 'login' | 'register' | 'forgot' | 'reset';

interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<ActionResult>;
  onRegister: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<ActionResult>;
  onResetPassword: (email: string) => Promise<ActionResult>;
  onUpdatePassword: (password: string) => Promise<ActionResult>;
  forceReset?: boolean;
}

export function AuthScreen({
  onLogin,
  onRegister,
  onResetPassword,
  onUpdatePassword,
  forceReset = false,
}: AuthScreenProps) {
  const [view, setView] = useState<AuthView>(forceReset ? 'reset' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (forceReset) {
      setView('reset');
      setError('');
      setInfo('');
    }
  }, [forceReset]);

  const switchView = (next: AuthView) => {
    if (forceReset && next !== 'reset') return;
    setView(next);
    setError('');
    setInfo('');
    setShowPassword(false);
    setConfirmPassword('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');

    setBusy(true);
    try {
      if (view === 'forgot') {
        if (!email.includes('@')) {
          setError('נא להזין כתובת מייל תקינה');
          return;
        }
        const result = await onResetPassword(email);
        if (!result.ok) setError(result.error);
        else setInfo('נשלח קישור לאיפוס סיסמה למייל שלכם.');
        return;
      }

      if (view === 'reset') {
        if (password.length < 6) {
          setError('הסיסמה חייבת להכיל לפחות 6 תווים');
          return;
        }
        if (password !== confirmPassword) {
          setError('הסיסמאות אינן תואמות');
          return;
        }
        const result = await onUpdatePassword(password);
        if (!result.ok) setError(result.error);
        return;
      }

      if (!email.includes('@')) {
        setError('נא להזין כתובת מייל תקינה');
        return;
      }

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

  const title =
    view === 'forgot'
      ? 'שחזור סיסמה'
      : view === 'reset'
        ? 'סיסמה חדשה'
        : view === 'register'
          ? 'הרשמה'
          : 'התחברות';

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

        <p className="auth-form-title">{title}</p>

        <form key={view} onSubmit={submit} autoComplete="on">
          {view === 'register' && (
            <div className="field">
              <label htmlFor="displayName">שם ומשפחה</label>
              <input
                id="displayName"
                name="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}

          {(view === 'login' || view === 'register' || view === 'forgot') && (
            <div className="field">
              <label htmlFor="email">כתובת מייל</label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
          )}

          {(view === 'login' || view === 'register' || view === 'reset') && (
            <div className="field">
              <label htmlFor="password">
                {view === 'reset' ? 'סיסמה חדשה' : 'סיסמה'}
              </label>
              <div className="password-field">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    view === 'register' || view === 'reset'
                      ? 'new-password'
                      : 'current-password'
                  }
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
          )}

          {view === 'reset' && (
            <div className="field">
              <label htmlFor="confirmPassword">אימות סיסמה</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          )}

          {view === 'login' && (
            <div className="forgot-row">
              <button type="button" className="forgot-link" onClick={() => switchView('forgot')}>
                שכחתי סיסמה
              </button>
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}
          {info && <div className="auth-info">{info}</div>}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {view === 'forgot'
              ? busy
                ? 'שולח…'
                : 'שליחת קישור לאיפוס'
              : view === 'reset'
                ? busy
                  ? 'שומר…'
                  : 'שמירת סיסמה חדשה'
                : view === 'login'
                  ? busy
                    ? 'מתחבר…'
                    : 'התחברות'
                  : busy
                    ? 'נרשם…'
                    : 'הרשמה'}
          </button>
        </form>

        {!forceReset && (
          <div className="auth-switch">
            {view === 'login' ? (
              <>
                אין חשבון?
                <button type="button" onClick={() => switchView('register')}>
                  הרשמה
                </button>
              </>
            ) : view === 'register' ? (
              <>
                כבר רשומים?
                <button type="button" onClick={() => switchView('login')}>
                  התחברות
                </button>
              </>
            ) : (
              <>
                נזכרתם בסיסמה?
                <button type="button" onClick={() => switchView('login')}>
                  חזרה להתחברות
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
