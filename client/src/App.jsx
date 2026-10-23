import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Home from './pages/Home.jsx';
import Packages from './pages/Packages.jsx';
import PackageDetail from './pages/PackageDetail.jsx';
import Checkout from './pages/Checkout.jsx';
import MyBookings from './pages/MyBookings.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Admin from './pages/Admin.jsx';

function Protected({ children, admin }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;
  if (admin && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="packages" element={<Packages />} />
        <Route path="packages/:slug" element={<PackageDetail />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="checkout/:bookingId" element={<Protected><Checkout /></Protected>} />
        <Route path="my-bookings" element={<Protected><MyBookings /></Protected>} />
        <Route path="admin" element={<Protected admin><Admin /></Protected>} />
        <Route path="*" element={<div className="page center"><h1>Page not found</h1></div>} />
      </Route>
    </Routes>
  );
}
