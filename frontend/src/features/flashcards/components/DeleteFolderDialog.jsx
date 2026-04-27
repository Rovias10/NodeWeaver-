import { useEffect, useRef } from 'react';
import { Button } from '@/ui/Button.jsx';

/**
 * Diálogo de confirmación de borrado masivo de una carpeta entera.
 *
 * Mismo patrón que DeleteFlashcardDialog/DeleteNoteDialog: <dialog>
 * nativo + Tailwind, sin librerías. El navegador gestiona focus
 * trap, backdrop y la tecla Escape.
 *
 * Props:
 *   - open:        bool — controla showModal/close.
 *   - folderTitle: nombre de la carpeta (apunte o "Sin apunte").
 *   - count:       cuántas flashcards van a desaparecer.
 *   - isDeleting:  pinta spinner y bloquea botones.
 *   - onConfirm:   callback al confirmar.
 *   - onCancel:    callback al cancelar (botón, click fuera, Escape).
 */
export function DeleteFolderDialog({
  open,
  folderTitle = '',
  count = 0,
  isDeleting = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

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
            <h2 className="text-lg font-bold text-ink">
              ¿Borrar la carpeta «{folderTitle || 'sin nombre'}»?
            </h2>
            <p className="text-sm text-ink-muted mt-2">
              Vas a eliminar <strong className="text-ink">{count}</strong>{' '}
              flashcard{count === 1 ? '' : 's'}. Esta acción no se puede
              deshacer. El apunte de origen no se borra.
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
            Borrar carpeta
          </Button>
        </div>
      </div>
    </dialog>
  );
}
