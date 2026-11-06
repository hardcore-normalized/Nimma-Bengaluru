import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, KeyRound, LogIn, ShieldCheck, User } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useOfficial } from '../../lib/store';
import { Field, LogoMark } from '../../components/ui';

interface Demo {
  username: string;
  password: string;
  name: string;
  designation: string;
  role: string;
  areas: string;
}

export default function Login() {
  const { official, login } = useOfficial();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<Demo[]>([]);

  useEffect(() => {
    api
      .get<{ items: Demo[] }>('/api/auth/demo-accounts')
      .then((r) => setDemo(r.items))
      .catch(() => {});
  }, []);

  if (official) return <Navigate to={params.get('next') || '/official'} replace />;

  const submit = async (e?: FormEvent, u = username, p = password) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(u, p);
      nav(params.get('next') || '/official', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-wrap">
        <div className="login-top">
          <Link to="/" className="link-btn small">
            <ArrowLeft size={14} /> Citizen portal
          </Link>
        </div>
        <div className="card login-card">
          <div className="login-brand">
            <LogoMark size={52} />
            <div>
              <h1>Admin Portal</h1>
              <p className="muted small">Nimma Bengaluru · administrator sign-in</p>
            </div>
          </div>
          <form onSubmit={submit}>
            <Field label="Username">
              <div className="input-icon">
                <User size={16} />
                <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
              </div>
            </Field>
            <Field label="Password">
              <div className="input-icon">
                <KeyRound size={16} />
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </div>
            </Field>
            {error && <div className="alert alert-danger small">{error}</div>}
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
              <LogIn size={18} /> {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="small muted login-note">
            <ShieldCheck size={13} /> One administrator account manages complaints from all 369 wards. Every action is recorded in the audit log.
          </p>
        </div>
        {demo.length > 0 && (
          <div className="card demo-card">
            <h3>Demo login</h3>
            <p className="small muted">For the demo. Tap to sign in.</p>
            <div className="demo-list">
              {demo.map((d) => (
                <button key={d.username} className="demo-item" onClick={() => submit(undefined, d.username, d.password)} disabled={busy}>
                  <div>
                    <strong>{d.name}</strong>
                    <small>{d.designation}</small>
                    <small className="muted">{d.areas}</small>
                  </div>
                  <code>
                    {d.username}
                    <br />
                    {d.password}
                  </code>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
