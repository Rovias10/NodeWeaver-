import { useEffect, useRef } from 'react';
import { Button } from '@/ui/Button.jsx';

/**
 * Diálogo de confirmación de borrado de flashcard.
 *
 * Calco de DeleteMapDialog: <dialog> nativo HTML5, sin librería de
 * modales. Solo cambia el copy y el preview (mostramos el anverso
 * truncado de la tarjeta en vez del título de un mapa).
 *
 * Props:
 *   - open:       bool (controla showModal/close).
 *   - cardFront:  texto del anverso a mostrar en la confirmación.
 *   - isDeleting: muestra spinner en el botón "Eliminar".
 *   - onConfirm:  callback al confirmar.
 *   - onCancel:   callback al cancelar.
 */
export function DeleteFlashcardDialog({
  open,
  cardFront = '',
  isDeleting = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);

  // Mostrar/ocultar dialog desde el estado React.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  // Escape no debe cerrar en seco; lo encauzamos por onCancel.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleCancel = (e) => {
      e.preventDefault();
      onCancel?.();
    };
    dlg.addEventListener('cancel', handleCancel);
    return () => dlg.removeEventListener('cancel', handleCancel);
  }, [onCancel]);

  // Truncamos el preview del anverso para que el modal no crezca de más.
  const preview = (cardFront || '').trim();
  const shown = preview.length > 120 ? preview.slice(0, 117) + '…' : preview;

  return (
    <dialog
      ref={dialogRef}
      className="
        max-w-md w-[calc(100%-2rem)] p-0 rounded-2xl border border-line
        bg-glass backdrop-blur-2xl shadow-card
        backdrop:bg-ink/40 backdrop:backdrop-blur-sm
      "
      onClick={(e) => {
        if (e.target === dialogRef.current && !isDeleting) onCancel?.();
      }}
    >
      <div className="p-6 md:p-7">
        <div className="flex items-start gap-4">
          <span
            className="inline-flex w-12 h-12 rounded-2xl bg-coral-400/15 text-coral-500 items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <i className="fas fa-triangle-exclamation text-xl" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink">¿Eliminar esta flashcard?</h2>
            <p className="text-sm text-ink-muted mt-2">
              Vas a borrar{' '}
              <strong className="text-ink">«{shown || 'sin pregunta'}»</strong>.
              Esta acción no se puede deshacer y perderás su progreso de repaso.
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            isLoading={isDeleting}
          >
            <i className="fas fa-trash" aria-hidden="true" />
            Eliminar
          </Button>
        </div>
      </div>
    </dialog>
  );
}
