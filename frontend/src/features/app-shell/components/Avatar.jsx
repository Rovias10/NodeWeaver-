import { useEffect, useState } from 'react';

/**
 * Avatar circular con fallback robusto a iniciales.
 *
 * - Si user.avatar_url existe y la imagen carga, muestra la imagen.
 * - Si la imagen falla (404, CORS, ruta legacy rota), automáticamente
 *   pinta las iniciales sobre un gradient veraniego.
 * - Si no hay avatar_url, va directo a iniciales.
 *
 * El estado broken se resetea cuando cambia user.avatar_url, lo que
 * permite que tras subir un avatar nuevo el componente lo vuelva a
 * intentar sin necesidad de remontarlo.
 */
function getInitials(name) {
  if (!name || typeof name !== 'string') return '·';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '·';
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-24 h-24 text-2xl',
};

export function Avatar({ user, size = 'md', className = '' }) {
  const url = user?.avatar_url ?? null;
  const [broken, setBroken] = useState(false);

  // Reset al cambiar la URL: tras un upload nuevo no queremos seguir
  // mostrando las iniciales si la nueva imagen sí carga.
  useEffect(() => {
    setBroken(false);
  }, [url]);

  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const baseClass = `${sizeClass} rounded-full flex items-center justify-center font-bold flex-shrink-0 ${className}`;

  if (url && !broken) {
    return (
      <img
        src={url}
        alt={user?.name ?? 'Avatar'}
        onError={() => setBroken(true)}
        className={`${baseClass} object-cover border border-line bg-white`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${baseClass} bg-gradient-to-br from-brand-400 to-sun-300 text-white shadow-[var(--shadow-glow-brand)]`}
    >
      {getInitials(user?.name)}
    </span>
  );
}
