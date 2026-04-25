import { useAuth } from '@/auth/useAuth.js';
import { StatsCard } from './StatsCard.jsx';
import { RecentMapsList } from './RecentMapsList.jsx';

/**
 * Página de inicio del shell autenticado.
 *
 * En Fase 3 todas las métricas son MOCK (0). El propósito es validar
 * que el shell + ProtectedRoute + AuthContext funcionan, y dejar el
 * andamiaje listo para enchufarlo a /maps/list y /flashcards/stats
 * en fases posteriores.
 *
 * No introducimos llamadas reales a backend aún para no añadir endpoints
 * y errores que distraigan del objetivo de Fase 3.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const firstName = (user?.name ?? '').split(' ')[0] || 'estudiante';

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

      <section
        aria-label="Resumen de estudio"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <StatsCard
          icon="fa-diagram-project"
          tone="brand"
          value={0}
          label="Mapas creados"
          hint="datos de ejemplo"
        />
        <StatsCard
          icon="fa-clone"
          tone="sun"
          value={0}
          label="Flashcards repasadas"
          hint="datos de ejemplo"
        />
        <StatsCard
          icon="fa-fire-flame-curved"
          tone="coral"
          value="0 días"
          label="Racha actual"
          hint="datos de ejemplo"
        />
      </section>

      <RecentMapsList maps={[]} />
    </div>
  );
}
