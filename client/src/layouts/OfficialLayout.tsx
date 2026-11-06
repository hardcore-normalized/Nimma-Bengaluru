// Admin portal shell. One administrator account sees every ward.
// Desktop: notebook-style sidebar. Phone: top bar + bottom tabs + slide-in menu.
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Ban, BrickWall, Gauge, KeyRound, ListChecks, LogOut, Map, MapPinned, Menu, PieChart, ScrollText, Settings, ShieldAlert, TriangleAlert, X } from 'lucide-react';
import { api } from '../lib/api';
import { pctText, type UsageStatus } from '../pages/official/admin/Usage';
import { useOfficial } from '../lib/store';
import { LogoMark, Spinner } from '../components/ui';
import { cls } from '../lib/format';

export default function OfficialLayout() {
  const { official, loading, logout } = useOfficial();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => setOpen(false), [loc.pathname]);

  // Free-plan limits: check now and every 5 minutes, show a banner when close.
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  useEffect(() => {
    if (!official) return;
    const check = () => api.get<UsageStatus>('/api/admin/usage').then(setUsage).catch(() => {});
    check();
    const id = setInterval(check, 5 * 60000);
    return () => clearInterval(id);
  }, [official]);

  if (loading) return <Spinner label="Loading admin portal…" />;
  if (!official) return <Navigate to={`/official/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (official.mustChangePassword && loc.pathname !== '/official/account') return <Navigate to="/official/account" replace />;

  const signOut = async () => {
    await logout();
    nav('/official/login');
  };
  const link = (to: string, icon: ReactNode, label: string, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => cls('side-link', isActive && 'active')}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );

  return (
    <div className="off-shell">
      <header className="off-top">
        <button className="icon-btn off-burger" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <Link to="/official" className="off-brand">
          <LogoMark size={36} />
          <div>
            <strong>Nimma Bengaluru</strong>
            <small>Admin portal · all 369 wards</small>
          </div>
        </Link>
        <div className="off-top-right">
          <div className="off-user">
            <div className="off-avatar" aria-hidden="true">
              {official.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div className="off-user-text">
              <strong>{official.name}</strong>
              <small>Administrator</small>
            </div>
          </div>
          <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={signOut}>
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className="off-body">
        <aside className={cls('off-side', open && 'open')} aria-label="Admin menu">
          <div className="side-group">Work</div>
          {link('/official', <Gauge size={18} />, 'Dashboard', true)}
          {link('/official/reports', <ListChecks size={18} />, 'Complaints')}
          {link('/official/map', <Map size={18} />, 'Map view')}
          {link('/official/admin/areas', <MapPinned size={18} />, 'Wards')}
          <div className="side-group">Stop misuse</div>
          {link('/official/admin/reporters', <ShieldAlert size={18} />, 'Watch-list')}
          {link('/official/admin/blocks', <Ban size={18} />, 'Blocklist')}
          {link('/official/admin/audit', <ScrollText size={18} />, 'Audit log')}
          {link('/official/admin/settings', <Settings size={18} />, 'Anti-misuse settings')}
          <div className="side-group">Free plan & security</div>
          {link('/official/admin/usage', <PieChart size={18} />, 'Free-tier usage')}
          {link('/official/admin/firewall', <BrickWall size={18} />, 'Firewall')}
          <div className="side-group">Account</div>
          {link('/official/account', <KeyRound size={18} />, 'Change password')}
          <button className="side-link side-signout" onClick={signOut}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </aside>
        {open && <div className="off-scrim" onClick={() => setOpen(false)} />}
        <main className="off-main">
          {usage && usage.level !== 'ok' && !loc.pathname.startsWith('/official/admin/usage') && (
            <Link to="/official/admin/usage" className={cls('alert alert-action free-tier-banner', usage.level === 'warning' ? 'alert-warning' : 'alert-danger')}>
              <TriangleAlert size={18} />
              <span>
                <strong>Running on a free plan:</strong>{' '}
                {usage.items
                  .filter((i) => i.applies && i.level !== 'ok')
                  .map((i) => `${i.label.toLowerCase()} at ${pctText(i.pct)}`)
                  .join(', ')}
                . {usage.uploadsPaused ? 'New reports are paused. ' : usage.videosPaused ? 'Video uploads are paused. ' : ''}Tap to see what can be done.
              </span>
            </Link>
          )}
          <Outlet />
        </main>
      </div>
      <nav className="off-tabbar" aria-label="Quick">
        <NavLink to="/official" end>
          <Gauge size={20} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/official/reports">
          <ListChecks size={20} />
          <span>Complaints</span>
        </NavLink>
        <NavLink to="/official/map">
          <Map size={20} />
          <span>Map</span>
        </NavLink>
        <button onClick={() => setOpen(true)} className={cls(open && 'active')}>
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
