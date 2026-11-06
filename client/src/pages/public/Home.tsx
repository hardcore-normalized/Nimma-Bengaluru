import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Camera, Gavel, MapPin, Phone, Search, ShieldCheck, Smartphone, BadgeCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { useConfig } from '../../lib/store';
import { useLang } from '../../lib/i18n';
import { CrayonCity, CrayonStar } from '../../components/CrayonArt';

interface Stats {
  total: number;
  resolved: number;
  inProgress: number;
  pending: number;
  resolvedPct: number;
  avgResolutionDays: number | null;
  misuseBlocked: number;
}

function useCount(target: number, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Counter({ value }: { value: number }) {
  return <>{useCount(value).toLocaleString('en-IN')}</>;
}

function TrackBox() {
  const { t } = useLang();
  const nav = useNavigate();
  const [ref, setRef] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ref.trim()) nav(`/track/${encodeURIComponent(ref.trim().toUpperCase())}`);
  };
  return (
    <form className="track-box" onSubmit={submit}>
      <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t('track.placeholder')} aria-label={t('track.placeholder')} autoCapitalize="characters" />
      <button className="btn btn-blue" type="submit">
        <Search size={17} /> {t('track.btn')}
      </button>
    </form>
  );
}

const HELPLINES: [string, string][] = [
  ['Civic complaints (GBA)', '1533'],
  ['Water & sewage (BWSSB)', '1916'],
  ['Electricity (BESCOM)', '1912'],
  ['Police / fire / ambulance', '112'],
  ['Cyber crime', '1930'],
];

const HOW_STEPS = [
  { n: 1, Icon: Smartphone, title: 'home.step1.title', text: 'home.step1.text', tone: 'yellow' },
  { n: 2, Icon: Camera, title: 'home.step2.title', text: 'home.step2.text', tone: 'pink' },
  { n: 3, Icon: BadgeCheck, title: 'home.step3.title', text: 'home.step3.text', tone: 'green' },
] as const;

const TILE_TONES = ['yellow', 'sky', 'pink', 'green', 'orange', 'violet'];

export default function Home() {
  const { t } = useLang();
  const { config } = useConfig();
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api.get<Stats>('/api/public/stats').then(setStats).catch(() => {});
  }, []);
  const popular = (config?.categories || []).filter((c) => c.popular);

  const tiles: [string, number, string][] = [
    [t('home.stats.total'), stats?.total || 0, 'sky'],
    [t('home.stats.resolved'), stats?.resolved || 0, 'green'],
    [t('home.stats.progress'), stats?.inProgress || 0, 'yellow'],
    ['Fake reports caught', stats?.misuseBlocked || 0, 'pink'],
  ];

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-text">
          <span className="hero-badge">
            <MapPin size={14} /> {config ? `${config.wardCount} wards · 5 city corporations` : 'Bengaluru'}
          </span>
          <h1 className="hero-title">
            Make <span className="scribble">Bengaluru</span> better, one photo at a time.
          </h1>
          <p className="hero-sub">{t('home.hero.sub')}</p>
          <div className="hero-cta">
            <Link to="/report" className="btn btn-primary btn-xl">
              <Camera size={21} /> {t('home.cta.report')}
            </Link>
            <Link to="/track" className="btn btn-ghost btn-xl">
              <Search size={19} /> {t('home.cta.track')}
            </Link>
          </div>
        </div>
        <div className="hero-art">
          <CrayonCity />
        </div>
      </section>

      <section className="stat-row" aria-label="Report statistics">
        {tiles.map(([label, value, tone]) => (
          <div key={label} className={`stat-card tone-bg-${tone}`}>
            <strong>
              <Counter value={value} />
            </strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>
            <CrayonStar /> {t('home.common')}
          </h2>
          <Link to="/report" className="section-link">
            All issues <ArrowRight size={14} />
          </Link>
        </div>
        <div className="cat-grid">
          {popular.map((c, i) => (
            <Link key={c.code} to={`/report?category=${c.code}`} className="cat-tile">
              <span className={`cat-blob tone-bg-${TILE_TONES[i % TILE_TONES.length]}`}>{c.emoji}</span>
              <span className="cat-name">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>
            <CrayonStar color="#8fd0f5" /> {t('home.how')}
          </h2>
        </div>
        <ol className="how-grid">
          {HOW_STEPS.map(({ n, Icon, title, text, tone }) => (
            <li className="how-card" key={n}>
              <span className={`how-num tone-bg-${tone}`}>{n}</span>
              <div>
                <h3>
                  <Icon size={18} /> {t(title)}
                </h3>
                <p>{t(text)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="section">
        <div className="track-panel card">
          <h2>{t('home.cta.track')}</h2>
          <p className="muted small">Enter the reference number you got after submitting, e.g. NB-K7QX-3MPA.</p>
          <TrackBox />
        </div>
      </section>

      <section className="section misuse-banner">
        <div className="misuse-icon">
          <Gavel size={26} />
        </div>
        <div>
          <h3>Fake reports are caught</h3>
          <p>
            Every report records live GPS, a camera timestamp, the device and the network. Fake or spam reports get strikes, and repeat offenders are blocked automatically.
          </p>
          <Link to="/about#misuse" className="section-link">
            <ShieldCheck size={15} /> How misuse is detected <ArrowRight size={13} />
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>
            <CrayonStar color="#f472a8" /> {t('nav.helplines')}
          </h2>
        </div>
        <div className="helpline-grid">
          {HELPLINES.map(([k, v]) => (
            <a key={k} href={`tel:${v}`} className="helpline">
              <span className="helpline-icon">
                <Phone size={16} />
              </span>
              <span className="helpline-text">
                <strong>{v}</strong>
                <span>{k}</span>
              </span>
            </a>
          ))}
        </div>
        <p className="muted small disclaimer">{t('home.disclaimer')}</p>
      </section>
    </div>
  );
}
