// Reporter profile ("dossier"): everything needed to identify and act against misuse.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Ban, FileDown, Fingerprint, Globe, Smartphone, Undo2, UserRound, Users } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useOfficial } from '../../lib/store';
import { useToast } from '../../lib/toast';
import { cls, fmtDate, fmtDistance, timeAgo } from '../../lib/format';
import { Field, Modal, RiskBadge, Spinner, StatusBadge } from '../../components/ui';

export default function Reporter() {
  const { id } = useParams();
  const { official } = useOfficial();
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');
  const [blockOpen, setBlockOpen] = useState(false);
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('');
  const [includeDevices, setIncludeDevices] = useState(true);
  const [busy, setBusy] = useState(false);
  const isAdmin = official?.role === 'admin';

  const load = () =>
    api
      .get(`/api/official/reporters/${id}`)
      .then(setD)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!d) return <Spinner label="Loading reporter profile…" />;
  const rep = d.reporter;

  const block = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/official/reporters/${id}/block`, { days: Number(days), reason, includeDevices });
      toast(`Blocked ${r.until ? 'until ' + new Date(r.until).toLocaleDateString('en-IN') : 'permanently'} (${r.blocks} identifiers).`, 'success');
      setBlockOpen(false);
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const unblock = async () => {
    if (!confirm('Lift all active blocks for this reporter?')) return;
    try {
      const r = await api.post(`/api/official/reporters/${id}/unblock`);
      toast(`${r.lifted} block(s) lifted.`, 'success');
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const revoke = async (sid: string) => {
    if (!confirm('Revoke this strike? Use this when a report was wrongly marked as misuse.')) return;
    try {
      await api.post(`/api/official/reporters/${id}/strikes/${sid}/revoke`);
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const activeStrikes = rep.strikes.filter((s: any) => !s.revoked);

  return (
    <div className="dossier">
      <div className="page-head">
        <div>
          <Link to="/official/reports" className="link-btn small">
            <ArrowLeft size={14} /> Complaints
          </Link>
          <h1>
            <UserRound size={24} /> {rep.name}
          </h1>
          <p className="muted small">
            Reporter profile · first seen {fmtDate(rep.firstSeenAt, false)} · last active {timeAgo(rep.lastSeenAt)}
          </p>
        </div>
        <div className="btn-row">
          <Link to={`/official/reporters/${id}/evidence`} target="_blank" className="btn btn-ghost">
            <FileDown size={16} /> Evidence report (print / PDF)
          </Link>
          {rep.blocked ? (
            isAdmin && (
              <button className="btn btn-ghost" onClick={unblock}>
                <Undo2 size={16} /> Lift block
              </button>
            )
          ) : (
            <button className="btn btn-danger" onClick={() => setBlockOpen(true)}>
              <Ban size={16} /> Block reporter
            </button>
          )}
        </div>
      </div>

      {rep.blocked && (
        <div className="alert alert-danger">
          <Ban size={16} /> <strong>Blocked.</strong> {rep.blocked.message} {rep.blocked.reason && <span className="small">({rep.blocked.reason})</span>}
        </div>
      )}

      <div className="dossier-grid">
        <section className="card">
          <h3>Identity</h3>
          <dl className="forensics">
            <dt>Self-reported contact number</dt>
            <dd>
              <a href={`tel:${rep.phone}`}>
                <strong>+91 {rep.phone}</strong>
              </a>{' '}
              <span className="badge tone-warning">Unverified</span>
            </dd>
            <dt>Names used</dt>
            <dd>{rep.namesUsed.join(', ')}</dd>
            <dt>Residential locality</dt>
            <dd>{rep.localitiesUsed.join(', ') || '—'}</dd>
            <dt>Trust score</dt>
            <dd>
              <span className={cls('badge', rep.trust.score >= 80 ? 'tone-success' : rep.trust.score >= 50 ? 'tone-info' : rep.trust.score >= 25 ? 'tone-warning' : 'tone-danger')}>
                {rep.trust.label} · {rep.trust.score}/100
              </span>
            </dd>
            <dt>Reports</dt>
            <dd>
              {rep.stats.reports} total · {rep.stats.resolved} genuine & resolved · {rep.stats.rejected} rejected · {rep.stats.duplicates} duplicates ·{' '}
              <strong className={cls(rep.stats.spam > 0 && 'text-danger')}>{rep.stats.spam} fake</strong>
            </dd>
          </dl>
        </section>

        <section className="card">
          <h3>
            <Ban size={17} /> Strikes ({activeStrikes.length})
          </h3>
          {rep.strikes.length === 0 ? (
            <p className="muted small">No misuse strikes.</p>
          ) : (
            <ul className="strike-list">
              {rep.strikes.map((s: any) => (
                <li key={s.id} className={cls(s.revoked && 'revoked')}>
                  <div>
                    <strong>{s.ref}</strong> · {fmtDate(s.at)} · by {s.byName || 'official'}
                    {s.revoked && <span className="badge tone-neutral">revoked</span>}
                  </div>
                  <p className="small">{s.reason}</p>
                  {isAdmin && !s.revoked && (
                    <button className="link-btn small" onClick={() => revoke(s.id)}>
                      Revoke strike
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {d.linkedIdentities.length > 0 && (
          <section className="card card-alert">
            <h3>
              <Users size={17} /> Linked identities – same phone / browser
            </h3>
            <p className="small muted">Other contact numbers entered on a matching device or browser fingerprint. Shared devices and similar browsers can create false matches; this is a review signal, not proof of one person.</p>
            <table className="table table-compact table-stack">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Name</th>
                  <th className="num">Reports</th>
                  <th className="num">Strikes</th>
                </tr>
              </thead>
              <tbody>
                {d.linkedIdentities.map((l: any) => (
                  <tr key={l.id}>
                    <td data-label="Number">
                      <Link to={`/official/reporters/${l.id}`}>+91 {l.phone}</Link>
                    </td>
                    <td data-label="Name">{l.name}</td>
                    <td data-label="Reports" className="num">{l.reports}</td>
                    <td data-label="Strikes" className={cls('num', l.strikes > 0 && 'text-danger')}>{l.strikes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="card">
          <h3>
            <Smartphone size={17} /> Devices ({d.devices.length})
          </h3>
          {d.devices.map((dv: any) => (
            <div key={dv.deviceId} className="device-row">
              <div>
                <code>{dv.deviceId.slice(0, 13)}…</code> <span className="muted small">fingerprint {dv.fpHash ? dv.fpHash.slice(0, 10) : '—'}</span>
              </div>
              <div className="small">{dv.ua}</div>
              <div className="small muted">
                {dv.fp?.screen ? `screen ${dv.fp.screen} · ` : ''}first {fmtDate(dv.firstSeen, false)} · last {timeAgo(dv.lastSeen)}
                {dv.ips.length ? ` · IPs ${dv.ips.join(', ')}` : ''}
              </div>
              {dv.otherNumbers.length > 0 && <div className="small text-danger">Also used with: {dv.otherNumbers.map((p: string) => '+91 ' + p).join(', ')}</div>}
            </div>
          ))}
        </section>

        <section className="card">
          <h3>
            <Globe size={17} /> Networks (IP addresses)
          </h3>
          <table className="table table-compact table-stack">
            <thead>
              <tr>
                <th>IP</th>
                <th>First seen</th>
                <th>Last seen</th>
                <th className="num">Uses</th>
              </tr>
            </thead>
            <tbody>
              {d.ips.map((i: any) => (
                <tr key={i.ip}>
                  <td data-label="IP">
                    <code>{i.ip}</code>
                  </td>
                  <td data-label="First seen">{fmtDate(i.firstSeen, false)}</td>
                  <td data-label="Last seen">{timeAgo(i.lastSeen)}</td>
                  <td data-label="Uses" className="num">{i.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h3><Smartphone size={17} /> Contact entries (unverified)</h3>
          <table className="table table-compact table-stack">
            <thead>
              <tr>
                <th>When</th>
                <th>IP</th>
                <th>Device</th>
                <th>Name entered</th>
              </tr>
            </thead>
            <tbody>
              {d.contactClaims.slice(0, 15).map((o: any, i: number) => (
                <tr key={i}>
                  <td data-label="When">{fmtDate(o.at)}</td>
                  <td data-label="IP">
                    <code>{o.ip}</code>
                  </td>
                  <td data-label="Device">
                    <code>{o.deviceId?.slice(0, 8)}</code>
                  </td>
                  <td data-label="Name entered">{o.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card">
        <h3>
          <Fingerprint size={17} /> All reports by this person ({d.reports.length})
        </h3>
        <div className="table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Issue</th>
                <th>Ward</th>
                <th>Reported</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Reporter distance</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {d.reports.map((r: any) => (
                <tr key={r.ref}>
                  <td data-label="Reference">{r.inScope ? <Link to={`/official/reports/${r.ref}`}>{r.ref}</Link> : r.ref}</td>
                  <td data-label="Issue">
                    {r.category.emoji} {r.category.name}
                  </td>
                  <td data-label="Ward">{r.areaName}</td>
                  <td data-label="Reported">{fmtDate(r.createdAt)}</td>
                  <td data-label="Status">
                    <StatusBadge status={r.status} label={r.statusLabel} />
                  </td>
                  <td data-label="Risk">{r.risk ? <RiskBadge level={r.risk.level} score={r.risk.score} /> : <span className="muted small">outside your area</span>}</td>
                  <td data-label="Reporter distance">{r.inScope ? fmtDistance(r.distanceToIssueM) : '—'}</td>
                  <td data-label="IP">{r.ip ? <code>{r.ip}</code> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={blockOpen} title={`Block ${rep.name} (+91 ${rep.phone})`} onClose={() => setBlockOpen(false)}>
        <p className="small muted">A blocked contact number, device, fingerprint or network cannot submit reports. The reporter sees the reason and end date.</p>
        <Field label="Duration">
          <select className="input select" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            {isAdmin && <option value="365">1 year</option>}
            {isAdmin && <option value="-1">Permanent</option>}
          </select>
        </Field>
        <Field label="Reason" required hint="Visible to the reporter and in the evidence report.">
          <textarea className="input textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={includeDevices} onChange={(e) => setIncludeDevices(e.target.checked)} />
          <span>Also block all {d.devices.length} phone(s) / browser(s) used by this person (stops new SIM cards)</span>
        </label>
        <button className="btn btn-danger btn-block" onClick={block} disabled={busy || reason.trim().length < 5}>
          <Ban size={16} /> Block
        </button>
      </Modal>
    </div>
  );
}
