// Shown when the citizen reporting flow is opened on a computer: reporting is meant
// for phones (camera + GPS), so we show a QR code to continue on the phone.
import { useEffect, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';
import { CopyButton, QR } from './ui';

export function usePhoneUrl(path = '') {
  const [url, setUrl] = useState('');
  useEffect(() => {
    api
      .get('/api/system/network')
      .then((n) => setUrl(n.phoneUrl ? n.phoneUrl + path : ''))
      .catch(() => setUrl(''));
  }, [path]);
  return url;
}

export default function PhoneGate({ path, onContinue }: { path: string; onContinue: () => void }) {
  const { t } = useLang();
  const url = usePhoneUrl(path);
  return (
    <div className="card phone-gate">
      <div className="phone-gate-icon">
        <Smartphone size={30} />
      </div>
      <h2>{t('phone.title')}</h2>
      <p className="muted">{t('phone.sub')}</p>
      {url ? (
        <>
          <QR value={url} size={210} />
          <div className="url-box">
            <code>{url}</code>
            <CopyButton text={url} />
          </div>
          <p className="small muted">Phone must be on the same Wi-Fi as this computer. If the browser warns “connection not private”, tap Advanced → Proceed.</p>
        </>
      ) : (
        <p className="muted small">Finding this computer’s Wi-Fi address…</p>
      )}
      <button className="btn btn-ghost" onClick={onContinue}>
        <Monitor size={16} /> {t('phone.anyway')}
      </button>
    </div>
  );
}
