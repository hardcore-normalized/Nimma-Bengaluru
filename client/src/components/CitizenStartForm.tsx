import { useState, type FormEvent } from 'react';
import { ArrowRight, UserRound } from 'lucide-react';
import { ApiError, errorMessage } from '../lib/api';
import { useCitizen } from '../lib/store';
import { Field } from './ui';

export default function CitizenStartForm({ onStarted }: { onStarted?: () => void }) {
  const { startSession } = useCitizen();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (name.trim().length < 2) return setError('Enter your name (at least 2 characters).');
    if (!/^[6-9]\d{9}$/.test(digits)) return setError('Enter a valid 10-digit Indian mobile number.');
    setBusy(true);
    try {
      const citizen = await startSession(digits, name.trim());
      if (citizen.blocked) setError(citizen.blocked.message);
      else onStarted?.();
    } catch (err) {
      const message = errorMessage(err);
      const reason = err instanceof ApiError ? err.details?.reason : '';
      setError(reason ? `${message} Reason: ${reason}` : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="citizen-start-form" onSubmit={start}>
      <Field label="Full name" required>
        <div className="input-icon">
          <UserRound size={16} />
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} placeholder="e.g. Ananya Rao" />
        </div>
      </Field>
      <Field label="Mobile number (unverified)" required hint="The admin team may call this number to follow up.">
        <div className="input-prefix">
          <span>+91</span>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" autoComplete="tel-national" maxLength={14} placeholder="98450 12345" />
        </div>
      </Field>
      <p className="small muted contact-note">Use your own number. It is stored with every report you send.</p>
      {error && <div className="alert alert-danger small">{error}</div>}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
        {busy ? 'Starting…' : 'Continue'} <ArrowRight size={17} />
      </button>
    </form>
  );
}
