import { Link } from 'react-router';
import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';
import { relativeTime } from '@/utils/relativeTime.js';

/**
 * Tarjeta resumen de un mapa en el listado del dashboard.
 *
 * No carga drawflow_json — el listado es ligero (lo trae maps/list).
 * Sólo al pulsar "Abrir" se navega a /mapas/:id, donde se hará el get
 * completo con drawflow_json (Subfase M3).
 *
 * Props:
 *   - map:       fila de maps/list (id, title, description, is_public, updated_at, created_at).
 *   - onDelete:  callback que dispara el padre para abrir DeleteMapDialog.
 */
export function MapCard({ map, onDelete }) {
  const description = (map.description ?? '').trim();
  const truncated = description.length > 140
    ? description.slice(0, 137) + '…'
    : description;

  return (
    <Card padded className="flex flex-col gap-4 h-full">
      {/* Cabecera: badge + fecha relativa */}
      <div className="flex items-start justify-between gap-3">
        <span
          className={
            'text-xs font-semibold px-2.5 py-1 rounded-full border ' +
            (map.is_public
              ? 'bg-mint-400/15 text-emerald-700 border-mint-400/40'
              : 'bg-brand-50 text-brand-700 border-brand-200')
          }
        >
          <i
            className={`fas ${map.is_public ? 'fa-globe' : 'fa-lock'} mr-1.5`}
            aria-hidden="true"
          />
          {map.is_public ? 'Público' : 'Privado'}
        </span>
        <span className="text-xs text-ink-faint" title={map.updated_at}>
          {relativeTime(map.updated_at)}
        </span>
      </div>

      {/* Cuerpo: título + descripción */}
      <div className="flex-1">
        <h3 className="text-lg font-bold text-ink leading-snug line-clamp-2">
          {map.title || 'Mapa sin título'}
        </h3>
        {truncated ? (
          <p className="text-sm text-ink-muted mt-2 line-clamp-3">{truncated}</p>
        ) : (
          <p className="text-sm text-ink-faint italic mt-2">Sin descripción.</p>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-line">
        <Link to={`/mapas/${map.id}`} className="flex-1">
          <Button variant="primary" size="md" className="w-full">
            <i className="fas fa-arrow-right" aria-hidden="true" />
            Abrir
          </Button>
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => onDelete(map)}
          aria-label={`Eliminar mapa ${map.title}`}
          title="Eliminar mapa"
        >
          <i className="fas fa-trash text-coral-500" aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}
