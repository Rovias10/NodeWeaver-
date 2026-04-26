import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/ui/Button.jsx';
import { Spinner } from '@/ui/Spinner.jsx';
import { Card } from '@/ui/Card.jsx';
import { useNotification } from '@/ui/useNotification.js';
import {
  listFlashcards,
  listDue,
  saveFlashcard,
  deleteFlashcard,
} from '../services/flashcardsService.js';
import { FlashcardCard } from '../components/FlashcardCard.jsx';
import { FlashcardEditDialog } from '../components/FlashcardEditDialog.jsx';
import { DeleteFlashcardDialog } from '../components/DeleteFlashcardDialog.jsx';
import { EmptyFlashcardsState } from '../components/EmptyFlashcardsState.jsx';

/**
 * Listado de flashcards del usuario autenticado.
 *
 * Tabs internos (sin sub-rutas para no inflar el router):
 *   - 'review' → vista CTA "Empezar repaso" o "nada que repasar".
 *                Navega a /flashcards/repaso (ruta creada en F4).
 *   - 'all'    → grid responsive de FlashcardCard con CRUD inline.
 *
 * Estados:
 *   loading → spinner.
 *   error   → mensaje + reintentar.
 *   ok      → tabs + contenido.
 *
 * Cumple RA2 0615 (Grid Layout) con grid-cols-1 sm:grid-cols-2 lg:grid-cols-3.
 *
 * Carga ambas listas (all + due) en paralelo al montar para que el
 * contador del tab "Repasar" sea inmediato. Tras crear/editar/borrar
 * refrescamos las dos para mantener coherencia (una tarjeta nueva
 * arranca con next_review_at = hoy, así que entra en `due`).
 */
