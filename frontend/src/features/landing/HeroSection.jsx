import { Link } from 'react-router';
import { Button } from '@/ui/Button.jsx';
import { useAuth } from '@/auth/useAuth.js';
import { HeroIllustration } from './HeroIllustration.jsx';

/**
 * Sección hero de la landing.
 *
 * Estructura: dos columnas en desktop (texto | ilustración) y una
 * sola columna en mobile.
 *
 * Comportamiento auth-aware:
 *   - Sin sesión → CTAs "Empezar gratis" (registro) y "Iniciar sesión".
 *   - Con sesión → CTA único "Ir al panel" (dashboard).
 *
 * Animaciones: fade-up con stagger basado en CSS variables registradas
 * en el @theme. Sin librerías de animación.
 */
export function HeroSection() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 px-6">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div className="space-y-8">
          <span
            className="inline-block px-4 py-1.5 rounded-full bg-brand-50 border border-brand-200 opacity-0"
            style={{ animation: 'var(--animate-fade-up)', animationDelay: '0.1s' }}
          >
            <span className="text-sm font-semibold bg-gradient-to-r from-brand-600 to-coral-400 bg-clip-text text-transparent">
              Aprendizaje visual con IA
            </span>
          </span>

          <h1
            className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight tracking-tight text-ink opacity-0"
            style={{ animation: 'var(--animate-fade-up)', animationDelay: '0.2s' }}
          >
            Estudia mejor con
            <span className="block mt-2 bg-gradient-to-r from-brand-600 via-brand-500 to-coral-400 bg-clip-text text-transparent leading-[1.1]">
              mapas inteligentes
            </span>
          </h1>

          <p
            className="text-lg md:text-xl text-ink-muted max-w-xl opacity-0"
            style={{ animation: 'var(--animate-fade-up)', animationDelay: '0.35s' }}
          >
            Convierte tus apuntes y PDFs en mapas conceptuales generados con IA.
            Repasa con flashcards de repetición espaciada y comparte tus mapas
            con la comunidad.
          </p>

          <div
            className="flex flex-wrap gap-3 opacity-0"
            style={{ animation: 'var(--animate-fade-up)', animationDelay: '0.5s' }}
          >
            {isAuthenticated ? (
              <Link to="/dashboard">
                <Button size="lg">
                  <i className="fas fa-arrow-right-to-bracket" aria-hidden="true" /> Ir al panel
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/registro">
                  <Button size="lg">
                    Empezar gratis
                    <i className="fas fa-arrow-right" aria-hidden="true" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="ghost">
                    Iniciar sesión
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        <div
          className="relative hidden lg:block opacity-0"
          style={{ animation: 'var(--animate-fade-up)', animationDelay: '0.4s' }}
        >
          <div className="absolute inset-0 -m-10 bg-gradient-to-br from-brand-200/40 to-sun-200/40 blur-3xl rounded-full pointer-events-none" />
          <div className="relative bg-white/60 backdrop-blur-2xl border border-line rounded-3xl shadow-card p-6">
            <HeroIllustration />
          </div>
        </div>
      </div>
    </section>
  );
}
