import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/useAuth.js';
import { useNotification } from '@/ui/useNotification.js';
import { listMaps } from '@/features/maps/services/mapsService.js';
import { DashboardStatsSection } from './DashboardStatsSection.jsx';
import { RecentMapsList } from './RecentMapsList.jsx';
import { fetchStats } from './services/dashboardService.js';

/** Cuántos mapas pintar en la sección "Tus últimos mapas". */
const RECENT_MAPS_LIMIT = 5;

/**
 * Página de inicio del shell autenticado (`/dashboard`).
 *
 * Carga en paralelo dos cosas al montar:
 *   1. Las métricas reales del usuario (`GET dashboard/stats`),
 *      pintadas por `DashboardStatsSection`.
 *   2. Los últimos mapas del usuario (`GET maps/list`, recortado a
 *      los primeros 5 — el endpoint ya viene ordenado por
 *      `updated_at DESC` desde `Map::findByUser`), pintados por
 *      `RecentMapsList`. Reusamos el endpoint existente en lugar de
 *      crear uno dedicado: la respuesta de `maps/list` excluye
 *      `drawflow_json`, así que es ligera y no merece la pena
 *      duplicar.
 *
 * Estados estándar `loading | error | ok` para las stats. Para los
 * mapas recientes el fallo es silencioso (cae al EmptyState): es
 * información secundaria y no queremos romper la página por ello.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const firstName = (user?.name ?? '').split(' ')[0] || 'estudiante';

  const [statsStatus, setStatsStatus] = useState('loading');
  const [stats, setStats]             = useState(null);

  const [recentMaps, setRecentMaps]   = useState([]);
  const [hasMoreMaps, setHasMoreMaps] = useState(false);

  const loadStats = useCallback(async (signal) => {
    setStatsStatus('loading');
    try {
      const res = await fetchStats(signal);
      if (signal?.aborted) return;
      if (!res?.success) {
        setStatsStatus('error');
        notify(res?.message || 'No se pudieron cargar tus estadísticas.', 'error');
        return;
      }
      setStats(res.data ?? null);
      setStatsStatus('ok');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setStatsStatus('error');
      notify('Error de red al cargar tus estadísticas.', 'error');
    }
  }, [notify]);

  const loadRecentMaps = useCallback(async (signal) => {
    try {
      const res = await listMaps(signal);
      if (signal?.aborted) return;
      if (!res?.success || !Array.isArray(res.data)) {
        // Fallo silencioso: dejamos el EmptyState. Las stats sí
        // emitirán el toast si hay un problema general.
        return;
      }
      setRecentMaps(res.data.slice(0, RECENT_MAPS_LIMIT));
      setHasMoreMaps(res.data.length > RECENT_MAPS_LIMIT);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      // Igual que arriba: fallo silencioso para la sección secundaria.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadStats(controller.signal);
    loadRecentMaps(controller.signal);
    return () => controller.abort();
  }, [loadStats, loadRecentMaps]);

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-muted">¡Hola de nuevo!</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink">
          Buen día,&nbsp;
          <span className="bg-gradient-to-r from-brand-600 to-coral-400 bg-clip-text text-transparent">
            {firstName}
          </span>
        </h1>
        <p className="text-ink-muted text-sm md:text-base mt-1">
          Aquí verás tu progreso y los últimos mapas en los que has trabajado.
        </p>
      </header>

      <DashboardStatsSection
        status={statsStatus}
        stats={stats}
        onRetry={() => loadStats()}
      />

      <RecentMapsList maps={recentMaps} showSeeAll={hasMoreMaps} />
    </div>
  );
}
