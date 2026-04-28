import { Button } from '@/ui/Button.jsx';

/**
 * Estado vacío del listado de apuntes.
 *
 * Aparece la primera vez que un alumno entra a `/apuntes` y no ha
 * subido ni un PDF ni pegado un texto todavía. Buena UX: explica el
 * propósito de la sección y ofrece una acción clara.
 *
 * Props:
 *   - onUpload:  callback que abre `UploadNoteDialog`.
 */
export function EmptyNotesState({ onUpload }) {
  return (
    <div className="text-center py-10 px-6">
      <span
        className="inline-flex w-14 h-14 rounded-2xl bg-brand-100 text-brand-600 items-center justify-center mb-4"
        aria-hidden="true"
      >
        <i className="fas fa-file-lines text-2xl" />
      </span>
      <h3 className="text-lg font-semibold text-ink">Aún no tienes apuntes</h3>
      <p className="text-ink-muted text-sm mt-2 max-w-md mx-auto">
        Sube un PDF de tu temario o pega tus notas en texto. Desde ahí
        podrás generar mapas conceptuales y flashcards de repaso.
      </p>
      <div className="mt-6">
        <Button onClick={onUpload}>
          <i className="fas fa-upload" aria-hidden="true" />
          Sube tus primeros apuntes
        </Button>
      </div>
    </div>
  );
}
