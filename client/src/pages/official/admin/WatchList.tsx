// Citizens with misuse strikes / blocks.
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Search, ShieldAlert } from 'lucide-react';
import { api } from '../../../lib/api';
import { cls, fmtDate, timeAgo } from '../../../lib/format';
import { Empty, Spinner } from '../../../components/ui';

export default function WatchList() {
  const [filter, setFilter] = useState<'flagged' | 'blocked' | 'all'>('flagged');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    setD(null);
    api.get(`/api/admin/reporters?filter=${filter}${query ? '&q=' + encodeURIComponent(query) : ''}`).then(setD);
  }, [filter, query]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setQuery(q.trim());
  };
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            <ShieldAlert size={24} /> Misuse watch-list
          </h1>
          <p className="muted small">Citizens with fake-report strikes, repeated rejections or active blocks. Open a profile for the full evidence.</p>
        </div>
      </div>
      <div className="filter-bar card">
        <div className="seg">
          {(['flagged', 'blocked', 'all'] as const).map((f) => (
            <button key={f} className={cls(filter === f && 'on')} onClick={() => setFilter(f)}>
              {f === 'flagged' ? 'Flagged' : f === 'blocked' ? 'Blocked' : 'All citizens'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="search-input grow">
          <Search size={15} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or mobile number" />
        </form>
      </div>
      {!d ? (
        <Spinner />
      ) : d.items.length === 0 ? (
        <Empty title="Nobody here" />
      ) : (
        <div className="card table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Citizen</th>
                <th>Mobile</th>
                <th className="num">Reports</th>
                <th className="num">Fake</th>
                <th className="num">Strikes</th>
                <th>Trust</th>
                <th>Devices</th>
                <th>Status</th>
                <th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((r: any) => (
                <tr key={r.id}>
                  <td data-label="Citizen">
                    <Link to={`/official/reporters/${r.id}`}>
                      <strong>{r.name}</strong>
                    </Link>
                    <div className="small muted">{r.locality}</div>
                  </td>
                  <td data-label="Mobile">
                    <code>+91 {r.phone}</code>
                  </td>
                  <td data-label="Reports" className="num">{r.stats?.reports || 0}</td>
                  <td data-label="Fake" className="num">{r.stats?.spam || 0}</td>
                  <td data-label="Strikes" className={cls('num', r.strikes > 0 && 'text-danger')}>
                    <strong>{r.strikes}</strong>
                  </td>
                  <td data-label="Trust">
                    <span className={cls('badge', r.trust.score >= 80 ? 'tone-success' : r.trust.score >= 50 ? 'tone-info' : r.trust.score >= 25 ? 'tone-warning' : 'tone-danger')}>
                      {r.trust.label} {r.trust.score}
                    </span>
                  </td>
                  <td data-label="Devices" className="num">{r.devices}</td>
                  <td data-label="Status">{r.blocked ? <span className="badge tone-danger">Blocked{r.blocked.until ? ' till ' + fmtDate(r.blocked.until, false) : ' (permanent)'}</span> : <span className="badge tone-neutral">Active</span>}</td>
                  <td data-label="Last active" className="small">{timeAgo(r.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
