import { Link } from 'react-router';
import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';
import { relativeTime } from '@/utils/relativeTime.js';

/**
 * Tarjeta resumen de un apunte en `/apuntes`.
 *
 * Muestra un badge según el origen (PDF o Texto), el título, la
 * cantidad de caracteres extraídos (sólo para apuntes de texto en
 * MVP — los PDFs van con char_count = 0 hasta que la rama IA decida
 * cachear texto) y la fecha de última edición.
 *
 * Props:
 *   - note:      fila de notes/list (id, title, source_type,
 *                char_count, original_filename, created_at, updated_at).
 *   - onDelete:  callback que dispara el padre para abrir DeleteNoteDialog.
 */
export function NoteCard({ note, onDelete }) {
  const isPdf = note.source_type === 'pdf';

  // Para PDFs el char_count está a 0 en MVP, así que no mostramos la
  // métrica — sería ruido. Para textos, sí aporta una señal del
  // tamaño del apunte.
  const showCharCount = !isPdf && note.char_count > 0;

  return (
    <Card padded className="flex flex-col gap-4 h-full">
      {/* Cabecera: badge + fecha relativa */}
      <div className="flex items-start justify-between gap-3">
        <span
          className={
            'text-xs font-semibold px-2.5 py-1 rounded-full border ' +
            (isPdf
              ? 'bg-coral-400/15 text-coral-600 border-coral-400/40'
              : 'bg-brand-50 text-brand-700 border-brand-200')
          }
        >
          <i
            className={`fas ${isPdf ? 'fa-file-pdf' : 'fa-file-lines'} mr-1.5`}
            aria-hidden="true"
          />
          {isPdf ? 'PDF' : 'Texto'}
        </span>
        <span className="text-xs text-ink-faint" title={note.updated_at}>
          {relativeTime(note.updated_at)}
        </span>
      </div>

      {/* Cuerpo: título + metadatos */}
      <div className="flex-1">
        <h3 className="text-lg font-bold text-ink leading-snug line-clamp-2">
          {note.title || 'Apunte sin título'}
        </h3>
        {isPdf && note.original_filename && (
          <p className="text-xs text-ink-faint mt-2 truncate" title={note.original_filename}>
            <i className="fas fa-paperclip mr-1.5" aria-hidden="true" />
            {note.original_filename}
          </p>
        )}
        {showCharCount && (
          <p className="text-xs text-ink-muted mt-2">
            <i className="fas fa-quote-left mr-1.5" aria-hidden="true" />
            {note.char_count.toLocaleString('es-ES')} caracteres
          </p>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-line">
        <Link to={`/apuntes/${note.id}`} className="flex-1">
          <Button variant="primary" size="md" className="w-full">
            <i className="fas fa-arrow-right" aria-hidden="true" />
            Abrir
          </Button>
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => onDelete(note)}
          aria-label={`Eliminar apunte ${note.title}`}
          title="Eliminar apunte"
        >
          <i className="fas fa-trash text-coral-500" aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}
