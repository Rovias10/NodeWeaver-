import { Link } from 'react-router';
import { Button } from '@/ui/Button.jsx';

/**
 * Bloque "estado vacío" amigable.
 *
 * Aparece cuando una colección no tiene aún elementos (mapas,
 * flashcards, etc.). Buena UX: explica qué falta y ofrece el primer
 * paso accionable.
 *
 * Props:
 *   - icon:    clase Font Awesome.
 *   - title:   titular ("Aún no tienes mapas").
 *   - message: subtítulo descriptivo.
 *   - actionLabel + actionTo: render condicional del CTA. Si actionTo
 *                 empieza por "/" se usa <Link> de react-router; en
 *                 otro caso, queda como botón sin acción (placeholder).
 */
export function EmptyState({ icon = 'fa-folder-open', title, message, actionLabel, actionTo }) {
  return (
    <div className="text-center py-10 px-6">
      <span className="inline-flex w-14 h-14 rounded-2xl bg-brand-100 text-brand-600 items-center justify-center mb-4">
        <i className={`fas ${icon} text-2xl`} aria-hidden="true" />
      </span>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {message && <p className="text-ink-muted text-sm mt-2 max-w-md mx-auto">{message}</p>}

      {actionLabel && actionTo && (
        <div className="mt-6">
          {actionTo.startsWith('/') ? (
            <Link to={actionTo}>
              <Button>
                <i className="fas fa-plus" aria-hidden="true" /> {actionLabel}
              </Button>
            </Link>
          ) : (
            <Button disabled>{actionLabel}</Button>
          )}
        </div>
      )}
    </div>
  );
}
