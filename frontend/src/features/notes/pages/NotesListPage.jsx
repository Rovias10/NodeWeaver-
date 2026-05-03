import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/ui/Button.jsx';
import { Spinner } from '@/ui/Spinner.jsx';
import { Card } from '@/ui/Card.jsx';
import { useNotification } from '@/ui/useNotification.js';
import {
  listNotes,
  uploadPdfNote,
  uploadTextNote,
  deleteNote,
} from '../services/notesService.js';
import { NoteCard } from '../components/NoteCard.jsx';
import { UploadNoteDialog } from '../components/UploadNoteDialog.jsx';
import { DeleteNoteDialog } from '../components/DeleteNoteDialog.jsx';
import { EmptyNotesState } from '../components/EmptyNotesState.jsx';

/**
 * Listado de apuntes del usuario autenticado — zona principal de
 * StudyWeaver tras el pivote ADR-06.
 *
 * Estados:
 *   loading → spinner.
 *   error   → mensaje + reintentar.
 *   empty   → EmptyNotesState con CTA "Sube tus primeros apuntes".
 *   ok      → grid responsive de NoteCard.
 *
 * Acciones:
 *   - "Subir apunte": abre `UploadNoteDialog` (tabs PDF / Texto).
 *   - Click en NoteCard "Abrir" → navega a /apuntes/:id (preview).
 *   - Papelera en una tarjeta: abre DeleteNoteDialog y, al confirmar,
 *     borra y refresca la lista (optimismo local).
 *
 * Cumple RA2 0615 (Grid Layout) con grid-cols-1 sm:grid-cols-2 lg:grid-cols-3.
 */
export function NotesListPage() {
  const { notify } = useNotification();

  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ok'
  const [notes, setNotes] = useState([]);

  const [showUpload, setShowUpload] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Carga inicial / refresh ──────────────────────────────────────
  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await listNotes();
      if (!res.success) {
        setStatus('error');
        notify(res.message || 'No se pudieron cargar los apuntes.', 'error');
        return;
      }
      setNotes(Array.isArray(res.data) ? res.data : []);
      setStatus('ok');
    } catch {
      setStatus('error');
      notify('Error de red al cargar los apuntes.', 'error');
    }
  }, [notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Atajo de teclado: 'n' abre el diálogo de subida ──────────────
  // Ignoramos cuando el foco está en input/textarea/select o en un
  // contenteditable, para que escribir 'n' en cualquier campo NO
  // dispare el atajo. También lo desactivamos si ya hay un diálogo
  // abierto (subida o borrado).
  useEffect(() => {
    const isEditableTarget = (target) => {
      if (!target) return false;
      const tag = (target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      return Boolean(target.isContentEditable);
    };

    const handler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'n' && e.key !== 'N') return;
      if (isEditableTarget(e.target)) return;
      if (showUpload || pendingDelete) return;
      e.preventDefault();
      setShowUpload(true);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showUpload, pendingDelete]);

  // ── Subida (PDF o texto) ─────────────────────────────────────────
  const handleSubmitPdf = async ({ file, title }) => {
    setIsUploading(true);
    try {
      const res = await uploadPdfNote(file, title);
      if (!res.success) {
        notify(res.message || 'No se pudo subir el PDF.', 'error');
        return;
      }
      notify('Apunte subido.', 'success');
      setShowUpload(false);
      refresh();
    } catch {
      notify('Error de red al subir el PDF.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitText = async ({ title, body }) => {
    setIsUploading(true);
    try {
      const res = await uploadTextNote({ title, body });
      if (!res.success) {
        notify(res.message || 'No se pudo guardar el apunte.', 'error');
        return;
      }
      notify('Apunte guardado.', 'success');
      setShowUpload(false);
      refresh();
    } catch {
      notify('Error de red al guardar el apunte.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // ── Borrado ──────────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteNote(pendingDelete.id);
      if (!res.success) {
        notify(res.message || 'No se pudo eliminar el apunte.', 'error');
        return;
      }
      notify('Apunte eliminado.', 'success');
      // Optimismo local: lo quitamos de la lista sin recargar.
      setNotes((prev) => prev.filter((n) => n.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch {
      notify('Error de red al eliminar el apunte.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-ink">Mis apuntes</h1>
          <p className="text-ink-muted text-sm mt-1">
            Sube un PDF o pega el texto. La IA generará mapas y flashcards desde aquí.
          </p>
        </div>
        <Button
          onClick={() => setShowUpload(true)}
          size="lg"
          title="Atajo: pulsa N"
          aria-keyshortcuts="N"
        >
          <i className="fas fa-upload" aria-hidden="true" />
          Subir apunte
        </Button>
      </header>

      {status === 'loading' && (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      )}

      {status === 'error' && (
        <Card padded className="text-center">
          <i className="fas fa-cloud-bolt text-3xl text-coral-500" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">No pudimos cargar tus apuntes</p>
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

      {status === 'ok' && notes.length === 0 && (
        <Card padded>
          <EmptyNotesState onUpload={() => setShowUpload(true)} />
        </Card>
      )}

      {status === 'ok' && notes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} onDelete={setPendingDelete} />
          ))}
        </div>
      )}

      <UploadNoteDialog
        open={showUpload}
        isUploading={isUploading}
        onSubmitPdf={handleSubmitPdf}
        onSubmitText={handleSubmitText}
        onCancel={() => (isUploading ? null : setShowUpload(false))}
      />

      <DeleteNoteDialog
        open={pendingDelete !== null}
        noteTitle={pendingDelete?.title}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => (isDeleting ? null : setPendingDelete(null))}
      />
    </div>
  );
}
