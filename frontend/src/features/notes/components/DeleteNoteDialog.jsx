import { useEffect, useRef } from 'react';
import { Button } from '@/ui/Button.jsx';

/**
 * Diálogo de confirmación de borrado de apunte.
 *
 * Implementado con `<dialog>` nativo HTML5 + Tailwind, sin librerías
 * externas (mismo patrón que `DeleteMapDialog` y `DeleteFlashcardDialog`).
 * El navegador gestiona focus trap, backdrop y la tecla Escape.
 *
 * Props:
 *   - open:       bool (controla showModal/close).
 *   - noteTitle:  título del apunte a mostrar en el mensaje.
 *   - isDeleting: muestra spinner en el botón "Eliminar".
 *   - onConfirm:  callback al confirmar.
 *   - onCancel:   callback al cancelar (botón Cancelar, click fuera o Escape).
 */
export function DeleteNoteDialog({ open, noteTitle = '', isDeleting = false, onConfirm, onCancel }) {
  const dialogRef = useRef(null);

  // Sincroniza el estado React con la API imperativa de <dialog>.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  // El navegador dispara 'cancel' al pulsar Escape; lo interceptamos
  // para que pase por nuestro flujo en lugar de cerrarse en seco.
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

  return (
    <dialog
      ref={dialogRef}
      className="
        max-w-md w-[calc(100%-2rem)] p-0 rounded-2xl border border-line
        bg-glass backdrop-blur-2xl shadow-card
        backdrop:bg-ink/40 backdrop:backdrop-blur-sm
      "
      onClick={(e) => {
        // Click en el backdrop cierra (target = el propio dialog).
        if (e.target === dialogRef.current) onCancel?.();
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
            <h2 className="text-lg font-bold text-ink">¿Eliminar este apunte?</h2>
            <p className="text-sm text-ink-muted mt-2">
              Vas a borrar <strong className="text-ink">«{noteTitle || 'sin título'}»</strong>.
              También se eliminará el archivo subido si lo había. Los
              mapas y flashcards generados desde este apunte se conservarán.
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} isLoading={isDeleting}>
            <i className="fas fa-trash" aria-hidden="true" />
            Eliminar
          </Button>
        </div>
      </div>
    </dialog>
  );
}
