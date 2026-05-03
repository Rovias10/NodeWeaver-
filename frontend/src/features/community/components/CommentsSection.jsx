import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';
import { Spinner } from '@/ui/Spinner.jsx';
import { useNotification } from '@/ui/useNotification.js';
import {
  fetchComments,
  createComment,
  deleteComment,
} from '../services/communityService.js';
import { CommentItem } from './CommentItem.jsx';

const PAGE_SIZE = 20;
/** Mismas constantes que el backend (ver CommentController). */
const BODY_MAX = 1000;

/**
 * Sección de comentarios de un mapa público.
 *
 * Carga el hilo paginado, permite añadir un comentario nuevo y
 * borrar los propios (o los de los demás si soy dueño del mapa —
 * decisión backend, ver `can_delete` en cada item).
 *
 * Estados:
 *   loading → spinner.
 *   error   → mensaje + reintentar.
 *   ok      → form + lista + load-more.
 *
 * Props:
 *  - mapId: id del mapa al que pertenece el hilo.
 *  - onCountChange: callback opcional (newCount) para que la cabecera
 *                   del padre actualice su contador tras crear/borrar.
 */
export function CommentsSection({ mapId, onCountChange }) {
  const { notify } = useNotification();

  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ok'
  const [items, setItems]   = useState([]);
  const [page, setPage]     = useState(1);
  const [total, setTotal]   = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [body, setBody]           = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const loadFirst = useCallback(async () => {
    setStatus('loading');
    setPage(1);
    try {
      const res = await fetchComments(mapId, { page: 1, page_size: PAGE_SIZE });
      if (!res.success) {
        setStatus('error');
        notify(res.message || 'No se pudieron cargar los comentarios.', 'error');
        return;
      }
      setItems(Array.isArray(res.data) ? res.data : []);
      setHasMore(Boolean(res.pagination?.has_more));
      setTotal(Number(res.pagination?.total ?? 0));
      onCountChange?.(Number(res.pagination?.total ?? 0));
      setStatus('ok');
    } catch {
      setStatus('error');
      notify('Error de red al cargar los comentarios.', 'error');
    }
  }, [mapId, notify, onCountChange]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await fetchComments(mapId, { page: next, page_size: PAGE_SIZE });
      if (!res.success) {
        notify(res.message || 'No se pudo cargar más.', 'error');
        return;
      }
      const newItems = Array.isArray(res.data) ? res.data : [];
      setItems((prev) => [...prev, ...newItems]);
      setPage(next);
      setHasMore(Boolean(res.pagination?.has_more));
    } catch {
      notify('Error de red al cargar más comentarios.', 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, mapId, notify]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    if (trimmed.length > BODY_MAX) {
      notify(`El comentario no puede superar ${BODY_MAX} caracteres.`, 'error');
      return;
    }

    setIsPosting(true);
    try {
      const res = await createComment(mapId, trimmed);
      if (!res.success) {
        notify(res.message || 'No se pudo publicar el comentario.', 'error');
        return;
      }
      setItems((prev) => [...prev, res.data]);
      setTotal((prev) => {
        const next = prev + 1;
        onCountChange?.(next);
        return next;
      });
      setBody('');
      notify('Comentario publicado.', 'success');
    } catch {
      notify('Error de red al publicar el comentario.', 'error');
    } finally {
      setIsPosting(false);
    }
  };

  const handleDelete = async (comment) => {
    const ok = window.confirm('¿Eliminar este comentario? Esta acción no se puede deshacer.');
    if (!ok) return;

    setDeletingId(comment.id);
    try {
      const res = await deleteComment(comment.id);
      if (!res.success) {
        notify(res.message || 'No se pudo eliminar el comentario.', 'error');
        return;
      }
      setItems((prev) => prev.filter((c) => c.id !== comment.id));
      setTotal((prev) => {
        const next = Math.max(0, prev - 1);
        onCountChange?.(next);
        return next;
      });
      notify('Comentario eliminado.', 'success');
    } catch {
      notify('Error de red al eliminar el comentario.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const remaining = BODY_MAX - body.length;
  const overLimit = remaining < 0;

  return (
    <Card padded className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">
          Comentarios
          <span className="ml-2 text-sm text-ink-muted font-medium">({total})</span>
        </h2>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="new-comment" className="sr-only">
          Escribe un comentario
        </label>
        <textarea
          id="new-comment"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={BODY_MAX + 50}
          placeholder="Escribe un comentario…"
          className="
            w-full bg-white/70 border border-line rounded-xl px-4 py-3
            text-sm text-ink placeholder-ink-faint resize-y
            focus:outline-none focus:ring-2 focus:ring-brand-400/60 focus:border-brand-400/60
          "
        />
        <div className="flex items-center justify-between gap-3">
          <span
            className={
              'text-xs ' +
              (overLimit ? 'text-coral-500 font-semibold' : 'text-ink-faint')
            }
          >
            {overLimit
              ? `Te has pasado por ${Math.abs(remaining)} caracteres.`
              : `${remaining} caracteres restantes`}
          </span>
          <Button
            type="submit"
            size="md"
            isLoading={isPosting}
            disabled={isPosting || !body.trim() || overLimit}
          >
            <i className="fas fa-paper-plane" aria-hidden="true" />
            Publicar
          </Button>
        </div>
      </form>

      {status === 'loading' && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {status === 'error' && (
        <div className="text-center py-6">
          <p className="text-sm text-ink-muted">No se pudo cargar el hilo.</p>
          <div className="mt-3">
            <Button variant="ghost" onClick={loadFirst}>
              <i className="fas fa-rotate-right" aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        </div>
      )}

      {status === 'ok' && items.length === 0 && (
        <p className="text-sm text-ink-muted text-center py-6">
          Aún no hay comentarios. Sé el primero en escribir uno.
        </p>
      )}

      {status === 'ok' && items.length > 0 && (
        <div className="divide-y divide-line">
          {items.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              onDelete={handleDelete}
              isDeleting={deletingId === c.id}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={loadMore} isLoading={loadingMore}>
            <i className="fas fa-circle-down" aria-hidden="true" />
            Cargar más
          </Button>
        </div>
      )}
    </Card>
  );
}
