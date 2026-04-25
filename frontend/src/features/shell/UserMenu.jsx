import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/auth/useAuth.js';
import { Avatar } from './Avatar.jsx';

/**
 * Dropdown del usuario en la navbar.
 *
 * Comportamiento:
 *  - Click en el botón → abre/cierra el menú.
 *  - Click fuera del componente → cierra.
 *  - Tecla Escape → cierra.
 *  - Click en cualquier item → cierra y ejecuta la acción.
 *
 * Mantenemos el dropdown sencillo (sin Headless UI ni Radix) para no
 * añadir dependencias y poder explicarlo línea a línea ante el
 * tribunal.
 */
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function handleLogout() {
    setOpen(false);
    logout();
    navigate('/', { replace: true });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'flex items-center gap-3 rounded-full pl-1 pr-3 py-1 transition-all ' +
          'hover:bg-brand-50/80 ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-paper'
        }
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar user={user} size="sm" />
        <span className="hidden sm:block text-sm font-medium text-ink max-w-[140px] truncate">
          {user?.name ?? 'Mi cuenta'}
        </span>
        <i
          className={`fas fa-chevron-down text-xs text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className={
            'absolute right-0 mt-2 w-56 rounded-2xl bg-glass backdrop-blur-2xl border border-line ' +
            'shadow-card overflow-hidden z-50'
          }
        >
          <div className="px-4 py-3 border-b border-line">
            <p className="text-sm font-semibold text-ink truncate">{user?.name ?? 'Sin nombre'}</p>
            <p className="text-xs text-ink-faint truncate">{user?.email ?? ''}</p>
          </div>

          <Link
            to="/perfil"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-ink hover:bg-brand-50 transition-colors"
          >
            <i className="fas fa-user-gear text-brand-500 w-4" aria-hidden="true" />
            Mi perfil
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-coral-500 hover:bg-coral-400/10 transition-colors"
          >
            <i className="fas fa-arrow-right-from-bracket w-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
