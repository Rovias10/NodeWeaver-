import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';
import { Spinner } from '@/ui/Spinner.jsx';
import { useNotification } from '@/ui/useNotification.js';
import { useAuth } from '@/auth/useAuth.js';
import { fetchProfile, fetchProfileMaps } from '../services/communityService.js';
import { PublicMapCard } from '../components/PublicMapCard.jsx';
import { Avatar } from '../components/Avatar.jsx';

const PAGE_SIZE = 12;

/**
 * Perfil público de un usuario — ruta `/u/:userId`.
 *
 * Muestra avatar grande, nombre y número total de mapas públicos del
 * autor, seguidos por un grid paginado de sus mapas. Sin email,
 * teléfono ni datos sensibles (RGPD: el backend ya filtra esos
 * campos en `community/profile`).
 *
 * Si el visitante coincide con el autor, mostramos un aviso
 * informativo "Este es tu perfil público" + acceso rápido a /mapas
 * para gestionar sus mapas (la página actual es de sólo lectura).
 *
 * Cumple RA2 0615 (Grid Layout) reutilizando `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
 */
export function PublicProfilePage() {
  const { userId: rawId } = useParams();
  const userId = Number(rawId);
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { user } = useAuth();

  const [status, setStatus]             = useState('loading'); // 'loading' | 'error' | 'ok'
  const [profile, setProfile]           = useState(null);
  const [maps, setMaps]                 = useState([]);
  const [page, setPage]                 = useState(1);
  const [hasMore, setHasMore]           = useState(false);
  const [loadingMore, setLoadingMore]   = useState(false);

  const isMe = user && Number(user.id) === userId;

  // ── Carga inicial: profile + página 1 de mapas en paralelo ────────
  const loadFirst = useCallback(async () => {
    if (!userId || userId <= 0) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    setPage(1);
    try {
      const [resProfile, resMaps] = await Promise.all([
        fetchProfile(userId),
        fetchProfileMaps(userId, { page: 1, page_size: PAGE_SIZE }),
      ]);
      if (!resProfile.success) {
        setStatus('error');
        notify(resProfile.message || 'Usuario no encontrado.', 'error');
        return;
      }
      if (!resMaps.success) {
        setStatus('error');
        notify(resMaps.message || 'No se pudieron cargar los mapas del perfil.', 'error');
        return;
      }
      setProfile(resProfile.data);
      setMaps(Array.isArray(resMaps.data) ? resMaps.data : []);
      setHasMore(Boolean(resMaps.pagination?.has_more));
      setStatus('ok');
    } catch {
      setStatus('error');
      notify('Error de red al cargar el perfil.', 'error');
    }
  }, [userId, notify]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  // ── Cargar siguiente página de mapas ──────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await fetchProfileMaps(userId, { page: next, page_size: PAGE_SIZE });
      if (!res.success) {
        notify(res.message || 'No se pudo cargar más.', 'error');
        return;
      }
      const newItems = Array.isArray(res.data) ? res.data : [];
      setMaps((prev) => [...prev, ...newItems]);
      setPage(next);
      setHasMore(Boolean(res.pagination?.has_more));
    } catch {
      notify('Error de red al cargar más.', 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, userId, notify]);

  // ── Sincronizar count tras toggle de like en una tarjeta ──────────
  const handleLikeChange = (mapId, { liked, count }) => {
    setMaps((prev) =>
      prev.map((m) =>
        m.id === mapId
          ? { ...m, liked_by_me: liked, likes_count: count }
          : m
      )
    );
  };

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (status === 'error' || !profile) {
    return (
      <div className="max-w-md mx-auto">
        <Card padded className="text-center">
          <i className="fas fa-user-slash text-3xl text-coral-500" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">Perfil no disponible</p>
          <p className="text-sm text-ink-muted mt-1">
            Puede que el usuario no exista o que aún no haya compartido nada.
          </p>
          <div className="mt-5">
            <Button variant="ghost" onClick={() => navigate('/comunidad')}>
              <i className="fas fa-arrow-left" aria-hidden="true" />
              Volver al feed
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const totalPublic = Number(profile.public_maps_count ?? 0);

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      {/* Volver al feed */}
      <div>
        <Button variant="ghost" size="md" onClick={() => navigate('/comunidad')}>
          <i className="fas fa-arrow-left" aria-hidden="true" />
          Volver al feed
        </Button>
      </div>

      {/* Cabecera del perfil */}
      <Card padded className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <Avatar src={profile.avatar_url} name={profile.name} size="xl" />
        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-2xl md:text-3xl font-bold text-ink">
            {profile.name || 'Anónimo'}
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            {totalPublic === 0
              ? 'Aún no ha compartido mapas.'
              : `${totalPublic} ${totalPublic === 1 ? 'mapa público' : 'mapas públicos'}`}
          </p>
          {isMe && (
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-50 text-brand-700 text-xs font-semibold border border-brand-200">
              <i className="fas fa-circle-info" aria-hidden="true" />
              Este es tu perfil público.{' '}
              <button
                type="button"
                onClick={() => navigate('/mapas')}
                className="underline hover:text-brand-800"
              >
                Gestiona tus mapas
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Grid de mapas públicos del autor */}
      {maps.length === 0 ? (
        <Card padded className="text-center">
          <i className="fas fa-folder-open text-3xl text-ink-faint mb-3" aria-hidden="true" />
          <h3 className="text-lg font-bold text-ink">Sin mapas públicos</h3>
          <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto">
            {isMe
              ? 'Cuando hagas público alguno de tus mapas aparecerá aquí para que cualquiera pueda verlo.'
              : 'Este usuario aún no ha hecho público ningún mapa.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {maps.map((m) => (
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

