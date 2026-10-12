import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function useRefreshOnFocus(refresh: () => void) {
  const latest = useRef(refresh);
  const first = useRef(true);
  useEffect(() => {
    latest.current = refresh;
  });
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      latest.current();
    }, []),
  );
}
