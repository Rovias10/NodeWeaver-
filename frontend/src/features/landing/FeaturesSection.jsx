import { FeatureCard } from './FeatureCard.jsx';

/**
 * Tres características clave de StudyWeaver. El copy debe poder
 * defenderse: cada feature corresponde a una capacidad real prevista
 * en el roadmap, no inventamos beneficios.
 */
const FEATURES = [
  {
    icon: 'fa-diagram-project',
    tone: 'brand',
    title: 'Mapas mentales con IA',
    description:
      'Sube un PDF o un texto y obtén un mapa conceptual editable en segundos. La IA detecta los conceptos clave y sus relaciones.',
  },
  {
    icon: 'fa-clone',
    tone: 'sun',
    title: 'Repetición espaciada',
    description:
      'Flashcards generadas a partir de tus mapas, repasadas con un algoritmo SM-2 simplificado para fijar lo importante.',
  },
  {
    icon: 'fa-circle-question',
    tone: 'coral',
    title: 'Quizzes adaptativos',
    description:
      'Tests automáticos que se centran en las preguntas que más te cuestan. Mide tu progreso real, no la cantidad de horas.',
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="relative py-24 lg:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-ink tracking-tight">
            Aprender, repasar y dominar
          </h2>
          <p className="text-lg text-ink-muted mt-4">
            Tres herramientas que se conectan entre sí para que estudies con menos esfuerzo y más resultado.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}
