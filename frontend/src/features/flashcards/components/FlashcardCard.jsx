import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';
import { DueBadge } from './DueBadge.jsx';

/**
 * Tarjeta resumen de una flashcard en el listado "Mis tarjetas".
 *
 * Muestra el anverso (front) truncado, badge de vencimiento, origen
 * (mapa o tarjeta suelta) y stats SM-2 mínimas (repeticiones y ease).
 * El reverso (back) NO se muestra aquí: se ve al editar o al repasar,
 * para no romper el efecto de "test mental" propio de las flashcards.
 *
 * Props:
 *   - card:     fila de flashcards/list (ya normalizada por el backend).
 *   - onEdit:   callback que dispara el padre para abrir FlashcardEditDialog.
 *   - onDelete: callback que dispara el padre para abrir DeleteFlashcardDialog.
 */
export function FlashcardCard({ card, onEdit, onDelete }) {
  const front = (card.front ?? '').trim();
  const truncated = front.length > 200 ? front.slice(0, 197) + '…' : front;

  const reps = Number(card.repetitions ?? 0);
  const ease = Number(card.ease_factor ?? 2.5);

  return (
    <Card padded className="flex flex-col gap-4 h-full">
      {/* Cabecera: vencimiento + origen.

          Tres badges posibles según la procedencia de la tarjeta:
          - "Mapa"   → generada desde un mapa (map_id != null).
          - "Apunte" → generada por IA desde un apunte (note_id != null
                       y map_id == null).
          - "Suelta" → creada a mano sin origen ligado.

          Mostrar el origen ayuda al alumno a recordar de qué tema sale
          cada tarjeta. */}
      <div className="flex items-start justify-between gap-3">
        <DueBadge nextReviewAt={card.next_review_at} />
        {card.map_id ? (
          <span
            className="text-xs text-ink-faint inline-flex items-center gap-1"
            title={`Generada desde el mapa #${card.map_id}`}
          >
            <i className="fas fa-link" aria-hidden="true" />
            Mapa
          </span>
        ) : card.note_id ? (
          <span
            className="text-xs text-ink-faint inline-flex items-center gap-1"
            title={`Generada desde el apunte #${card.note_id}`}
          >
            <i className="fas fa-file-lines" aria-hidden="true" />
            Apunte
          </span>
        ) : (
          <span className="text-xs text-ink-faint">Suelta</span>
        )}
      </div>

      {/* Pregunta truncada */}
      <div className="flex-1">
        <h3 className="text-base font-bold text-ink leading-snug line-clamp-3">
          {truncated || <span className="italic text-ink-faint">Sin pregunta</span>}
        </h3>
        <p className="text-xs text-ink-faint mt-3">
          Repeticiones: <strong className="text-ink-muted">{reps}</strong>
          <span className="mx-2">·</span>
          Facilidad: <strong className="text-ink-muted">{ease.toFixed(2)}</strong>
        </p>
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => onEdit?.(card)}
          aria-label="Editar tarjeta"
          title="Editar"
        >
          <i className="fas fa-pen" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => onDelete?.(card)}
          aria-label="Eliminar tarjeta"
          title="Eliminar"
        >
          <i className="fas fa-trash text-coral-500" aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}
