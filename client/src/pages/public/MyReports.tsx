import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ChevronRight, FileText, LogOut, Plus } from 'lucide-react';
import { api, mediaUrl } from '../../lib/api';
import { useCitizen } from '../../lib/store';
import { useLang } from '../../lib/i18n';
import { timeAgo } from '../../lib/format';
import CitizenStartForm from '../../components/CitizenStartForm';
import { Empty, Spinner, StatusBadge } from '../../components/ui';

interface Item {
  ref: string;
  category: { name: string; emoji: string };
  status: string;
  statusLabel: string;
  closed: boolean;
  createdAt: string;
  area: { name: string };
  thumb: string | null;
  needsAction: boolean;
}

export default function MyReports() {
  const { citizen, loading, logout } = useCitizen();
  const { t } = useLang();
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    if (!citizen) return;
    api
      .get<{ items: Item[] }>('/api/public/my-reports')
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [citizen]);

  if (loading) return <Spinner />;

  return (
    <div className="page-narrow">
      <div className="page-head">
        <h1>{t('mine.title')}</h1>
        {citizen && (
          <button className="btn btn-ghost btn-sm" onClick={() => logout()}>
            <LogOut size={14} /> {t('common.logout')}
          </button>
        )}
      </div>
      {!citizen ? (
        <section className="card">
          <p className="muted">Enter the contact details you used on this device. The number is self-reported; reports are linked to this browser.</p>
          <CitizenStartForm />
        </section>
      ) : (
        <>
          <div className="card contact-box">
            <div>
              <span className="muted small">{t('w.sessionAs')}</span>
              <strong>
                {citizen.name} · +91 {citizen.phoneMasked}
              </strong>
            </div>
            <Link to="/report" className="btn btn-primary btn-sm">
              <Plus size={14} /> {t('nav.report')}
            </Link>
          </div>
          {citizen.warning && (
            <div className="alert alert-warning small">
              <AlertTriangle size={15} /> {citizen.warning}
            </div>
          )}
          {citizen.blocked && <div className="alert alert-danger">{citizen.blocked.message}</div>}
          {!items ? (
            <Spinner />
          ) : items.length === 0 ? (
            <Empty icon={<FileText size={28} />} title={t('mine.empty')} />
          ) : (
            <div className="list">
              {items.map((r) => (
                <Link key={r.ref} to={`/track/${r.ref}`} className="list-item card">
                  {r.thumb ? <img src={mediaUrl(r.thumb)} alt="" className="list-thumb" /> : <span className="list-emoji">{r.category.emoji}</span>}
                  <div className="list-text">
                    <strong>
                      {r.category.emoji} {r.category.name}
                    </strong>
                    <small className="muted">
                      {r.ref} · {r.area.name} · {timeAgo(r.createdAt)}
                    </small>
                    <div>
                      <StatusBadge status={r.status} label={r.statusLabel} /> {r.needsAction && <span className="badge tone-warning">Action needed</span>}
                    </div>
                  </div>
                  <ChevronRight size={18} className="muted" />
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
