import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Building2, Camera, Clock, MapPin, RotateCcw, Search, Send, ThumbsUp, Users } from 'lucide-react';
import { api, errorMessage, mediaUrl, uploadWithProgress } from '../../lib/api';
import { useCitizen, useConfig } from '../../lib/store';
import { useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useGeolocation } from '../../lib/geo';
import { dueLabel, fmtDate } from '../../lib/format';
import { Empty, Field, Modal, Spinner, StatusBadge, Timeline } from '../../components/ui';
import MapView from '../../components/MapView';
import CameraCapture from '../../components/CameraCapture';
import type { CapturedMedia } from '../../lib/capture';

interface TrackView {
  ref: string;
  category: { code: string; name: string; emoji: string };
  status: string;
  statusLabel: string;
  closed: boolean;
  createdAt: string;
  updatedAt: string;
  area: { code: string; name: string; corporation: string; zone: string };
  landmark: string;
  location: { lat: number; lng: number } | null;
  department: string | null;
  slaDueAt: string;
  supportCount: number;
  sensitive: boolean;
  timeline: { status: string; label: string; at: string; note: string; by: string }[];
  resolution: null | { note: string; at: string; media: { id: string; kind: string }[] };
  duplicateOf: string | null;
  mine: boolean;
  description?: string;
  media: { id: string; kind: string }[];
  correctionRequest: string;
  canRespond: boolean;
  canReopen: boolean;
}

