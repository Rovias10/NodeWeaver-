import { Link } from 'react-router';
import { Button } from '@/ui/Button.jsx';
import { useAuth } from '@/auth/useAuth.js';

/**
 * Llamada a la acción de cierre.
 *
 * Se renderiza una versión distinta según haya sesión: invitar a
 * registrarse vs invitar a entrar al panel. La caja con borde y glow
 * hereda el patrón del HTML antiguo, pero con la paleta clara y un
 * mensaje honesto: somos un proyecto académico, sin coste, sin pubs.
 */
export function CTASection() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative py-24 lg:py-32 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl border border-brand-200 bg-gradient-to-br from-white via-brand-50 to-sun-200/40 p-10 lg:p-16 text-center shadow-[var(--shadow-glow-brand)]">
          <div
            aria-hidden="true"
            className="absolute -top-20 -right-20 w-64 h-64 bg-coral-300/30 blur-3xl rounded-full"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-20 -left-20 w-64 h-64 bg-brand-200/40 blur-3xl rounded-full"
          />

          <h2 className="relative text-3xl md:text-5xl font-bold text-ink tracking-tight">
            Empieza a estudiar mejor hoy
          </h2>
          <p className="relative text-lg text-ink-muted mt-4 max-w-2xl mx-auto">
            Proyecto académico abierto, sin coste, sin publicidad. Sólo el material que tú subas y los mapas que tú construyas.
          </p>

          <div className="relative mt-8 flex justify-center">
            <Link to={isAuthenticated ? '/apuntes' : '/registro'}>
              <Button size="lg">
                {isAuthenticated ? (
                  <>
                    <i className="fas fa-arrow-right-to-bracket" aria-hidden="true" />
                    Ir al panel
                  </>
                ) : (
                  <>
                    Crear cuenta gratis
                    <i className="fas fa-arrow-right" aria-hidden="true" />
                  </>
                )}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
