import { SectionCard } from '../components/SectionCard.jsx';

/**
 * Sección de estadísticas de estudio.
 *
 * En Fase 4 los valores son MOCK (0). Cuando existan los endpoints
 * /maps/list y /flashcards/stats sustituiremos los placeholders por
 * datos reales. Mantenemos la estructura visual definitiva para que
 * el rediseño sea final y honesto: el tribunal ve qué información
 * vivirá aquí en producción.
 *
 * Sustituye al "panel de estadísticas de automatizaciones" del antiguo
 * NodeWeaver: ahora hablamos de mapas, flashcards y racha.
 */
const ITEMS = [
  {
    icon: 'fa-diagram-project',
    tone: 'bg-brand-50 text-brand-600',
    label: 'Mapas creados',
    value: 0,
  },
  {
    icon: 'fa-clone',
    tone: 'bg-sun-200 text-sun-400',
    label: 'Flashcards repasadas',
    value: 0,
  },
  {
    icon: 'fa-fire-flame-curved',
    tone: 'bg-coral-300/40 text-coral-500',
    label: 'Racha actual',
    value: '0 días',
  },
];

export function StudyStatsSection() {
  return (
    <SectionCard
      icon="fa-chart-line"
      title="Mi progreso"
      description="Vista rápida de tu actividad de estudio."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {ITEMS.map((item) => (
          <div
            key={item.label}
            className="flex flex-col items-start gap-2 rounded-xl border border-line bg-white/40 p-4"
          >
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${item.tone}`}>
              <i className={`fas ${item.icon}`} aria-hidden="true" />
            </span>
            <p className="text-2xl font-bold text-ink leading-none">{item.value}</p>
            <p className="text-xs text-ink-muted">{item.label}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-ink-faint mt-2">
        Datos provisionales. Conectaremos esta sección al backend en cuanto los
        endpoints de mapas y flashcards estén disponibles.
      </p>
    </SectionCard>
  );
}
