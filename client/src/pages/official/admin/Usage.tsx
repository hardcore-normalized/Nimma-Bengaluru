// Free-tier usage: how close the app is to the limits of its free plans, and what to do.
import { useEffect, useState } from 'react';
import { CheckCircle2, Database, Film, Gauge, RefreshCw, Server, Trash2, TriangleAlert } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import { useToast } from '../../../lib/toast';
import { cls, fmtDate } from '../../../lib/format';
import { Field, Modal, Spinner } from '../../../components/ui';

export interface UsageItem {
  key: string;
  label: string;
  plan: string;
  applies: boolean;
  used: number;
  limit: number;
  unit: 'bytes' | 'hours';
  pct: number;
  level: 'ok' | 'warning' | 'critical' | 'full';
  note: string;
  advice: string[];
}
export interface UsageStatus {
  freeTier: boolean;
  hosting: string;
  database: string;
  level: UsageItem['level'];
  items: UsageItem[];
  uploadsPaused: boolean;
  videosPaused: boolean;
  publicNotice: string;
  checkedAt: string;
}

export const pctText = (p: number) => (p > 100 ? 'over 100%' : `${p}%`);

export const LEVEL_TEXT: Record<string, string> = { ok: 'OK', warning: 'Getting full', critical: 'Almost full', full: 'Full' };

function amount(v: number, unit: string) {
  if (unit === 'hours') return `${v.toFixed(1)} h`;
  if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(2)} GB`;
  if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(v / 1024)} KB`;
}

const ICON: Record<string, React.ReactNode> = {
  'db-storage': <Database size={18} />,
  'db-transfer': <Gauge size={18} />,
  'host-hours': <Server size={18} />,
  'host-bandwidth': <Gauge size={18} />,
};

export default function Usage() {
  const toast = useToast();
  const [u, setU] = useState<UsageStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [cleanOpen, setCleanOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [days, setDays] = useState('30');

  const load = (fresh = false) =>
    api
      .get<UsageStatus>(`/api/admin/usage${fresh ? '?fresh=1' : ''}`)
      .then(setU)
      .catch((e) => toast(errorMessage(e), 'error'));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!u) return <Spinner label="Checking free-plan usage…" />;

  const cleanup = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/admin/usage/cleanup-videos', { olderThanDays: Number(days) });
      setU(r.usage);
      toast(r.videos ? `Removed ${r.videos} video(s), freed ${amount(r.bytesFreed, 'bytes')}.` : 'No videos matched – nothing removed.', 'success');
      setCleanOpen(false);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const removeDemo = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/admin/usage/remove-demo-data');
      setU(r.usage);
      toast('Demo data removed. It will not be added again.', 'success');
      setDemoOpen(false);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Free-tier usage</h1>
          <p className="muted small">
            {u.freeTier ? 'This app runs on free plans. You are warned at 80%, uploads of videos pause at 90%, and new reports pause at 98% so the database never breaks.' : 'Running on this computer with the built-in database – no free-plan limits apply.'}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => load(true)}>
          <RefreshCw size={15} /> Check now
        </button>
      </div>

      {u.level === 'ok' ? (
        <div className="alert alert-tip">
          <CheckCircle2 size={16} /> Everything is within the free limits.
        </div>
      ) : (
        <div className={cls('alert', u.level === 'warning' ? 'alert-warning' : 'alert-danger')}>
          <TriangleAlert size={16} /> <strong>Running on a free plan – {LEVEL_TEXT[u.level].toLowerCase()}.</strong> See what you can do under each item below.
          {u.publicNotice && <p className="small">Citizens currently see: “{u.publicNotice}”</p>}
        </div>
      )}

      <div className="usage-grid">
        {u.items.map((it) => (
          <section key={it.key} className={cls('card usage-card', `usage-${it.applies ? it.level : 'na'}`)}>
            <div className="card-title">
              <h3>
                {ICON[it.key]} {it.label}
              </h3>
              <span className={cls('badge', !it.applies ? 'tone-neutral' : it.level === 'ok' ? 'tone-success' : it.level === 'warning' ? 'tone-warning' : 'tone-danger')}>
                {it.applies ? `${LEVEL_TEXT[it.level]} · ${pctText(it.pct)}` : 'No limit here'}
              </span>
            </div>
            <p className="small muted">{it.plan}</p>
            {it.applies && (
              <>
                <div className="meter usage-meter" aria-label={`${pctText(it.pct)} used`}>
                  <span style={{ width: `${Math.min(100, Math.max(1.5, it.pct))}%` }} />
                  <i style={{ left: '80%' }} />
                  <i style={{ left: '90%' }} />
                </div>
                <p className="usage-amount">
                  <strong>{amount(it.used, it.unit)}</strong> used of {amount(it.limit, it.unit)}
                </p>
              </>
            )}
            {!it.applies && it.used > 0 && (
              <p className="usage-amount">
                <strong>{amount(it.used, it.unit)}</strong> used
              </p>
            )}
            {it.note && <p className="small">{it.note}</p>}
            {it.applies && (
              <details className="usage-advice" open={it.level !== 'ok'}>
                <summary>What can be done</summary>
                <ul>
                  {it.advice.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        ))}
      </div>

      <section className="card">
        <h3>Free up database space</h3>
        <p className="small muted">Photos are small; videos are what fill a free database. Fake-report evidence is never deleted.</p>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={() => setCleanOpen(true)}>
            <Film size={16} /> Remove old videos
          </button>
          <button className="btn btn-ghost" onClick={() => setDemoOpen(true)}>
            <Trash2 size={16} /> Remove demo data
          </button>
        </div>
        <p className="small muted">Last checked {fmtDate(u.checkedAt)}.</p>
      </section>

      <Modal open={cleanOpen} title="Remove old videos" onClose={() => setCleanOpen(false)}>
        <p className="small">Deletes the videos of complaints that were resolved, referred, merged as duplicates or rejected. Photos, notes and history stay. Videos of fake reports are kept as evidence.</p>
        <Field label="Only complaints closed more than … days ago">
          <select className="input select" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="0">Any closed complaint</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </Field>
        <button className="btn btn-danger btn-block" onClick={cleanup} disabled={busy}>
          <Film size={16} /> Remove videos
        </button>
      </Modal>

      <Modal open={demoOpen} title="Remove demo data" onClose={() => setDemoOpen(false)}>
        <p className="small">Deletes the sample complaints, sample citizens and their photos that were added for presentations. Real reports are not touched. Demo data will not be added again.</p>
        <button className="btn btn-danger btn-block" onClick={removeDemo} disabled={busy}>
          <Trash2 size={16} /> Remove demo data
        </button>
      </Modal>
    </div>
  );
}
