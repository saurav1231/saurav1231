import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox } from '../components/ui.jsx';

function useAfterAuth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next');
  return () => navigate(next && next.startsWith('/') ? next : '/');
}

export function Login() {
  const { login } = useAuth();
  const done = useAfterAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await login(form.email, form.password);
      done();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="page narrow auth" onSubmit={submit}>
      <h1>Welcome back</h1>
      <label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label>Password<input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
      <ErrorBox error={error} />
      <button className="btn btn-block">Sign in</button>
      <p className="center muted">New to Ayana? <Link to={`/register${location.search}`}>Create an account</Link></p>
    </form>
  );
}

export function Register() {
  const { register } = useAuth();
  const done = useAfterAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await register({ ...form, phone: form.phone || undefined });
      done();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="page narrow auth" onSubmit={submit}>
      <h1>Begin your journey</h1>
      <label>Full name<input required value={form.name} onChange={set('name')} /></label>
      <label>Email<input type="email" required value={form.email} onChange={set('email')} /></label>
      <label>Phone<input type="tel" value={form.phone} onChange={set('phone')} /></label>
      <label>Password (8+ characters)<input type="password" minLength={8} required value={form.password} onChange={set('password')} /></label>
      <ErrorBox error={error} />
      <button className="btn btn-block">Create account</button>
      <p className="center muted">Already have an account? <Link to={`/login${location.search}`}>Sign in</Link></p>
    </form>
  );
}
