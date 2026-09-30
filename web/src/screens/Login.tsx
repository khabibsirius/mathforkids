import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { Notice, TopBar } from '../components/ui';

/**
 * The grown-up's screen.
 *
 * The security boundary is the parent account; children never have a password.
 * Copy is addressed to the adult and says so plainly, so nobody hands a
 * five-year-old a form asking for an email address.
 */
export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('demo@mathforkids.local');
  const [password, setPassword] = useState('demo1234');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') await api.register(email.trim(), password);
      else await api.login(email.trim(), password);
      onSignedIn();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === 'VALIDATION_FAILED'
            ? 'Check the email address and use a password of at least 8 characters.'
            : err.kidMessage
          : 'Could not reach the server. Is the API running?',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell" style={{ maxWidth: 460 }}>
      <TopBar />

      <div className="card stack">
        <div>
          <h1>{mode === 'login' ? 'Grown-ups first' : 'Create an account'}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {mode === 'login'
              ? 'Sign in, then choose who is playing today.'
              : 'One account holds up to six players.'}
          </p>
        </div>

        {error ? <Notice kind="bad">{error}</Notice> : null}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn--primary btn--big" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="center">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>

      <p className="tiny center" style={{ marginTop: 18 }}>
        The demo account is filled in for you: <code>demo@mathforkids.local</code> / <code>demo1234</code>
        <br />
        It comes with two players and ten days of practice history.
      </p>
    </div>
  );
}
