import { Card } from '@/components/ui/Card.jsx';

/**
 * Tarjeta de métrica: número grande + etiqueta + icono accent.
 *
 * Pensada para el dashboard. En Fase 3 los valores son mock; en Fase
 * Maps/Flashcards se conectan a endpoints reales (mapas creados,
 * flashcards revisadas, racha de días).
 *
 * Props:
 *   - icon:  clase Font Awesome.
 *   - tone:  'brand' | 'sun' | 'mint' | 'coral'. Determina el color del
 *            icono y del aura.
 *   - value: número o string a mostrar grande.
 *   - label: descripción corta debajo del valor.
 *   - hint:  texto secundario opcional (p. ej. "+2 esta semana").
 */
const TONES = {
  brand: 'bg-brand-100 text-brand-700',
  sun:   'bg-sun-200 text-sun-400',
  mint:  'bg-mint-400/20 text-emerald-700',
  coral: 'bg-coral-300/30 text-coral-500',
};

export function StatsCard({ icon, tone = 'brand', value, label, hint }) {
  const toneClass = TONES[tone] ?? TONES.brand;

  return (
    <Card padded className="flex flex-col gap-3 min-h-[140px]">
      <div className="flex items-center justify-between">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneClass}`}>
          <i className={`fas ${icon}`} aria-hidden="true" />
        </span>
        {hint && <span className="text-xs text-ink-faint">{hint}</span>}
      </div>
      <div>
        <p className="text-3xl font-bold text-ink leading-tight">{value}</p>
        <p className="text-sm text-ink-muted mt-1">{label}</p>
      </div>
    </Card>
  );
}
