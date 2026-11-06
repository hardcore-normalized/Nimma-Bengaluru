import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { useOfficial } from '../../lib/store';
import { cls } from '../../lib/format';
import MapView, { type MapMarker } from '../../components/MapView';
import { STATUS_COLOR, Spinner } from '../../components/ui';

interface Pt {
  ref: string;
  category: string;
  status: string;
  lat: number;
  lng: number;
  areaName: string;
  risk: string;
  hazard: boolean;
  overdue: boolean;
  createdAt: string;
}

export default function OfficialMap() {
  const { meta } = useOfficial();
  const nav = useNavigate();
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const [colorBy, setColorBy] = useState<'status' | 'risk'>('status');
  const [items, setItems] = useState<Pt[] | null>(null);
  const [geo, setGeo] = useState<any>(null);

  useEffect(() => {
    setItems(null);
    api.get(`/api/official/map?status=${status}`).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [status]);
  useEffect(() => {
    api.get('/api/official/wards-geo').then(setGeo).catch(() => {});
  }, []);

  const cats = useMemo(() => Object.fromEntries((meta?.categories || []).map((c) => [c.code, c])), [meta]);
  const markers: MapMarker[] = useMemo(
    () =>
      (items || []).map((p) => ({
        id: p.ref,
        lat: p.lat,
        lng: p.lng,
        emoji: cats[p.category]?.emoji || '•',
        color: colorBy === 'risk' ? (p.risk === 'high' ? '#ef4444' : p.risk === 'medium' ? '#f59e0b' : '#22c55e') : STATUS_COLOR[p.status],
        ring: p.hazard || p.overdue,
        onClick: () => nav(`/official/reports/${p.ref}`),
      })),
    [items, cats, colorBy, nav]
  );

  const center: [number, number] = meta?.wards?.[0] ? [meta.wards[0].center[0], meta.wards[0].center[1]] : [12.9716, 77.5946];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Map view</h1>
          <p className="muted small">Your assigned wards are outlined. Tap a pin to open the report. Ringed pins are hazards or overdue.</p>
        </div>
      </div>
      <div className="filter-bar card">
        <div className="seg">
          <button className={cls(status === 'open' && 'on')} onClick={() => setStatus('open')}>
            Open only
          </button>
          <button className={cls(status === 'all' && 'on')} onClick={() => setStatus('all')}>
            All
          </button>
        </div>
        <div className="seg">
          <button className={cls(colorBy === 'status' && 'on')} onClick={() => setColorBy('status')}>
            Colour by status
          </button>
          <button className={cls(colorBy === 'risk' && 'on')} onClick={() => setColorBy('risk')}>
            Colour by misuse risk
          </button>
        </div>
        <span className="muted small">{items ? `${items.length} reports` : ''}</span>
      </div>
      <div className="card map-card">
        {!items && <Spinner />}
        <MapView className="map-big" center={center} zoom={12} markers={markers} geojson={geo} fit="geojson" />
        <div className="legend">
          {colorBy === 'status'
            ? ['SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'RESOLVED', 'REOPENED', 'SPAM'].map((s) => (
                <span key={s}>
                  <i style={{ background: STATUS_COLOR[s] }} /> {meta?.statuses[s]?.label || s}
                </span>
              ))
            : [
                ['#22c55e', 'Low risk'],
                ['#f59e0b', 'Medium risk'],
                ['#ef4444', 'High risk'],
              ].map(([c, l]) => (
                <span key={l}>
                  <i style={{ background: c }} /> {l}
                </span>
              ))}
        </div>
      </div>
    </div>
  );
}
