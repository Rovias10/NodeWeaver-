import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/Button.jsx';

/**
 * Diálogo de creación de un apunte. Soporta dos modos en tabs:
 *
 *   - "PDF":   selección/drag&drop de un PDF (≤ 5 MB) + título opcional.
 *              Llama a `onSubmitPdf({ file, title })`.
 *   - "Texto": título opcional + body en textarea (1..200 000 chars).
 *              Llama a `onSubmitText({ title, body })`.
 *
 * Implementado con `<dialog>` nativo HTML5 + Tailwind, mismo patrón
 * que `FlashcardEditDialog` y `DeleteMapDialog`.
 *
 * Props:
 *   - open:          bool (controla showModal/close).
 *   - isUploading:   muestra spinner en el botón principal y bloquea el cierre por backdrop.
 *   - onSubmitPdf:   callback({ file, title }) tras "Subir PDF".
 *   - onSubmitText:  callback({ title, body }) tras "Guardar texto".
 *   - onCancel:      callback al cancelar.
 */
const MAX_PDF_SIZE = 5 * 1024 * 1024;       // 5 MB (mismo que el backend)
const TEXT_MAX_LEN = 200000;                 // 200 000 chars (mismo que el backend)
const TITLE_MAX_LEN = 200;

export function UploadNoteDialog({
  open,
  isUploading = false,
  onSubmitPdf,
  onSubmitText,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const fileInputRef = useRef(null);

  const [tab, setTab] = useState('pdf'); // 'pdf' | 'text'
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [errors, setErrors] = useState({});

  // Sincroniza la API imperativa de <dialog> con el estado React.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  // Al abrir, reseteamos al estado inicial (tab por defecto = pdf).
  useEffect(() => {
    if (!open) return;
    setTab('pdf');
    setFile(null);
    setTitle('');
    setBody('');
    setIsDragOver(false);
    setErrors({});
  }, [open]);

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

  // Validación inline del archivo (extensión + tamaño). Devuelve mensaje
  // de error o null si todo va bien.
  const validatePdfFile = (f) => {
    if (!f) return 'Selecciona un PDF.';
    const lower = (f.name || '').toLowerCase();
    if (!lower.endsWith('.pdf')) return 'Sólo se aceptan archivos PDF.';
    if (f.size > MAX_PDF_SIZE) return 'El PDF supera el tamaño máximo (5 MB).';
    return null;
  };

  const handleFileSelected = (f) => {
    setErrors({});
    if (!f) {
      setFile(null);
      return;
    }
    const err = validatePdfFile(f);
    if (err) {
      setFile(null);
      setErrors({ file: err });
      return;
    }
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isUploading) return;
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) handleFileSelected(dropped);
  };

  // Submit unificado: ramifica según el tab activo.
  const handleSubmit = (e) => {
    e.preventDefault();
    if (isUploading) return;

    const t = title.trim();
    if (t.length > TITLE_MAX_LEN) {
      setErrors({ title: `Máximo ${TITLE_MAX_LEN} caracteres.` });
      return;
    }

    if (tab === 'pdf') {
      const err = validatePdfFile(file);
      if (err) {
        setErrors({ file: err });
        return;
      }
      onSubmitPdf?.({ file, title: t });
      return;
    }

    // tab === 'text'
    const b = body.trim();
    if (b === '') {
      setErrors({ body: 'El contenido del apunte no puede estar vacío.' });
      return;
    }
    if (b.length > TEXT_MAX_LEN) {
      setErrors({ body: `Máximo ${TEXT_MAX_LEN.toLocaleString('es-ES')} caracteres.` });
      return;
    }
    onSubmitText?.({ title: t, body: b });
  };

  return (
    <dialog
      ref={dialogRef}
      className="
        max-w-2xl w-[calc(100%-2rem)] p-0 rounded-2xl border border-line
        bg-glass backdrop-blur-2xl shadow-card
        backdrop:bg-ink/40 backdrop:backdrop-blur-sm
      "
      onClick={(e) => {
        if (e.target === dialogRef.current && !isUploading) onCancel?.();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="p-6 md:p-7"
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter envía el formulario, sobre todo útil dentro
          // del textarea del tab Texto donde Enter hace nueva línea.
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
      >
        <div className="flex items-start gap-4">
          <span
            className="inline-flex w-12 h-12 rounded-2xl bg-brand-50 text-brand-500 items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <i className="fas fa-upload text-xl" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink">Nuevo apunte</h2>
            <p className="text-sm text-ink-muted mt-1">
              Sube un PDF o pega tus notas en texto. La IA podrá generar mapas
              y flashcards a partir del contenido (próximamente).
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="Origen del apunte" className="flex gap-1 mt-5 border-b border-line">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pdf'}
            onClick={() => {
              if (isUploading) return;
              setTab('pdf');
              setErrors({});
            }}
            className={
              'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ' +
              (tab === 'pdf'
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-ink-muted hover:text-ink')
            }
          >
            <i className="fas fa-file-pdf mr-2" aria-hidden="true" />
            Subir PDF
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'text'}
            onClick={() => {
              if (isUploading) return;
              setTab('text');
              setErrors({});
            }}
            className={
              'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ' +
              (tab === 'text'
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-ink-muted hover:text-ink')
            }
          >
            <i className="fas fa-pen-to-square mr-2" aria-hidden="true" />
            Pegar texto
          </button>
        </div>

        {/* Título (común a ambos tabs) */}
        <label className="block mt-5">
          <span className="text-sm font-semibold text-ink">
            Título <span className="font-normal text-ink-faint">(opcional)</span>
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isUploading}
            maxLength={TITLE_MAX_LEN}
            placeholder={tab === 'pdf' ? 'Si lo dejas vacío, usaremos el nombre del archivo' : 'Apunte sin título'}
            className="mt-1 block w-full rounded-xl border border-line bg-paper/60 px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60"
          />
          {errors.title && (
            <p className="text-coral-500 text-xs mt-1 font-medium">{errors.title}</p>
          )}
        </label>

        {/* Tab PDF */}
        {tab === 'pdf' && (
          <div className="mt-4">
            <span className="text-sm font-semibold text-ink">Archivo PDF</span>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!isUploading) setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              role="button"
              tabIndex={isUploading ? -1 : 0}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={
                'mt-2 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ' +
                (isDragOver
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-line hover:border-brand-400 hover:bg-brand-50/40 ') +
                (isUploading ? ' opacity-60 cursor-not-allowed' : '')
              }
            >
              <i className="fas fa-cloud-arrow-up text-3xl text-brand-500" aria-hidden="true" />
              {file ? (
                <>
                  <p className="mt-3 font-semibold text-ink truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-ink-muted mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB · pulsa para cambiar
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 font-semibold text-ink">
                    Arrastra el PDF aquí o haz click para seleccionar
                  </p>
                  <p className="text-xs text-ink-muted mt-1">Tamaño máximo: 5 MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                disabled={isUploading}
                onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </div>
            {errors.file && (
              <p className="text-coral-500 text-xs mt-1 font-medium">{errors.file}</p>
            )}
          </div>
        )}

        {/* Tab Texto */}
        {tab === 'text' && (
          <label className="block mt-4">
            <span className="text-sm font-semibold text-ink">Contenido</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              disabled={isUploading}
              placeholder="Pega aquí el texto del temario, de un PDF copiado, de tus notas..."
              className="mt-1 block w-full rounded-xl border border-line bg-paper/60 px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60"
            />
            <div className="flex justify-between mt-1 text-xs">
              <span className={errors.body ? 'text-coral-500 font-medium' : 'text-ink-faint'}>
                {errors.body || ' '}
              </span>
              <span className={body.length > TEXT_MAX_LEN ? 'text-coral-500' : 'text-ink-faint'}>
                {body.length.toLocaleString('es-ES')} / {TEXT_MAX_LEN.toLocaleString('es-ES')}
              </span>
            </div>
          </label>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6 sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isUploading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isUploading}
            title="Atajo: Ctrl+Enter"
            aria-keyshortcuts="Control+Enter"
          >
            <i className={`fas ${tab === 'pdf' ? 'fa-upload' : 'fa-floppy-disk'}`} aria-hidden="true" />
            {tab === 'pdf' ? 'Subir PDF' : 'Guardar texto'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
