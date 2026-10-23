import { createContext, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  useEffect(() => {
    if (!tokenStore.get()) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const handleAuth = (d) => {
    tokenStore.set(d.token);
    setUser(d.user);
    return d.user;
  };

  const value = {
    user,
    loading,
    login: (email, password) => api('/auth/login', { method: 'POST', body: { email, password } }).then(handleAuth),
    register: (form) => api('/auth/register', { method: 'POST', body: form }).then(handleAuth),
    logout: () => {
      tokenStore.clear();
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
