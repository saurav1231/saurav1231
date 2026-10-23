import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPrice, mediaUrl } from '../api.js';

export const Spinner = () => <div className="spinner" aria-label="Loading" />;

export const ErrorBox = ({ error }) =>
  error ? <div className="error-box">{error.message || String(error)}</div> : null;

// Gradient artwork used when a package has no photo yet.
const PALETTES = [
  ['#ff9a5a', '#7b2ff7'],
  ['#ffd27a', '#e2445c'],
  ['#5ee7df', '#2b3a8f'],
  ['#f6d365', '#fd7043'],
  ['#a18cd1', '#fbc2eb'],
  ['#43e97b', '#2a5298'],
];
function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// Cover photo: first uploaded photo, else the image URL typed in admin, else gradient artwork.
export function Cover({ pkg, className = '', large = false }) {
  const first = pkg.images?.[0];
  const src = first ? (large ? first.url : first.thumbUrl) : pkg.imageUrl;
  if (src) {
    return <img className={`cover ${className}`} src={mediaUrl(src)} alt={first?.alt || pkg.title} loading="lazy" />;
  }
  const [a, b] = PALETTES[hash(pkg.slug) % PALETTES.length];
  return (
    <div className={`cover ${className}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
      <svg viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
        <circle cx="300" cy="70" r="34" fill="rgba(255,255,255,.55)" />
        <path d="M0 200 L90 90 L150 150 L230 60 L320 160 L400 110 L400 200 Z" fill="rgba(13,11,34,.35)" />
        <path d="M0 200 L70 140 L140 180 L220 120 L300 190 L400 150 L400 200 Z" fill="rgba(13,11,34,.55)" />
      </svg>
      <span className="cover-place">{pkg.destination?.name}</span>
    </div>
  );
}

export function Stars({ value, count }) {
  if (!count) return <span className="muted small">New journey</span>;
  return (
    <span className="stars" title={`${value} out of 5`}>
      ★ {value.toFixed(1)} <span className="muted">({count})</span>
    </span>
  );
}

// Card that tilts in 3D as the mouse moves over it.
export function PackageCard({ pkg }) {
  const ref = useRef();
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateZ(0)`;
  };
  const reset = () => (ref.current.style.transform = '');

  return (
    <Link to={`/packages/${pkg.slug}`} className="card" ref={ref} onMouseMove={onMove} onMouseLeave={reset}>
      <Cover pkg={pkg} />
      {pkg.isFeatured && <span className="badge">Featured</span>}
      <div className="card-body">
        <span className="chip">{pkg.category}</span>
        <h3>{pkg.title}</h3>
        <p className="muted">{pkg.summary}</p>
        <div className="card-foot">
          <span>
            {pkg.durationDays} {pkg.durationDays === 1 ? 'day' : 'days'} · <Stars value={pkg.ratingAvg} count={pkg.ratingCount} />
          </span>
          <strong>
            {formatPrice(pkg.pricePerPerson, pkg.currency)}
            <small> /person</small>
          </strong>
        </div>
      </div>
    </Link>
  );
}

// Asks for a second click instead of a browser confirm() popup.
export function ConfirmButton({ children, confirmText = 'Tap again to confirm', onConfirm, className = 'link' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${className} ${armed ? 'danger' : ''}`}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmText : children}
    </button>
  );
}

export function StatusPill({ status }) {
  return <span className={`pill pill-${status.toLowerCase()}`}>{status.replace('_', ' ').toLowerCase()}</span>;
}
