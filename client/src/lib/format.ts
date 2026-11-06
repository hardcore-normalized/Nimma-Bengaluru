const IST = 'Asia/Kolkata';

export function fmtDate(d?: string | number | Date | null, withTime = true) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export function timeAgo(d?: string | number | Date | null) {
  if (!d) return '';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  return fmtDate(d, false);
}

export function dueLabel(d?: string | null) {
  if (!d) return '';
  const ms = new Date(d).getTime() - Date.now();
  const days = Math.round(ms / 86400000);
  if (ms < 0) return days === 0 ? 'Overdue today' : `Overdue by ${Math.abs(days)} day${Math.abs(days) > 1 ? 's' : ''}`;
  if (days === 0) return 'Due today';
  return `Due in ${days} day${days > 1 ? 's' : ''}`;
}

export function fmtDistance(m?: number | null) {
  if (m == null || !Number.isFinite(m)) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function fmtBytes(n?: number) {
  if (!n) return '';
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}
