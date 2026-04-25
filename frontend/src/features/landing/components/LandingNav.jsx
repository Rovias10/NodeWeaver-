import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth.js';
import { Button } from '@/components/ui/Button.jsx';

/**
 * Barra superior de la landing pública.
 *
 * Comportamiento:
 *   - Posición fija en la parte superior.
 *   - Cuando se hace scroll (>50px) cambia a "modo cristal" con
 *     backdrop-blur + borde inferior, igual que en el HTML antiguo.
 *   - El CTA de la derecha cambia según haya sesión:
 *       sin sesión  → "Acceder" (link a /login)
 *       con sesión  → "Ir al panel" (link a /dashboard)
 *
 * Sin librerías de animación ni intersección. Listener del scroll
 * suscrito sólo mientras el componente está montado.
 */
export function LandingNav() {
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const baseClass = 'fixed top-0 inset-x-0 z-50 transition-all duration-300 ';
  const glassClass = scrolled
    ? 'bg-glass backdrop-blur-2xl border-b border-line/60 shadow-card'
    : 'bg-transparent';

  return (
    <header className={baseClass + glassClass}>
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="block text-xl font-extrabold tracking-tight bg-gradient-to-r from-brand-600 via-brand-500 to-coral-400 bg-clip-text text-transparent group-hover:brightness-110 transition">
            StudyWeaver
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm font-semibold text-ink-muted hover:text-ink transition-colors">
            Características
          </a>
          <a href="#como-funciona" className="text-sm font-semibold text-ink-muted hover:text-ink transition-colors">
            Cómo funciona
          </a>
        </nav>

        <Link to={isAuthenticated ? '/dashboard' : '/login'}>
          <Button>
            <i className={`fas ${isAuthenticated ? 'fa-arrow-right-to-bracket' : 'fa-right-to-bracket'}`} aria-hidden="true" />
            {isAuthenticated ? 'Ir al panel' : 'Acceder'}
          </Button>
        </Link>
      </div>
    </header>
  );
}
