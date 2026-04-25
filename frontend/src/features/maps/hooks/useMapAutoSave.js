import { useCallback, useEffect, useRef, useState } from 'react';
import { saveMap } from '../services/mapsService.js';
import { useDebouncedCallback } from './useDebouncedCallback.js';

export function useMapAutoSave(mapId) {
  const [status, setStatus]           = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [lastError, setLastError]     = useState(null);

  // Huella del último payload guardado: si el siguiente coincide, no se
  // dispara save. Evita ruido por re-renders sin cambios reales.
  const lastFingerprintRef = useRef(null);
  const inFlightRef        = useRef(false);

  const performSave = useCallback(async (payload) => {
    if (!mapId) return;
    inFlightRef.current = true;
    setStatus('saving');
    try {
      const res = await saveMap({ id: mapId, ...payload });
      if (!res.success) {
        setStatus('error');
        setLastError(res.message || 'Error al guardar.');
        return;
      }
      lastFingerprintRef.current = JSON.stringify(payload);
      setLastSavedAt(res.data?.updated_at ?? new Date().toISOString());
      setLastError(null);
      setStatus('saved');
    } catch {
      setStatus('error');
      setLastError('Error de red.');
    } finally {
      inFlightRef.current = false;
    }
  }, [mapId]);

  const debouncedSave = useDebouncedCallback(performSave, 1500);

  const requestSave = useCallback((payload) => {
    const fp = JSON.stringify(payload);
    if (fp === lastFingerprintRef.current) return; // Sin cambios reales.
    debouncedSave(payload);
  }, [debouncedSave]);

  // Cancela cualquier save pendiente al desmontar (la limpieza de los
  // timers la hace useDebouncedCallback internamente).
  useEffect(() => {
    return () => debouncedSave.cancel();
  }, [debouncedSave]);

  return {
    status,
    lastSavedAt,
    lastError,
    requestSave,
    flushSave:  debouncedSave.flush,
    cancelSave: debouncedSave.cancel,
  };
}
