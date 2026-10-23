import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

// Loads data from the API whenever `path` or `query` changes.
export function useApi(path, query) {
  const key = JSON.stringify(query || {});
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const load = useCallback(() => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    api(path, { query: JSON.parse(key) })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState({ data: null, error, loading: false }));
  }, [path, key]);

  useEffect(load, [load]);
  return { ...state, reload: load };
}
