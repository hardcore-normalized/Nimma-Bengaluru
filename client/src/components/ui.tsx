// Small shared UI pieces.
import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, X } from 'lucide-react';
import { cls, fmtDate } from '../lib/format';

export const STATUS_TONE: Record<string, string> = {
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  NEEDS_CORRECTION: 'warning',
  RESUBMITTED: 'info',
  ASSIGNED: 'violet',
  IN_PROGRESS: 'violet',
  AWAITING_VERIFICATION: 'teal',
  RESOLVED: 'success',
  REOPENED: 'warning',
  REFERRED: 'neutral',
  DUPLICATE: 'neutral',
  REJECTED: 'neutral',
  SPAM: 'danger',
};

export const STATUS_COLOR: Record<string, string> = {
  SUBMITTED: '#3d85e6',
  UNDER_REVIEW: '#20a39e',
  NEEDS_CORRECTION: '#f5a623',
  RESUBMITTED: '#5aa9f0',
  ASSIGNED: '#8a63d2',
  IN_PROGRESS: '#b05fd6',
  AWAITING_VERIFICATION: '#1fa38a',
  RESOLVED: '#43a047',
  REOPENED: '#f5862a',
  REFERRED: '#9a8f84',
  DUPLICATE: '#9a8f84',
  REJECTED: '#7d7480',
  SPAM: '#e2453c',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge tone-${STATUS_TONE[status] || 'neutral'}`}>{label || status.replace(/_/g, ' ').toLowerCase()}</span>;
}

export function RiskBadge({ level, score }: { level: string; score?: number }) {
  const text = level === 'high' ? 'High risk' : level === 'medium' ? 'Medium risk' : 'Low risk';
  return (
    <span className={`badge risk-${level}`} title={score != null ? `Misuse risk score ${score}/100` : undefined}>
      {text}
      {score != null && level !== 'low' ? ` · ${score}` : ''}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cls('modal', wide && 'modal-wide')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function QR({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!value) return;
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2b2733', light: '#ffffff' } }).then(setSrc).catch(() => setSrc(''));
  }, [value, size]);
  return src ? <img className="qr" src={src} width={size} height={size} alt={`QR code for ${value}`} /> : <div className="qr qr-empty" style={{ width: size, height: size }} />;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
      {done ? <Check size={15} /> : <Copy size={15} />} {done ? 'Copied' : label}
    </button>
  );
}

export interface TimelineItem {
  status: string;
  label: string;
  at: string;
  note?: string;
  by?: string;
  internal?: boolean;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="timeline">
      {items.map((it, i) => (
        <li key={i} className={cls(i === items.length - 1 && 'current', it.internal && 'internal')}>
          <span className="tl-dot" style={{ background: STATUS_COLOR[it.status] || '#9a8f84' }} />
          <div className="tl-body">
            <div className="tl-head">
              <strong>{it.label}</strong>
              <span className="muted small">{fmtDate(it.at)}</span>
            </div>
            {it.note && <p className="tl-note">{it.note}</p>}
            {it.by && <span className="muted small">{it.by}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export { LogoMark } from './CrayonArt';

export function Field({ label, hint, error, children, required }: { label: string; hint?: string; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className={cls('field', error && 'has-error')}>
      <span className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
