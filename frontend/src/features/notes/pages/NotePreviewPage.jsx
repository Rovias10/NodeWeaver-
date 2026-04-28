import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/ui/Button.jsx';
import { Card } from '@/ui/Card.jsx';
import { Spinner } from '@/ui/Spinner.jsx';
import { useNotification } from '@/ui/useNotification.js';
import {
  fromNoteToFlashcards,
  fromNoteToMap,
  getNote,
  getNoteFile,
} from '../services/notesService.js';

/**
 * Vista preview de un apunte concreto.
 *
 * - Apunte de tipo `text`: muestra el `extracted_text` íntegro en un
 *   bloque legible (`<pre>` con `whitespace-pre-wrap`).
 * - Apunte de tipo `pdf`: descarga el binario por el endpoint
 *   autenticado `notes/file?id=N` (JWT en cabecera), envuelve el
 *   resultado con `URL.createObjectURL` y lo muestra en un `<iframe>`.
 *   No usamos `<iframe src="?route=notes/file...">` directo porque
 *   el navegador haría un GET sin Authorization y el backend
 *   devolvería 401.
 *
 * Acciones IA («Generar mapa», «Generar flashcards») cableadas contra
 * `POST ai/from-note` (rama IA_Integration con Gemini API). Mientras
 * la IA trabaja se monta un overlay full-screen bloqueante: la
 * generación tarda 10-30 s y queremos evitar dobles clicks o
 * navegaciones accidentales del usuario.
 */
