// Printable misuse evidence report (use the browser's "Save as PDF").
import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { Printer } from 'lucide-react';
import { api, mediaUrl } from '../../lib/api';
import { useOfficial } from '../../lib/store';
import { fmtDate, fmtDistance } from '../../lib/format';
import { Spinner } from '../../components/ui';

export default function Evidence() {
  const { id } = useParams();
  const { official, loading } = useOfficial();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!official) return;
    api
      .get(`/api/official/reporters/${id}?purpose=evidence`)
      .then(setD)
      .catch((e) => setError(e.message));
  }, [id, official]);

  if (loading) return <Spinner />;
  if (!official) return <Navigate to={`/official/login?next=/official/reporters/${id}/evidence`} replace />;
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!d) return <Spinner label="Preparing evidence report…" />;
  const rep = d.reporter;
  const fake = d.reports.filter((r: any) => r.status === 'SPAM');

  return (
    <div className="evidence-doc">
      <div className="no-print evidence-toolbar">
        <button className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print / Save as PDF
        </button>
      </div>
      <header className="ev-head">
        <div>
          <h1>Reporter Activity & Evidence Report</h1>
          <p>Nimma Bengaluru – Citizen Civic Issue Portal (academic prototype)</p>
        </div>
        <div className="ev-meta">
          <div>
            <b>Generated:</b> {fmtDate(d.generatedAt)}
          </div>
          <div>
            <b>By:</b> {d.generatedBy.name}, {d.generatedBy.designation}
          </div>
          <div>
            <b>Record ID:</b> {rep.id}
          </div>
        </div>
      </header>

      <h2>1. Contact details supplied (unverified)</h2>
      <table className="ev-table">
        <tbody>
          <tr>
            <th>Contact number (unverified)</th>
            <td>
              <b>+91 {rep.phone}</b> (entered by the reporter; no SMS verification was used)
            </td>
          </tr>
          <tr>
            <th>Name(s) given</th>
            <td>{rep.namesUsed.join(', ')}</td>
          </tr>
          <tr>
            <th>Residential locality given</th>
            <td>{rep.localitiesUsed.join(', ') || '—'}</td>
          </tr>
          <tr>
            <th>First / last activity</th>
            <td>
              {fmtDate(rep.firstSeenAt)} / {fmtDate(rep.lastSeenAt)}
            </td>
          </tr>
          <tr>
            <th>Record summary</th>
            <td>
              {rep.stats.reports} reports · {rep.stats.spam} marked fake/misuse · {rep.stats.rejected} rejected · {rep.stats.resolved} genuine
            </td>
          </tr>
          <tr>
            <th>Current status</th>
            <td>{rep.blocked ? `BLOCKED – ${rep.blocked.message}` : 'Not blocked'}</td>
          </tr>
        </tbody>
      </table>

      <h2>2. Reports marked as fake / misuse ({fake.length})</h2>
      {fake.length === 0 && <p>None.</p>}
      {fake.map((r: any) => (
        <div key={r.ref} className="ev-report">
          <h3>
            {r.ref} – {r.category.name} – {r.areaName}
          </h3>
          <table className="ev-table">
            <tbody>
              <tr>
                <th>Submitted</th>
                <td>{fmtDate(r.createdAt)}</td>
              </tr>
              {r.inScope ? (
                <>
                  <tr>
                    <th>Description given</th>
                    <td>“{r.description}”</td>
                  </tr>
                  <tr>
                    <th>Official finding</th>
                    <td>
                      {r.spam?.reason} {r.spam?.byName ? `(${r.spam.byName}, ${fmtDate(r.spam.at)})` : ''}
                    </td>
                  </tr>
                  <tr>
                    <th>Reported location</th>
                    <td>
                      {r.location.lat.toFixed(6)}, {r.location.lng.toFixed(6)}
                    </td>
                  </tr>
                  <tr>
                    <th>Reporter’s GPS at submission</th>
                    <td>
                      {r.deviceLocation ? `${r.deviceLocation.lat.toFixed(6)}, ${r.deviceLocation.lng.toFixed(6)} (±${Math.round(r.deviceLocation.accuracy || 0)} m)` : 'not shared'} – {fmtDistance(r.distanceToIssueM)} from the reported spot
                    </td>
                  </tr>
                  <tr>
                    <th>Network / device</th>
                    <td>
                      IP {r.ip} · device {r.deviceId?.slice(0, 13)}… · {r.ua}
                    </td>
                  </tr>
                  <tr>
                    <th>Automatic misuse signals</th>
                    <td>{r.risk?.signals?.length ? r.risk.signals.map((s: any) => s.label).join('; ') : 'none'}</td>
                  </tr>
                  <tr>
                    <th>Photo fingerprints (SHA-256)</th>
                    <td className="ev-mono">{r.media.map((m: any) => m.sha256?.slice(0, 32)).join(', ')}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <th>Details</th>
                  <td>Outside the signing official’s area – available to the administrator.</td>
                </tr>
              )}
            </tbody>
          </table>
          {r.inScope && (
            <div className="ev-photos">
              {r.media
                .filter((m: any) => m.kind === 'image')
                .map((m: any) => (
                  <img key={m.id} src={mediaUrl(m.id)} alt="Evidence" />
                ))}
            </div>
          )}
        </div>
      ))}

      <h2>3. Devices and networks used</h2>
      <table className="ev-table">
        <thead>
          <tr>
            <th>Device ID</th>
            <th>Browser / phone</th>
            <th>Other numbers on this device</th>
          </tr>
        </thead>
        <tbody>
          {d.devices.map((dv: any) => (
            <tr key={dv.deviceId}>
              <td className="ev-mono">{dv.deviceId}</td>
              <td>{dv.ua}</td>
              <td>{dv.otherNumbers.length ? dv.otherNumbers.map((p: string) => '+91 ' + p).join(', ') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <b>IP addresses:</b> {d.ips.map((i: any) => `${i.ip} (${i.count}×, last ${fmtDate(i.lastSeen, false)})`).join('; ') || '—'}
      </p>
      {d.linkedIdentities.length > 0 && (
        <p>
          <b>Linked identities (same phone/browser):</b> {d.linkedIdentities.map((l: any) => `+91 ${l.phone} (${l.name}, ${l.strikes} strikes)`).join('; ')}
        </p>
      )}

      <h2>4. Contact entries (unverified)</h2>
      <table className="ev-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>IP</th>
            <th>Device</th>
            <th>Name entered</th>
          </tr>
        </thead>
        <tbody>
          {d.contactClaims.map((o: any, i: number) => (
            <tr key={i}>
              <td>{fmtDate(o.at)}</td>
              <td>{o.ip}</td>
              <td className="ev-mono">{o.deviceId?.slice(0, 13)}</td>
              <td>{o.name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>5. Review history and access restrictions</h2>
      <ul>
        {rep.strikes.map((s: any) => (
          <li key={s.id}>
            {fmtDate(s.at)} – strike for {s.ref} by {s.byName}: {s.reason} {s.revoked ? '(revoked)' : ''}
          </li>
        ))}
        {d.blocks.map((b: any, i: number) => (
          <li key={'b' + i}>
            {fmtDate(b.at)} – {b.auto ? 'automatic' : 'manual'} block on {b.type} {b.value} until {b.until ? fmtDate(b.until, false) : 'permanent'}: {b.reason} {b.active ? '' : '(lifted)'}
          </li>
        ))}
      </ul>

      <h2>6. Review safeguards</h2>
      <ul>
        {d.legal.map((l: string, i: number) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <p className="ev-note">
        This report contains system records for authorised review. Signals may be inaccurate or shared and are not proof of a person’s identity, intent or guilt. Timestamps are in Indian Standard Time. Every access to this report is recorded in the audit log.
      </p>
      <div className="ev-sign">
        <div>
          <span>Signature of officer</span>
        </div>
        <div>
          <span>Name, designation & seal</span>
        </div>
        <div>
          <span>Date</span>
        </div>
      </div>
    </div>
  );
}
