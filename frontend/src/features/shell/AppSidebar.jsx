import { Link } from 'react-router';
import { NAV_ITEMS } from './navItems.js';
import { NavItem } from './NavItem.jsx';

/**
 * Barra lateral de navegación visible en escritorio (>= lg).
 *
 * Posicionada como aside a la izquierda con las secciones principales
 * de la app y un footer con créditos académicos.
 *
 * En mobile no se renderiza: usamos MobileDrawer en su lugar.
 */
export function AppSidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 h-[calc(100dvh-72px)] sticky top-[72px] border-r border-line/60 bg-glass backdrop-blur-2xl px-4 py-6">
      <Link
        to="/dashboard"
        className="px-3 mb-8 flex items-center gap-2 group"
      >
        <span className="block text-xl font-extrabold tracking-tight bg-gradient-to-r from-brand-600 via-brand-500 to-coral-400 bg-clip-text text-transparent group-hover:brightness-110 transition">
          StudyWeaver
        </span>
      </Link>

      <nav aria-label="Secciones principales" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      <p className="mt-auto pt-6 text-xs text-ink-faint">
        Proyecto Final 2 · Ciclo Superior DAW
        <br />
        © 2026 StudyWeaver
      </p>
    </aside>
  );
}
