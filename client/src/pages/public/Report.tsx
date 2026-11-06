// Citizen reporting wizard: Contact → Issue → Photos → Location → Details → Submit.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Crosshair, LocateFixed, MapPin, Plus, RefreshCw, Search, Send, ThumbsUp, Trash2, Video } from 'lucide-react';
import { api, errorMessage, uploadWithProgress } from '../../lib/api';
import { useCitizen, useConfig, type Category } from '../../lib/store';
import { useLang, type MsgKey } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { useGeolocation } from '../../lib/geo';
import { fingerprint, isMobileDevice } from '../../lib/device';
import { cls, fmtDistance, haversineM, timeAgo } from '../../lib/format';
import type { CapturedMedia } from '../../lib/capture';
import CameraCapture from '../../components/CameraCapture';
import MapView from '../../components/MapView';
import CitizenStartForm from '../../components/CitizenStartForm';
import PhoneGate from '../../components/PhoneGate';
import { CopyButton, Field, QR, Spinner, StatusBadge } from '../../components/ui';
import Confetti from '../../components/Confetti';

interface Ward {
  code: string;
  name: string;
  corporation: string;
  zone: string;
}
interface Nearby {
  ref: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  supportCount: number;
  distanceM: number;
  landmark: string;
  areaName: string;
}
interface Result {
  ref: string;
  category: { name: string; emoji: string };
  area: { name: string; corporation: string };
  department: string;
  slaDueAt: string;
}

