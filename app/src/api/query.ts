import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from './client';

const cache = new Map<string, unknown>();

type State<T> = { key: string; data: T | undefined; error: ApiError | null; loading: boolean };

const toError = (e: unknown) => (e instanceof ApiError ? e : new ApiError(0, 'unknown', e instanceof Error ? e.message : String(e)));

export function invalidateQuery(prefix: string) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export function useQuery<T>(key: string, fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>(() => ({ key, data: cache.get(key) as T | undefined, error: null, loading: true }));
  const fnRef = useRef(fn);
  const seq = useRef(0);

  useEffect(() => {
    fnRef.current = fn;
  });

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ key, data: s.key === key ? s.data : (cache.get(key) as T | undefined), error: null, loading: true }));
    try {
      const data = await fnRef.current();
      cache.set(key, data);
      if (id === seq.current) setState({ key, data, error: null, loading: false });
    } catch (e) {
      if (id === seq.current) setState((s) => ({ ...s, key, error: toError(e), loading: false }));
    }
  }, [key]);

  useEffect(() => {
    reload();
  }, [reload, ...deps]);

  const data = state.key === key ? state.data : (cache.get(key) as T | undefined);
  return { data, error: state.key === key ? state.error : null, loading: state.key === key ? state.loading : true, reload };
}