export function FlashcardsListPage() {
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [tab, setTab] = useState('review'); // 'review' | 'all'
  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ok'

  const [all, setAll] = useState([]);
  const [due, setDue] = useState([]);

  // Edición / creación. `editing` !== null → modo editar; `showCreate` → modo crear.
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Borrado.
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Carga inicial / refresh ───────────────────────────────────────
  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      const [resAll, resDue] = await Promise.all([listFlashcards(), listDue()]);
      if (!resAll.success || !resDue.success) {
        setStatus('error');
        notify(
          resAll.message || resDue.message || 'No se pudieron cargar las flashcards.',
          'error',
        );
        return;
      }
      setAll(Array.isArray(resAll.data) ? resAll.data : []);
      setDue(Array.isArray(resDue.data) ? resDue.data : []);
      setStatus('ok');
    } catch {
      setStatus('error');
      notify('Error de red al cargar las flashcards.', 'error');
    }
  }, [notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Crear / editar ────────────────────────────────────────────────
  const handleSubmitCard = async ({ front, back }) => {
    setIsSaving(true);
    try {
      const id = editing?.id;
      const payload = id ? { id, front, back } : { front, back };
      const res = await saveFlashcard(payload);
      if (!res.success) {
        notify(res.message || 'No se pudo guardar la flashcard.', 'error');
        return;
      }
      notify(id ? 'Flashcard actualizada.' : 'Flashcard creada.', 'success');
      setEditing(null);
      setShowCreate(false);
      refresh();
    } catch {
      notify('Error de red al guardar la flashcard.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Borrar ───────────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteFlashcard(pendingDelete.id);
      if (!res.success) {
        notify(res.message || 'No se pudo eliminar la flashcard.', 'error');
        return;
      }
      notify('Flashcard eliminada.', 'success');
      // Optimismo local: sacamos la tarjeta de las dos listas sin refetch.
      setAll((prev) => prev.filter((c) => c.id !== pendingDelete.id));
      setDue((prev) => prev.filter((c) => c.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch {
      notify('Error de red al eliminar la flashcard.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const dialogOpen = editing !== null || showCreate;
  const dialogCard = editing;

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto">
      {/* Cabecera */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-ink">Flashcards</h1>
          <p className="text-ink-muted text-sm mt-1">
            Repasa con repetición espaciada. Algoritmo SM-2 simplificado.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="lg">
          <i className="fas fa-plus" aria-hidden="true" />
          Nueva tarjeta
        </Button>
      </header>

      {/* Tabs */}
      <div role="tablist" aria-label="Vistas de flashcards" className="flex gap-1 mb-6 border-b border-line">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'review'}
          onClick={() => setTab('review')}
          className={
            'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ' +
            (tab === 'review'
              ? 'border-brand-500 text-brand-700'
              : 'border-transparent text-ink-muted hover:text-ink')
          }
        >
          <i className="fas fa-bolt mr-2" aria-hidden="true" />
          Repasar
          {due.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-bold bg-brand-500 text-white">
              {due.length}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          onClick={() => setTab('all')}
          className={
            'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ' +
            (tab === 'all'
              ? 'border-brand-500 text-brand-700'
              : 'border-transparent text-ink-muted hover:text-ink')
          }
        >
          <i className="fas fa-list mr-2" aria-hidden="true" />
          Mis tarjetas
          <span className="ml-2 text-xs text-ink-faint">({all.length})</span>
        </button>
      </div>

      {/* Estados */}
      {status === 'loading' && (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      )}

      {status === 'error' && (
        <Card padded className="text-center">
          <i className="fas fa-cloud-bolt text-3xl text-coral-500" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">No pudimos cargar tus flashcards</p>
          <p className="text-sm text-ink-muted mt-1">
            Comprueba tu conexión y vuelve a intentarlo.
          </p>
          <div className="mt-5">
            <Button variant="ghost" onClick={refresh}>
              <i className="fas fa-rotate-right" aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        </Card>
      )}

      {/* Tab Repasar */}
      {status === 'ok' && tab === 'review' && (
        <Card padded className="text-center">
          {due.length === 0 ? (
            <>
              <i className="fas fa-check-circle text-4xl text-emerald-500 mb-3" aria-hidden="true" />
              <h3 className="text-lg font-bold text-ink">Sin repasos pendientes</h3>
              <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto">
                Vuelve mañana, o crea más tarjetas para mantener la racha. Las
                tarjetas vuelven a la cola según el algoritmo de repetición
                espaciada.
              </p>
              <div className="mt-5">
                <Button variant="ghost" onClick={() => setTab('all')}>
                  <i className="fas fa-list" aria-hidden="true" />
                  Ver mis tarjetas
                </Button>
              </div>
            </>
          ) : (
            <>
              <i className="fas fa-bolt text-4xl text-brand-500 mb-3" aria-hidden="true" />
              <h3 className="text-2xl font-bold text-ink">
                {due.length} tarjeta{due.length === 1 ? '' : 's'} para repasar
              </h3>
              <p className="text-sm text-ink-muted mt-2">
                Empieza la sesión y la app te enseñará una a una.
              </p>
              <div className="mt-5">
                <Button onClick={() => navigate('/flashcards/repaso')} size="lg">
                  <i className="fas fa-play" aria-hidden="true" />
                  Empezar repaso
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Tab Mis tarjetas */}
      {status === 'ok' && tab === 'all' && (
        all.length === 0 ? (
          <EmptyFlashcardsState
            onCreate={() => setShowCreate(true)}
            onGoToMaps={() => navigate('/mapas')}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {all.map((card) => (
              <FlashcardCard
                key={card.id}
                card={card}
                onEdit={(c) => setEditing(c)}
                onDelete={(c) => setPendingDelete(c)}
              />
            ))}
          </div>
        )
      )}

      {/* Diálogos */}
      <FlashcardEditDialog
        open={dialogOpen}
        card={dialogCard}
        isSaving={isSaving}
        onSubmit={handleSubmitCard}
        onCancel={() => {
          if (isSaving) return;
          setEditing(null);
          setShowCreate(false);
        }}
      />

      <DeleteFlashcardDialog
        open={pendingDelete !== null}
        cardFront={pendingDelete?.front}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => (isDeleting ? null : setPendingDelete(null))}
      />
    </div>
  );
}
