/**
 * Switch on/off para alternar la visibilidad pública de un mapa.
 *
 * Componente controlado: el padre mantiene el estado `isPublic` y
 * decide qué hacer cuando se togglea (típicamente confirmar antes
 * de publicar y persistir vía `mapsService.saveMap`).
 *
 * Accesibilidad: usa `role="switch"` + `aria-checked`, lo que
 * permite a lectores de pantalla anunciarlo correctamente. El
 * elemento es un `<button>` por lo que ya es activable con Space y
 * Enter sin código adicional.
 *
 * Props:
 *  - isPublic:  bool, estado actual.
 *  - onChange:  callback(next: bool) — el padre decide si confirmar
 *               y persistir el cambio.
 *  - disabled:  bloquea la interacción.
 *  - isPending: dibuja el switch en estado loading mientras el
 *               padre persiste el cambio.
 */
export function ShareToggle({ isPublic, onChange, disabled = false, isPending = false }) {
  const handleClick = () => {
    if (disabled || isPending) return;
    onChange?.(!isPublic);
  };

  const label = isPublic
    ? 'Visibilidad pública. Clic para hacer privado.'
    : 'Visibilidad privada. Clic para hacer público.';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        aria-label={label}
        title={label}
        onClick={handleClick}
        disabled={disabled || isPending}
        className={
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ' +
          'disabled:opacity-60 disabled:cursor-not-allowed ' +
          (isPublic ? 'bg-emerald-500' : 'bg-ink-faint/40')
        }
      >
        <span
          aria-hidden="true"
          className={
            'inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ' +
            (isPublic ? 'translate-x-6' : 'translate-x-1')
          }
        />
      </button>
      <span
        className={
          'text-xs font-semibold shrink-0 ' +
          (isPublic ? 'text-emerald-700' : 'text-ink-muted')
        }
      >
        {isPending ? (
          <>
            <span
              aria-hidden="true"
              className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1 align-middle"
            />
            Guardando…
          </>
        ) : (
          <>
            <i className={`fas ${isPublic ? 'fa-globe' : 'fa-lock'} mr-1`} aria-hidden="true" />
            {isPublic ? 'Público' : 'Privado'}
          </>
        )}
      </span>
    </div>
  );
}
