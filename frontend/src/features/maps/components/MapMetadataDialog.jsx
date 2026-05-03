import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/Button.jsx';

/**
 * Diálogo de edición de metadatos del mapa: título y descripción.
 *
 * La visibilidad pública/privada NO se edita aquí — vive en el
 * `ShareToggle` de la cabecera del editor para mantener un único
 * punto de edición por dato y evitar drift entre dos UIs.
 *
 * Implementado con `<dialog>` nativo HTML5 + Tailwind, mismo patrón
 * que `FlashcardEditDialog`: useEffect imperativo para showModal/close,
 * captura del evento `cancel` para encauzar Escape por `onCancel`.
 *
 * Props:
 *   - open:        bool (controla showModal/close).
 *   - title:       valor inicial del título.
 *   - description: valor inicial de la descripción (puede ser null).
 *   - isSaving:    muestra spinner en el botón principal y bloquea
 *                  cierre por backdrop.
 *   - onSubmit:    callback({ title, description }) tras "Guardar cambios".
 *   - onCancel:    callback al cancelar (botón, Escape, click backdrop).
 */
const TITLE_MAX_LEN = 200;
const DESCRIPTION_MAX_LEN = 1000;

export function MapMetadataDialog({
  open,
  title: initialTitle = '',
  description: initialDescription = '',
  isSaving = false,
  onSubmit,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const [title, setTitle] = useState(initialTitle ?? '');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [errors, setErrors] = useState({});

  // Sincroniza la API imperativa de <dialog> con el estado React.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  // Al abrir, precarga los valores actuales y limpia errores.
  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle ?? '');
    setDescription(initialDescription ?? '');
    setErrors({});
  }, [open, initialTitle, initialDescription]);

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

  // Validación inline coherente con el backend (mapController::save).
  // Título obligatorio y ≤ 200 chars; descripción opcional con un cap
  // generoso pero defendible (1000 chars ≈ 200 palabras).
  const validate = () => {
    const errs = {};
    const t = title.trim();
    const d = description.trim();
    if (t === '') errs.title = 'El título es obligatorio.';
    else if (t.length > TITLE_MAX_LEN) errs.title = `Máximo ${TITLE_MAX_LEN} caracteres.`;
    if (d.length > DESCRIPTION_MAX_LEN) {
      errs.description = `Máximo ${DESCRIPTION_MAX_LEN} caracteres.`;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSaving) return;
    if (!validate()) return;
    onSubmit?.({
      title: title.trim(),
      description: description.trim(),
    });
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
            <i className="fas fa-pen text-xl" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink">Editar metadatos</h2>
            <p className="text-sm text-ink-muted mt-1">
              Cambia el título o añade una descripción que ayude a recordar
              de qué trata el mapa. La visibilidad se gestiona desde el
              interruptor de la cabecera.
            </p>
          </div>
        </div>

        <label className="block mt-5">
          <span className="text-sm font-semibold text-ink">Título</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSaving}
            maxLength={TITLE_MAX_LEN + 50}
            placeholder="Mapa sin título"
            className="mt-1 block w-full rounded-xl border border-line bg-paper/60 px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60"
          />
          <div className="flex justify-between mt-1 text-xs">
            <span className={errors.title ? 'text-coral-500 font-medium' : 'text-ink-faint'}>
              {errors.title || ' '}
            </span>
            <span className={title.length > TITLE_MAX_LEN ? 'text-coral-500' : 'text-ink-faint'}>
              {title.length}/{TITLE_MAX_LEN}
            </span>
          </div>
        </label>

        <label className="block mt-3">
          <span className="text-sm font-semibold text-ink">
            Descripción <span className="font-normal text-ink-faint">(opcional)</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            disabled={isSaving}
            placeholder="Resumen breve del tema, capítulo o asignatura del que trata el mapa..."
            className="mt-1 block w-full rounded-xl border border-line bg-paper/60 px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60"
          />
          <div className="flex justify-between mt-1 text-xs">
            <span className={errors.description ? 'text-coral-500 font-medium' : 'text-ink-faint'}>
              {errors.description || ' '}
            </span>
            <span
              className={description.length > DESCRIPTION_MAX_LEN ? 'text-coral-500' : 'text-ink-faint'}
            >
              {description.length}/{DESCRIPTION_MAX_LEN}
            </span>
          </div>
        </label>

        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={isSaving}>
            <i className="fas fa-floppy-disk" aria-hidden="true" />
            Guardar cambios
          </Button>
        </div>
      </form>
    </dialog>
  );
}
