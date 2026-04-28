import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';

/**
 * Resumen de la sesión de repaso. Dos modos:
 *   - kind="empty" → no había tarjetas pendientes al entrar.
 *   - kind="done"  → el usuario terminó la cola; muestra stats locales
 *                    (no se piden al backend, las cuenta la página).
 *
 * Props:
 *   - kind:   'empty' | 'done'.
 *   - stats:  { total, fail, good, easy } sólo necesarias en kind="done".
 *   - onBack: callback del botón "Volver al listado".
 */
export function ReviewSummary({ kind, stats = {}, onBack }) {
  if (kind === 'empty') {
    return (
      <Card padded className="text-center max-w-lg mx-auto">
        <i
          className="fas fa-check-circle text-5xl text-emerald-500 mb-4"
          aria-hidden="true"
        />
        <h2 className="text-2xl font-bold text-ink">Sin repasos pendientes</h2>
        <p className="text-sm text-ink-muted mt-2">
          Todas tus tarjetas vencen más adelante. Vuelve cuando alguna toque
          o crea más para mantener la racha.
        </p>
        <div className="mt-6">
          <Button variant="ghost" onClick={onBack}>
            <i className="fas fa-arrow-left" aria-hidden="true" />
            Volver al listado
          </Button>
        </div>
      </Card>
    );
  }

  // kind === 'done'
  const total    = Number(stats.total ?? 0);
  const fail     = Number(stats.fail  ?? 0);
  const good     = Number(stats.good  ?? 0);
  const easy     = Number(stats.easy  ?? 0);
  const aciertos = good + easy;

  return (
    <Card padded className="text-center max-w-lg mx-auto">
      <i className="fas fa-trophy text-5xl text-sun-300 mb-4" aria-hidden="true" />
      <h2 className="text-2xl font-bold text-ink">¡Repaso completado!</h2>
      <p className="text-sm text-ink-muted mt-2">
        Has repasado {total} tarjeta{total === 1 ? '' : 's'} en esta sesión.
      </p>

      <div className="grid grid-cols-3 gap-3 mt-6">
        <StatBox label="Fallo" value={fail} className="bg-coral-400/15 text-coral-500" />
        <StatBox label="Bien"  value={good} className="bg-brand-50 text-brand-700" />
        <StatBox label="Fácil" value={easy} className="bg-mint-400/15 text-emerald-700" />
      </div>

      <p className="mt-6 text-sm text-ink-muted">
        Aciertos:{' '}
        <strong className="text-ink">{aciertos}</strong>
        {' '}de{' '}
        <strong className="text-ink">{total}</strong>
      </p>

      <div className="mt-6">
        <Button variant="ghost" onClick={onBack}>
          <i className="fas fa-arrow-left" aria-hidden="true" />
          Volver al listado
        </Button>
      </div>
    </Card>
  );
}

/** Caja de stat individual del resumen (encapsulada para no repetir markup). */
function StatBox({ label, value, className = '' }) {
  return (
    <div className={`rounded-2xl p-4 ${className}`}>
      <div className="text-3xl font-bold leading-none">{value}</div>
      <div className="text-xs uppercase tracking-wider font-semibold mt-2">{label}</div>
    </div>
  );
}
