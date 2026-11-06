import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Building2,
  Camera,
  ClipboardList,
  Copy,
  Eye,
  Fingerprint,
  Lock,
  MapPin,
  MessageSquarePlus,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
} from 'lucide-react';
import { api, errorMessage, mediaUrl } from '../../lib/api';
import { useOfficial } from '../../lib/store';
import { useToast } from '../../lib/toast';
import { cls, dueLabel, fmtBytes, fmtDate, fmtDistance, timeAgo } from '../../lib/format';
import MapView from '../../components/MapView';
import { Field, Modal, RiskBadge, Spinner, StatusBadge, Timeline } from '../../components/ui';

type Detail = any;

const ACTION_LABEL: Record<string, string> = {
  UNDER_REVIEW: 'Move to review',
  NEEDS_CORRECTION: 'Ask citizen for more info',
  REFERRED: 'Refer to other authority',
  DUPLICATE: 'Mark as duplicate',
  REJECTED: 'Reject (not actionable)',
  SPAM: 'Mark as fake / misuse',
  IN_PROGRESS: 'Start work',
  AWAITING_VERIFICATION: 'Work done – verify',
  RESOLVED: 'Mark resolved',
  REOPENED: 'Reopen',
};

const CAPTURE_LABEL: Record<string, string> = {
  live: 'Live in-app camera',
  native: 'Phone camera app',
  gallery: 'From gallery',
  official: 'Uploaded by official',
  seed: 'Demo',
};

