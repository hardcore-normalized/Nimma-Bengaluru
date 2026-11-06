// Dashboard charts (plain SVG). Colours come from CSS tokens (--series-1/2, --grid …)
// Uses neutral series colours for the monochrome interface.
import { useEffect, useMemo, useRef, useState } from 'react';
import { cls } from '../lib/format';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  created: number;
  resolved: number;
}

const SERIES = [
  { key: 'created' as const, label: 'Reported', color: 'var(--series-1)' },
  { key: 'resolved' as const, label: 'Resolved', color: 'var(--series-2)' },
];

const dayLabel = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const H = 220;
  const pad = { l: 34, r: 74, t: 12, b: 28 };
  const iw = width - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.created, d.resolved])));
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max].filter((v) => Number.isInteger(v));
  const x = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const path = (k: 'created' | 'resolved') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(' ');
  const every = width < 420 ? 4 : width < 640 ? 3 : 2;
  const last = data.length - 1;
  const endGap = last >= 0 ? Math.abs(y(data[last].created) - y(data[last].resolved)) : 99;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * iw;
    const i = Math.round((px / iw) * (data.length - 1));
    setHover(Math.max(0, Math.min(last, i)));
  };

  return (
    <div className="chart" ref={wrap}>
      <div className="chart-head">
        <div className="legend-row">
          {SERIES.map((s) => (
            <span key={s.key} className="legend-key">
              <i className="key-line" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
        <button className="link-btn small" onClick={() => setTable(!table)}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {table ? (
        <table className="table table-compact">
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">Reported</th>
              <th className="num">Resolved</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <td>{dayLabel(d.date)}</td>
                <td className="num">{d.created}</td>
                <td className="num">{d.resolved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-stage">
          <svg width={width} height={H} role="img" aria-label="Reports created and resolved per day, last 14 days">
            {ticks.map((tv) => (
              <g key={tv}>
                <line x1={pad.l} x2={pad.l + iw} y1={y(tv)} y2={y(tv)} className={tv === 0 ? 'axis-line' : 'grid-line'} />
                <text x={pad.l - 8} y={y(tv) + 4} textAnchor="end" className="tick">
                  {tv}
                </text>
              </g>
            ))}
            {data.map((d, i) =>
              (i % every === 0 && last - i >= every) || i === last ? (
                <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" className="tick">
                  {dayLabel(d.date)}
                </text>
              ) : null
            )}
            {SERIES.map((s) => (
              <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {last >= 0 &&
              SERIES.map((s, si) => {
                const v = data[last][s.key];
                // direct end labels only when they do not collide
                const show = endGap >= 14 || si === 0;
                return (
                  <g key={s.key}>
                    <circle cx={x(last)} cy={y(v)} r={4} fill={s.color} stroke="var(--chart-surface)" strokeWidth={2} />
                    {show && (
                      <text x={x(last) + 9} y={y(v) + 4} className="end-label">
                        {endGap >= 14 ? `${s.label} ${v}` : `${data[last].created} / ${data[last].resolved}`}
                      </text>
                    )}
                  </g>
                );
              })}
            {hover != null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="crosshair" />
                {SERIES.map((s) => (
                  <circle key={s.key} cx={x(hover)} cy={y(data[hover][s.key])} r={4.5} fill={s.color} stroke="var(--chart-surface)" strokeWidth={2} />
                ))}
              </g>
            )}
            <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
          {hover != null && (
            <div className="chart-tip" style={{ left: Math.min(width - 150, Math.max(0, x(hover) + 12)), top: 8 }}>
              <div className="tip-title">{dayLabel(data[hover].date)}</div>
              {SERIES.map((s) => (
                <div key={s.key} className="tip-row">
                  <i className="key-line" style={{ background: s.color }} />
                  <strong>{data[hover][s.key]}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface BarItem {
  key: string;
  label: string;
  value: number;
  icon?: string;
  onClick?: () => void;
}

/** Horizontal bars for one measure (single series → no legend; values at the tips). */
export function BarList({ items, unit = '' }: { items: BarItem[]; unit?: string }) {
  const max = useMemo(() => Math.max(1, ...items.map((i) => i.value)), [items]);
  return (
    <ul className="bar-list">
      {items.map((it) => (
        <li key={it.key} className={cls(it.onClick && 'clickable')} onClick={it.onClick} title={`${it.label}: ${it.value}${unit}`}>
          <span className="bar-label">
            {it.icon && <span className="bar-icon">{it.icon}</span>}
            {it.label}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} />
            <span className="bar-value">
              {it.value}
              {unit}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StatTile({ label, value, tone, hint, onClick }: { label: string; value: string | number; tone?: 'danger' | 'warning' | 'success' | 'accent'; hint?: string; onClick?: () => void }) {
  return (
    <button type="button" className={cls('stat-tile', tone && `stat-${tone}`, !onClick && 'static')} onClick={onClick} disabled={!onClick}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </button>
  );
}
