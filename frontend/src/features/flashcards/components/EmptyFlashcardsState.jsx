import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';

/**
 * Estado vacío del listado de flashcards. Ofrece dos rutas de
 * arranque al usuario:
 *   - Crear una tarjeta a mano (CTA principal).
 *   - Ir a sus mapas para generar un lote desde uno existente
 *     (CTA secundario).
 *
 * Props:
 *   - onCreate:    callback del botón "Crea tu primera tarjeta".
 *   - onGoToMaps:  callback del botón secundario.
 */
export function EmptyFlashcardsState({ onCreate, onGoToMaps }) {
  return (
    <Card padded>
      <div className="text-center py-6 max-w-md mx-auto">
        <span
          className="inline-flex w-16 h-16 rounded-2xl bg-brand-50 text-brand-500 items-center justify-center mb-4"
          aria-hidden="true"
        >
          <i className="fas fa-clone text-2xl" />
        </span>
        <h3 className="text-lg font-bold text-ink">Aún no tienes flashcards</h3>
        <p className="text-sm text-ink-muted mt-2">
          Crea tu primera tarjeta a mano o genera un lote a partir de un mapa
          conceptual con IA.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={onCreate}>
            <i className="fas fa-plus" aria-hidden="true" />
            Crea tu primera tarjeta
          </Button>
          {onGoToMaps && (
            <Button variant="ghost" onClick={onGoToMaps}>
              <i className="fas fa-diagram-project" aria-hidden="true" />
              Generar desde un mapa
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
