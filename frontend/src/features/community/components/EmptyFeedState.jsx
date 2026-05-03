import { Link } from 'react-router';
import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';

/**
 * Estado vacío del feed comunidad. Tres modos:
 *  - 'no-results': hay filtro `q` activo y no hay coincidencias.
 *  - 'empty':       el feed entero está vacío (nadie ha hecho público).
 *                   CTA: ir a Mis mapas a hacer público alguno.
 *  - 'favorites':   el usuario aún no ha guardado favoritos.
 *                   CTA: ir al feed.
 */
export function EmptyFeedState({ mode = 'empty', onResetFilter }) {
  if (mode === 'no-results') {
    return (
      <Card padded className="text-center">
        <i className="fas fa-search text-3xl text-ink-faint mb-3" aria-hidden="true" />
        <h3 className="text-lg font-bold text-ink">Sin coincidencias</h3>
        <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto">
          Prueba con otra palabra clave o limpia la búsqueda para ver todo el feed.
        </p>
        {onResetFilter && (
          <div className="mt-5">
            <Button variant="ghost" onClick={onResetFilter}>
              <i className="fas fa-rotate-left" aria-hidden="true" />
              Limpiar búsqueda
            </Button>
          </div>
        )}
      </Card>
    );
  }

  if (mode === 'favorites') {
    return (
      <Card padded className="text-center">
        <i className="fas fa-bookmark text-3xl text-ink-faint mb-3" aria-hidden="true" />
        <h3 className="text-lg font-bold text-ink">Aún no tienes favoritos</h3>
        <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto">
          Da like a un mapa del feed y aparecerá aquí para que lo encuentres rápido.
        </p>
        <div className="mt-5">
          <Link to="/comunidad" className="inline-flex">
            <Button>
              <i className="fas fa-compass" aria-hidden="true" />
              Explorar el feed
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card padded className="text-center">
      <i className="fas fa-users text-3xl text-ink-faint mb-3" aria-hidden="true" />
      <h3 className="text-lg font-bold text-ink">Aún no hay mapas públicos</h3>
      <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto">
        Sé el primero en compartir: abre uno de tus mapas, márcalo como público
        y empezarás a verlo aquí junto al de otros estudiantes.
      </p>
      <div className="mt-5">
        <Link to="/mapas" className="inline-flex">
          <Button>
            <i className="fas fa-share-nodes" aria-hidden="true" />
            Ir a mis mapas
          </Button>
        </Link>
      </div>
    </Card>
  );
}
