import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';
import { Spinner } from '@/ui/Spinner.jsx';
import { useNotification } from '@/ui/useNotification.js';
import { fetchFeed } from '../services/communityService.js';
import { FeedToolbar } from '../components/FeedToolbar.jsx';
import { PublicMapCard } from '../components/PublicMapCard.jsx';
import { EmptyFeedState } from '../components/EmptyFeedState.jsx';

/** Tamaño de página del feed (12 entra bien en grid de 1/2/3 columnas). */
const PAGE_SIZE = 12;

/**
 * Feed público de mapas comunidad — ruta `/comunidad`.
 *
 * Estados:
 *   loading → spinner.
 *   error   → mensaje + reintentar.
 *   ok      → toolbar + grid + paginación load-more.
 *
 * Cumple RA2 0615 (Grid Layout) con grid-cols-1 sm:grid-cols-2 lg:grid-cols-3.
 *
 * Paginación acumulativa: cada vez que cambian `sort` o `q` se vuelve
 * a la página 1; el botón "Cargar más" añade ítems al final manteniendo
 * los ya pintados (mejor UX que una paginación tradicional para feeds).
 */
export function CommunityFeedPage() {
  const { notify } = useNotification();

  const [status, setStatus]           = useState('loading'); // 'loading' | 'error' | 'ok'
  const [items, setItems]             = useState([]);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [sort, setSort] = useState('recent');
  const [q, setQ]       = useState('');

  const loadFirst = useCallback(async (nextSort, nextQ) => {
    setStatus('loading');
    setPage(1);
    try {
      const res = await fetchFeed({ sort: nextSort, q: nextQ, page: 1, page_size: PAGE_SIZE });
      if (!res.success) {
        setStatus('error');
        notify(res.message || 'No se pudo cargar el feed.', 'error');
        return;
      }
      setItems(Array.isArray(res.data) ? res.data : []);
      setHasMore(Boolean(res.pagination?.has_more));
      setStatus('ok');
    } catch {
      setStatus('error');
      notify('Error de red al cargar el feed.', 'error');
    }
  }, [notify]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await fetchFeed({ sort, q, page: next, page_size: PAGE_SIZE });
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
  }, [loadingMore, hasMore, page, sort, q, notify]);

  const handleSort = (next) => {
    if (next === sort) return;
    setSort(next);
    loadFirst(next, q);
  };
  const handleQuery = (next) => {
    if (next === q) return;
    setQ(next);
    loadFirst(sort, next);
  };

  useEffect(() => {
    loadFirst('recent', '');
  }, []);

  const handleLikeChange = (mapId, { liked, count }) => {
    setItems((prev) =>
      prev.map((m) =>
        m.id === mapId
          ? { ...m, liked_by_me: liked, likes_count: count }
          : m
      )
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-ink">Comunidad</h1>
        <p className="text-ink-muted text-sm mt-1">
          Descubre mapas públicos de otros estudiantes, da likes y guarda los que te ayuden a estudiar.
        </p>
      </header>

      <FeedToolbar
        sort={sort}
        q={q}
        onSortChange={handleSort}
        onQueryChange={handleQuery}
      />

      {status === 'loading' && (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      )}

      {status === 'error' && (
        <Card padded className="text-center">
          <i className="fas fa-cloud-bolt text-3xl text-coral-500" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">No pudimos cargar el feed</p>
          <p className="text-sm text-ink-muted mt-1">
            Comprueba tu conexión y vuelve a intentarlo.
          </p>
          <div className="mt-5">
            <Button variant="ghost" onClick={() => loadFirst(sort, q)}>
              <i className="fas fa-rotate-right" aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        </Card>
      )}

      {status === 'ok' && items.length === 0 && (
        <EmptyFeedState
          mode={q ? 'no-results' : 'empty'}
          onResetFilter={q ? () => handleQuery('') : undefined}
        />
      )}

      {status === 'ok' && items.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((m) => (
              <PublicMapCard key={m.id} map={m} onLikeChange={handleLikeChange} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center mt-8">
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
