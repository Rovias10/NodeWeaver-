import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';
import { Spinner } from '@/ui/Spinner.jsx';
import { useNotification } from '@/ui/useNotification.js';
import { useAuth } from '@/auth/useAuth.js';
import { relativeTime } from '@/utils/relativeTime.js';
import { DrawflowEditor } from '@/features/maps/components/DrawflowEditor.jsx';
import { fetchPublicMap } from '../services/communityService.js';
import { LikeButton } from '../components/LikeButton.jsx';
import { CommentsSection } from '../components/CommentsSection.jsx';
import { Avatar } from '../components/Avatar.jsx';

/**
 * Vista pública de un mapa concreto — ruta `/comunidad/mapa/:id`.
 *
 * Estados:
 *   loading → spinner.
 *   error   → mensaje + volver al feed (404 o privado: mismo mensaje
 *             para no filtrar la existencia de mapas ajenos).
 *   ok      → cabecera + DrawflowEditor en read-only + CommentsSection.
 *
 * Decisiones técnicas:
 *  · El visor reusa el mismo `DrawflowEditor` con `readOnly` (Fase
 *    Comunidad C3). El componente se monta con `key={id}` para
 *    forzar remount si el usuario navega entre mapas públicos sin
 *    desmontar la página.
 *  · Si el visitante es el dueño del mapa (`owner_user_id` ===
 *    `user.id`), enseñamos un botón "Editar" que lleva a /mapas/:id.
 *  · Layout vertical (cabecera → editor → comentarios). En desktop
 *    se podría hacer 2 columnas pero un hilo de comentarios largo
 *    se lee mejor a ancho completo.
 */
export function PublicMapPage() {
  const { id: rawId } = useParams();
  const mapId = Number(rawId);
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { user } = useAuth();

  const [status, setStatus]   = useState('loading'); // 'loading' | 'error' | 'ok'
  const [mapData, setMapData] = useState(null);
  const [initialJson, setInitialJson] = useState(null);

  // Counts en estado local para que se actualicen tras likear o
  // comentar sin recargar el mapa entero.
  const [likesCount, setLikesCount]       = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);

  useEffect(() => {
    if (!mapId || mapId <= 0) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const res = await fetchPublicMap(mapId);
        if (cancelled) return;
        if (!res.success || !res.data) {
          setStatus('error');
          notify(res.message || 'Mapa no encontrado.', 'error');
          return;
        }
        const m = res.data;
        setMapData(m);
        setLikesCount(Number(m.likes_count ?? 0));
        setCommentsCount(Number(m.comments_count ?? 0));

        // El backend devuelve drawflow_json como STRING (LONGTEXT).
        // Si es null o vacío, montamos canvas vacío.
        if (m.drawflow_json) {
          try {
            setInitialJson(typeof m.drawflow_json === 'string'
              ? JSON.parse(m.drawflow_json)
              : m.drawflow_json);
          } catch {
            notify('No se pudo leer el contenido del mapa.', 'error');
            setInitialJson(null);
          }
        } else {
          setInitialJson(null);
        }
        setStatus('ok');
      } catch {
        if (!cancelled) {
          setStatus('error');
          notify('Error de red al cargar el mapa.', 'error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [mapId, notify]);

  const handleBack = () => navigate('/comunidad');
  const handleEditMine = () => navigate(`/mapas/${mapId}`);

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (status === 'error' || !mapData) {
    return (
      <div className="max-w-md mx-auto">
        <Card padded className="text-center">
          <i className="fas fa-cloud-bolt text-3xl text-coral-500" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">No pudimos cargar este mapa</p>
          <p className="text-sm text-ink-muted mt-1">
            Puede que ya no sea público o que se haya eliminado.
          </p>
          <div className="mt-5">
            <Button variant="ghost" onClick={handleBack}>
              <i className="fas fa-arrow-left" aria-hidden="true" />
              Volver al feed
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const author = mapData.author ?? {};
  const profileTo = author.id ? `/u/${author.id}` : '#';
  const isOwner = user && Number(user.id) === Number(mapData.owner_user_id);

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      {/* Volver al feed */}
      <div>
        <Button variant="ghost" size="md" onClick={handleBack}>
          <i className="fas fa-arrow-left" aria-hidden="true" />
          Volver al feed
        </Button>
      </div>

      {/* Cabecera del mapa */}
      <Card padded className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-ink leading-tight">
              {mapData.title || 'Mapa sin título'}
            </h1>
            {mapData.description && (
              <p className="text-sm text-ink-muted mt-2 max-w-2xl">
                {mapData.description}
              </p>
            )}
            {/* Autor + fecha */}
            <div className="flex items-center gap-2 mt-3">
              <Link
                to={profileTo}
                className="flex items-center gap-2 hover:opacity-80"
                title={`Ver perfil de ${author.name ?? 'autor'}`}
              >
                <Avatar src={author.avatar_url} name={author.name} size="md" />
                <span className="text-sm font-medium text-ink">
                  {author.name ?? 'Anónimo'}
                </span>
              </Link>
              <span className="text-xs text-ink-faint" title={mapData.updated_at ?? ''}>
                · {relativeTime(mapData.updated_at)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <LikeButton
              mapId={mapData.id}
              liked={Boolean(mapData.liked_by_me)}
              count={likesCount}
              onChange={({ count }) => setLikesCount(count)}
              size="md"
            />
            <span
              className="inline-flex items-center gap-1.5 px-2 py-1 text-sm text-ink-muted"
              title={`${commentsCount} ${commentsCount === 1 ? 'comentario' : 'comentarios'}`}
            >
              <i className="far fa-comment" aria-hidden="true" />
              <span className="tabular-nums font-semibold">{commentsCount}</span>
            </span>
            {isOwner && (
              <Button variant="ghost" size="md" onClick={handleEditMine}>
                <i className="fas fa-pen" aria-hidden="true" />
                Editar
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Visor Drawflow read-only */}
      <Card padded={false} className="overflow-hidden h-[60vh] min-h-[420px] relative">
        <DrawflowEditor
          key={mapData.id}
          initialJson={initialJson}
          readOnly
        />
        {/* Si el mapa no tiene contenido, hacemos un overlay informativo
            en lugar de canvas en blanco a secas. */}
        {!initialJson && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-live="polite"
          >
            <p className="text-sm text-ink-muted bg-glass border border-line rounded-2xl px-4 py-2">
              Este mapa aún no tiene conceptos.
            </p>
          </div>
        )}
      </Card>

      {/* Comentarios */}
      <CommentsSection
        mapId={mapData.id}
        onCountChange={(n) => setCommentsCount(n)}
      />
    </div>
  );
}

