import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/Button.jsx';

/**
 * Diálogo de creación / edición de una flashcard.
 *
 * Implementado con <dialog> nativo + Tailwind, mismo patrón que
 * DeleteMapDialog. Sin librerías de modales: API estándar del
 * navegador (focus trap y backdrop gestionados por el browser).
 *
 * Modo:
 *   - card === null  → modo "Nueva tarjeta".
 *   - card === obj   → modo "Editar"; precarga front/back del objeto.
 *
 * Validación inline: front y back son obligatorios y ≤ 500 chars
 * (mismo límite que valida el backend; es defensa profunda).
 *
 * Props:
 *   - open:       bool (controla showModal/close).
 *   - card:       null o fila a editar.
 *   - isSaving:   muestra spinner en el botón principal y bloquea cierre por backdrop.
 *   - onSubmit:   callback({ front, back }) tras pulsar "Guardar".
 *   - onCancel:   callback al cancelar (botón Cancelar, Escape, click backdrop).
 */
const MAX_LEN = 500;

export function FlashcardEditDialog({
  open,
  card = null,
  isSaving = false,
  onSubmit,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [errors, setErrors] = useState({});

  const isEdit = card !== null && card.id != null;

  // Sincroniza la API imperativa de <dialog> con el estado React.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  // Al abrir, precarga contenido (o limpia para create) y resetea errores.
  useEffect(() => {
    if (!open) return;
    setFront(card?.front ?? '');
    setBack(card?.back ?? '');
    setErrors({});
  }, [open, card]);

  // Escape → onCancel (en lugar de cerrar en seco el dialog).
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

  const validate = () => {
    const errs = {};
    const f = front.trim();
    const b = back.trim();
    if (f === '') errs.front = 'La pregunta es obligatoria.';
    else if (f.length > MAX_LEN) errs.front = `Máximo ${MAX_LEN} caracteres.`;
    if (b === '') errs.back = 'La respuesta es obligatoria.';
    else if (b.length > MAX_LEN) errs.back = `Máximo ${MAX_LEN} caracteres.`;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSaving) return;
    if (!validate()) return;
    onSubmit?.({ front: front.trim(), back: back.trim() });
  };

  return (
    <dialog
      ref={dialogRef}
      className="
        max-w-lg w-[calc(100%-2rem)] p-0 rounded-2xl border border-line
        bg-glass backdrop-blur-2xl shadow-card
        backdrop:bg-ink/40 backdrop:backdrop-blur-sm
      "
      onClick={(e) => {
        if (e.target === dialogRef.current && !isSaving) onCancel?.();
      }}
    >
      <form onSubmit={handleSubmit} className="p-6 md:p-7">
        <div className="flex items-start gap-4">
          <span
            className="inline-flex w-12 h-12 rounded-2xl bg-brand-50 text-brand-500 items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <i className={`fas ${isEdit ? 'fa-pen' : 'fa-plus'} text-xl`} />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink">
              {isEdit ? 'Editar flashcard' : 'Nueva flashcard'}
            </h2>
            <p className="text-sm text-ink-muted mt-1">
              Mantén la pregunta breve y la respuesta concreta. Los campos del
              algoritmo de repaso (intervalo, facilidad…) se actualizan solos al
              repasar.
            </p>
          </div>
        </div>

        <label className="block mt-5">
          <span className="text-sm font-semibold text-ink">Pregunta (anverso)</span>
          <textarea
            value={front}
            onChange={(e) => setFront(e.target.value)}
            rows={3}
            disabled={isSaving}
            placeholder="¿Qué es la herencia en POO?"
            className="mt-1 block w-full rounded-xl border border-line bg-paper/60 px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60"
          />
          <div className="flex justify-between mt-1 text-xs">
            <span className={errors.front ? 'text-coral-500 font-medium' : 'text-ink-faint'}>
              {errors.front || ' '}
            </span>
            <span className={front.length > MAX_LEN ? 'text-coral-500' : 'text-ink-faint'}>
              {front.length}/{MAX_LEN}
            </span>
          </div>
        </label>

        <label className="block mt-3">
          <span className="text-sm font-semibold text-ink">Respuesta (reverso)</span>
          <textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            rows={4}
            disabled={isSaving}
            placeholder="Mecanismo por el que una clase deriva propiedades y métodos de otra…"
            className="mt-1 block w-full rounded-xl border border-line bg-paper/60 px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60"
          />
          <div className="flex justify-between mt-1 text-xs">
            <span className={errors.back ? 'text-coral-500 font-medium' : 'text-ink-faint'}>
              {errors.back || ' '}
            </span>
            <span className={back.length > MAX_LEN ? 'text-coral-500' : 'text-ink-faint'}>
              {back.length}/{MAX_LEN}
            </span>
          </div>
        </label>

        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={isSaving}>
            <i className="fas fa-floppy-disk" aria-hidden="true" />
            {isEdit ? 'Guardar cambios' : 'Crear tarjeta'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
