import { Link } from 'react-router';
import { relativeTime } from '@/utils/relativeTime.js';
import { Avatar } from './Avatar.jsx';

/**
 * Una entrada del hilo de comentarios.
 *
 * El backend ya manda `can_delete` precalculado con la lógica
 * "autor del comentario o autor del mapa", así que el frontend no
 * necesita cruzar IDs en cliente. Si `can_delete` es false o no
 * pasamos `onDelete`, no renderizamos la papelera.
 *
 * Props:
 *  - comment:      { id, body, created_at, author: {id, name, avatar_url}, can_delete }.
 *  - onDelete:     callback(comment) opcional. Si está y can_delete=true, pinta papelera.
 *  - isDeleting:   bool para mostrar el botón en estado loading.
 */
export function CommentItem({ comment, onDelete, isDeleting = false }) {
  const author = comment.author ?? {};
  const profileTo = author.id ? `/u/${author.id}` : '#';
  const showDelete = Boolean(comment.can_delete) && typeof onDelete === 'function';

  return (
    <article
      className="flex gap-3 py-4 border-b border-line last:border-b-0"
      aria-labelledby={`comment-author-${comment.id}`}
    >
      <Link
        to={profileTo}
        title={`Ver perfil de ${author.name ?? 'autor'}`}
        className="shrink-0 hover:opacity-80"
      >
        <Avatar src={author.avatar_url} name={author.name} size="md" />
      </Link>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              id={`comment-author-${comment.id}`}
              to={profileTo}
              className="text-sm font-semibold text-ink truncate hover:underline"
            >
              {author.name ?? 'Anónimo'}
            </Link>
            <span className="text-xs text-ink-faint" title={comment.created_at ?? ''}>
              · {relativeTime(comment.created_at)}
            </span>
          </div>
          {showDelete && (
            <button
              type="button"
              onClick={() => onDelete(comment)}
              disabled={isDeleting}
              aria-label="Eliminar comentario"
              title="Eliminar comentario"
              className="
                text-ink-faint hover:text-coral-500 hover:bg-coral-400/10
                rounded-lg p-1.5 transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-400
                disabled:opacity-60 disabled:cursor-not-allowed
              "
            >
              <i className="fas fa-trash text-sm" aria-hidden="true" />
            </button>
          )}
        </div>
        {/* Body: text-only. Mantenemos saltos de línea con
            whitespace-pre-line; el backend ya hace trim y limita a
            1000 chars, así que no hay riesgo de párrafo gigantesco. */}
        <p className="mt-1 text-sm text-ink whitespace-pre-line break-words">
          {comment.body}
        </p>
      </div>
    </article>
  );
}

