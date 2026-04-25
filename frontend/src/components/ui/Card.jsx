/**
 * Tarjeta superficie cristal del sistema "Cielo Claro".
 *
 * Reemplaza el bg-slate-800/40 backdrop-blur-2xl border border-white/10
 * que se repetía en cada HTML antiguo. Aquí lo hacemos un único punto
 * de cambio: si mañana ajustamos translucidez o radio, lo hacemos
 * en este archivo.
 *
 * Props:
 *   - as: tag HTML a renderizar (por defecto 'div').
 *   - padded: aplica padding interno por defecto.
 *   - elevated: añade sombra glow brand.
 *   - className: clases extra.
 */
export function Card({ as: Tag = 'div', padded = true, elevated = false, className = '', children, ...rest }) {
  return (
    <Tag
      className={
        'bg-glass backdrop-blur-2xl border border-line rounded-3xl ' +
        (elevated ? 'shadow-[var(--shadow-glow-brand)] ' : 'shadow-card ') +
        (padded ? 'p-6 md:p-8 ' : '') +
        className
      }
      {...rest}
    >
      {children}
    </Tag>
  );
}
