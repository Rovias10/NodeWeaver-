/**
 * Avatar circular reutilizable.
 *
 * Usado en feed, hilo de comentarios, vista pública de mapa y perfil
 * público. Si recibe `src` lo muestra como `<img>`; si no, pinta la
 * inicial del nombre sobre fondo de marca. Sin librerías de UI.
 *
 * Props:
 *   - src:  URL absoluta del avatar (puede ser null/undefined).
 *   - name: nombre del usuario (se usa para el fallback de inicial).
 *   - size: 'sm' | 'md' | 'lg' | 'xl'
 *           sm  → 32x32 (cabecera de tarjeta del feed)
 *           md  → 36x36 (item de comentario / cabecera de mapa público)
 *           lg  → 48x48 (no usado por defecto, disponible)
 *           xl  → 96x96 (perfil público)
 *   - className: clases extra para casos puntuales.
 */
const SIZES = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-24 h-24 text-3xl',
};

export function Avatar({ src, name, size = 'md', className = '' }) {
  const sizeClass = SIZES[size] ?? SIZES.md;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${sizeClass} rounded-full object-cover bg-brand-100 border border-line shrink-0 ${className}`}
      />
    );
  }

  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={`${sizeClass} rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold border border-line shrink-0 ${className}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