export default function ReportDetail() {
  const { ref } = useParams();
  const { official, meta } = useOfficial();
  const toast = useToast();
  const nav = useNavigate();
  const [r, setR] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // form state
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dupRef, setDupRef] = useState('');
  const [blockDays, setBlockDays] = useState('0');
  const [blockDevices, setBlockDevices] = useState(true);
  const [dept, setDept] = useState('');
  const [team, setTeam] = useState('');
    const [due, setDue] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    setR(null);
    setError('');
    setPhone(null);
    api
      .get(`/api/official/reports/${ref}`)
      .then((d) => setR(d.report))
      .catch((e) => setError(e.message));
  }, [ref]);

  useEffect(() => {
    if (!assignOpen || !r) return;
    setDept(r.assignment?.department || r.category.dept || 'WARD');
    setDue(r.slaDueAt ? new Date(r.slaDueAt).toISOString().slice(0, 10) : '');
  }, [assignOpen, r]);

  const me = r?.client?.deviceLocation;
  const line = useMemo(() => {
    if (!r || !me || !Number.isFinite(me.lat)) return null;
    return (r.client.distanceToIssueM || 0) > 30 ? ([[me.lat, me.lng], [r.location.lat, r.location.lng]] as [[number, number], [number, number]]) : null;
  }, [r, me]);

  if (error)
    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => nav(-1)}>
          <ArrowLeft size={15} /> Back
        </button>
        <div className="alert alert-danger">
          <Lock size={16} /> {error}
        </div>
      </div>
    );
  if (!r) return <Spinner label="Loading report…" />;

  const isAdmin = official?.role === 'admin';
  const evidence = r.media.filter((m: any) => m.role === 'evidence' || m.role === 'correction');
  const afterPhotos = r.media.filter((m: any) => m.role === 'resolution' || m.role === 'progress');
  const needsPhotos = action === 'RESOLVED' || action === 'AWAITING_VERIFICATION' || action === 'IN_PROGRESS';
  const reasonRequired = action ? (meta?.reasonRequired || []).includes(action) || (r.status === 'SPAM' && action === 'UNDER_REVIEW') : false;

  const openAction = (a: string) => {
    setReason('');
    setFiles([]);
    setDupRef(r.possibleDuplicates?.[0]?.ref || '');
    setBlockDays('0');
    setAction(a);
  };

  const doStatus = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const f = new FormData();
      f.append('to', action);
      f.append('reason', reason);
      if (action === 'DUPLICATE') f.append('duplicateOf', dupRef);
      if (action === 'SPAM') {
        f.append('blockDays', blockDays);
        f.append('blockDevices', String(blockDevices));
      }
      files.forEach((file) => f.append('media', file));
      const res = await api.post(`/api/official/reports/${r.ref}/status`, f);
      setR(res.report);
      setAction(null);
      toast(res.blocked ? `Marked as misuse. Reporter blocked${res.blocked.until ? ' until ' + new Date(res.blocked.until).toLocaleDateString('en-IN') : ' permanently'}.` : 'Status updated.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const doAssign = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/api/official/reports/${r.ref}/assign`, { department: dept, team, dueAt: due ? new Date(due + 'T18:00:00').toISOString() : '', note });
      setR(res.report);
      setAssignOpen(false);
      setNote('');
      toast('Assigned.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const doNote = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/api/official/reports/${r.ref}/notes`, { text: note });
      setR(res.report);
      setNoteOpen(false);
      setNote('');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const reveal = async () => {
    try {
      const res = await api.post(`/api/official/reports/${r.ref}/reveal-contact`);
      setPhone(res.phone);
      toast('Contact revealed – this access is recorded in the audit log.', 'info');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const riskSignals: { code: string; label: string; weight: number }[] = r.risk?.signals || [];
  const timeline = r.history.map((h: any) => ({
    status: h.to,
    label: (meta?.statuses[h.to]?.label || h.to) + (h.from === h.to ? ' · system flag' : ''),
    at: h.at,
    note: h.reason,
    by: `${h.actorName || h.actorType}${h.public ? '' : ' · internal'}`,
    internal: !h.public,
  }));
  const canAssign = ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED', 'REOPENED', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status);

  return (
    <div className="detail">
      <div className="detail-head">
        <button className="btn btn-ghost btn-sm" onClick={() => nav(-1)}>
          <ArrowLeft size={15} /> Back
        </button>
        <div className="detail-title">
          <span className="detail-emoji">{r.category.emoji}</span>
          <div>
            <h1>{r.category.name}</h1>
            <div className="muted small">
              <button
                className="link-btn"
                onClick={() => {
                  navigator.clipboard?.writeText(r.ref);
                  toast('Reference copied', 'info');
                }}
              >
                {r.ref} <Copy size={12} />
              </button>{' '}
              · reported {fmtDate(r.createdAt)} ({timeAgo(r.createdAt)})
            </div>
          </div>
        </div>
        <div className="detail-badges">
          <StatusBadge status={r.status} label={r.statusLabel} />
          <RiskBadge level={r.risk.level} score={r.risk.score} />
          {r.sensitive && (
            <span className="badge tone-violet">
              <Lock size={11} /> Confidential
            </span>
          )}
          {r.hazard && (
            <span className="badge tone-danger">
              <AlertTriangle size={11} /> Hazard
            </span>
          )}
          {!r.closed && r.slaDueAt && <span className={cls('badge', r.overdue ? 'tone-danger' : 'tone-neutral')}>{dueLabel(r.slaDueAt)}</span>}
          {r.isDemo && <span className="badge tone-neutral">Demo data</span>}
        </div>
      </div>

      {r.risk.level === 'high' && !r.closed && (
        <div className="alert alert-danger">
          <ShieldAlert size={18} /> <strong>Possible misuse – verify before acting.</strong> Risk score {r.risk.score}/100. See the reasons in “Misuse checks”.
        </div>
      )}

      <div className="detail-grid">
        <div className="detail-main">
          <section className="card">
            <h3>Evidence from citizen</h3>
            <div className="evidence-grid">
              {evidence.map((m: any) => (
                <figure key={m.id} className="evidence">
                  {m.kind === 'image' ? (
                    <img src={mediaUrl(m.id)} alt="Evidence" onClick={() => setLightbox(m.id)} loading="lazy" />
                  ) : (
                    <video src={mediaUrl(m.id)} controls playsInline preload="metadata" />
                  )}
                  <figcaption>
                    <span className={cls('badge', m.captureMethod === 'live' || m.captureMethod === 'seed' ? 'tone-success' : 'tone-warning')}>
                      {m.captureMethod === 'live' ? <ShieldCheck size={11} /> : <Camera size={11} />} {CAPTURE_LABEL[m.captureMethod] || m.captureMethod}
                    </span>
                    <small className="muted">
                      {m.kind === 'video' ? `${m.durationSec || '?'}s video · ` : ''}
                      {m.capturedAt ? fmtDate(m.capturedAt) : ''} {m.size ? '· ' + fmtBytes(m.size) : ''}
                      {m.role === 'correction' ? ' · added later' : ''}
                    </small>
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="desc">{r.description}</p>
            {r.citizenResponses?.length > 0 && (
              <div className="alert alert-info small">
                <strong>Citizen replies:</strong>
                {r.citizenResponses.map((c: any, i: number) => (
                  <p key={i}>
                    “{c.text}” <span className="muted">– {fmtDate(c.at)}</span>
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-title">
              <h3>
                <MapPin size={17} /> Location
              </h3>
              <a className="small" href={`https://www.google.com/maps?q=${r.location.lat},${r.location.lng}`} target="_blank" rel="noreferrer">
                Open in Google Maps
              </a>
            </div>
            <MapView
              className="map-detail"
              center={[r.location.lat, r.location.lng]}
              zoom={16}
              pin={{ lat: r.location.lat, lng: r.location.lng, emoji: r.category.emoji }}
              me={me && Number.isFinite(me.lat) ? { lat: me.lat, lng: me.lng, accuracy: me.accuracy } : null}
              line={line}
            />
            <div className="kv-grid">
              <div>
                <span>Ward</span>
                <strong>
                  {r.area.name} ({r.area.code})
                </strong>
                <small className="muted">
                  {r.area.zone} zone · {r.area.corporation} Corporation{r.area.assembly ? ` · ${r.area.assembly} AC` : ''}
                </small>
              </div>
              <div>
                <span>Landmark / address</span>
                <strong>{r.landmark || '—'}</strong>
                <small className="muted">{r.address}</small>
              </div>
              <div>
                <span>Reporter was</span>
                <strong className={cls((r.client.distanceToIssueM || 0) > 300 && 'text-danger')}>{r.client.distanceToIssueM != null ? fmtDistance(r.client.distanceToIssueM) + ' from the spot' : 'not shared'}</strong>
                <small className="muted">
                  GPS ±{r.location.accuracy ?? '—'} m · {r.location.source === 'gps-adjusted' ? 'pin adjusted by reporter' : 'pin at live GPS'}
                </small>
              </div>
              <div>
                <span>Severity</span>
                <strong>{r.severity}</strong>
                <small className="muted">{r.supportCount} other citizen(s) support this report</small>
              </div>
            </div>
          </section>

          {afterPhotos.length > 0 && (
            <section className="card">
              <h3>Work / resolution photos</h3>
              <div className="evidence-grid">
                {afterPhotos.map((m: any) => (
                  <figure key={m.id} className="evidence">
                    <img src={mediaUrl(m.id)} alt="After" onClick={() => setLightbox(m.id)} loading="lazy" />
                    <figcaption>
                      <small className="muted">
                        {m.role === 'resolution' ? 'After photo' : 'Progress'} · {m.uploadedBy} · {fmtDate(m.uploadedAt)}
                      </small>
                    </figcaption>
                  </figure>
                ))}
              </div>
              {r.resolution?.note && (
                <p>
                  <strong>Resolution note:</strong> {r.resolution.note} <span className="muted small">– {r.resolution.byName}</span>
                </p>
              )}
            </section>
          )}

          <section className="card">
            <div className="card-title">
              <h3>
                <ClipboardList size={17} /> History
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setNoteOpen(true)}>
                <MessageSquarePlus size={14} /> Internal note
              </button>
            </div>
            <Timeline items={timeline} />
            {r.notes.length > 0 && (
              <div className="notes">
                <h4>Internal notes</h4>
                {r.notes.map((n: any, i: number) => (
                  <div key={i} className="note">
                    <p>{n.text}</p>
                    <small className="muted">
                      {n.byName} · {fmtDate(n.at)}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="detail-side">
          <section className="card actions-card">
            <h3>Actions</h3>
            {r.allowedTransitions.length === 0 && !canAssign ? (
              <p className="muted small">This report is closed. {r.status === 'SPAM' && !isAdmin ? 'Only the administrator can reverse a misuse decision.' : ''}</p>
            ) : (
              <div className="action-list">
                {canAssign && (
                  <button className="btn btn-primary btn-block" onClick={() => setAssignOpen(true)}>
                    <Building2 size={16} /> {r.status === 'ASSIGNED' || r.status === 'IN_PROGRESS' ? 'Re-assign' : 'Assign to department'}
                  </button>
                )}
                {r.allowedTransitions
                  .filter((a: string) => a !== 'SPAM')
                  .map((a: string) => (
                    <button key={a} className={cls('btn btn-block', a === 'RESOLVED' ? 'btn-success' : 'btn-ghost')} onClick={() => openAction(a)}>
                      {r.status === 'SPAM' && a === 'UNDER_REVIEW' ? 'Reverse misuse decision' : ACTION_LABEL[a] || a}
                    </button>
                  ))}
                {r.allowedTransitions.includes('SPAM') && (
                  <button className="btn btn-danger btn-block" onClick={() => openAction('SPAM')}>
                    <Ban size={16} /> Mark as fake / misuse
                  </button>
                )}
              </div>
            )}
            {r.assignment && (
              <div className="assign-box small">
                <span className="muted">Assigned to</span>
                <strong>{r.assignment.departmentName}</strong>
                {r.assignment.team && <span>{r.assignment.team}</span>}
                {r.assignment.officialName && <span>Officer: {r.assignment.officialName}</span>}
                <span className="muted">
                  by {r.assignment.byName} · {fmtDate(r.assignment.at)}
                </span>
              </div>
            )}
          </section>

          <section className={cls('card risk-card', `risk-${r.risk.level}`)}>
            <div className="card-title">
              <h3>
                <ShieldAlert size={17} /> Misuse checks
              </h3>
              <RiskBadge level={r.risk.level} score={r.risk.score} />
            </div>
            <div className="meter" aria-label={`Risk ${r.risk.score} of 100`}>
              <span style={{ width: `${Math.max(3, r.risk.score)}%` }} />
            </div>
            {riskSignals.length ? (
              <ul className="signal-list">
                {riskSignals.map((s, i) => (
                  <li key={i} className={s.weight < 0 ? 'good' : s.weight >= 25 ? 'bad' : 'warn'}>
                    <span className="sig-w">{s.weight > 0 ? `+${s.weight}` : s.weight}</span>
                    <span>{s.label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No warning signs: live photo, reporter at the spot, normal behaviour.</p>
            )}
            {r.possibleDuplicates?.length > 0 && (
              <div className="small">
                <strong>Possible duplicates nearby:</strong>
                {r.possibleDuplicates.map((d: any) => (
                  <div key={d.ref}>
                    <Link to={`/official/reports/${d.ref}`}>{d.ref}</Link> · {fmtDistance(d.distanceM)} · <StatusBadge status={d.status} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {r.reporter && (
            <section className="card reporter-card">
              <div className="card-title">
                <h3>
                  <UserRound size={17} /> Reporter
                </h3>
                <span className={cls('badge', r.reporter.trust.score >= 80 ? 'tone-success' : r.reporter.trust.score >= 50 ? 'tone-info' : r.reporter.trust.score >= 25 ? 'tone-warning' : 'tone-danger')}>
                  {r.reporter.trust.label} · {r.reporter.trust.score}
                </span>
              </div>
              <div className="rep-line">
                <strong>{r.reporter.name}</strong>
                <span className="muted small">lives in {r.reporter.locality || '—'}</span>
              </div>
              <div className="rep-line">
                <Phone size={14} /> {phone ? <a href={`tel:${phone}`}>+91 {phone}</a> : <span>+91 {r.reporter.phoneMasked}</span>}
                {!phone && (
                  <button className="link-btn small" onClick={reveal}>
                    <Eye size={13} /> Reveal (logged)
                  </button>
                )}
              </div>
              <div className="rep-stats">
                <span>
                  <b>{r.reporter.stats?.reports || 0}</b> reports
                </span>
                <span>
                  <b>{r.reporter.stats?.resolved || 0}</b> genuine
                </span>
                <span className={cls(r.reporter.strikes > 0 && 'text-danger')}>
                  <b>{r.reporter.strikes}</b> strikes
                </span>
              </div>
              {r.reporter.numbersOnThisDevice > 1 && (
                <div className="alert alert-warning small">
                  <Smartphone size={14} /> This phone was used with {r.reporter.numbersOnThisDevice} different mobile numbers.
                </div>
              )}
              {r.reporter.namesUsed?.length > 1 && <div className="small muted">Names used: {r.reporter.namesUsed.join(', ')}</div>}
              {r.reporter.blocked && (
                <div className="alert alert-danger small">
                  <Ban size={14} /> {r.reporter.blocked.message}
                </div>
              )}
              <Link to={`/official/reporters/${r.reporter.id}`} className="btn btn-ghost btn-block btn-sm">
                <Fingerprint size={14} /> Full reporter profile & evidence
              </Link>
            </section>
          )}

          <section className="card">
            <h3>
              <Smartphone size={17} /> Submission details
            </h3>
            <dl className="forensics">
              <dt>IP address</dt>
              <dd>
                <code>{r.client.ip || '—'}</code>
                {r.client.viaTunnel ? ' (via internet link)' : ''}
              </dd>
              <dt>Device ID</dt>
              <dd>
                <code>{r.client.deviceShort || '—'}…</code>
              </dd>
              <dt>Browser</dt>
              <dd className="small">{r.client.ua || '—'}</dd>
              <dt>Screen / time zone</dt>
              <dd>
                {r.client.screen || '—'} · {r.client.tz || '—'}
              </dd>
              <dt>GPS at submit</dt>
              <dd>{me && Number.isFinite(me.lat) ? `${me.lat.toFixed(5)}, ${me.lng.toFixed(5)} (±${Math.round(me.accuracy || 0)} m)` : 'not shared'}</dd>
              <dt>Time to fill form</dt>
              <dd>{r.client.formDurationMs ? `${Math.round(r.client.formDurationMs / 1000)} s` : '—'}</dd>
            </dl>
            {(r.related.sameDevice.length > 0 || r.related.sameReporter.length > 0) && (
              <div className="related small">
                {r.related.sameReporter.length > 0 && (
                  <>
                    <strong>
                      <Users size={13} /> Other reports by this person
                    </strong>
                    {r.related.sameReporter.map((x: any) => (
                      <div key={x.ref}>
                        {x.inScope ? <Link to={`/official/reports/${x.ref}`}>{x.ref}</Link> : <span>{x.ref}</span>} · <StatusBadge status={x.status} /> · {timeAgo(x.createdAt)}
                      </div>
                    ))}
                  </>
                )}
                {r.related.sameDevice.filter((x: any) => x.otherNumber).length > 0 && (
                  <>
                    <strong className="text-danger">
                      <Smartphone size={13} /> Same phone, different number
                    </strong>
                    {r.related.sameDevice
                      .filter((x: any) => x.otherNumber)
                      .map((x: any) => (
                        <div key={x.ref}>
                          <Link to={`/official/reports/${x.ref}`}>{x.ref}</Link> · <StatusBadge status={x.status} /> · {timeAgo(x.createdAt)}
                        </div>
                      ))}
                  </>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* --- status change --- */}
      <Modal open={action !== null} title={action ? (r.status === 'SPAM' && action === 'UNDER_REVIEW' ? 'Reverse misuse decision' : ACTION_LABEL[action] || action) : ''} onClose={() => setAction(null)}>
        {action === 'SPAM' && (
          <div className="alert alert-danger small">
            This gives the reporter a <strong>misuse strike</strong>. At 3 strikes their number and phone are blocked automatically. The citizen is informed by SMS. Use only when the report is
            clearly fake (no issue at site, someone else’s photo, abusive content, etc.).
          </div>
        )}
        {action === 'DUPLICATE' && (
          <Field label="Original report reference" required>
            <input className="input" value={dupRef} onChange={(e) => setDupRef(e.target.value.toUpperCase())} placeholder="NB-XXXX-XXXX" />
          </Field>
        )}
        {action === 'NEEDS_CORRECTION' && <p className="small muted">The citizen sees this message on the tracking page and can reply with details or a new photo.</p>}
        <Field label={action === 'RESOLVED' ? 'Resolution note' : 'Reason / message'} required={reasonRequired} hint={action === 'SPAM' ? 'Shown in the evidence report – be specific.' : undefined}>
          <textarea className="input textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </Field>
        {needsPhotos && (
          <Field label={action === 'RESOLVED' ? 'After photo (required unless already uploaded)' : 'Photos (optional)'}>
            <input className="input" type="file" accept="image/*" capture="environment" multiple onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 4))} />
          </Field>
        )}
        {action === 'SPAM' && (
          <>
            <Field label="Block the reporter now?">
              <select className="input select" value={blockDays} onChange={(e) => setBlockDays(e.target.value)}>
                <option value="0">No – only add a strike (auto-block at 3 strikes)</option>
                <option value="7">Block for 7 days</option>
                <option value="30">Block for 30 days</option>
                <option value="90">Block for 90 days</option>
                {isAdmin && <option value="-1">Block permanently</option>}
              </select>
            </Field>
            {blockDays !== '0' && (
              <label className="check">
                <input type="checkbox" checked={blockDevices} onChange={(e) => setBlockDevices(e.target.checked)} />
                <span>Also block every phone / browser this person has used</span>
              </label>
            )}
          </>
        )}
        <button className={cls('btn btn-block', action === 'SPAM' ? 'btn-danger' : 'btn-primary')} onClick={doStatus} disabled={busy || (reasonRequired && reason.trim().length < 5)}>
          {busy ? 'Saving…' : 'Confirm'}
        </button>
      </Modal>

      {/* --- assign --- */}
      <Modal open={assignOpen} title="Assign to department / field team" onClose={() => setAssignOpen(false)}>
        <Field label="Department" required>
          <select className="input select" value={dept} onChange={(e) => setDept(e.target.value)}>
            {meta?.departments.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Field team / contractor" hint="e.g. Ward 15 road gang, BWSSB sub-division East">
          <input className="input" value={team} onChange={(e) => setTeam(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Target date">
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Instructions (optional)">
          <textarea className="input textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <button className="btn btn-primary btn-block" onClick={doAssign} disabled={busy || !dept}>
          {busy ? 'Saving…' : 'Assign'}
        </button>
      </Modal>

      <Modal open={noteOpen} title="Internal note (not visible to the citizen)" onClose={() => setNoteOpen(false)}>
        <textarea className="input textarea" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        <button className="btn btn-primary btn-block" onClick={doNote} disabled={busy || note.trim().length < 2}>
          Save note
        </button>
      </Modal>

      <Modal open={lightbox !== null} title="Photo" onClose={() => setLightbox(null)} wide>
        {lightbox && <img src={mediaUrl(lightbox)} alt="Evidence" className="lightbox-img" />}
      </Modal>
    </div>
  );
}
