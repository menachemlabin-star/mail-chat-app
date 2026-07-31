import { useState, type FormEvent } from 'react';
import { Mail, Sparkles } from 'lucide-react';

type AuthMode = 'password' | 'magic';
type AuthView = 'login' | 'register';

interface AuthScreenProps {
  onLogin: (email: string, password: string) => { ok: true } | { ok: false; error: string };
  onRegister: (
    email: string,
    password: string,
    displayName: string,
  ) => { ok: true } | { ok: false; error: string };
  onMagicLink: (email: string, displayName: string) => { ok: true } | { ok: false; error: string };
}

export function AuthScreen({ onLogin, onRegister, onMagicLink }: AuthScreenProps) {
  const [view, setView] = useState<AuthView>('login');
  const [mode, setMode] = useState<AuthMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [magicSent, setMagicSent] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMagicSent(false);

    if (!email.includes('@')) {
      setError('נא להזין כתובת מייל תקינה');
      return;
    }

    if (mode === 'magic') {
      const result = onMagicLink(email, displayName || email.split('@')[0]);
      if (!result.ok) setError(result.error);
      else setMagicSent(true);
      return;
    }

    if (password.length < 4) {
      setError('הסיסמה חייבת להכיל לפחות 4 תווים');
      return;
    }

    if (view === 'register') {
      if (!displayName.trim()) {
        setError('נא להזין שם תצוגה');
        return;
      }
      const result = onRegister(email, password, displayName);
      if (!result.ok) setError(result.error);
      return;
    }

    const result = onLogin(email, password);
    if (!result.ok) setError(result.error);
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
          <h1 className="brand-name">MailChat</h1>
        </div>
        <p className="auth-tagline">
          שיחות פרטיות וקבוצתיות לפי כתובת מייל — במהירות של צ׳אט, בפשטות של מייל.
        </p>

        <div className="mode-toggle" role="tablist" aria-label="שיטת התחברות">
          <button
            type="button"
            className={mode === 'password' ? 'active' : ''}
            onClick={() => {
              setMode('password');
              setMagicSent(false);
              setError('');
            }}
          >
            מייל וסיסמה
          </button>
          <button
            type="button"
            className={mode === 'magic' ? 'active' : ''}
            onClick={() => {
              setMode('magic');
              setError('');
            }}
          >
            קישור קסם
          </button>
        </div>

        <form onSubmit={submit}>
          {(view === 'register' || mode === 'magic') && (
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

          {mode === 'password' && (
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
          )}

          {error && <div className="auth-error">{error}</div>}
          {magicSent && (
            <div className="auth-error" style={{ background: 'rgba(15,118,110,.1)', color: 'var(--teal-deep)' }}>
              קישור הקסם אומת — מתחברים…
            </div>
          )}

          <button className="btn btn-primary" type="submit">
            {mode === 'magic' ? (
              <>
                <Sparkles size={18} />
                שליחת קישור קסם והתחברות
              </>
            ) : view === 'login' ? (
              'התחברות'
            ) : (
              'הרשמה'
            )}
          </button>
        </form>

        {mode === 'password' && (
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
        )}
      </div>
    </div>
  );
}
