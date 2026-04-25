import { Card } from '@/ui/Card.jsx';

/**
 * Página genérica "Próximamente" para las secciones del shell que aún
 * no tienen feature implementada (mapas, flashcards, comunidad, perfil
 * antes de Fase 4).
 *
 * Justificación académica: el tribunal puede navegar por toda la app
 * y ver la estructura completa; cada placeholder explica qué hará la
 * sección y en qué fase se entrega. Es honesto y orienta la defensa.
 *
 * Props:
 *   - title:    nombre de la sección.
 *   - icon:     clase Font Awesome.
 *   - description: qué hará la feature cuando esté lista.
 *   - phase:    en qué fase del rediseño se entrega.
 */
export function PlaceholderPage({ title, icon = 'fa-screwdriver-wrench', description, phase }) {
  return (
    <div className="max-w-3xl mx-auto">
      <Card padded elevated className="text-center">
        <span className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-sun-300 text-white items-center justify-center mb-5 shadow-[var(--shadow-glow-brand)]">
          <i className={`fas ${icon} text-2xl`} aria-hidden="true" />
        </span>
        <h1 className="text-2xl md:text-3xl font-bold text-ink">{title}</h1>
        {description && (
          <p className="text-ink-muted text-sm md:text-base mt-3 max-w-xl mx-auto">{description}</p>
        )}
        {phase && (
          <p className="mt-6 inline-block text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
            Próximamente · {phase}
          </p>
        )}
      </Card>
    </div>
  );
}
