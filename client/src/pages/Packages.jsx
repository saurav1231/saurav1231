import { useSearchParams } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { ErrorBox, PackageCard, Spinner } from '../components/ui.jsx';

const SORTS = [
  ['popular', 'Most popular'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['duration', 'Shortest first'],
  ['newest', 'Newest'],
];

export default function Packages() {
  const [params, setParams] = useSearchParams();
  const query = Object.fromEntries(params.entries());
  const { data, error, loading } = useApi('/packages', query);
  const { data: cats } = useApi('/categories');
  const { data: dests } = useApi('/destinations');

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <div className="page">
      <h1>
        {query.destination && dests
          ? `Journeys to ${dests.destinations.find((d) => d.slug === query.destination)?.name || 'this dham'}`
          : 'Find your journey'}
      </h1>
      <div className="listing">
        <aside className="filters">
          <label>
            Search
            <input defaultValue={query.search || ''} onKeyDown={(e) => e.key === 'Enter' && set('search', e.target.value)} onBlur={(e) => set('search', e.target.value)} placeholder="Place or theme" />
          </label>
          <label>
            Type of journey
            <select value={query.category || ''} onChange={(e) => set('category', e.target.value)}>
              <option value="">All</option>
              {cats?.categories.map((c) => (
                <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
              ))}
            </select>
          </label>
          <label>
            Destination
            <select value={query.destination || ''} onChange={(e) => set('destination', e.target.value)}>
              <option value="">Anywhere</option>
              {dests?.destinations.map((d) => (
                <option key={d.slug} value={d.slug}>{d.name}</option>
              ))}
            </select>
          </label>
          <label>
            Max budget per person (₹)
            <input type="number" min="0" step="1000" defaultValue={query.maxPrice || ''} onBlur={(e) => set('maxPrice', e.target.value)} placeholder="Any" />
          </label>
          <label>
            Max days
            <input type="number" min="1" defaultValue={query.maxDays || ''} onBlur={(e) => set('maxDays', e.target.value)} placeholder="Any" />
          </label>
          <button className="btn btn-ghost" onClick={() => setParams({})}>Clear filters</button>
        </aside>

        <section>
          <div className="listing-bar">
            <span className="muted">{data ? `${data.total} journeys` : ' '}</span>
            <select value={query.sort || 'popular'} onChange={(e) => set('sort', e.target.value)} aria-label="Sort">
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <ErrorBox error={error} />
          {loading ? (
            <Spinner />
          ) : data?.packages.length ? (
            <div className="grid">
              {data.packages.map((p) => (
                <PackageCard key={p.id} pkg={p} />
              ))}
            </div>
          ) : (
            <p className="empty">No journeys match these filters yet.</p>
          )}
          {data?.totalPages > 1 && (
            <div className="pager">
              {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((n) => (
                <button key={n} className={n === data.page ? 'active' : ''} onClick={() => set('page', String(n))}>{n}</button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
