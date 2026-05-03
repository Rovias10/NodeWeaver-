import { Button } from '@/ui/Button.jsx';

/**
 * Tarjeta de la sesión de repaso. Muestra siempre la pregunta arriba
 * y, según el estado `revealed`, o un botón "Mostrar respuesta" o
 * la respuesta en sí.
 *
 * No usamos animación de "flip" 3D — un revelado simple es más
 * defendible (sin librerías) y evita problemas de accesibilidad.
 *
 * Props:
 *   - card:     fila de flashcards/due (debe tener front y back).
 *   - revealed: bool, controla qué se muestra debajo de la pregunta.
 *   - onReveal: callback del botón "Mostrar respuesta".
 */
export function FlippableCard({ card, revealed, onReveal }) {
  return (
    <div className="bg-glass backdrop-blur-2xl border border-line rounded-3xl shadow-card p-8 md:p-10 max-w-2xl mx-auto w-full">
      <div>
        <span className="text-xs uppercase tracking-wider font-semibold text-brand-700">
          Pregunta
        </span>
        <p className="mt-3 text-xl md:text-2xl font-bold text-ink leading-snug whitespace-pre-wrap break-words">
          {(card?.front ?? '').trim() || (
            <span className="italic text-ink-faint font-normal">Sin pregunta</span>
          )}
        </p>
      </div>

      <hr className="my-6 border-line" />

      {revealed ? (
        <div>
          <span className="text-xs uppercase tracking-wider font-semibold text-emerald-700">
            Respuesta
          </span>
          <p className="mt-3 text-base md:text-lg text-ink leading-relaxed whitespace-pre-wrap break-words">
            {(card?.back ?? '').trim() || (
              <span className="italic text-ink-faint">Sin respuesta</span>
            )}
          </p>
        </div>
      ) : (
        <div className="text-center py-2">
          <Button onClick={onReveal} size="lg">
            <i className="fas fa-eye" aria-hidden="true" />
            Mostrar respuesta
          </Button>
          <p className="mt-2 text-xs text-ink-faint">o pulsa la barra espaciadora</p>
        </div>
      )}
    </div>
  );
}
