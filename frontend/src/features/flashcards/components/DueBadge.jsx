/**
 * Cápsula de "vence en X días" para una flashcard.
 *
 * Color según urgencia:
 *   - rojo si está atrasada,
 *   - ámbar si vence hoy,
 *   - morado marca si vence mañana,
 *   - verde menta si vence más adelante.
 *
 * El cálculo se hace en local: `next_review_at` viene como cadena
 * 'Y-m-d' del backend (la columna es DATE). Reconstruimos un Date
 * a las 00:00 hora local para evitar el desfase de zona horaria
 * típico de `new Date('2026-04-26')` (UTC).
 */
function daysFromToday(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / 86400000);
}

export function DueBadge({ nextReviewAt }) {
  const diff = daysFromToday(nextReviewAt);
  if (diff === null) return null;

  let text;
  let classes;
  let icon = 'fa-clock';

  if (diff < 0) {
    const days = Math.abs(diff);
    text = `Atrasada ${days} día${days === 1 ? '' : 's'}`;
    classes = 'bg-coral-400/15 text-coral-500 border-coral-400/40';
    icon = 'fa-triangle-exclamation';
  } else if (diff === 0) {
    text = 'Vence hoy';
    classes = 'bg-sun-300/15 text-amber-700 border-sun-300/50';
    icon = 'fa-bolt';
  } else if (diff === 1) {
    text = 'Vence mañana';
    classes = 'bg-brand-50 text-brand-700 border-brand-200';
  } else {
    text = `Vence en ${diff} días`;
    classes = 'bg-mint-400/15 text-emerald-700 border-mint-400/40';
  }

  return (
    <span
      className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${classes}`}
      title={`Próximo repaso: ${nextReviewAt}`}
    >
      <i className={`fas ${icon} mr-1.5`} aria-hidden="true" />
      {text}
    </span>
  );
}
