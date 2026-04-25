import { Card } from '@/components/ui/Card.jsx';
import { EmptyState } from './EmptyState.jsx';

/**
 * Listado de mapas recientes del usuario.
 *
 * En Fase 3 siempre muestra el EmptyState (no hay endpoint /maps/list
 * todavía). En Fase Maps recibirá maps[] como prop y renderizará un
 * grid con las miniaturas. Mantenemos aquí la API que tendrá esa
 * versión: { maps: Map[] }.
 */
export function RecentMapsList({ maps = [] }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-line">
        <h2 className="text-lg font-semibold text-ink">Tus últimos mapas</h2>
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
        <ul className="divide-y divide-line/60">
          {maps.map((map) => (
            <li key={map.id} className="px-6 py-4 flex items-center gap-4">
              <i className="fas fa-diagram-project text-brand-500" aria-hidden="true" />
              <span className="font-medium text-ink truncate">{map.title}</span>
              <span className="ml-auto text-xs text-ink-faint">{map.updated_at}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
