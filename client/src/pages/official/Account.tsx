import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useOfficial } from '../../lib/store';
import { useToast } from '../../lib/toast';
import { Field } from '../../components/ui';

export default function Account() {
  const { official, refresh } = useOfficial();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await api.post('/api/auth/password', { current, next });
      toast('Password changed.', 'success');
      setCurrent('');
      setNext('');
      setConfirm('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-narrow">
      <div className="page-head">
        <h1>
          <KeyRound size={24} /> Change password
        </h1>
      </div>
      {official?.mustChangePassword && <div className="alert alert-warning">Your account was created or reset by the administrator. Please set your own password to continue.</div>}
      <form className="card" onSubmit={submit}>
        <Field label="Current password" required>
          <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" required hint="At least 8 characters with letters and numbers.">
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" required>
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        {error && <div className="alert alert-danger small">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Save password
        </button>
      </form>
      <div className="card small muted">
        Signed in as <strong>{official?.username}</strong> · {official?.role === 'admin' ? 'Administrator' : `${official?.areas.length} wards`} · last login {official?.lastLoginAt ? new Date(official.lastLoginAt).toLocaleString('en-IN') : '—'}
      </div>
    </div>
  );
}