export default function Track() {
  const { ref: refParam } = useParams();
  const nav = useNavigate();
  const { t } = useLang();
  const { citizen } = useCitizen();
  const { config } = useConfig();
  const toast = useToast();
  const [input, setInput] = useState(refParam || '');
  const [report, setReport] = useState<TrackView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [respondOpen, setRespondOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<CapturedMedia | null>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const geo = useGeolocation(respondOpen);

  const load = async (r: string) => {
    setLoading(true);
    setError('');
    try {
      const d = await api.get<{ report: TrackView }>(`/api/public/track/${encodeURIComponent(r)}`);
      setReport(d.report);
      setInput(d.report.ref);
    } catch (e) {
      setReport(null);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (refParam) load(refParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refParam, citizen?.phoneMasked]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) nav(`/track/${encodeURIComponent(input.trim().toUpperCase())}`);
  };

  const respond = async () => {
    if (!report) return;
    setBusy(true);
    try {
      const f = new FormData();
      f.append('text', text);
      if (photo) f.append('media', photo.blob, 'correction.jpg');
      const r = await uploadWithProgress<{ report: TrackView }>(`/api/public/reports/${report.ref}/respond`, f);
      setReport(r.report);
      setRespondOpen(false);
      setText('');
      setPhoto(null);
      toast('Thank you – your reply was sent to the official.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (!report) return;
    setBusy(true);
    try {
      const r = await api.post<{ report: TrackView }>(`/api/public/reports/${report.ref}/reopen`, { reason: text });
      setReport(r.report);
      setReopenOpen(false);
      setText('');
      toast('Report reopened. Officials have been notified.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const support = async () => {
    if (!report) return;
    try {
      const r = await api.post(`/api/public/reports/${report.ref}/support`);
      setReport({ ...report, supportCount: r.supportCount });
      toast(r.already ? 'You already support this report.' : 'Thanks – your support was added.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <div className="page-narrow track-page">
      <div className="page-head">
        <h1>{t('track.title')}</h1>
      </div>
      <form className="track-box card" onSubmit={submit}>
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('track.placeholder')} autoCapitalize="characters" />
        <button className="btn btn-primary" type="submit">
          <Search size={16} /> {t('track.btn')}
        </button>
      </form>

      {loading && <Spinner />}
      {error && <div className="alert alert-danger">{error}</div>}
      {!refParam && !report && !loading && (
        <Empty icon={<Search size={28} />} title="Enter your reference number">
          You received it on screen after submitting. Lost it? See <Link to="/my-reports">My reports</Link> on the same device.
        </Empty>
      )}

      {report && (
        <>
          <section className="card track-card">
            <div className="track-top">
              <span className="track-emoji">{report.category.emoji}</span>
              <div>
                <div className="muted small">{report.ref}</div>
                <h2>{report.category.name}</h2>
              </div>
              <StatusBadge status={report.status} label={report.statusLabel} />
            </div>
            <div className="track-facts">
              <div>
                <MapPin size={15} />
                <span>
                  {report.area.name} ({report.area.code}) · {report.area.corporation}
                  {report.landmark && <small className="muted"> · {report.landmark}</small>}
                </span>
              </div>
              <div>
                <Clock size={15} />
                <span>
                  Reported {fmtDate(report.createdAt)}
                  {!report.closed && report.slaDueAt && <small className="muted"> · {dueLabel(report.slaDueAt)}</small>}
                </span>
              </div>
              {report.department && (
                <div>
                  <Building2 size={15} />
                  <span>
                    {t('track.dept')}: {report.department}
                  </span>
                </div>
              )}
              <div>
                <Users size={15} />
                <span>
                  {report.supportCount} {t('track.supporters')}
                </span>
              </div>
            </div>
            {report.duplicateOf && (
              <div className="alert alert-info small">
                This was merged with an earlier report of the same issue: <Link to={`/track/${report.duplicateOf}`}>{report.duplicateOf}</Link>
              </div>
            )}
            {report.correctionRequest && (
              <div className="alert alert-warning">
                <strong>The official needs more information:</strong>
                <p>{report.correctionRequest}</p>
                <button className="btn btn-primary btn-sm" onClick={() => setRespondOpen(true)}>
                  <Send size={14} /> {t('track.respond')}
                </button>
              </div>
            )}
            <div className="btn-row">
              {citizen && !report.mine && !report.closed && !report.sensitive && (
                <button className="btn btn-ghost btn-sm" onClick={support}>
                  <ThumbsUp size={14} /> I face this issue too
                </button>
              )}
              {report.canReopen && (
                <button className="btn btn-ghost btn-sm" onClick={() => setReopenOpen(true)}>
                  <RotateCcw size={14} /> {t('track.reopen')}
                </button>
              )}
            </div>
          </section>

          {report.resolution && (
            <section className="card">
              <h3>{t('track.resolution')}</h3>
              <p>{report.resolution.note}</p>
              <p className="small muted">{fmtDate(report.resolution.at)}</p>
              <div className="photo-row">
                {report.resolution.media.map((m) => (
                  <a key={m.id} href={mediaUrl(m.id)} target="_blank" rel="noreferrer">
                    <img src={mediaUrl(m.id)} alt="After the work" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {report.mine && (
            <section className="card">
              <h3>Your report</h3>
              <p>{report.description}</p>
              <div className="photo-row">
                {report.media.map((m) =>
                  m.kind === 'image' ? (
                    <a key={m.id} href={mediaUrl(m.id)} target="_blank" rel="noreferrer">
                      <img src={mediaUrl(m.id)} alt="Your photo" />
                    </a>
                  ) : (
                    <video key={m.id} src={mediaUrl(m.id)} controls playsInline />
                  )
                )}
              </div>
            </section>
          )}

          <section className="card">
            <h3>{t('track.timeline')}</h3>
            <Timeline items={report.timeline.map((x) => ({ status: x.status, label: x.label, at: x.at, note: x.note, by: x.by }))} />
          </section>

          {report.location && (
            <section className="card">
              <MapView className="map-small" center={[report.location.lat, report.location.lng]} zoom={16} pin={{ lat: report.location.lat, lng: report.location.lng, emoji: report.category.emoji }} />
            </section>
          )}
        </>
      )}

      <Modal open={respondOpen} title={t('track.respond')} onClose={() => setRespondOpen(false)}>
        <Field label="Your reply" required hint="Answer what the official asked (exact spot, timing, etc.)">
          <textarea className="input textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={800} />
        </Field>
        {photo ? (
          <div className="photo-row">
            <img src={photo.url} alt="New" />
            <button className="btn btn-ghost btn-sm" onClick={() => setPhoto(null)}>
              Remove photo
            </button>
          </div>
        ) : (
          <button className="btn btn-ghost btn-block" onClick={() => setCamera(true)}>
            <Camera size={16} /> Add a new live photo (optional)
          </button>
        )}
        <button className="btn btn-primary btn-block" onClick={respond} disabled={busy || text.trim().length < 5}>
          <Send size={16} /> Send reply
        </button>
      </Modal>

      <Modal open={reopenOpen} title={t('track.reopen')} onClose={() => setReopenOpen(false)}>
        <Field label="What is still wrong?" required hint="At least 10 characters. Officials will re-inspect the site.">
          <textarea className="input textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
        </Field>
        <button className="btn btn-primary btn-block" onClick={reopen} disabled={busy || text.trim().length < 10}>
          <RotateCcw size={16} /> Reopen report
        </button>
      </Modal>

      <CameraCapture
        open={camera}
        mode="photo"
        stamp={{ lat: geo.pos?.lat, lng: geo.pos?.lng, accuracy: geo.pos?.accuracy }}
        maxVideoSec={config?.settings.maxVideoSeconds || 20}
        allowGallery={false}
        onClose={() => setCamera(false)}
        onCapture={(m) => {
          setPhoto(m);
          setCamera(false);
        }}
      />
    </div>
  );
}
