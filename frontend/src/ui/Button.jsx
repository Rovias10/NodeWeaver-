/**
 * Botón base reutilizable.
 *
 * Variantes:
 *   - primary: gradient marca→sol, CTA principal.
 *   - ghost:   superficie cristal con borde sutil, acción secundaria.
 *   - google:  blanco con icono Google, único en pantallas auth.
 *   - danger:  coral, acciones destructivas.
 *   - success: verde esmeralda, acciones positivas (p.ej. "Fácil"
 *              en la sesión de repaso de flashcards).
 *
 * Props:
 *   - variant: 'primary' | 'ghost' | 'google' | 'danger' | 'success'
 *   - size:    'md' | 'lg'
 *   - isLoading: muestra spinner y deshabilita.
 *   - resto: cualquier prop nativa de <button>.
 */

import { forwardRef } from 'react';

const VARIANTS = {
  primary:
    'text-white bg-gradient-to-r from-brand-500 via-brand-400 to-sun-300 ' +
    'shadow-[var(--shadow-glow-brand)] hover:brightness-105 ' +
    'focus-visible:ring-brand-400',
  ghost:
    'text-ink bg-glass border border-line backdrop-blur-md ' +
    'hover:bg-white/80 focus-visible:ring-brand-400',
  google:
    'text-ink bg-white border border-line ' +
    'hover:bg-brand-50 focus-visible:ring-brand-400',
  danger:
    'text-white bg-coral-500 hover:bg-coral-400 ' +
    'focus-visible:ring-coral-400',
  success:
    'text-white bg-emerald-500 hover:bg-emerald-400 ' +
    'focus-visible:ring-emerald-400',
};

const SIZES = {
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', isLoading = false, className = '', children, disabled, ...rest },
  ref,
) {
  const variantClasses = VARIANTS[variant] ?? VARIANTS.primary;
  const sizeClasses = SIZES[size] ?? SIZES.md;

  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold ' +
        'transition-all duration-200 transform-gpu ' +
        'hover:-translate-y-0.5 active:translate-y-0 ' +
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ' +
        'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 ' +
        `${variantClasses} ${sizeClasses} ${className}`
      }
      {...rest}
    >
      {isLoading && (
        <span
          aria-hidden="true"
          className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
        />
      )}
      {children}
    </button>
  );
});
