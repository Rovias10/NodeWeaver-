import { Button } from '@/ui/Button.jsx';

/**
 * Tres botones de grado para la sesión de repaso SM-2:
 *   - Fallo (1) → variante danger.
 *   - Bien  (2) → variante primary (gradient marca).
 *   - Fácil (3) → variante success (esmeralda).
 *
 * Cada botón muestra el atajo de teclado bajo la etiqueta para que
 * el usuario no tenga que memorizarlos.
 *
 * Props:
 *   - disabled: deshabilita los 3 botones (típicamente cuando aún
 *               no se ha revelado la respuesta).
 *   - onGrade:  callback(grade: 'fail' | 'good' | 'easy').
 */
export function GradeButtons({ disabled = false, onGrade }) {
  const items = [
    { grade: 'fail', label: 'Fallo', variant: 'danger',  icon: 'fa-xmark', shortcut: '1' },
    { grade: 'good', label: 'Bien',  variant: 'primary', icon: 'fa-check', shortcut: '2' },
    { grade: 'easy', label: 'Fácil', variant: 'success', icon: 'fa-bolt',  shortcut: '3' },
  ];

  return (
    <div
      role="group"
      aria-label="Califica esta tarjeta"
      className="grid grid-cols-3 gap-3 max-w-2xl mx-auto w-full"
    >
      {items.map(({ grade, label, variant, icon, shortcut }) => (
        <Button
          key={grade}
          type="button"
          variant={variant}
          size="lg"
          disabled={disabled}
          onClick={() => onGrade?.(grade)}
          aria-label={`${label} (atajo ${shortcut})`}
          // Sobrescribimos la disposición por defecto del Button (flex
          // horizontal) para apilar etiqueta + atajo en columna.
          className="!flex-col !gap-1 py-4"
        >
          <span className="inline-flex items-center gap-2">
            <i className={`fas ${icon}`} aria-hidden="true" />
            {label}
          </span>
          <span className="text-xs font-normal opacity-80">tecla {shortcut}</span>
        </Button>
      ))}
    </div>
  );
}
