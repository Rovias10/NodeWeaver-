import { useEffect, useState } from 'react';

/**
 * Editor inline del título del mapa.
 *
 * Renderiza un input transparente que parece texto plano hasta que el
 * usuario lo enfoca. Los cambios se notifican al padre con cada
 * keystroke; el padre se encarga del debounce/auto-save.
 *
 * Validación inline: vacío o > 200 chars no se notifica (queda en el
 * estado local) y muestra mensaje al perder foco.
 *
 * Props:
 *   - value:    título actual.
 *   - onChange: callback(string) cuando hay valor válido.
 */
export function MapTitleEditor({ value, onChange }) {
  const [draft, setDraft] = useState(value ?? '');
  const [touched, setTouched] = useState(false);

  // Sincroniza si el valor externo cambia (ej. al cargar el mapa).
  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const trimmed = draft.trim();
  const isInvalid = touched && (trimmed === '' || trimmed.length > 200);

  const handleChange = (e) => {
    const v = e.target.value;
    setDraft(v);
    const t = v.trim();
    if (t !== '' && t.length <= 200) {
      onChange?.(t);
    }
  };

  return (
    <div className="flex-1 min-w-0">
      <input
        type="text"
        value={draft}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        placeholder="Mapa sin título"
        maxLength={250}
        className="w-full bg-transparent text-2xl md:text-3xl font-bold text-ink outline-none border-b-2 border-transparent focus:border-brand-400 transition-colors py-1"
        aria-label="Título del mapa"
      />
      {isInvalid && (
        <p className="text-xs text-coral-500 mt-1">
          {trimmed === '' ? 'El título es obligatorio.' : 'Máximo 200 caracteres.'}
        </p>
      )}
    </div>
  );
}
