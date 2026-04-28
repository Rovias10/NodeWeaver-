import { useEffect } from 'react';
import { Link } from 'react-router';
import { NAV_ITEMS } from './navItems.js';
import { NavItem } from './NavItem.jsx';

/**
 * Drawer lateral para viewports < lg.
 *
 * Comportamiento:
 *   - Estado open/close lo gestiona AppLayout (única fuente de verdad).
 *   - Al abrir bloquea el scroll del body para que sólo se desplace el
 *     contenido del drawer.
 *   - Click en backdrop o tecla Escape lo cierra.
 *   - Click en un NavItem lo cierra (ergonomía: el usuario ya navega).
 *
 * Animación: translate-x con transición rápida (200ms). Sin librerías.
 */
export function MobileDrawer({ open, onClose }) {
  useEffect(() => {
    if (!open) return;

    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleEscape(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = original;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={
          'lg:hidden fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm transition-opacity duration-200 ' +
          (open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
        }
      />

      <aside
        aria-label="Menú principal"
        aria-hidden={!open}
        className={
          'lg:hidden fixed top-0 left-0 h-dvh w-72 max-w-[85vw] z-50 ' +
          'bg-paper border-r border-line shadow-card ' +
          'transform transition-transform duration-200 ease-out ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <Link to="/apuntes" onClick={onClose} className="flex items-center">
            <img
              src="/Logotipo.svg"
              alt="Logotipo de StudyWeaver"
              className="h-10 w-auto"
            />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="text-ink-muted hover:text-ink p-2 rounded-lg hover:bg-brand-50 transition-colors"
          >
            <i className="fas fa-xmark text-lg" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Secciones principales" className="flex flex-col gap-1 p-4">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} onSelect={onClose} />
          ))}
        </nav>

        <p className="mt-auto absolute bottom-4 left-5 right-5 text-xs text-ink-faint">
          © 2026 StudyWeaver · DAW
        </p>
      </aside>
    </>
  );
}
