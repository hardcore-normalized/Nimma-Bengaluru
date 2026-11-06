// Ward statistics: open and total reports for each of the 369 GBA wards.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, MapPinned, Search } from 'lucide-react';
import { api } from '../../../lib/api';
import { cls } from '../../../lib/format';
import { Empty, Spinner } from '../../../components/ui';

interface WardRow {
  code: string;
  name: string;
  corporation: string;
  zone: string;
  assembly: string;
  population: number;
  open: number;
  total: number;
}

export default function Areas() {
  const nav = useNavigate();
  const [data, setData] = useState<{ corporations: { key: string; name: string }[]; wards: WardRow[] } | null>(null);
  const [q, setQ] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [corp, setCorp] = useState('');
  useEffect(() => {
    api.get('/api/admin/areas').then(setData);
  }, []);
  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.wards
      .filter((w) => (!corp || w.corporation === corp) && (!onlyOpen || w.open > 0) && (!needle || `${w.name} ${w.code} ${w.zone} ${w.assembly}`.toLowerCase().includes(needle)))
      .sort((a, b) => b.open - a.open || b.total - a.total || a.code.localeCompare(b.code));
  }, [data, q, onlyOpen, corp]);
  if (!data) return <Spinner />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Wards</h1>
          <p className="muted small">GBA 2025 delimitation – {data.wards.length} wards in 5 city corporations. Tap a ward to see its open complaints.</p>
        </div>
      </div>
      <div className="stat-grid">
        {data.corporations.map((c) => {
          const ws = data.wards.filter((w) => w.corporation === c.key);
          return (
            <button key={c.key} className={cls('stat-tile', corp === c.key && 'stat-accent')} onClick={() => setCorp(corp === c.key ? '' : c.key)}>
              <span className="stat-label">{c.key} corporation</span>
              <strong className="stat-value">{ws.reduce((a, w) => a + w.open, 0)}</strong>
              <span className="stat-hint">
                open · {ws.length} wards · {ws.reduce((a, w) => a + w.total, 0)} total
              </span>
            </button>
          );
        })}
      </div>
      <div className="filter-bar card">
        <div className="search-input grow">
          <Search size={15} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ward, code, zone or constituency" />
        </div>
        <label className="check">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          <span>Only wards with open reports</span>
        </label>
      </div>
      {rows.length === 0 ? (
        <Empty icon={<MapPinned size={28} />} title="No wards match" />
      ) : (
        <div className="card ward-list">
          {rows.slice(0, 400).map((w) => (
            <button key={w.code} className="ward-row" onClick={() => nav(`/official/reports?area=${w.code}&status=${w.open ? 'open' : 'all'}`)}>
              <code className="ward-code">{w.code}</code>
              <span className="ward-main">
                <strong>{w.name}</strong>
                <small className="muted">
                  {w.zone} zone · {w.corporation} · {w.assembly}
                </small>
              </span>
              <span className="ward-count">
                <strong>{w.open}</strong>
                <small>open</small>
              </span>
              <span className="ward-count muted">
                <strong>{w.total}</strong>
                <small>total</small>
              </span>
              <ChevronRight size={16} className="muted" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
