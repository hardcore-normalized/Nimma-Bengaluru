// "Open on your phone" page – opened automatically on the PC when the server starts.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, Laptop, ShieldCheck, Smartphone, Wifi } from 'lucide-react';
import { api } from '../../lib/api';
import { CopyButton, QR, Spinner } from '../../components/ui';

interface Net {
  phoneUrl: string | null;
  lanUrls: { name: string; address: string; url: string; virtual: boolean }[];
  publicUrl: string | null;
  httpsEnabled: boolean;
  localUrl: string;
  db: { mode: string; label: string; warning: string };
}

export default function Connect() {
  const [net, setNet] = useState<Net | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<Net>('/api/system/network').then(setNet).catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!net) return <Spinner />;
  const others = net.lanUrls.filter((u) => u.url !== net.phoneUrl && !u.virtual);

  return (
    <div className="page-wide connect-page">
      <div className="page-head">
        <div>
          <h1>
            <Smartphone size={26} /> Open Nimma Bengaluru on your phone
          </h1>
          <p className="muted">Connect the phone to the same Wi-Fi as this computer, then scan the code with the phone camera.</p>
        </div>
      </div>
      <div className="connect-grid">
        <section className="card connect-qr">
          {net.phoneUrl ? (
            <>
              <QR value={net.phoneUrl} size={260} />
              <div className="url-box big">
                <code>{net.phoneUrl}</code>
                <CopyButton text={net.phoneUrl} />
              </div>
              {others.length > 0 && (
                <details className="small">
                  <summary>Other addresses of this computer</summary>
                  {others.map((u) => (
                    <div key={u.url}>
                      <code>{u.url}</code> <span className="muted">({u.name})</span>
                    </div>
                  ))}
                </details>
              )}
            </>
          ) : (
            <div className="alert alert-warning">This computer is not connected to any Wi-Fi / network. Connect it to Wi-Fi (or a phone hotspot) and restart the start file.</div>
          )}
        </section>
        <section className="card">
          <h3>First time on the phone</h3>
          <ol className="steps-list">
            <li>
              <Wifi size={16} /> Phone and computer on the <strong>same Wi-Fi</strong> (or connect this computer to the phone’s hotspot).
            </li>
            <li>
              <Smartphone size={16} /> Scan the QR code with the phone camera and open the link.
            </li>
            {net.httpsEnabled && !net.publicUrl && (
              <li>
                <ShieldCheck size={16} /> The browser will say <em>“Your connection is not private”</em>. This is expected for a local site. Tap <strong>Advanced → Proceed to {net.phoneUrl?.split('//')[1]?.split(':')[0]}</strong>
                . On iPhone: <strong>Show Details → visit this website → Visit Website</strong>.
              </li>
            )}
            <li>
              <CheckCircle2 size={16} /> Allow <strong>Camera</strong> and <strong>Location</strong> when asked.
            </li>
          </ol>
          <h3>Not opening?</h3>
          <ul className="small">
            <li>Use the exact <code>https://</code> address and port shown here. The local certificate warning is expected; choose <strong>Advanced → Proceed</strong> (on iPhone, <strong>Show Details → Visit Website</strong>).</li>
            <li>Check that both devices use the same non-guest Wi-Fi, and disconnect any VPN. Guest and campus networks may block devices from reaching one another.</li>
            <li>On Windows, allow Node.js on a <strong>Private network</strong> when prompted. If needed, right-click <code>allow-firewall-windows.bat</code> and choose <strong>Run as administrator</strong>.</li>
            <li>If the Wi-Fi blocks device-to-device traffic, connect the computer to the phone’s hotspot and restart the app so its QR code refreshes.</li>
          </ul>
          <h3>
            <Laptop size={18} /> On this computer
          </h3>
          <div className="btn-row">
            <Link to="/" className="btn btn-ghost">
              Citizen portal
            </Link>
            <Link to="/official/login" className="btn btn-primary">
              Official portal
            </Link>
          </div>
          <p className="small muted">
            Database: {net.db.label}
          </p>
          {net.db.warning && (
            <div className="alert alert-warning small">
              <AlertTriangle size={14} /> {net.db.warning}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
