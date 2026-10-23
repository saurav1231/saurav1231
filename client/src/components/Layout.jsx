import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { IS_DEMO } from '../api.js';

export function Navbar() {
  const { user, logout } = useAuth();
  return (
    <header className="nav">
      <Link to="/" className="brand">
        <span className="brand-sun" />
        Ayana
        <small>journey within</small>
      </Link>
      <nav>
        <NavLink to="/packages">Journeys</NavLink>
        {user && <NavLink to="/my-bookings">My bookings</NavLink>}
        {user?.role === 'ADMIN' && <NavLink to="/admin">Admin</NavLink>}
        {user ? (
          <button className="link" onClick={logout}>
            Log out
          </button>
        ) : (
          <NavLink to="/login" className="btn btn-small">
            Sign in
          </NavLink>
        )}
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div>
        <div className="brand">
          <span className="brand-sun" />
          Ayana
        </div>
        <p>Ayana (अयन) means journey. We craft pilgrimages and retreats that move you inward as much as outward.</p>
      </div>
      <div>
        <h4>Explore</h4>
        <Link to="/packages?category=Pilgrimage">Pilgrimages</Link>
        <Link to="/packages?category=Yoga%20Retreat">Yoga retreats</Link>
        <Link to="/packages?category=Meditation">Meditation</Link>
      </div>
      <div>
        <h4>Contact</h4>
        <a href="mailto:hello@ayana.travel">hello@ayana.travel</a>
        <span>Secure payments by Razorpay</span>
      </div>
      <p className="copyright">© {new Date().getFullYear()} Ayana. All rights reserved.</p>
    </footer>
  );
}

function DemoBanner() {
  const reset = async () => {
    const { resetDemo } = await import('../demo/demoBackend.js');
    resetDemo();
    window.location.reload();
  };
  return (
    <div className="demo-banner">
      <span>
        <strong>Preview</strong> · Payments are simulated and your data stays in this browser. Admin login: admin@ayana.travel / Admin@12345
      </span>
      <button className="link" onClick={reset}>Reset demo</button>
    </div>
  );
}

export default function Layout() {
  return (
    <>
      {IS_DEMO && <DemoBanner />}
      <Navbar />
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
