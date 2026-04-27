import { Card } from '@/ui/Card.jsx';
import { Spinner } from '@/ui/Spinner.jsx';
import { Button } from '@/ui/Button.jsx';
import { StatsCard } from './StatsCard.jsx';

/**
 * Sección de estadísticas reales del usuario en la página de Inicio.
 *
 * Sustituye al `StudyStatsSection` huérfano de la feature profile
 * (que mostraba ceros mock). Aquí los valores vienen de
 * `GET dashboard/stats` y se pintan con el `StatsCard` ya existente
 * en la propia feature dashboard, así que no duplicamos el componente
 * visual.
 *
 * Las tres tarjetas mantienen los labels acordados con el alumno:
 *   - "Mapas creados"        ← maps_total.
 *   - "Flashcards repasadas" ← flashcards_reviewed_total.
 *   - "Racha actual"         ← streak_days, formateado como "N días".
 *
 * El endpoint también devuelve `flashcards_total`, pero la página
 * pinta sólo 3 tarjetas; mantenemos `flashcards_total` disponible en
 * el JSON por si en el futuro se añade una cuarta métrica
 * ("Flashcards creadas") sin tener que volver a tocar backend.
 *
 * Estados:
 *   - status === 'loading' → spinner.
 *   - status === 'error'   → card con CTA "Reintentar".
 *   - status === 'ok'      → grid 1/2/3 con tres `StatsCard`.
 *
 * Props:
 *   - status:  'loading' | 'error' | 'ok'.
 *   - stats:   objeto del backend o null.
 *   - onRetry: callback() para reintentar tras error.
 */
export function DashboardStatsSection({ status, stats, onRetry }) {
  if (status === 'loading') {
    return (
      <section aria-label="Resumen de estudio" aria-busy="true">
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section aria-label="Resumen de estudio">
        <Card padded className="text-center">
          <i className="fas fa-cloud-bolt text-2xl text-coral-500" aria-hidden="true" />
          <p className="mt-2 font-semibold text-ink">No pudimos cargar tus estadísticas</p>
          <p className="text-sm text-ink-muted mt-1">
            Comprueba tu conexión y vuelve a intentarlo.
          </p>
          {onRetry && (
            <div className="mt-4">
              <Button variant="ghost" onClick={onRetry}>
                <i className="fas fa-rotate-right" aria-hidden="true" />
                Reintentar
              </Button>
            </div>
          )}
        </Card>
      </section>
    );
  }

  const safe = stats ?? {};
  const mapsTotal     = Number.isFinite(safe.maps_total)                ? safe.maps_total                : 0;
  const reviewedTotal = Number.isFinite(safe.flashcards_reviewed_total) ? safe.flashcards_reviewed_total : 0;
  const streakDays    = Number.isFinite(safe.streak_days)               ? safe.streak_days               : 0;
  const streakLabel   = `${streakDays} ${streakDays === 1 ? 'día' : 'días'}`;

  return (
    <section
      aria-label="Resumen de estudio"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <StatsCard
        icon="fa-diagram-project"
        tone="brand"
        value={mapsTotal}
        label="Mapas creados"
      />
      <StatsCard
        icon="fa-clone"
        tone="sun"
        value={reviewedTotal}
        label="Flashcards repasadas"
      />
      <StatsCard
        icon="fa-fire-flame-curved"
        tone="coral"
        value={streakLabel}
        label="Racha actual"
      />
    </section>
  );
}
