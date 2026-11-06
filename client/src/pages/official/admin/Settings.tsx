import { useEffect, useState } from 'react';
import { Save, Settings as Cog } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import { useToast } from '../../../lib/toast';
import { Spinner } from '../../../components/ui';

const GROUPS: [string, string[]][] = [
  ['Limits per citizen', ['maxReportsPerHour', 'maxReportsPerDay', 'cooldownMinutes', 'maxReportsPerDevicePerDay']],
  ['Proof of presence', ['requireDeviceLocation', 'maxPinDistanceM', 'allowGalleryUploads', 'maxPhotos', 'maxVideoSeconds', 'duplicateRadiusM']],
  ['Strikes & blocking', ['autoBlockStrikes', 'autoBlockDays', 'permanentBlockStrikes']],
  ['Firewall', ['firewallEnabled', 'fwRequestsPerMinute', 'fwBanMinutes']],
  ['Portal', ['sensitiveIntakeEnabled', 'showDemoLogins']],
];

export default function Settings() {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, any> | null>(null);
  const [defs, setDefs] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get('/api/admin/settings').then((r) => {
      setValues(r.values);
      setDefs(r.defs);
    });
  }, []);
  if (!values) return <Spinner />;
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put('/api/admin/settings', { values });
      setValues(r.values);
      toast('Settings saved – they apply immediately.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-narrow">
      <div className="page-head">
        <div>
          <h1>
            <Cog size={24} /> Anti-misuse settings
          </h1>
          <p className="muted small">Tune how strict the portal is. Changes are recorded in the audit log.</p>
        </div>
      </div>
      {GROUPS.map(([title, keys]) => (
        <section className="card" key={title}>
          <h3>{title}</h3>
          {keys.map((k) => {
            const d = defs[k];
            if (!d) return null;
            return typeof d.def === 'boolean' ? (
              <label key={k} className="check setting-row">
                <input type="checkbox" checked={Boolean(values[k])} onChange={(e) => setValues({ ...values, [k]: e.target.checked })} />
                <span>{d.label}</span>
              </label>
            ) : (
              <label key={k} className="setting-row">
                <span>{d.label}</span>
                <input className="input input-num" type="number" min={d.min} max={d.max} value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
              </label>
            );
          })}
        </section>
      ))}
      <div className="alert alert-warning small">
        Confidential allegation intake is off by default. Enable it only after an institution has approved who may review the reports, how evidence is handled and retained, and where cases may be referred.
      </div>
      <div className="sticky-actions">
        <button className="btn btn-primary btn-lg" onClick={save} disabled={busy}>
          <Save size={18} /> Save settings
        </button>
      </div>
    </div>
  );
}
