import { Link, useLocation } from 'react-router';
import { NAV_ITEMS } from './navItems.js';
import { UserMenu } from './UserMenu.jsx';

/**
 * Barra superior fija del shell autenticado.
 *
 * Layout en 3 columnas (flex-1 a izquierda y derecha) para que el
 * logo del centro quede ópticamente centrado independientemente del
 * ancho del texto de la sección o del nombre del usuario:
 *
 *   [hamburguesa? · sección]   [LOGO StudyWeaver]   [UserMenu]
 *
 * - Hamburguesa: sólo en < lg, abre el MobileDrawer.
 * - Sección: nombre + icono de la entrada de NAV_ITEMS que casa con
 *   el pathname actual. Visible en todos los viewports.
 * - Logo: lleva al home (/dashboard).
 * - UserMenu: avatar + dropdown de cuenta a la derecha.
 *
 * No es jerárquico (no hay subrutas todavía); cuando aparezcan,
 * basta con encadenar el breadcrumb dentro del bloque izquierdo.
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
      <div className="flex-1 flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Abrir menú"
          className={
            'lg:hidden p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-brand-50 ' +
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 transition-colors'
          }
        >
          <i className="fas fa-bars text-lg" aria-hidden="true" />
        </button>

        {currentSection && (
          <h1 className="flex items-center gap-3 text-base font-semibold text-ink min-w-0">
            <i className={`fas ${currentSection.icon} text-brand-500 shrink-0`} aria-hidden="true" />
            <span className="truncate">{currentSection.label}</span>
          </h1>
        )}
      </div>

      <Link
        to="/dashboard"
        className="shrink-0 flex items-center group"
        aria-label="Ir al inicio de StudyWeaver"
      >
        <img
          src="/Logotipo.svg"
          alt="Logotipo de StudyWeaver"
          className="h-14 w-auto group-hover:brightness-110 transition"
        />
      </Link>

      <div className="flex-1 flex items-center justify-end gap-3">
        <UserMenu />
      </div>
    </header>
  );
}
