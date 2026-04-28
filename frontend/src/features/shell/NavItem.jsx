import { NavLink } from 'react-router';

/**
 * Enlace de navegación con estado activo, usado tanto en la sidebar
 * de escritorio como en el drawer móvil.
 *
 * NavLink de react-router-7 expone isActive en su className/style
 * callbacks; lo aprovechamos para aplicar la paleta veraniega.
 *
 * Props:
 *   - to:    ruta de destino.
 *   - label: texto visible.
 *   - icon:  clase Font Awesome (sin el prefijo 'fas').
 *   - end:   true si la ruta no debe coincidir parcialmente
 *            (por ejemplo, '/dashboard' debe ser end=true para que
 *            '/dashboard/cualquier-cosa' no la marque activa).
 *   - onSelect: callback opcional (drawer lo usa para auto-cerrarse).
 */
export function NavItem({ to, label, icon, end = false, onSelect }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onSelect}
      className={({ isActive }) =>
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ' +
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ' +
        (isActive
          ? 'bg-brand-50 text-brand-700 shadow-card'
          : 'text-ink-muted hover:bg-brand-50/60 hover:text-ink')
      }
    >
      <i className={`fas ${icon} w-5 text-center`} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
