// Firewall: what was blocked, who is banned, and manual ban / unban.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BrickWall, Plus, RefreshCw, Undo2 } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import { useToast } from '../../../lib/toast';
import { fmtDate, timeAgo } from '../../../lib/format';
import { Empty, Field, Modal, Spinner } from '../../../components/ui';

const EVENT_TEXT: Record<string, string> = {
  'blocked-banned': 'Banned network tried again',
  'rate-limited': 'Too many requests',
  'attack-probe': 'Attack / probe blocked',
  scanner: 'Hacking tool blocked',
  'uploads-busy': 'Upload refused (server busy)',
  'bad-method': 'Unusual request blocked',
  'url-too-long': 'Oversized request blocked',
};

export default function Firewall() {
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [ip, setIp] = useState('');
  const [minutes, setMinutes] = useState('1440');
  const [reason, setReason] = useState('');

  const load = () =>
    api
      .get('/api/admin/firewall')
      .then(setD)
      .catch((e) => toast(errorMessage(e), 'error'));
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!d) return <Spinner label="Loading firewall…" />;
  const c = d.counters;

  const ban = async () => {
    try {
      await api.post('/api/admin/firewall/bans', { ip: ip.trim(), minutes: Number(minutes), reason });
      toast('Network banned.', 'success');
      setOpen(false);
      setIp('');
      setReason('');
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const unban = async (x: string) => {
    if (!confirm(`Lift the ban on ${x}?`)) return;
    try {
      await api.del(`/api/admin/firewall/bans/${encodeURIComponent(x)}`);
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            <BrickWall size={24} /> Firewall
          </h1>
          <p className="muted small">
            {d.enabled ? 'On.' : 'Off – turn it on in Anti-misuse settings.'} Blocks request floods, hacking tools and attack probes, and bans networks that keep trying. Up to {d.settings.fwRequestsPerMinute} requests a
            minute per network; first automatic ban {d.settings.fwBanMinutes} min, longer for repeat offenders. Your IP: <code>{d.yourIp}</code> (the signed-in admin is never rate-limited).
          </p>
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost btn-sm" onClick={load}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => setOpen(true)}>
            <Plus size={15} /> Ban an IP
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-tile static">
          <span className="stat-label">Requests checked</span>
          <strong className="stat-value">{c.checked.toLocaleString('en-IN')}</strong>
          <span className="stat-hint">since {timeAgo(c.since)}</span>
        </div>
        <div className="stat-tile static stat-warning">
          <span className="stat-label">Floods slowed down</span>
          <strong className="stat-value">{c.rateLimited}</strong>
        </div>
        <div className="stat-tile static stat-danger">
          <span className="stat-label">Attacks & scanners blocked</span>
          <strong className="stat-value">{c.probes + c.scanners}</strong>
        </div>
        <div className="stat-tile static">
          <span className="stat-label">Automatic bans</span>
          <strong className="stat-value">{c.autoBans}</strong>
          <span className="stat-hint">{c.banned} requests refused from banned networks</span>
        </div>
      </div>

      <section className="card">
        <h3>Banned networks ({d.activeBans.length})</h3>
        {d.activeBans.length === 0 ? (
          <p className="muted small">Nobody is banned right now.</p>
        ) : (
          <div className="table-wrap">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th>IP</th>
                  <th>Reason</th>
                  <th>Until</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.activeBans.map((b: any) => (
                  <tr key={b.ip}>
                    <td data-label="IP">
                      <code>{b.ip}</code> {b.count > 1 && <span className="badge tone-danger">banned {b.count}×</span>}
                    </td>
                    <td data-label="Reason" className="small">
                      {b.reason}
                    </td>
                    <td data-label="Until" className="small">
                      {b.until ? fmtDate(b.until) : <strong>Permanent</strong>}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => unban(b.ip)}>
                        <Undo2 size={14} /> Lift
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {d.watching.length > 0 && (
        <section className="card">
          <h3>Being watched</h3>
          <p className="small muted">Networks collecting strikes. At 10 points in 10 minutes they are banned automatically.</p>
          {d.watching.map((w: any) => (
            <div key={w.ip} className="fw-watch">
              <code>{w.ip}</code>
              <div className="meter">
                <span style={{ width: `${Math.min(100, w.score * 10)}%` }} />
              </div>
              <small>{w.reasons.join(', ')}</small>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h3>Recent blocked requests</h3>
        {d.recent.length === 0 ? (
          <Empty title="Nothing blocked yet" />
        ) : (
          <ul className="fw-events">
            {d.recent.slice(0, 40).map((e: any, i: number) => (
              <li key={i}>
                <div>
                  <strong>{EVENT_TEXT[e.type] || e.type}</strong> <code>{e.ip}</code>
                </div>
                <small className="muted">
                  {timeAgo(e.at)} · {e.method} {e.path}
                  {e.detail ? ` · ${e.detail}` : ''}
                </small>
              </li>
            ))}
          </ul>
        )}
        <p className="small muted">
          Bans are also listed in the <Link to="/official/admin/audit">audit log</Link>. Reporting bans for citizens (by phone / device) are in the <Link to="/official/admin/blocks">blocklist</Link>.
        </p>
      </section>

      <Modal open={open} title="Ban an IP address" onClose={() => setOpen(false)}>
        <p className="small">Every request from this network will be refused – including the citizen site. Careful: a college or office Wi-Fi often shares one IP for many people.</p>
        <Field label="IP address" required>
          <input className="input" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="49.207.52.18" inputMode="decimal" />
        </Field>
        <Field label="For how long">
          <select className="input select" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
            <option value="60">1 hour</option>
            <option value="1440">1 day</option>
            <option value="10080">7 days</option>
            <option value="43200">30 days</option>
            <option value="0">Permanent</option>
          </select>
        </Field>
        <Field label="Reason" required>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        </Field>
        <button className="btn btn-danger btn-block" onClick={ban} disabled={!ip.trim() || reason.trim().length < 3}>
          Ban network
        </button>
      </Modal>
    </div>
  );
}