export function NotePreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification();

  // Estado de la generación IA. 'idle' = sin acción. 'map' / 'flashcards'
  // = petición en vuelo del target indicado. Se usa tanto para deshabilitar
  // los botones como para condicionar el overlay y su mensaje.
  const [aiBusy, setAiBusy] = useState('idle');

  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ok'
  const [note, setNote] = useState(null);

  // Object URL al PDF descargado como Blob. Mientras la descarga
  // está en curso, se mantiene en null y se muestra un spinner. Al
  // desmontar (o al cambiar de apunte) se revoca para no leakear
  // memoria del navegador.
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfStatus, setPdfStatus] = useState('idle'); // 'idle' | 'loading' | 'error' | 'ok'

  useEffect(() => {
    let active = true;
    setStatus('loading');
    getNote(id)
      .then((res) => {
        if (!active) return;
        if (!res.success) {
          setStatus('error');
          notify(res.message || 'No se pudo cargar el apunte.', 'error');
          return;
        }
        setNote(res.data);
        setStatus('ok');
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
        notify('Error de red al cargar el apunte.', 'error');
      });
    return () => {
      active = false;
    };
  }, [id, notify]);

  // Descarga del PDF como Blob cuando el apunte cargado es de tipo
  // 'pdf'. El URL se revoca al desmontar el componente o al cambiar
  // de apunte para no acumular blobs en memoria.
  useEffect(() => {
    if (status !== 'ok' || !note) return undefined;
    if (note.source_type !== 'pdf') return undefined;

    let active = true;
    let createdUrl = null;
    setPdfStatus('loading');
    setPdfUrl(null);

    getNoteFile(note.id)
      .then((res) => {
        if (!active) return;
        if (!res.success || !res.blob) {
          setPdfStatus('error');
          notify(res.message || 'No se pudo cargar el PDF.', 'error');
          return;
        }
        createdUrl = URL.createObjectURL(res.blob);
        setPdfUrl(createdUrl);
        setPdfStatus('ok');
      })
      .catch(() => {
        if (!active) return;
        setPdfStatus('error');
        notify('Error de red al cargar el PDF.', 'error');
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [status, note, notify]);

  /**
   * Lanza la generación IA contra el backend y, en éxito, navega o
   * notifica según el target. Compartimos el flujo entre los dos
   * targets porque el patrón es idéntico salvo por la respuesta
   * concreta y la acción post-éxito.
   *
   * Errores conocidos del backend (ver aiController::fromNote):
   *   400 → apunte sin contenido procesable.
   *   404 → apunte no encontrado (carrera improbable: alguien lo borró).
   *   410 → PDF físico desaparecido del storage.
   *   503 → IA no disponible (Gemini caído, sin cuota o sin API key).
   * En todos los casos `result.message` trae el texto canónico del
   * backend en castellano y lo mostramos tal cual al usuario.
   */
  const runAiGeneration = async (target) => {
    if (!note || aiBusy !== 'idle') return;
    setAiBusy(target);
    try {
      const result = target === 'map'
        ? await fromNoteToMap(note.id)
        : await fromNoteToFlashcards(note.id);

      if (!result.success) {
        notify(result.message || 'No se pudo completar la generación.', 'error');
        return;
      }

      if (target === 'map') {
        const newMapId = result.data?.map_id;
        const nodeCount = result.data?.node_count ?? 0;
        notify(`Mapa generado con ${nodeCount} conceptos.`, 'success');
        if (newMapId) navigate(`/mapas/${newMapId}`);
      } else {
        const created = result.data?.created ?? 0;
        notify(`Generadas ${created} flashcards. Disponibles en /flashcards.`, 'success');
      }
    } catch {
      // El wrapper apiPost lanza un Error genérico cuando la red cae
      // o el JSON no parsea (raro: el backend responde JSON siempre).
      notify('Error de red al contactar con la IA.', 'error');
    } finally {
      setAiBusy('idle');
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (status === 'error' || !note) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card padded className="text-center">
          <i className="fas fa-cloud-bolt text-3xl text-coral-500" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">No se encontró el apunte</p>
          <p className="text-sm text-ink-muted mt-1">
            Es posible que lo hayas borrado o que no tengas acceso.
          </p>
          <div className="mt-5">
            <Link to="/apuntes">
              <Button variant="ghost">
                <i className="fas fa-arrow-left" aria-hidden="true" />
                Volver a Mis apuntes
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const isPdf = note.source_type === 'pdf';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Cabecera */}
      <div className="mb-4">
        <Link
          to="/apuntes"
          className="text-sm text-ink-muted hover:text-ink inline-flex items-center gap-1.5"
        >
          <i className="fas fa-arrow-left" aria-hidden="true" />
          Volver a Mis apuntes
        </Link>
      </div>

      <header className="mb-6">
        <span
          className={
            'text-xs font-semibold px-2.5 py-1 rounded-full border inline-flex items-center ' +
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
        <h1 className="text-2xl md:text-3xl font-bold text-ink mt-3">
          {note.title || 'Apunte sin título'}
        </h1>
        {note.original_filename && (
          <p className="text-sm text-ink-faint mt-1">
            <i className="fas fa-paperclip mr-1.5" aria-hidden="true" />
            {note.original_filename}
          </p>
        )}
      </header>

      {/* Acciones IA — cableadas contra POST ai/from-note (Gemini). */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Button
          variant="primary"
          onClick={() => runAiGeneration('map')}
          disabled={aiBusy !== 'idle'}
          isLoading={aiBusy === 'map'}
          title="Generar un mapa conceptual con IA a partir de este apunte"
        >
          <i className="fas fa-diagram-project" aria-hidden="true" />
          Generar mapa conceptual
        </Button>
        <Button
          variant="ghost"
          onClick={() => runAiGeneration('flashcards')}
          disabled={aiBusy !== 'idle'}
          isLoading={aiBusy === 'flashcards'}
          title="Generar flashcards SM-2 con IA a partir de este apunte"
        >
          <i className="fas fa-clone" aria-hidden="true" />
          Generar flashcards
        </Button>

        {/* Descargar PDF — sólo cuando el blob está listo. Reutilizamos
            el object URL ya creado para el iframe; el atributo
            `download` fuerza una guardar-como con el filename original. */}
        {isPdf && pdfStatus === 'ok' && pdfUrl && (
          <a
            href={pdfUrl}
            download={note.original_filename || 'apunte.pdf'}
            className="
              inline-flex items-center justify-center gap-2 rounded-xl font-semibold
              transition-all duration-200 transform-gpu hover:-translate-y-0.5 active:translate-y-0
              focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-paper focus-visible:ring-brand-400
              text-ink bg-glass border border-line backdrop-blur-md hover:bg-white/80
              px-5 py-2.5 text-sm sm:ml-auto
            "
            title="Descargar el PDF original"
          >
            <i className="fas fa-download" aria-hidden="true" />
            Descargar PDF
          </a>
        )}
      </div>

      {/* Contenido */}
      {!isPdf && (
        <Card padded>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-ink leading-relaxed">
            {note.extracted_text || ''}
          </pre>
        </Card>
      )}

      {isPdf && (
        <Card padded={false} className="overflow-hidden">
          {pdfStatus === 'loading' && (
            <div className="flex flex-col items-center justify-center py-20">
              <Spinner />
              <p className="text-sm text-ink-muted mt-4">Cargando el PDF…</p>
            </div>
          )}

          {pdfStatus === 'error' && (
            <div className="text-center p-8">
              <i className="fas fa-cloud-bolt text-3xl text-coral-500" aria-hidden="true" />
              <p className="mt-3 font-semibold text-ink">No se pudo mostrar el PDF</p>
              <p className="text-sm text-ink-muted mt-1">
                Inténtalo de nuevo o vuelve al listado.
              </p>
              <div className="mt-5">
                <Link to="/apuntes">
                  <Button variant="ghost">
                    <i className="fas fa-arrow-left" aria-hidden="true" />
                    Volver a Mis apuntes
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {pdfStatus === 'ok' && pdfUrl && (
            <iframe
              src={pdfUrl}
              title={note.title || 'Vista previa del apunte'}
              className="block w-full h-[75vh] bg-white"
            />
          )}
        </Card>
      )}

      {/* Overlay full-screen mientras la IA genera. Bloquea cualquier
          interacción (clicks, foco, scroll) durante la espera larga
          de Gemini (10-30 s). aria-live=assertive para que los lectores
          de pantalla anuncien el inicio del proceso. */}
      {aiBusy !== 'idle' && (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-busy="true"
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center"
        >
          <div className="bg-glass backdrop-blur-2xl border border-line rounded-2xl shadow-card px-8 py-7 max-w-sm w-[calc(100%-2rem)] text-center">
            <div className="flex justify-center mb-4">
              <Spinner size={36} />
            </div>
            <p className="font-semibold text-ink">
              {aiBusy === 'map'
                ? 'Generando mapa conceptual…'
                : 'Generando flashcards…'}
            </p>
            <p className="text-sm text-ink-muted mt-2">
              La IA está leyendo tu apunte. Esto puede tardar entre
              10 y 30 segundos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
