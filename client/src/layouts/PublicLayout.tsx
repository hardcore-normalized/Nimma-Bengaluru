// Citizen-facing shell (crayon theme). Phone: compact header + bottom tab bar
// with a big "report" button. Desktop: header navigation.
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { AlertTriangle, Camera, Home, Info, Search, ShieldCheck, User } from 'lucide-react';
import { useLang } from '../lib/i18n';
import { useConfig } from '../lib/store';
import { LogoMark } from '../components/CrayonArt';
import { cls } from '../lib/format';

export default function PublicLayout() {
  const { t } = useLang();
  const { config } = useConfig();
  const loc = useLocation();
  const inWizard = loc.pathname.startsWith('/report');
  const navItems: [string, string][] = [
    ['/', t('nav.home')],
    ['/report', t('nav.report')],
    ['/track', t('nav.track')],
    ['/my-reports', t('nav.mine')],
    ['/about', t('nav.about')],
  ];

  return (
    <div className={cls('site', inWizard && 'site-wizard')}>
      <header className="site-header">
        <div className="container site-header-in">
          <Link to="/" className="brand">
            <LogoMark size={40} />
            <span className="brand-text">
              <strong>Nimma Bengaluru</strong>
              <small>{t('app.tagline')}</small>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Main">
            {navItems.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cls(isActive && 'active')}>
                {label}
              </NavLink>
            ))}
          </nav>
          <Link to="/official/login" className="admin-link" title={t('nav.official')}>
            <ShieldCheck size={18} />
            <span>Admin</span>
          </Link>
        </div>
      </header>

      {config?.freeTier?.notice && (
        <div className="free-tier-strip" role="status">
          <div className="container">
            <AlertTriangle size={16} /> <span>{config.freeTier.notice}</span>
          </div>
        </div>
      )}

      <main className="site-main">
        <div className="container">
          <Outlet />
        </div>
      </main>

      {!inWizard && (
        <footer className="site-footer">
          <div className="container">
            <p>{t('footer.prototype')}</p>
            <p className="muted small">Ward boundaries: GBA 2025 delimitation (via OpenCity, public domain) · Map © OpenStreetMap contributors</p>
          </div>
        </footer>
      )}

      {!inWizard && (
        <nav className="tabbar" aria-label="Quick">
          <NavLink to="/" end>
            <Home size={21} />
            <span>{t('nav.home')}</span>
          </NavLink>
          <NavLink to="/track">
            <Search size={21} />
            <span>Track</span>
          </NavLink>
          <Link to="/report" className="fab" aria-label={t('nav.report')}>
            <Camera size={27} />
            <span>Report</span>
          </Link>
          <NavLink to="/my-reports">
            <User size={21} />
            <span>Mine</span>
          </NavLink>
          <NavLink to="/about">
            <Info size={21} />
            <span>Help</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}
