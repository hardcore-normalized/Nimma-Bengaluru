import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, ScrollText, Search } from 'lucide-react';
import { api } from '../../../lib/api';
import { cls, fmtDate } from '../../../lib/format';
import { Spinner } from '../../../components/ui';

const DANGER = new Set(['ACCESS_DENIED', 'LOGIN_FAILED', 'BLOCKED_USER_ATTEMPT', 'BOT_TRAP_TRIGGERED', 'MARKED_SPAM', 'REPORTER_BLOCKED', 'REPORTER_AUTO_BLOCKED', 'DUPLICATE_MEDIA_REJECTED', 'HIGH_RISK_REPORT', 'REPORT_REJECTED_DISTANCE']);
const SENSITIVE = new Set(['CONTACT_REVEALED', 'DOSSIER_VIEWED', 'EVIDENCE_EXPORTED', 'OFFICIAL_CREATED', 'OFFICIAL_UPDATED', 'OFFICIAL_PASSWORD_RESET', 'SETTINGS_UPDATED', 'BLOCK_ADDED', 'BLOCK_REMOVED', 'REPORTER_UNBLOCKED', 'SPAM_REVERSED', 'STRIKE_REVOKED']);

export default function Audit() {
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    setD((x: any) => x);
    api.get(`/api/admin/audit?page=${page}${action ? '&action=' + action : ''}${query ? '&q=' + encodeURIComponent(query) : ''}`).then(setD);
  }, [action, query, page]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(q.trim());
  };
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            <ScrollText size={24} /> Audit log
          </h1>
          <p className="muted small">Every privileged action: sign-ins, report views, contact reveals, status changes, blocks, access denials and settings changes.</p>
        </div>
      </div>
      <div className="filter-bar card">
        <select
          className="input select"
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
        >
          <option value="">All actions</option>
          {(d?.actions || []).map((a: string) => (
            <option key={a} value={a}>
              {a.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </select>
        <form onSubmit={submit} className="search-input grow">
          <Search size={15} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, official, IP" />
        </form>
      </div>
      {!d ? (
        <Spinner />
      ) : (
        <>
          <div className="card table-wrap">
            <table className="table table-compact table-stack">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((a: any) => (
                  <tr key={a.id}>
                    <td data-label="When" className="small nowrap">{fmtDate(a.at)}</td>
                    <td data-label="Who" className="small">
                      {a.actorName}
                      <div className="muted">{a.actorRole}</div>
                    </td>
                    <td data-label="Action">
                      <span className={cls('badge', DANGER.has(a.action) ? 'tone-danger' : SENSITIVE.has(a.action) ? 'tone-warning' : 'tone-neutral')}>{a.action.replace(/_/g, ' ').toLowerCase()}</span>
                    </td>
                    <td data-label="Target" className="small">
                      {a.targetRef ? <Link to={`/official/reports/${a.targetRef}`}>{a.targetRef}</Link> : a.targetType ? `${a.targetType} ${a.targetId ? String(a.targetId).slice(0, 12) : ''}` : '—'}
                    </td>
                    <td data-label="Details" className="small details-cell">{a.details ? Object.entries(a.details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : ''}</td>
                    <td data-label="IP" className="small">
                      <code>{a.ip || '—'}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={15} /> Newer
            </button>
            <span className="muted small">
              Page {d.page} of {Math.max(1, d.pages)} · {d.total} entries
            </span>
            <button className="btn btn-ghost btn-sm" disabled={page >= d.pages} onClick={() => setPage(page + 1)}>
              Older <ChevronRight size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
