import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { PackageCard, Spinner } from '../components/ui.jsx';

// three.js is heavy, so the 3D scene loads in its own chunk.
const HeroScene = lazy(() => import('../three/HeroScene.jsx'));

const CATEGORY_TEXT = {
  Pilgrimage: 'Sacred temples and darshan, handled end to end',
  'Yoga Retreat': 'Ashram stays, daily practice, Himalayan air',
  Meditation: 'Silence, teachers and monasteries',
  'Char Dham': 'The four abodes, at a pace that respects you',
  Jyotirlinga: 'Journeys to the twelve lights of Shiva',
  Trek: 'High-altitude yatras with full support',
};

export default function Home() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data: destData } = useApi('/destinations');
  const { data: featured, loading } = useApi('/packages', { featured: 'true', limit: 6 });
  const { data: catData } = useApi('/categories');

  const goSearch = (e) => {
    e.preventDefault();
    navigate(`/packages?search=${encodeURIComponent(search)}`);
  };

  return (
    <>
      <section className="hero">
        <div className="hero-canvas">
          <Suspense fallback={null}>
            <HeroScene
              destinations={destData?.destinations || []}
              onSelect={(d) => navigate(`/packages?destination=${d.slug}`)}
            />
          </Suspense>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">अयन · the journey</p>
          <h1>
            Travel outward.
            <br />
            <em>Arrive within.</em>
          </h1>
          <p className="lead">
            Handpicked pilgrimages, yoga retreats and meditation journeys across India and the Himalaya. Choose your
            path, book in minutes, pay securely.
          </p>
          <form className="search" onSubmit={goSearch}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Kedarnath, Rishikesh, yoga..."
              aria-label="Search journeys"
            />
            <button className="btn">Find my journey</button>
          </form>
          <p className="hint">Tip: drag the globe and click a glowing point to see journeys there.</p>
        </div>
      </section>

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
