import { Button } from '@/ui/Button.jsx';

/**
 * Carpeta plegable de flashcards agrupadas por apunte de origen.
 *
 * Implementada con <details>/<summary> nativos: el navegador gestiona
 * el estado open/closed, el focus y las teclas Enter/Space sin estado
 * React ni librerías. El triángulo nativo de <summary> se oculta con
 * `list-none` + `[&::-webkit-details-marker]:hidden` (Safari/Chrome
 * antiguo) y se sustituye por un chevron Font Awesome que rota con
 * la variante Tailwind `group-open:` apuntando al propio <details>.
 *
 * Acciones de la cabecera:
 *   - "Jugar"   → callback onPlay; el padre navega a la sesión de
 *                 repaso filtrada por carpeta. Si no hay tarjetas
 *                 pendientes hoy queda deshabilitado para evitar
 *                 el viaje y la pantalla "no hay nada que repasar".
 *   - "Borrar"  → callback onDelete; el padre abre el diálogo de
 *                 confirmación.
 *
 * Los botones llevan `onClick` con `e.stopPropagation` y `e.preventDefault`
 * porque el <summary> también consume el click (toggle del details);
 * sin eso, pulsar "Jugar" abriría/cerraría la carpeta además de
 * disparar la acción.
 *
 * Props:
 *   - title:       etiqueta visible (título del apunte o "Sin apunte").
 *   - count:       total de flashcards en este grupo.
 *   - dueCount:    cuántas vencen hoy o antes (para el badge y para
 *                  habilitar/deshabilitar "Jugar").
 *   - icon:        clase Font Awesome a la izquierda del título.
 *   - defaultOpen: true → carpeta desplegada al montar.
 *   - onPlay:      callback sin args; el padre sabe qué carpeta es.
 *   - onDelete:    callback sin args.
 *   - children:    contenido (típicamente el grid de FlashcardCard).
 */
export function FlashcardFolder({
  title,
  count,
  dueCount = 0,
  icon = 'fa-folder-open',
  defaultOpen = true,
  onPlay,
  onDelete,
  children,
}) {
  function stopAndRun(handler) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();
      handler?.();
    };
  }

  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-line bg-white/50 overflow-hidden"
    >
      <summary
        className={
          'flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer select-none ' +
          'hover:bg-brand-50/50 transition-colors ' +
          'list-none [&::-webkit-details-marker]:hidden ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400'
        }
      >
        <i
          className="fas fa-chevron-right text-ink-faint w-4 transition-transform duration-150 group-open:rotate-90"
          aria-hidden="true"
        />
        <i className={`fas ${icon} text-brand-500`} aria-hidden="true" />
        <span className="font-semibold text-ink truncate min-w-0 flex-1">{title}</span>

        <span className="flex items-center gap-2 shrink-0">
          {dueCount > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-7 h-6 px-2 rounded-full text-xs font-bold bg-brand-500 text-white"
              title={`${dueCount} pendiente${dueCount === 1 ? '' : 's'} hoy`}
            >
              <i className="fas fa-bolt mr-1" aria-hidden="true" />
              {dueCount}
            </span>
          )}
          <span
            className="inline-flex items-center justify-center min-w-7 h-6 px-2 rounded-full text-xs font-semibold bg-brand-50 text-brand-700"
            title={`${count} tarjeta${count === 1 ? '' : 's'} en total`}
          >
            {count}
          </span>

          <Button
            type="button"
            size="md"
            onClick={stopAndRun(onPlay)}
            disabled={dueCount === 0}
            title={
              dueCount === 0
                ? 'No hay tarjetas pendientes en esta carpeta hoy'
                : `Repasar ${dueCount} pendiente${dueCount === 1 ? '' : 's'}`
            }
          >
            <i className="fas fa-play" aria-hidden="true" />
            <span className="hidden sm:inline">Jugar</span>
          </Button>

          <Button
            type="button"
            size="md"
            variant="danger"
            onClick={stopAndRun(onDelete)}
            title="Borrar todas las tarjetas de esta carpeta"
            aria-label="Borrar carpeta"
          >
            <i className="fas fa-trash" aria-hidden="true" />
          </Button>
        </span>
      </summary>

      <div className="p-4 pt-3 border-t border-line">{children}</div>
    </details>
  );
}
