// Tiny fetch wrapper for the Ayana API.
const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'ayana_token';
// Demo build: the API is simulated in the browser (see src/demo/demoBackend.js).
export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';

let memoryToken = null;
export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return memoryToken;
    }
  },
  set: (t) => {
    memoryToken = t;
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* storage blocked */
    }
  },
  clear: () => {
    memoryToken = null;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage blocked */
    }
  },
};

export async function api(path, { method = 'GET', body, query } = {}) {
  if (IS_DEMO) {
    const { demoRequest } = await import('./demo/demoBackend.js');
    const cleanQuery = Object.fromEntries(Object.entries(query || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    return demoRequest(method, path, { body, query: cleanQuery, token: tokenStore.get() });
  }
  const url = new URL(BASE + path, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data.details;
    throw err;
  }
  return data;
}

// Uploads photo files (multipart/form-data). `files` is a FileList or array of File.
export async function apiUpload(path, files) {
  if (IS_DEMO) {
    const { demoRequest } = await import('./demo/demoBackend.js');
    return demoRequest('POST', path, { body: { files: [...files] }, token: tokenStore.get() });
  }
  const form = new FormData();
  [...files].forEach((f) => form.append('images', f));
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(new URL(BASE + path, window.location.origin), { method: 'POST', headers, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data;
}

// Photos uploaded to the API are stored as "/uploads/...". When the API is on another domain,
// prefix them with that domain.
export function mediaUrl(u) {
  if (!u || /^(https?:|data:|blob:)/.test(u)) return u;
  const api = import.meta.env.VITE_API_URL;
  return api ? new URL(u, api).toString() : u;
}

export const formatPrice = (paise, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(paise / 100);

export const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
