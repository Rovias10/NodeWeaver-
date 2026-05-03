import { Link } from 'react-router';
import { Card } from '@/ui/Card.jsx';
import { relativeTime } from '@/utils/relativeTime.js';
import { LikeButton } from './LikeButton.jsx';
import { Avatar } from './Avatar.jsx';

/**
 * Tarjeta de un mapa en el feed comunidad.
 *
 * Diferencias frente a MapCard del dashboard:
 *  - Cabecera con avatar+nombre del autor (link a /u/:userId).
 *  - Sin acciones de eliminar (los mapas ajenos sólo se consumen).
 *  - LikeButton optimista + contador de comentarios + fecha relativa.
 *
 * Props:
 *  - map:          fila normalizada del feed (incluye author + counts + liked_by_me).
 *  - onLikeChange: callback (mapId, { liked, count }) tras toggle exitoso.
 */
export function PublicMapCard({ map, onLikeChange }) {
  const description = (map.description ?? '').trim();
  const truncated = description.length > 140
    ? description.slice(0, 137) + '…'
    : description;
  const authorId = map.author?.id;
  const authorName = map.author?.name ?? 'Anónimo';
  const profileTo = authorId ? `/u/${authorId}` : '#';

  return (
    <Card padded className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between gap-3">
        <Link
          to={profileTo}
          className="flex items-center gap-2 min-w-0 hover:opacity-80"
          title={`Ver perfil de ${authorName}`}
        >
          <Avatar src={map.author?.avatar_url} name={authorName} size="sm" />
          <span className="text-sm font-medium text-ink truncate">{authorName}</span>
        </Link>
        <span className="text-xs text-ink-faint shrink-0" title={map.updated_at ?? ''}>
          {relativeTime(map.updated_at)}
        </span>
      </div>

      <div className="flex-1">
        <Link
          to={`/comunidad/mapa/${map.id}`}
          className="block hover:underline decoration-brand-300 underline-offset-2"
        >
          <h3 className="text-lg font-bold text-ink leading-snug line-clamp-2">
            {map.title || 'Mapa sin título'}
          </h3>
        </Link>
        {truncated ? (
          <p className="text-sm text-ink-muted mt-2 line-clamp-3">{truncated}</p>
        ) : (
          <p className="text-sm text-ink-faint italic mt-2">Sin descripción.</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-line">
        <div className="flex items-center gap-1">
          <LikeButton
            mapId={map.id}
            liked={Boolean(map.liked_by_me)}
            count={map.likes_count ?? 0}
            onChange={(state) => onLikeChange?.(map.id, state)}
            size="sm"
          />
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-ink-muted"
            title={`${map.comments_count ?? 0} ${map.comments_count === 1 ? 'comentario' : 'comentarios'}`}
          >
            <i className="far fa-comment" aria-hidden="true" />
            <span className="tabular-nums font-semibold">{map.comments_count ?? 0}</span>
          </span>
        </div>
        <Link
          to={`/comunidad/mapa/${map.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-semibold hover:bg-brand-100 transition-colors"
        >
          Abrir
          <i className="fas fa-arrow-right" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}

