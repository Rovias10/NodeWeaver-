import { Link } from 'react-router';
import { AmbientBackground } from '@/ui/AmbientBackground.jsx';
import { Card } from '@/ui/Card.jsx';

/**
 * Contenedor común para las pantallas de auth. Reemplaza el panel
 * cristal con logo + título + subtítulo que se repetía en los 6
 * HTMLs antiguos de SERVER/pages/auth/.
 *
 * Props:
 *   - title:    titular grande de la tarjeta.
 *   - subtitle: línea descriptiva opcional.
 *   - width:    'md' (login, forgot, reset, confirm, wait) | '2xl' (register).
 *   - icon:     clase Font Awesome (ej. 'fa-envelope-open-text') opcional.
 *               Si no se pasa, se muestra el wordmark "StudyWeaver".
 *   - children: contenido propio de la página (formulario o mensaje).
 *
 * Incluye el AmbientBackground veraniego una sola vez para todas las
 * pantallas auth. La página usa <AuthCard>...</AuthCard> y nada más.
 */
export function AuthCard({ title, subtitle, width = 'md', icon, children }) {
  const widthClass = width === '2xl' ? 'max-w-2xl' : 'max-w-md';

  return (
    <>
      <AmbientBackground />
      <main className="min-h-screen flex items-start sm:items-center justify-center p-4 py-8">
        <Card elevated className={`${widthClass} w-full z-10`}>
          <div className="text-center mb-8">
            {icon ? (
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-linear-to-br from-brand-400 to-sun-300 flex items-center justify-center shadow-(--shadow-glow-brand)">
                <i className={`fas ${icon} text-3xl text-white`} aria-hidden="true" />
              </div>
            ) : (
              <Link to="/" className="inline-block mb-4 group">
                <img
                  src="/Logotipo.svg"
                  alt="Logotipo de StudyWeaver"
                  className="h-16 w-auto mx-auto group-hover:brightness-110 transition"
                />
              </Link>
            )}
            {title && <h1 className="text-2xl font-bold text-ink mb-2">{title}</h1>}
            {subtitle && <p className="text-ink-muted text-sm">{subtitle}</p>}
          </div>
          {children}
        </Card>
      </main>
    </>
  );
}
