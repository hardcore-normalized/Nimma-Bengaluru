import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Inbox, Search, SlidersHorizontal } from 'lucide-react';
import { api } from '../../lib/api';
import { useOfficial } from '../../lib/store';
import { cls } from '../../lib/format';
import { Empty, Spinner } from '../../components/ui';
import { ReportRow } from './Dashboard';

const TABS: [string, string][] = [
  ['open', 'Open'],
  ['SUBMITTED,RESUBMITTED', 'New'],
  ['UNDER_REVIEW,NEEDS_CORRECTION', 'In review'],
  ['ASSIGNED,IN_PROGRESS,AWAITING_VERIFICATION,REOPENED', 'In progress'],
  ['RESOLVED', 'Resolved'],
  ['closed', 'Closed'],
  ['SPAM', 'Misuse'],
  ['all', 'All'],
];

export default function Reports() {
  const { meta } = useOfficial();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{ items: any[]; total: number; page: number; pages: number } | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState(params.get('q') || '');
  // On phones the extra filters fold away so the list is visible straight away.
  const [showFilters, setShowFilters] = useState(() => window.innerWidth >= 640);
  const activeFilters = ['category', 'area', 'risk', 'flag'].filter((k) => params.get(k)).length + (params.get('sort') && params.get('sort') !== 'new' ? 1 : 0);
  const status = params.get('status') || 'open';

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k !== 'page') p.delete('page');
    setParams(p);
  };

  useEffect(() => {
    const p = new URLSearchParams(params);
    if (!p.get('status')) p.set('status', 'open');
    setData((d) => (d ? { ...d } : null));
    api
      .get(`/api/official/reports?${p.toString()}`)
      .then((r) => {
        setData(r);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [params]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    set('q', q.trim());
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Complaints</h1>
          <p className="muted small">{data ? `${data.total} report${data.total === 1 ? '' : 's'}` : ' '}</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([v, label]) => (
          <button key={v} role="tab" aria-selected={status === v} className={cls('tab', status === v && 'on')} onClick={() => set('status', v)}>
            {label}
          </button>
        ))}
      </div>
      <div className="filter-bar card">
        <form onSubmit={search} className="search-input grow">
          <Search size={16} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, place, description or reporter name" />
        </form>
        <button type="button" className="btn btn-ghost filter-toggle" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
          <SlidersHorizontal size={16} /> Filters{activeFilters ? ` (${activeFilters})` : ''}
        </button>
        {showFilters && (
          <>
        <select className="input select" value={params.get('category') || ''} onChange={(e) => set('category', e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {meta?.categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        <select className="input select" value={params.get('area') || ''} onChange={(e) => set('area', e.target.value)} aria-label="Ward">
          <option value="">All wards</option>
          {meta?.wards.map((w) => (
            <option key={w.code} value={w.code}>
              {w.name} ({w.code})
            </option>
          ))}
        </select>
        <select className="input select" value={params.get('risk') || ''} onChange={(e) => set('risk', e.target.value)} aria-label="Misuse risk">
          <option value="">Any risk</option>
          <option value="high">High risk</option>
          <option value="medium">Medium risk</option>
          <option value="low">Low risk</option>
        </select>
        <select className="input select" value={params.get('flag') || ''} onChange={(e) => set('flag', e.target.value)} aria-label="Flags">
          <option value="">No flag filter</option>
          <option value="overdue">Overdue</option>
          <option value="hazard">Safety hazard</option>
          <option value="duplicate">Possible duplicate</option>
          {(meta?.me.role === 'admin' || meta?.me.canViewSensitive) && <option value="sensitive">Confidential</option>}
        </select>
        <select className="input select" value={params.get('sort') || 'new'} onChange={(e) => set('sort', e.target.value)} aria-label="Sort">
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="risk">Highest misuse risk</option>
          <option value="sla">Target date</option>
          <option value="support">Most supported</option>
        </select>
          </>
        )}
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Empty icon={<Inbox size={28} />} title="No reports here">
          Nothing matches these filters in your assigned wards.
        </Empty>
      ) : (
        <>
          <div className="card report-list">
            {data.items.map((r) => (
              <ReportRow key={r.ref} r={r} />
            ))}
          </div>
          {data.pages > 1 && (
            <div className="pager">
              <button className="btn btn-ghost btn-sm" disabled={data.page <= 1} onClick={() => set('page', String(data.page - 1))}>
                <ChevronLeft size={15} /> Previous
              </button>
              <span className="muted small">
                Page {data.page} of {data.pages}
              </span>
              <button className="btn btn-ghost btn-sm" disabled={data.page >= data.pages} onClick={() => set('page', String(data.page + 1))}>
                Next <ChevronRight size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
