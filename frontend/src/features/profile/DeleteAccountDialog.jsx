import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/Button.jsx';
import { Input } from '@/ui/Input.jsx';

/**
 * Diálogo de confirmación de borrado de cuenta.
 *
 * Sigue el mismo patrón que DeleteNoteDialog/DeleteMapDialog/
 * DeleteFlashcardDialog: <dialog> nativo HTML5 + Tailwind, sin
 * librerías externas. El navegador gestiona focus trap, backdrop y
 * la tecla Escape.
 *
 * Fricción extra: el usuario tiene que escribir su email exacto
 * para habilitar el botón "Eliminar cuenta". Es UX anti-misclick
 * (patrón típico tipo Vercel/Cloudflare); la prueba de identidad
 * real sigue siendo el JWT en la cabecera Authorization.
 *
 * Props:
 *   - open:       bool (controla showModal/close).
 *   - email:      email de la cuenta (lo que el usuario debe tipear).
 *   - isDeleting: muestra spinner y bloquea el botón "Eliminar".
 *   - onConfirm:  callback con el email tipeado.
 *   - onCancel:   callback al cancelar (botón, click fuera o Escape).
 */
export function DeleteAccountDialog({ open, email = '', isDeleting = false, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
    if (!open) setConfirmation('');
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

  const matches = confirmation.trim().toLowerCase() === email.trim().toLowerCase() && email !== '';

  function handleSubmit(event) {
    event.preventDefault();
    if (!matches || isDeleting) return;
    onConfirm?.(confirmation);
  }

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
      <form onSubmit={handleSubmit} className="p-6 md:p-7">
        <div className="flex items-start gap-4">
          <span
            className="inline-flex w-12 h-12 rounded-2xl bg-coral-400/15 text-coral-500 items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <i className="fas fa-triangle-exclamation text-xl" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink">¿Eliminar tu cuenta?</h2>
            <p className="text-sm text-ink-muted mt-2">
              Esta acción es <strong className="text-ink">irreversible</strong>. Se borrarán
              tus apuntes, mapas, flashcards y comentarios. Los archivos PDF
              subidos se eliminarán también.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <Input
            label={
              <>
                Para confirmar, escribe tu email:{' '}
                <strong className="text-ink">{email}</strong>
              </>
            }
            type="email"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={email}
            autoComplete="off"
            disabled={isDeleting}
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" isLoading={isDeleting} disabled={!matches || isDeleting}>
            <i className="fas fa-trash" aria-hidden="true" />
            Eliminar cuenta
          </Button>
        </div>
      </form>
    </dialog>
  );
}