const STEPS: MsgKey[] = ['w.step.contact', 'w.step.issue', 'w.step.photos', 'w.step.location', 'w.step.details', 'w.step.review'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

function useWardLookup(lat?: number, lng?: number) {
  const [ward, setWard] = useState<Ward | null>(null);
  const [inside, setInside] = useState<boolean | null>(null);
  const key = lat != null && lng != null ? `${lat.toFixed(4)},${lng.toFixed(4)}` : '';
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const id = setTimeout(() => {
      api
        .get(`/api/public/geo/locate?lat=${lat}&lng=${lng}`)
        .then((r) => {
          if (stop) return;
          setWard(r.ward);
          setInside(r.inside);
        })
        .catch(() => {});
    }, 250);
    return () => {
      stop = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { ward, inside };
}

export default function Report() {
  const { config } = useConfig();
  const { citizen, logout } = useCitizen();
  const { t } = useLang();
  const toast = useToast();
  const [params] = useSearchParams();

  const [gateOk, setGateOk] = useState(() => isMobileDevice() || sessionStorage.getItem('nb-desktop-ok') === '1');
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<Category | null>(null);
  const [query, setQuery] = useState('');
  const [media, setMedia] = useState<CapturedMedia[]>([]);
  const [camera, setCamera] = useState<null | 'photo' | 'video'>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinMoved, setPinMoved] = useState(false);
  const [landmark, setLandmark] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('medium');
  const [hazard, setHazard] = useState(false);
  const [locality, setLocality] = useState('');
  const [declared, setDeclared] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [dups, setDups] = useState<Nearby[] | null>(null);
  const [dupDismissed, setDupDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [wardNames, setWardNames] = useState<string[]>([]);
  const startedAt = useRef(Date.now());

  const settings = config?.settings;
  const geo = useGeolocation(gateOk && !result);
  const me = geo.pos;
  const deviceWard = useWardLookup(me?.lat, me?.lng);
  const pinWard = useWardLookup(pin?.lat, pin?.lng);

  // pre-select a category from ?category=
  useEffect(() => {
    const code = params.get('category');
    if (code && config && !category) {
      const c = config.categories.find((x) => x.code === code);
      if (c) setCategory(c);
    }
  }, [params, config, category]);

  useEffect(() => {
    if (citizen?.locality && !locality) setLocality(citizen.locality);
  }, [citizen, locality]);

  useEffect(() => {
    api
      .get('/api/public/wards')
      .then((w: { name: string }[]) => setWardNames([...new Set(w.map((x) => x.name))].sort()))
      .catch(() => {});
  }, []);

  // place the pin at the live location the first time we have it
  useEffect(() => {
    if (me && !pin) setPin({ lat: me.lat, lng: me.lng });
  }, [me, pin]);

  // address suggestion for the pin
  useEffect(() => {
    if (!pin || step !== 3) return;
    const id = setTimeout(() => {
      api
        .get(`/api/public/geo/address?lat=${pin.lat}&lng=${pin.lng}`)
        .then((r) => r.address && setAddress((a) => (a && pinMoved === false ? a : r.address)))
        .catch(() => {});
    }, 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin?.lat, pin?.lng, step]);

  // duplicate check before the final step
  useEffect(() => {
    if (step !== 5 || !pin || !category) return;
    setDups(null);
    api
      .post('/api/public/reports/nearby', { lat: pin.lat, lng: pin.lng, category: category.code })
      .then((r) => setDups(r.items))
      .catch(() => setDups([]));
  }, [step, pin, category]);

  const filteredCats = useMemo(() => {
    const cats = config?.categories || [];
    const q = query.trim().toLowerCase();
    if (!q) return cats;
    return cats.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [config, query]);

  if (!config) return <Spinner label={t('common.loading')} />;
  if (!gateOk) {
    return (
      <div className="page-narrow">
        <PhoneGate
          path="/report"
          onContinue={() => {
            sessionStorage.setItem('nb-desktop-ok', '1');
            setGateOk(true);
          }}
        />
      </div>
    );
  }

  const images = media.filter((m) => m.kind === 'image');
  const video = media.find((m) => m.kind === 'video');
  const maxDist = settings?.maxPinDistanceM || 500;
  const distance = me && pin ? haversineM(me.lat, me.lng, pin.lat, pin.lng) : null;

  const movePin = (lat: number, lng: number) => {
    if (me) {
      const d = haversineM(me.lat, me.lng, lat, lng);
      if (d > maxDist) {
        const r = (maxDist * 0.98) / d;
        lat = me.lat + (lat - me.lat) * r;
        lng = me.lng + (lng - me.lng) * r;
        toast(`The pin must be within ${maxDist} m of where you are standing.`, 'warning');
      }
    }
    setPin({ lat, lng });
    setPinMoved(true);
  };

  const canNext = () => {
    switch (step) {
      case 0:
        return Boolean(citizen && !citizen.blocked);
      case 1:
        return Boolean(category);
      case 2:
        return images.length >= 1;
      case 3:
        return Boolean(pin && pinWard.inside && (me || !settings?.requireDeviceLocation));
      case 4:
        return description.trim().length >= 20 && locality.trim().length >= 2;
      default:
        return true;
    }
  };

  const stepHint = () => {
    switch (step) {
      case 2:
        return images.length ? '' : 'Take at least one photo of the issue.';
      case 3:
        if (!me && settings?.requireDeviceLocation) return 'Waiting for your GPS location…';
        if (pinWard.inside === false) return t('w.loc.outside');
        return '';
      case 4:
        if (description.trim().length < 20) return `Description: ${description.trim().length}/20 characters minimum.`;
        if (locality.trim().length < 2) return 'Enter your residential locality.';
        return '';
      default:
        return '';
    }
  };

  const next = () => {
    if (!canNext()) {
      const h = stepHint();
      if (h) toast(h, 'warning');
      return;
    }
    setStep((s) => Math.min(5, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const support = async (ref: string) => {
    try {
      const r = await api.post(`/api/public/reports/${ref}/support`);
      toast(r.already ? 'You have already supported this report.' : `Thank you! ${r.supportCount} people now support ${ref}.`, 'success');
      setDupDismissed(true);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const submit = async () => {
    if (!category || !pin) return;
    if (!declared) return toast('Please accept the declaration.', 'warning');
    setSubmitting(true);
    setError('');
    setProgress(0);
    const fp = fingerprint();
    const data = {
      category: category.code,
      description: description.trim(),
      severity,
      hazard,
      lat: pin.lat,
      lng: pin.lng,
      locationSource: pinMoved ? 'gps-adjusted' : 'gps',
      locationAccuracy: me?.accuracy ?? null,
      landmark: landmark.trim(),
      address: address.trim(),
      locality: locality.trim(),
      deviceLocation: me ? { lat: me.lat, lng: me.lng, accuracy: me.accuracy, at: new Date(me.at).toISOString() } : null,
      media: media.map((m) => ({
        kind: m.kind,
        captureMethod: m.captureMethod,
        capturedAt: m.capturedAt,
        gps: m.gps || null,
        exifDate: m.exifDate || null,
        exifLat: m.exifLat ?? null,
        exifLng: m.exifLng ?? null,
        width: m.width || null,
        height: m.height || null,
        durationSec: m.durationSec || null,
      })),
      startedAt: new Date(startedAt.current).toISOString(),
      formDurationMs: Date.now() - startedAt.current,
      declaration: true,
      website,
      fp,
      screen: fp.screen,
      tz: fp.tz,
      lang: fp.lang,
    };
    const form = new FormData();
    form.append('data', JSON.stringify(data));
    media.forEach((m, i) => form.append('media', m.blob, `${m.kind}-${i + 1}.${m.kind === 'image' ? 'jpg' : m.blob.type.includes('mp4') ? 'mp4' : 'webm'}`));
    try {
      const r = await uploadWithProgress<Result>('/api/public/reports', form, setProgress);
      setResult(r);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    media.forEach((m) => URL.revokeObjectURL(m.url));
    setMedia([]);
    setCategory(null);
    setDescription('');
    setLandmark('');
    setAddress('');
    setSeverity('medium');
    setHazard(false);
    setDeclared(false);
    setDups(null);
    setDupDismissed(false);
    setPinMoved(false);
    setPin(me ? { lat: me.lat, lng: me.lng } : null);
    setResult(null);
    setStep(citizen ? 1 : 0);
    startedAt.current = Date.now();
  };

  // ------------------------------------------------------------- success
  if (result) {
    const trackUrl = `${location.origin}/track/${result.ref}`;
    return (
      <div className="page-narrow">
        <Confetti />
        <div className="card success-card">
          <div className="success-icon">
            <CheckCircle2 size={44} />
          </div>
          <h2>{t('done.title')}</h2>
          <p className="muted">
            {result.category.emoji} {result.category.name} · {result.area.name} ({result.area.corporation})
          </p>
          <div className="ref-box">
            <small>{t('done.ref')}</small>
            <strong>{result.ref}</strong>
            <CopyButton text={result.ref} />
          </div>
          <p className="small">{t('done.save')}</p>
          <QR value={trackUrl} size={150} />
          <div className="success-meta small">
            <div>
              <span className="muted">Routed to</span> {result.department}
            </div>
            <div>
              <span className="muted">Target resolution</span> {new Date(result.slaDueAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            </div>
          </div>
          <div className="btn-row">
            <Link to={`/track/${result.ref}`} className="btn btn-primary">
              {t('done.track')}
            </Link>
            <button className="btn btn-ghost" onClick={reset}>
              <Plus size={16} /> {t('done.another')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- wizard
  const stamp = { lat: me?.lat, lng: me?.lng, accuracy: me?.accuracy, ward: deviceWard.ward ? `${deviceWard.ward.name} (${deviceWard.ward.code})` : undefined };

  return (
    <div className="wizard">
      <div className="wizard-head">
        <ol className="stepper" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className={cls(i === step && 'current', i < step && 'done')}>
              <span className="stepper-dot">{i < step ? <Check size={13} /> : i + 1}</span>
              <span className="stepper-label">{t(s)}</span>
            </li>
          ))}
        </ol>
        <div className="wizard-mobile-step">
          <span>Step {step + 1} of {STEPS.length}</span>
          <strong>{t(STEPS[step])}</strong>
        </div>
        <div className="wizard-progress">
          <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="wizard-body" key={step}>
        {step === 0 && (
          <section className="card wizard-card">
            <h2>{t('w.contact.title')}</h2>
            <p className="muted">{t('w.contact.why')}</p>
            {citizen ? (
              <div className="contact-box">
                <div>
                  <span className="muted small">{t('w.sessionAs')}</span>
                  <strong>
                    {citizen.name} · +91 {citizen.phoneMasked}
                  </strong>
                  <span className="badge tone-neutral">Not verified</span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => logout()}>
                  {t('w.change')}
                </button>
              </div>
            ) : (
              <CitizenStartForm onStarted={() => setStep(1)} />
            )}
            {citizen?.blocked && (
              <div className="alert alert-danger">
                <strong>Reporting blocked</strong>
                <p>{citizen.blocked.message}</p>
                {citizen.blocked.reason && <p className="small">Reason: {citizen.blocked.reason}</p>}
              </div>
            )}
            {citizen?.warning && !citizen.blocked && (
              <div className="alert alert-warning small">
                <AlertTriangle size={16} /> {citizen.warning}
              </div>
            )}
          </section>
        )}

        {step === 1 && (
          <section className="card wizard-card">
            <h2>{t('w.issue.title')}</h2>
            <div className="search-input">
              <Search size={16} />
              <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('w.issue.search')} />
            </div>
            {!query && (
              <>
                <h4 className="cat-group-title">{t('w.issue.popular')}</h4>
                <div className="cat-pick-grid">
                  {config.categories
                    .filter((c) => c.popular)
                    .map((c) => (
                      <button key={c.code} className={cls('cat-pick', category?.code === c.code && 'selected')} onClick={() => setCategory(c)}>
                        <span className="cat-emoji">{c.emoji}</span>
                        <span>{c.name}</span>
                      </button>
                    ))}
                </div>
              </>
            )}
            {config.groups.map((g) => {
              const cats = filteredCats.filter((c) => c.group === g.code && (query || !c.popular));
              if (!cats.length) return null;
              return (
                <div key={g.code}>
                  <h4 className="cat-group-title">{g.name}</h4>
                  <div className="cat-list">
                    {cats.map((c) => (
                      <button key={c.code} className={cls('cat-row', category?.code === c.code && 'selected', c.sensitive && 'sensitive')} onClick={() => setCategory(c)}>
                        <span className="cat-emoji">{c.emoji}</span>
                        <span className="cat-row-text">
                          <strong>{c.name}</strong>
                          <small>{c.department}</small>
                        </span>
                        {category?.code === c.code && <Check size={18} />}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {category?.hint && (
              <div className={cls('alert', category.sensitive ? 'alert-info' : 'alert-tip')}>
                <strong>
                  {category.emoji} {category.name}
                </strong>
                <p className="small">{category.hint}</p>
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="card wizard-card">
            <h2>{t('w.photos.title')}</h2>
            <p className="muted">{t('w.photos.sub')}</p>
            {category?.hint && <p className="small tip">💡 {category.hint}</p>}
            <div className="media-grid">
              {media.map((m) => (
                <div key={m.id} className="media-thumb">
                  {m.kind === 'image' ? <img src={m.url} alt="Captured" /> : m.thumb ? <img src={m.thumb} alt="Video" /> : <video src={m.url} muted playsInline />}
                  {m.kind === 'video' && (
                    <span className="media-tag">
                      <Video size={12} /> {m.durationSec}s
                    </span>
                  )}
                  {m.captureMethod !== 'live' && <span className="media-tag media-tag-left">{m.captureMethod === 'native' ? 'phone camera' : 'gallery'}</span>}
                  <button
                    className="media-remove"
                    onClick={() => {
                      URL.revokeObjectURL(m.url);
                      setMedia(media.filter((x) => x.id !== m.id));
                    }}
                    aria-label="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {images.length < (settings?.maxPhotos || 4) && (
                <button className="media-add" onClick={() => setCamera('photo')}>
                  <Camera size={28} />
                  <span>{t('w.photos.take')}</span>
                </button>
              )}
            </div>
            <p className="small muted">{t('w.photos.count', { n: images.length, max: settings?.maxPhotos || 4 })}</p>
            {!video && !config.freeTier?.videosPaused && (
              <button className="btn btn-ghost btn-block" onClick={() => setCamera('video')}>
                <Video size={18} /> {t('w.photos.optionalVideo', { s: settings?.maxVideoSeconds || 20 })}
              </button>
            )}
            <div className={cls('gps-chip', me ? 'ok' : 'wait')}>
              <LocateFixed size={15} /> {me ? `GPS locked ±${me.accuracy} m${deviceWard.ward ? ' · ' + deviceWard.ward.name : ''}` : geo.status === 'denied' ? t('w.loc.denied') : geo.status === 'insecure' ? t('w.loc.insecure') : t('w.loc.locating')}
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="card wizard-card">
            <h2>{t('w.loc.title')}</h2>
            <p className="muted small">{t('w.loc.sub', { m: maxDist })}</p>
            {geo.status === 'denied' || geo.status === 'insecure' || (geo.status === 'unavailable' && !me) ? (
              <div className="alert alert-danger">
                <p>{geo.status === 'insecure' ? t('w.loc.insecure') : t('w.loc.denied')}</p>
                <button className="btn btn-sm btn-primary" onClick={geo.retry}>
                  <RefreshCw size={14} /> {t('common.retry')}
                </button>
              </div>
            ) : !pin ? (
              <Spinner label={t('w.loc.locating')} />
            ) : (
              <>
                <MapView
                  className="map-picker"
                  center={[pin.lat, pin.lng]}
                  zoom={17}
                  pin={{ lat: pin.lat, lng: pin.lng, draggable: true, onMove: movePin, emoji: category?.emoji }}
                  me={me ? { lat: me.lat, lng: me.lng, accuracy: me.accuracy } : null}
                  circle={me ? { lat: me.lat, lng: me.lng, radius: maxDist } : null}
                  onClickMap={movePin}
                />
                <div className="loc-info">
                  <div>
                    <MapPin size={15} />{' '}
                    {pinWard.ward ? (
                      <span>
                        <strong>{pinWard.ward.name}</strong> ({pinWard.ward.code}) · {pinWard.ward.zone} zone · {pinWard.ward.corporation} Corporation
                      </span>
                    ) : pinWard.inside === false ? (
                      <span className="text-danger">{t('w.loc.outside')}</span>
                    ) : (
                      <span className="muted">…</span>
                    )}
                  </div>
                  <div className="small muted">
                    <Crosshair size={13} /> {t('w.loc.accuracy')} ±{me?.accuracy ?? '—'} m{distance != null && distance > 5 ? ` · pin is ${fmtDistance(distance)} from you` : ''}
                    {pinMoved && me && (
                      <button
                        className="link-btn"
                        onClick={() => {
                          setPin({ lat: me.lat, lng: me.lng });
                          setPinMoved(false);
                        }}
                      >
                        {' '}
                        Reset to my location
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
            <Field label={t('w.loc.landmark')} hint="e.g. opposite the bus stop, near metro pillar 42">
              <input className="input" value={landmark} onChange={(e) => setLandmark(e.target.value)} maxLength={160} />
            </Field>
            <Field label={t('w.loc.address')}>
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
            </Field>
          </section>
        )}

        {step === 4 && (
          <section className="card wizard-card">
            <h2>{t('w.det.title')}</h2>
            <Field label={t('w.det.desc')} hint={`${t('w.det.descHint')} · ${description.trim().length}/1000`} required>
              <textarea className="input textarea" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="e.g. A deep pothole in the middle of the road near the signal. Two-wheelers are skidding every evening." />
            </Field>
            <div className="field">
              <span className="field-label">{t('w.det.severity')}</span>
              <div className="chip-row">
                {SEVERITIES.map((s) => (
                  <button key={s} className={cls('chip', `sev-${s}`, severity === s && 'on')} onClick={() => setSeverity(s)}>
                    {t(`sev.${s}` as MsgKey)}
                  </button>
                ))}
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={hazard} onChange={(e) => setHazard(e.target.checked)} />
              <span>
                <AlertTriangle size={15} /> {t('w.det.hazard')}
              </span>
            </label>
            <Field label={t('w.det.locality')} hint={t('w.det.localityHint')} required>
              <input className="input" list="nb-wards" value={locality} onChange={(e) => setLocality(e.target.value)} maxLength={80} placeholder="e.g. Jayanagar 4th Block" />
              <datalist id="nb-wards">
                {wardNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
          </section>
        )}

        {step === 5 && category && pin && (
          <section className="card wizard-card">
            <h2>{t('w.rev.title')}</h2>
            {dups && dups.length > 0 && !dupDismissed && (
              <div className="dup-box">
                <h4>
                  <AlertTriangle size={16} /> {t('w.dup.title')}
                </h4>
                <p className="small muted">{t('w.dup.sub')}</p>
                {dups.map((d) => (
                  <div key={d.ref} className="dup-item">
                    <div>
                      <strong>{d.ref}</strong> <StatusBadge status={d.status} label={d.statusLabel} />
                      <div className="small muted">
                        {fmtDistance(d.distanceM)} away · {timeAgo(d.createdAt)} · {d.supportCount} supporter{d.supportCount === 1 ? '' : 's'}
                        {d.landmark ? ` · ${d.landmark}` : ''}
                      </div>
                    </div>
                    <button className="btn btn-sm btn-primary" onClick={() => support(d.ref)}>
                      <ThumbsUp size={14} /> {t('w.dup.support')}
                    </button>
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" onClick={() => setDupDismissed(true)}>
                  {t('w.dup.different')}
                </button>
              </div>
            )}
            <dl className="review-list">
              <div>
                <dt>{t('w.step.issue')}</dt>
                <dd>
                  {category.emoji} {category.name}
                </dd>
              </div>
              <div>
                <dt>{t('w.loc.ward')}</dt>
                <dd>
                  {pinWard.ward ? `${pinWard.ward.name} (${pinWard.ward.code}), ${pinWard.ward.corporation}` : '—'}
                  {landmark && <div className="small muted">{landmark}</div>}
                </dd>
              </div>
              <div>
                <dt>{t('w.det.desc')}</dt>
                <dd>{description}</dd>
              </div>
              <div>
                <dt>{t('w.det.severity')}</dt>
                <dd>
                  {t(`sev.${severity}` as MsgKey)}
                  {hazard ? ' · ⚠ hazard' : ''}
                </dd>
              </div>
              <div>
                <dt>{t('w.step.photos')}</dt>
                <dd className="review-thumbs">
                  {media.map((m) => (
                    <img key={m.id} src={m.kind === 'image' ? m.url : m.thumb} alt="" />
                  ))}
                </dd>
              </div>
              <div>
                <dt>{t('w.step.contact')}</dt>
                <dd>
                  {citizen?.name} · +91 {citizen?.phoneMasked} (not verified) · {locality}
                </dd>
              </div>
            </dl>
            <input className="hp-field" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
            <label className="check declare">
              <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
              <span>{t('w.rev.declare')}</span>
            </label>
            {error && <div className="alert alert-danger">{error}</div>}
            {submitting && (
              <div className="upload-progress">
                <span style={{ width: `${progress}%` }} />
                <small>
                  {t('w.uploading')} {progress}%
                </small>
              </div>
            )}
          </section>
        )}
      </div>

      {step < 5 && !canNext() && stepHint() && <div className="alert alert-tip small step-hint">{stepHint()}</div>}

      {(step > 0 || citizen) && <div className="wizard-foot">
        <button className="btn btn-ghost" onClick={back} disabled={step === 0 || submitting}>
          <ArrowLeft size={16} /> {t('w.back')}
        </button>
        {step < 5 ? (
          <button className={cls('btn btn-primary', !canNext() && 'btn-soft-disabled')} onClick={next}>
            {t('w.next')} <ArrowRight size={16} />
          </button>
        ) : (
          <button className="btn btn-primary" onClick={submit} disabled={submitting || !declared || Boolean(config.freeTier?.uploadsPaused)}>
            <Send size={16} /> {submitting ? t('w.uploading') : t('w.submit')}
          </button>
        )}
      </div>}

      <CameraCapture
        open={camera !== null}
        mode={camera || 'photo'}
        stamp={stamp}
        maxVideoSec={settings?.maxVideoSeconds || 20}
        allowGallery={Boolean(settings?.allowGalleryUploads)}
        onClose={() => setCamera(null)}
        onCapture={(m) => {
          setMedia((list) => {
            if (m.kind === 'video') return [...list.filter((x) => x.kind !== 'video'), m];
            return [...list, m];
          });
          setCamera(null);
          toast(m.kind === 'image' ? 'Photo added' : 'Video added', 'success');
        }}
      />
    </div>
  );
}
