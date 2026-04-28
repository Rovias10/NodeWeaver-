import { useCallback, useEffect, useRef } from 'react';

export function useDebouncedCallback(fn, delay) {
  const fnRef    = useRef(fn);
  const timerRef = useRef(null);
  const lastArgsRef = useRef(null);

  // Mantenemos la última versión de fn sin recrear el wrapper.
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const debounced = useCallback((...args) => {
    lastArgsRef.current = args;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      fnRef.current(...args);
    }, delay);
  }, [delay]);

  debounced.cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  debounced.flush = useCallback(() => {
    if (timerRef.current && lastArgsRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      fnRef.current(...lastArgsRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return debounced;
}
