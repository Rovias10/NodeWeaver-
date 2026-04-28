import { forwardRef, useId } from 'react';

/**
 * Input con etiqueta, icono opcional, mensaje de error y sufijo
 * (típicamente para el toggle de visibilidad de contraseña).
 *
 * Props:
 *   - label: texto del <label> superior (opcional pero recomendado).
 *   - icon: clase Font Awesome para el icono izquierdo (ej. 'fa-envelope').
 *   - error: si se pasa, muestra el mensaje en rojo bajo el campo.
 *   - rightAddon: ReactNode para colocar dentro del input a la derecha.
 *   - resto: props nativas de <input>.
 */
export const Input = forwardRef(function Input(
  { label, icon, error, rightAddon, id, className = '', ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? `input-${reactId}`;
  const errorId = error ? `${inputId}-error` : undefined;

  const hasIcon = Boolean(icon);
  const hasRight = Boolean(rightAddon);

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-muted mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {hasIcon && (
          <i
            className={`fas ${icon} absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none`}
            aria-hidden="true"
          />
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={errorId}
          className={
            'w-full bg-white/70 border rounded-xl py-3 text-ink placeholder-ink-faint ' +
            'shadow-inner transition-all ' +
            'focus:outline-none focus:ring-2 focus:ring-brand-400/60 focus:border-brand-400/60 ' +
            'disabled:bg-slate-100 disabled:text-ink-muted disabled:border-slate-200 disabled:shadow-none disabled:cursor-not-allowed disabled:opacity-100 ' +
            (hasIcon ? 'pl-11 ' : 'pl-4 ') +
            (hasRight ? 'pr-11 ' : 'pr-4 ') +
            (error ? 'border-coral-400/70' : 'border-line')
          }
          {...rest}
        />
        {hasRight && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">{rightAddon}</div>
        )}
      </div>
      {error && (
        <p id={errorId} className="text-coral-500 text-xs mt-1 font-medium">
          {error}
        </p>
      )}
    </div>
  );
});
