/**
 * Spinner circular minimalista. Tamaño en píxeles (24 por defecto).
 * Se basa en la animación spin nativa de Tailwind, sin dependencias.
 */
export function Spinner({ size = 24, label = 'Cargando…', className = '' }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block border-2 border-brand-400 border-t-transparent rounded-full animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
