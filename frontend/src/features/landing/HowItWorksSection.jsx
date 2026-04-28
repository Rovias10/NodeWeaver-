/**
 * Sección "Cómo funciona": 4 pasos del flujo de uso de StudyWeaver,
 * presentados como tarjetas numeradas conectadas visualmente con un
 * gradiente sutil en el fondo.
 *
 * El paso 4 (Comparte) es el único que toca la capa social del
 * roadmap; los otros 3 corresponden a fases ya planificadas.
 */
const STEPS = [
  {
    number: '01',
    icon: 'fa-file-arrow-up',
    title: 'Sube tus apuntes',
    description: 'PDFs, textos o un tema sobre el que quieras estudiar. Aceptamos varios formatos.',
  },
  {
    number: '02',
    icon: 'fa-wand-magic-sparkles',
    title: 'La IA expande',
    description: 'Detecta conceptos clave y los conecta en un mapa mental que puedes editar a mano.',
  },
  {
    number: '03',
    icon: 'fa-arrows-rotate',
    title: 'Repasa con flashcards',
    description: 'Tarjetas generadas a partir del mapa, espaciadas según lo que más te cuesta.',
  },
  {
    number: '04',
    icon: 'fa-users',
    title: 'Comparte con la comunidad',
    description: 'Publica tus mejores mapas, encuentra los de otros estudiantes y aprende juntos.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="como-funciona" className="relative py-24 lg:py-32 px-6">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[280px] bg-gradient-to-r from-brand-100/50 via-sun-200/30 to-coral-300/30 blur-3xl pointer-events-none -z-10" />

      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-ink tracking-tight">Cómo funciona</h2>
          <p className="text-lg text-ink-muted mt-4">
            Cuatro pasos para convertir cualquier material en un sistema de estudio activo.
          </p>
        </div>

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((step) => (
            <li
              key={step.number}
              className="relative bg-glass backdrop-blur-2xl border border-line rounded-3xl shadow-card p-6 flex flex-col gap-3"
            >
              <span className="text-xs font-bold tracking-widest text-brand-500">{step.number}</span>
              <span className="inline-flex w-10 h-10 rounded-xl bg-brand-50 text-brand-600 items-center justify-center">
                <i className={`fas ${step.icon}`} aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold text-ink">{step.title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
