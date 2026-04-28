import { Link } from 'react-router';
import { Card } from '@/ui/Card.jsx';
import { relativeTime } from '@/utils/relativeTime.js';
import { EmptyState } from './EmptyState.jsx';

/**
 * Listado vertical compacto con los mapas más recientes del usuario,
 * pensado para la página de Inicio. Cada item enlaza al editor del
 * mapa concreto (`/mapas/:id`) y muestra la fecha de última edición
 * en formato relativo ("hace 3 días") usando `relativeTime`.
 *
 * El llamador (`DashboardPage`) ya filtra a los N más recientes y
 * decide si mostrar el enlace "Ver todos". Aquí sólo nos preocupamos
 * de pintar la lista o el `EmptyState` si no hay nada.
 *
 * Props:
 *   - maps:    array de mapas (subset de la respuesta de `maps/list`).
 *   - showSeeAll: bool. Si true, pinta un enlace "Ver todos" abajo
 *                 que lleva a `/mapas`.
 */
export function RecentMapsList({ maps = [], showSeeAll = false }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-line">
        <h2 className="text-lg font-semibold text-ink">Tus últimos mapas</h2>
        {maps.length > 0 && (
          <Link
            to="/mapas"
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Ir a Mis mapas
          </Link>
        )}
      </div>

      {maps.length === 0 ? (
        <EmptyState
          icon="fa-diagram-project"
          title="Aún no tienes mapas"
          message="Cuando crees tu primer mapa, lo verás aquí. La idea: empezar con un PDF o tema y dejar que la IA lo expanda."
          actionLabel="Crear mi primer mapa"
          actionTo="/mapas"
        />
      ) : (
        <>
          <ul className="divide-y divide-line/60">
            {maps.map((map) => (
              <li key={map.id}>
                <Link
                  to={`/mapas/${map.id}`}
                  className="px-6 py-4 flex items-center gap-4 hover:bg-brand-50/60 transition-colors"
                >
                  <i
                    className="fas fa-diagram-project text-brand-500"
                    aria-hidden="true"
                  />
                  <span className="font-medium text-ink truncate">{map.title}</span>
                  <span className="ml-auto text-xs text-ink-faint whitespace-nowrap">
                    {relativeTime(map.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {showSeeAll && (
            <div className="px-6 py-3 border-t border-line/60 text-center">
              <Link
                to="/mapas"
                className="text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                Ver todos
              </Link>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
