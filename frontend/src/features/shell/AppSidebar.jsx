import { NAV_ITEMS } from './navItems.js';
import { NavItem } from './NavItem.jsx';

/**
 * Barra lateral de navegación visible en escritorio (>= lg).
 *
 * Posicionada como aside a la izquierda con las secciones principales
 * de la app y un footer con créditos académicos. El logo de
 * StudyWeaver vive en AppNavbar (centrado en la barra superior),
 * así que la sidebar arranca directamente con la navegación.
 *
 * En mobile no se renderiza: usamos MobileDrawer en su lugar.
 */
export function AppSidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 h-[calc(100dvh-72px)] sticky top-[72px] border-r border-line/60 bg-glass backdrop-blur-2xl px-4 py-6">
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
