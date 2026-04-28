import { useEffect, useState } from 'react';
import { useNotification } from '@/ui/useNotification.js';
import { toggleLike } from '../services/communityService.js';

/**
 * Botón de like (corazón) con contador.
 *
 * Diseño optimista: actualiza el estado local antes de la respuesta
 * del servidor. Si la petición falla, revierte y muestra un toast.
 * Esto cumple el RA7 0612 ("aplicación cliente asíncrona") de un
 * modo visible: la UI no espera al backend para sentirse responsiva.
 *
 * Props:
 *   - mapId:    id del mapa al que likear.
 *   - liked:    estado inicial (bool).
 *   - count:    contador inicial (int).
 *   - onChange: callback opcional ({ liked, count }) tras éxito.
 *   - disabled: bloquea la interacción (p. ej. mientras el feed carga).
 *   - size:     'sm' | 'md' (afecta sólo al tamaño del texto).
 */
export function LikeButton({
  mapId,
  liked,
  count,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
}) {
  const { notify } = useNotification();
  const [optLiked, setOptLiked] = useState(Boolean(liked));
  const [optCount, setOptCount] = useState(Number(count) || 0);
  const [pending, setPending]   = useState(false);

  // Re-sincronizar si los props cambian externamente (p. ej. el padre
  // recarga el feed con cifras nuevas). Evitamos pisar la actualización
  // optimista mientras hay una petición en curso.
  useEffect(() => {
    if (pending) return;
    setOptLiked(Boolean(liked));
    setOptCount(Number(count) || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liked, count]);

  const handleClick = async () => {
    if (pending || disabled) return;

    const prevLiked = optLiked;
    const prevCount = optCount;
    const nextLiked = !prevLiked;
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));

    setOptLiked(nextLiked);
    setOptCount(nextCount);
    setPending(true);

    try {
      const res = await toggleLike(mapId);
      if (!res.success) {
        // Revertimos optimismo y avisamos.
        setOptLiked(prevLiked);
        setOptCount(prevCount);
        notify(res.message || 'No se pudo registrar el like.', 'error');
        return;
      }
      // Tomamos los valores canónicos del servidor (puede haber drift).
      const finalLiked = Boolean(res.data?.liked);
      const finalCount = Number.isFinite(Number(res.data?.count))
        ? Number(res.data.count)
        : nextCount;
      setOptLiked(finalLiked);
      setOptCount(finalCount);
      onChange?.({ liked: finalLiked, count: finalCount });
    } catch {
      setOptLiked(prevLiked);
      setOptCount(prevCount);
      notify('Error de red al registrar el like.', 'error');
    } finally {
      setPending(false);
    }
  };

  const textSize  = size === 'sm' ? 'text-xs' : 'text-sm';
  const iconColor = optLiked ? 'text-coral-500' : 'text-ink-muted';
  // Con `fa-solid` (fas) el corazón sale relleno; con `fa-regular` (far)
  // sale como contorno. Usamos lo segundo cuando aún no hay like.
  const iconStyle = optLiked ? 'fas' : 'far';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || disabled}
      aria-pressed={optLiked}
      aria-label={optLiked ? 'Quitar like' : 'Dar like'}
      title={`${optCount} ${optCount === 1 ? 'like' : 'likes'}`}
      className={
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-lg ' +
        'hover:bg-brand-50 disabled:opacity-60 disabled:cursor-not-allowed ' +
        'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ' +
        textSize + ' ' + className
      }
    >
      <i className={`${iconStyle} fa-heart ${iconColor}`} aria-hidden="true" />
      <span className="text-ink-muted tabular-nums font-semibold">{optCount}</span>
    </button>
  );
}
