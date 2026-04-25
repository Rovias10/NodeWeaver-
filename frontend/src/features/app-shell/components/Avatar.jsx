/**
 * Avatar circular con fallback a iniciales.
 *
 * Si user.avatar_url existe y carga sin error, muestra la imagen.
 * En caso contrario, calcula iniciales del nombre y las pinta sobre
 * un fondo de gradiente brand→sun (paleta veraniega).
 *
 * No mantiene estado de "imagen rota": si la URL falla en el navegador,
 * la <img> queda en blanco. Para una versión robusta usaríamos onError
 * + useState; aquí mantenemos simple porque el modelo backend ya
 * devuelve null cuando no hay avatar real.
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
};

export function Avatar({ user, size = 'md', className = '' }) {
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const baseClass = `${sizeClass} rounded-full flex items-center justify-center font-bold flex-shrink-0 ${className}`;

  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name ?? 'Avatar'}
        className={`${baseClass} object-cover border border-line`}
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
