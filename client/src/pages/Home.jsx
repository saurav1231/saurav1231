import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { PackageCard, Spinner } from '../components/ui.jsx';
import { DHAMS } from '../three/dham/dhams.js';

// three.js is heavy, so the 3D scene loads in its own chunk.
const DhamScene = lazy(() => import('../three/dham/DhamScene.jsx'));

const CATEGORY_TEXT = {
  Pilgrimage: 'Sacred temples and darshan, handled end to end',
  'Yoga Retreat': 'Ashram stays, daily practice, Himalayan air',
  Meditation: 'Silence, teachers and monasteries',
  'Char Dham': 'The four abodes, at a pace that respects you',
  Jyotirlinga: 'Journeys to the twelve lights of Shiva',
  Trek: 'High-altitude yatras with full support',
};

// Phones and tablets without a mouse get the one-temple-at-a-time view.
function useCompact() {
  const query = '(max-width: 760px), (hover: none)';
  const [compact, setCompact] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setCompact(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return compact;
}

function DhamHero() {
  const navigate = useNavigate();
  const compact = useCompact();
  const [search, setSearch] = useState('');
  const [hovered, setHovered] = useState(null);
  const [picked, setPicked] = useState(DHAMS[0].slug); // phone view always shows one dham
  const [entering, setEntering] = useState(null);
  const { data: destData } = useApi('/destinations');

  const counts = useMemo(
    () => Object.fromEntries((destData?.destinations || []).map((d) => [d.slug, d.packageCount])),
    [destData],
  );
  const focused = compact ? picked : hovered;
  const active = DHAMS.find((d) => d.slug === (entering || focused));

  const focus = (slug) => (compact ? setPicked(slug) : setHovered(slug));
  const step = (dir) => {
    const i = DHAMS.findIndex((d) => d.slug === picked);
    setPicked(DHAMS[(i + dir + DHAMS.length) % DHAMS.length].slug);
  };
  const enter = (slug) => {
    if (entering) return;
    const go = () => navigate(`/packages?destination=${slug}`);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return go();
    setEntering(slug);
    setTimeout(go, 1300);
  };

  const goSearch = (e) => {
    e.preventDefault();
    navigate(`/packages?search=${encodeURIComponent(search)}`);
  };

  return (
    <section className={`hero ${compact ? 'compact' : ''}`}>
      <div className="hero-canvas">
        <Suspense fallback={<div className="hero-fallback" />}>
          <DhamScene
            focused={focused}
            entering={entering}
            compact={compact}
            onFocus={focus}
            onBlur={() => setHovered(null)}
            onEnter={enter}
          />
        </Suspense>
      </div>

      <div className="hero-copy">
        <p className="eyebrow">अयन · the journey</p>
        <h1>
          Travel outward. <em>Arrive within.</em>
        </h1>
        <form className="search" onSubmit={goSearch}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Kedarnath, Rishikesh, yoga..."
            aria-label="Search journeys"
          />
          <button className="btn">Find my journey</button>
        </form>
        {!compact && <p className="hint">Move your mouse over a temple to walk up to its door. Click to step inside.</p>}
      </div>

      <div className="dham-bar">
        {active && (
          <div className="dham-card" key={active.slug}>
            <span className="eyebrow">{active.region}</span>
            <h2>{active.name}</h2>
            <p>{active.line}</p>
            <button className="btn" onClick={() => enter(active.slug)}>
              Enter{compact ? "" : " the dham"}{counts[active.slug] ? ` · ${counts[active.slug]} ${counts[active.slug] === 1 ? 'journey' : 'journeys'}` : ''}
            </button>
          </div>
        )}
        <div className="dham-picker" role="group" aria-label="Choose a dham">
          {compact && (
            <button className="dham-arrow" onClick={() => step(-1)} aria-label="Previous dham">‹</button>
          )}
          {DHAMS.map((d) => (
            <button
              key={d.slug}
              className={`dham-chip ${focused === d.slug ? 'on' : ''}`}
              onMouseEnter={() => !compact && setHovered(d.slug)}
              onMouseLeave={() => !compact && setHovered(null)}
              onFocus={() => focus(d.slug)}
              onClick={() => (compact && picked !== d.slug ? setPicked(d.slug) : enter(d.slug))}
            >
              {d.name}
            </button>
          ))}
          {compact && (
            <button className="dham-arrow" onClick={() => step(1)} aria-label="Next dham">›</button>
          )}
        </div>
      </div>

      <div className={`enter-flash ${entering ? 'on' : ''}`} aria-hidden="true" />
    </section>
  );
}

export default function Home() {
  const { data: featured, loading } = useApi('/packages', { featured: 'true', limit: 6 });
  const { data: catData } = useApi('/categories');

  return (
    <>
      <DhamHero />

      <section className="section">
        <div className="section-head">
          <h2>Paths to choose from</h2>
          <Link to="/packages">All journeys →</Link>
        </div>
        <div className="categories">
          {(catData?.categories || []).map((c) => (
            <Link key={c.name} to={`/packages?category=${encodeURIComponent(c.name)}`} className="category">
              <h3>{c.name}</h3>
              <p>{CATEGORY_TEXT[c.name] || 'Curated spiritual journeys'}</p>
              <span>{c.count} journeys</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Featured journeys</h2>
        </div>
        {loading ? (
          <Spinner />
        ) : (
          <div className="grid">
            {featured?.packages.map((p) => (
              <PackageCard key={p.id} pkg={p} />
            ))}
          </div>
        )}
      </section>

      <section className="section why">
        {[
          ['Verified guides', 'Priest-guides, yoga teachers and trek leaders we have travelled with ourselves.'],
          ['Darshan made simple', 'Registrations, permits and special-entry tickets arranged before you arrive.'],
          ['Pay safely', 'UPI, cards, net banking and wallets through Razorpay. Instant confirmation.'],
          ['Small groups', 'Most journeys cap at 15 travellers so there is room for stillness.'],
        ].map(([t, d]) => (
          <div key={t}>
            <h3>{t}</h3>
            <p className="muted">{d}</p>
          </div>
        ))}
      </section>
    </>
  );
}
