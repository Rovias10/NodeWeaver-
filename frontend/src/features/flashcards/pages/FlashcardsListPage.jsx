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
  deleteFlashcardsByNote,
} from '../services/flashcardsService.js';
import { FlashcardCard } from '../components/FlashcardCard.jsx';
import { FlashcardEditDialog } from '../components/FlashcardEditDialog.jsx';
import { DeleteFlashcardDialog } from '../components/DeleteFlashcardDialog.jsx';
import { DeleteFolderDialog } from '../components/DeleteFolderDialog.jsx';
import { EmptyFlashcardsState } from '../components/EmptyFlashcardsState.jsx';
import { FlashcardFolder } from '../components/FlashcardFolder.jsx';

/**
 * "¿Esta tarjeta vence hoy o antes?".
 *
 * El backend serializa next_review_at como string 'Y-m-d', sin hora.
 * Comparar strings ISO funciona porque están normalizados (siempre
 * con padding) y porque la fecha del cliente se calcula con
 * Intl.DateTimeFormat para no depender de la zona horaria del SO.
 */
function isDueToday(card, todayIso) {
  if (!card?.next_review_at) return false;
  return String(card.next_review_at).slice(0, 10) <= todayIso;
}

/**
 * Agrupa la lista plana de flashcards por apunte de origen.
 *
 * Reglas:
 *   - Cada `note_id` distinto da una carpeta etiquetada con su
 *     `note_title`.
 *   - Las tarjetas con `note_id === null` (manuales o generadas
 *     desde un mapa) caen en una carpeta "Sin apunte" al final.
 *   - El orden de las carpetas con apunte sigue la primera aparición
 *     en `cards` — como `cards` ya viene ordenado por urgencia
 *     (next_review_at ASC) desde el backend, las carpetas más
 *     urgentes salen arriba sin ordenación extra.
 *
 * Devuelve un array de objetos { key, title, icon, items } listo
 * para renderizar.
 */
function groupCardsByNote(cards, todayIso) {
  const byNote = new Map(); // note_id → folder
  const orphans = [];

  for (const card of cards) {
    if (card.note_id == null) {
      orphans.push(card);
      continue;
    }
    const key = String(card.note_id);
    const existing = byNote.get(key);
    if (existing) {
      existing.items.push(card);
      if (isDueToday(card, todayIso)) existing.dueCount += 1;
    } else {
      byNote.set(key, {
        key,
        // noteId numérico (no la string del Map.key) — el handler de
        // "Jugar" y "Borrar" lo necesita tipado para componer la URL
        // y el body del DELETE.
        noteId: card.note_id,
        // Si el JOIN no devolvió título (apunte borrado pero la FK
        // ON DELETE SET NULL aún no se aplicó por algún motivo) caemos
        // a un nombre genérico defensivo.
        title: card.note_title || 'Apunte sin título',
        icon: 'fa-folder-open',
        items: [card],
        dueCount: isDueToday(card, todayIso) ? 1 : 0,
      });
    }
  }

  const folders = Array.from(byNote.values());
  if (orphans.length > 0) {
    folders.push({
      key: 'orphans',
      noteId: null, // null marca la carpeta "Sin apunte" para los handlers.
      title: 'Sin apunte',
      icon: 'fa-layer-group',
      items: orphans,
      dueCount: orphans.reduce(
        (acc, c) => acc + (isDueToday(c, todayIso) ? 1 : 0),
        0,
      ),
    });
  }
  return folders;
}

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

  // Borrado individual.
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Borrado masivo de carpeta entera. Guardamos el folder completo
  // para que el diálogo pueda mostrar el título y el conteo correctos.
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);

  // Cadena 'Y-m-d' del día de hoy en el cliente. Lo memoizamos por
  // render para no llamar a Date.now() N veces dentro de groupCardsByNote.
  // Si el usuario deja la pestaña abierta varios días, el contador de
  // pendientes podría desincronizarse hasta el siguiente refresh — es
  // un trade-off aceptable: el "due" real lo decide el backend al
  // pulsar "Jugar".
  const todayIso = new Date().toISOString().slice(0, 10);

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

  // ── Acciones de carpeta ──────────────────────────────────────────
  // "Jugar carpeta" → navegamos a la sesión de repaso con el filtro
  // adecuado en query string. Pasamos el título por location.state
  // para que la cabecera del repaso no necesite hacer otro fetch sólo
  // para mostrar el nombre del apunte.
  const handlePlayFolder = (folder) => {
    const noteParam = folder.noteId === null ? 'none' : String(folder.noteId);
    navigate(`/flashcards/repaso?note=${noteParam}`, {
      state: { folderTitle: folder.title },
    });
  };

  const handleConfirmDeleteFolder = async () => {
    if (!pendingDeleteFolder || isDeletingFolder) return;
    setIsDeletingFolder(true);
    try {
      const res = await deleteFlashcardsByNote(pendingDeleteFolder.noteId);
      if (!res.success) {
        notify(res.message || 'No se pudo borrar la carpeta.', 'error');
        return;
      }
      notify(res.message || 'Carpeta eliminada.', 'success');
      // Optimismo local: filtramos las dos listas en memoria sin
      // refetch. Mismo criterio que usa groupCardsByNote para casar
      // tarjeta ↔ carpeta (note_id numérico o null).
      const noteId = pendingDeleteFolder.noteId;
      const matches = (c) => (noteId === null ? c.note_id == null : c.note_id === noteId);
      setAll((prev) => prev.filter((c) => !matches(c)));
      setDue((prev) => prev.filter((c) => !matches(c)));
      setPendingDeleteFolder(null);
    } catch {
      notify('Error de red al borrar la carpeta.', 'error');
    } finally {
      setIsDeletingFolder(false);
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

      {status === 'ok' && tab === 'all' && (
        all.length === 0 ? (
          <EmptyFlashcardsState
            onCreate={() => setShowCreate(true)}
            onGoToMaps={() => navigate('/mapas')}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {groupCardsByNote(all, todayIso).map((folder) => (
              <FlashcardFolder
                key={folder.key}
                title={folder.title}
                icon={folder.icon}
                count={folder.items.length}
                dueCount={folder.dueCount}
                onPlay={() => handlePlayFolder(folder)}
                onDelete={() => setPendingDeleteFolder(folder)}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {folder.items.map((card) => (
                    <FlashcardCard
                      key={card.id}
                      card={card}
                      onEdit={(c) => setEditing(c)}
                      onDelete={(c) => setPendingDelete(c)}
                    />
                  ))}
                </div>
              </FlashcardFolder>
            ))}
          </div>
        )
      )}

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

      <DeleteFolderDialog
        open={pendingDeleteFolder !== null}
        folderTitle={pendingDeleteFolder?.title}
        count={pendingDeleteFolder?.items.length ?? 0}
        isDeleting={isDeletingFolder}
        onConfirm={handleConfirmDeleteFolder}
        onCancel={() => (isDeletingFolder ? null : setPendingDeleteFolder(null))}
      />
    </div>
  );
}
