/**
 * Tarjeta de característica para la sección "features" de la landing.
 *
 * Estilo: superficie cristal con icono coloreado según el tono y un
 * leve glow al hacer hover, igual que las cards del NodeWeaver antiguo
 * pero con la paleta veraniega. La elevación on-hover invita al
 * usuario a leer cada feature sin necesidad de animaciones costosas.
 *
 * Props:
 *   - icon:        clase Font Awesome.
 *   - tone:        'brand' | 'sun' | 'coral'. Color del icono y glow.
 *   - title:       titular corto.
 *   - description: 1–2 frases.
 */
const TONES = {
  brand: { icon: 'bg-brand-100 text-brand-600', glow: 'from-brand-400 to-brand-200' },
  sun:   { icon: 'bg-sun-200 text-sun-400',     glow: 'from-sun-300 to-sun-200' },
  coral: { icon: 'bg-coral-300/40 text-coral-500', glow: 'from-coral-400 to-coral-300' },
};

export function FeatureCard({ icon, tone = 'brand', title, description }) {
  const t = TONES[tone] ?? TONES.brand;

  return (
    <div className="group relative">
      <div
        aria-hidden="true"
        className={
          'absolute inset-0 bg-gradient-to-br ' +
          t.glow +
          ' opacity-0 group-hover:opacity-30 blur-2xl rounded-3xl transition-opacity duration-500'
        }
      />
      <div className="relative h-full bg-glass backdrop-blur-2xl border border-line rounded-3xl shadow-card p-8 transition-transform duration-300 group-hover:-translate-y-1">
        <span className={`inline-flex w-12 h-12 rounded-xl items-center justify-center mb-5 ${t.icon}`}>
          <i className={`fas ${icon} text-xl`} aria-hidden="true" />
        </span>
        <h3 className="text-xl font-bold text-ink mb-2">{title}</h3>
        <p className="text-ink-muted leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
