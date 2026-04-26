import { Link, useLocation } from 'react-router';
import { NAV_ITEMS } from './navItems.js';
import { UserMenu } from './UserMenu.jsx';

/**
 * Barra superior fija del shell autenticado.
 *
 * Compone:
 *   - Botón hamburguesa (visible en < lg) que abre el drawer móvil.
 *   - Wordmark "StudyWeaver" sólo en mobile (en desktop ya lo
 *     enseña la sidebar y duplicarlo es ruido).
 *   - Breadcrumb sencillo: nombre de la sección actual derivado de
 *     la URL contra NAV_ITEMS. No es jerárquico (no hay subrutas
 *     todavía); cuando aparezcan, basta con encadenar en este
 *     componente.
 *   - UserMenu a la derecha.
 */
export function AppNavbar({ onOpenDrawer }) {
  const location = useLocation();

  const currentSection = NAV_ITEMS.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );

  return (
    <header
      className={
        'sticky top-0 z-30 h-[72px] bg-glass backdrop-blur-2xl border-b border-line/60 ' +
        'flex items-center px-4 sm:px-6'
      }
    >
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label="Abrir menú"
        className={
          'lg:hidden mr-3 p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-brand-50 ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 transition-colors'
        }
      >
        <i className="fas fa-bars text-lg" aria-hidden="true" />
      </button>

      <Link to="/apuntes" className="lg:hidden">
        <span className="block text-lg font-extrabold tracking-tight bg-gradient-to-r from-brand-600 via-brand-500 to-coral-400 bg-clip-text text-transparent">
          StudyWeaver
        </span>
      </Link>

      <h1 className="hidden lg:flex items-center gap-3 text-base font-semibold text-ink">
        {currentSection && (
          <>
            <i className={`fas ${currentSection.icon} text-brand-500`} aria-hidden="true" />
            <span>{currentSection.label}</span>
          </>
        )}
      </h1>

      <div className="ml-auto flex items-center gap-3">
        <UserMenu />
      </div>
    </header>
  );
}
