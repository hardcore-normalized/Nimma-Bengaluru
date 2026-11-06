import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Ban, Plus, Undo2 } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import { useToast } from '../../../lib/toast';
import { cls, fmtDate } from '../../../lib/format';
import { Empty, Field, Modal, Spinner } from '../../../components/ui';

export default function Blocks() {
  const toast = useToast();
  const [active, setActive] = useState(true);
  const [items, setItems] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('phone');
  const [value, setValue] = useState('');
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('');
  const load = () => {
    setItems(null);
    api.get(`/api/admin/blocks?active=${active}`).then((r) => setItems(r.items));
  };
  useEffect(load, [active]);

  const add = async () => {
    try {
      await api.post('/api/admin/blocks', { type, value, days: Number(days), reason });
      toast('Block added.', 'success');
      setOpen(false);
      setValue('');
      setReason('');
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const lift = async (id: string) => {
    if (!confirm('Lift this block?')) return;
    try {
      await api.del(`/api/admin/blocks/${id}`);
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            <Ban size={24} /> Blocklist
          </h1>
          <p className="muted small">Blocked contact numbers, devices, browser fingerprints and networks cannot start sessions or submit reports.</p>
        </div>
        <button className="btn btn-danger" onClick={() => setOpen(true)}>
          <Plus size={16} /> Add block
        </button>
      </div>
      <div className="filter-bar card">
        <div className="seg">
          <button className={cls(active && 'on')} onClick={() => setActive(true)}>
            Active
          </button>
          <button className={cls(!active && 'on')} onClick={() => setActive(false)}>
            History
          </button>
        </div>
      </div>
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty title="No blocks" />
      ) : (
        <div className="card table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Type</th>
                <th>Value</th>
                <th>Person</th>
                <th>Reason</th>
                <th>Until</th>
                <th>By</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td data-label="Type">
                    <span className="badge tone-neutral">{b.type}</span>
                    {b.auto && <span className="badge tone-warning">auto</span>}
                  </td>
                  <td data-label="Value">
                    <code>{b.type === 'phone' ? '+91 ' + b.value : b.value.length > 16 ? b.value.slice(0, 16) + '…' : b.value}</code>
                  </td>
                  <td data-label="Person">{b.reporter ? <Link to={`/official/reporters/${b.reporter.id}`}>{b.reporter.name}</Link> : '—'}</td>
                  <td data-label="Reason" className="small">
                    {b.reason}
                    {b.relatedRef && <div className="muted">{b.relatedRef}</div>}
                  </td>
                  <td data-label="Until" className="small">{b.permanent ? <strong>Permanent</strong> : fmtDate(b.until)}</td>
                  <td data-label="By" className="small">
                    {b.byName}
                    <div className="muted">{fmtDate(b.createdAt, false)}</div>
                  </td>
                  <td>
                    {b.active && (
                      <button className="btn btn-ghost btn-sm" onClick={() => lift(b.id)}>
                        <Undo2 size={14} /> Lift
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={open} title="Add a block" onClose={() => setOpen(false)}>
        <Field label="Block type">
          <select className="input select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="phone">Mobile number</option>
            <option value="device">Device ID</option>
            <option value="ip">IP address / network (careful – can affect many people)</option>
          </select>
        </Field>
        <Field label="Value" required>
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === 'phone' ? '98450 12345' : type === 'ip' ? '49.207.52.18' : 'device id from a report'} />
        </Field>
        <Field label="Duration">
          <select className="input select" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
            <option value="-1">Permanent</option>
          </select>
        </Field>
        <Field label="Reason" required>
          <textarea className="input textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
        <button className="btn btn-danger btn-block" onClick={add} disabled={value.trim().length < 3 || reason.trim().length < 5}>
          <Ban size={16} /> Block
        </button>
      </Modal>
    </div>
  );
}
