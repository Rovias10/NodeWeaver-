import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';
import { Spinner } from '@/ui/Spinner.jsx';
import { useNotification } from '@/ui/useNotification.js';
import { fetchFavorites } from '../services/communityService.js';
import { PublicMapCard } from '../components/PublicMapCard.jsx';
import { EmptyFeedState } from '../components/EmptyFeedState.jsx';

const PAGE_SIZE = 12;

/**
 * "Mis favoritos" — ruta `/comunidad/favoritos`.
 *
 * Reusa el patrón del feed (mismo grid + load-more) pero alimentado
 * por `community/favorites`. Coherente con la decisión §0 del
 * community-plan: en StudyWeaver los likes funcionan a la vez como
 * bookmarks, sin tabla extra.
 *
 * Cuando el usuario quita el like sobre una tarjeta (toggle off), la
 * tarjeta deja de ser un favorito por definición y la sacamos del
 * listado en la misma actualización local — evita la situación
 * confusa de "veo la tarjeta sin el corazón en mi página de
 * favoritos".
 */
export function MyFavoritesPage() {
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [status, setStatus]           = useState('loading'); // 'loading' | 'error' | 'ok'
  const [items, setItems]             = useState([]);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadFirst = useCallback(async () => {
    setStatus('loading');
    setPage(1);
    try {
      const res = await fetchFavorites({ page: 1, page_size: PAGE_SIZE });
      if (!res.success) {
        setStatus('error');
        notify(res.message || 'No se pudieron cargar tus favoritos.', 'error');
        return;
      }
      setItems(Array.isArray(res.data) ? res.data : []);
      setHasMore(Boolean(res.pagination?.has_more));
      setStatus('ok');
    } catch {
      setStatus('error');
      notify('Error de red al cargar tus favoritos.', 'error');
    }
  }, [notify]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await fetchFavorites({ page: next, page_size: PAGE_SIZE });
      if (!res.success) {
        notify(res.message || 'No se pudo cargar más.', 'error');
        return;
      }
      const newItems = Array.isArray(res.data) ? res.data : [];
      setItems((prev) => [...prev, ...newItems]);
      setPage(next);
      setHasMore(Boolean(res.pagination?.has_more));
    } catch {
      notify('Error de red al cargar más.', 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, notify]);

  // Toggle de like: si el usuario quita el like aquí, la tarjeta
  // deja de ser un favorito → fuera del listado. Si lo deja puesto
  // (caso raro de doble click), actualizamos sólo el contador.
  const handleLikeChange = (mapId, { liked, count }) => {
    if (!liked) {
      setItems((prev) => prev.filter((m) => m.id !== mapId));
      return;
    }
    setItems((prev) =>
      prev.map((m) =>
        m.id === mapId ? { ...m, liked_by_me: true, likes_count: count } : m
      )
    );
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="md" onClick={() => navigate('/comunidad')}>
          <i className="fas fa-arrow-left" aria-hidden="true" />
          Volver al feed
        </Button>
      </div>

      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-ink">Mis favoritos</h1>
        <p className="text-ink-muted text-sm mt-1">
          Los mapas a los que has dado like — guardados para que puedas volver a ellos.
        </p>
      </header>

      {status === 'loading' && (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      )}

      {status === 'error' && (
        <Card padded className="text-center">
          <i className="fas fa-cloud-bolt text-3xl text-coral-500" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">No pudimos cargar tus favoritos</p>
          <p className="text-sm text-ink-muted mt-1">
            Comprueba tu conexión y vuelve a intentarlo.
          </p>
          <div className="mt-5">
            <Button variant="ghost" onClick={loadFirst}>
              <i className="fas fa-rotate-right" aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        </Card>
      )}

      {status === 'ok' && items.length === 0 && (
        <EmptyFeedState mode="favorites" />
      )}

      {status === 'ok' && items.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((m) => (
              <PublicMapCard key={m.id} map={m} onLikeChange={handleLikeChange} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="ghost" onClick={loadMore} isLoading={loadingMore}>
                <i className="fas fa-circle-down" aria-hidden="true" />
                Cargar más
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
