import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import { api, mediaUrl } from '../../lib/api';
import { useOfficial } from '../../lib/store';
import { dueLabel, timeAgo } from '../../lib/format';
import { BarList, StatTile, TrendChart, type TrendPoint } from '../../components/Charts';
import { RiskBadge, Spinner, StatusBadge } from '../../components/ui';

interface ListRow {
  ref: string;
  category: { code: string; name: string; emoji: string };
  status: string;
  statusLabel: string;
  createdAt: string;
  areaName: string;
  risk: { score: number; level: string };
  thumb: string | null;
  overdue: boolean;
  slaDueAt: string;
  hazard: boolean;
  severity: string;
}
interface Dash {
  scope: string;
  kpis: Record<string, number | null>;
  byCategory: { code: string; name: string; emoji: string; n: number }[];
  trend: TrendPoint[];
  byWard: { code: string; name: string; total: number; open: number }[];
  recent: ListRow[];
}

export function ReportRow({ r }: { r: ListRow }) {
  return (
    <Link to={`/official/reports/${r.ref}`} className="report-row">
      {r.thumb ? <img src={mediaUrl(r.thumb)} alt="" className="rr-thumb" loading="lazy" /> : <span className="rr-thumb rr-emoji">{r.category.emoji}</span>}
      <div className="rr-main">
        <div className="rr-title">
          <strong>
            {r.category.emoji} {r.category.name}
          </strong>
          {r.hazard && (
            <span className="badge tone-danger">
              <AlertTriangle size={11} /> Hazard
            </span>
          )}
        </div>
        <small className="muted">
          {r.ref} · {r.areaName} · {timeAgo(r.createdAt)}
        </small>
      </div>
      <div className="rr-badges">
        <StatusBadge status={r.status} label={r.statusLabel} />
        {r.risk.level !== 'low' && <RiskBadge level={r.risk.level} score={r.risk.score} />}
        {r.overdue && <span className="badge tone-danger">{dueLabel(r.slaDueAt)}</span>}
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { official } = useOfficial();
  const nav = useNavigate();
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<Dash>('/api/official/dashboard').then(setD).catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!d) return <Spinner label="Loading dashboard…" />;
  const k = d.kpis;
  const go = (q: string) => nav(`/official/reports?${q}`);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="dash">
      <div className="page-head">
        <div>
          <h1>
            {greet}, Admin
          </h1>
          <p className="muted small">Scope: {d.scope}</p>
        </div>
        <Link to="/official/reports?status=open" className="btn btn-primary">
          Open queue <ArrowRight size={16} />
        </Link>
      </div>

      {(k.highRisk || 0) > 0 && (
        <button className="alert alert-danger alert-action" onClick={() => go('risk=high&status=SUBMITTED,UNDER_REVIEW,RESUBMITTED&sort=risk')}>
          <ShieldAlert size={18} />
          <span>
            <strong>{k.highRisk} new report(s) flagged as possible misuse.</strong> Verify them before sending anyone to the site.
          </span>
          <ArrowRight size={16} />
        </button>
      )}

      <div className="stat-grid">
        <StatTile label="New – waiting for review" value={k.newReports ?? 0} tone="accent" onClick={() => go('status=SUBMITTED,RESUBMITTED')} />
        <StatTile label="Under review" value={k.underReview ?? 0} onClick={() => go('status=UNDER_REVIEW,NEEDS_CORRECTION')} />
        <StatTile label="Work in progress" value={k.inProgress ?? 0} onClick={() => go('status=ASSIGNED,IN_PROGRESS,AWAITING_VERIFICATION,REOPENED')} />
        <StatTile label="Overdue (past target date)" value={k.overdue ?? 0} tone={(k.overdue || 0) > 0 ? 'danger' : undefined} onClick={() => go('flag=overdue&sort=sla')} />
        <StatTile label="Open safety hazards" value={k.hazards ?? 0} tone={(k.hazards || 0) > 0 ? 'warning' : undefined} onClick={() => go('flag=hazard&status=open')} />
        <StatTile label="Resolved" value={k.resolved ?? 0} tone="success" hint={k.avgResolutionDays != null ? `avg ${k.avgResolutionDays} days to resolve` : undefined} onClick={() => go('status=RESOLVED')} />
        <StatTile label="Fake / misuse caught" value={k.spam ?? 0} onClick={() => go('status=SPAM')} />
        <StatTile label="Total in scope" value={k.total ?? 0} onClick={() => go('status=all')} />
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="card-title">
            <h3>Reports per day</h3>
            <span className="muted small">last 14 days</span>
          </div>
          <TrendChart data={d.trend} />
        </section>
        <section className="card">
          <div className="card-title">
            <h3>Top issue types</h3>
            <span className="muted small">all reports in scope</span>
          </div>
          {d.byCategory.length ? (
            <BarList items={d.byCategory.map((c) => ({ key: c.code, label: c.name, value: c.n, icon: c.emoji, onClick: () => go(`category=${c.code}&status=all`) }))} />
          ) : (
            <p className="muted">No reports yet.</p>
          )}
        </section>
        <section className="card">
          <div className="card-title">
            <h3>Wards needing attention</h3>
            <span className="muted small">most open reports</span>
          </div>
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Ward</th>
                <th className="num">Open</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.byWard.map((w) => (
                <tr key={w.code} className="clickable" onClick={() => go(`area=${w.code}&status=open`)}>
                  <td>
                    {w.name} <span className="muted small">{w.code}</span>
                  </td>
                  <td className="num">
                    <strong>{w.open}</strong>
                  </td>
                  <td className="num">{w.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card dash-recent">
          <div className="card-title">
            <h3>Latest reports</h3>
            <Link to="/official/reports" className="small">
              View all
            </Link>
          </div>
          <div className="report-list">
            {d.recent.map((r) => (
              <ReportRow key={r.ref} r={r} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
