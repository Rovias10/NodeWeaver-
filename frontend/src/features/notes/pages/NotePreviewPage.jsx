import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/ui/Button.jsx';
import { Card } from '@/ui/Card.jsx';
import { Spinner } from '@/ui/Spinner.jsx';
import { useNotification } from '@/ui/useNotification.js';
import { getNote } from '../services/notesService.js';

/**
 * Vista preview de un apunte concreto — placeholder MVP de N2.
 *
 * Esta versión es funcional para apuntes de tipo `text`: muestra el
 * `extracted_text` íntegro en un bloque legible. Para apuntes de tipo
 * `pdf` muestra metadatos y un aviso explicando que el visor del PDF
 * llegará en N3 junto con un endpoint autenticado para servir el
 * binario (`notes/file?id=N`).
 *
 * Los botones de acción IA («Generar mapa», «Generar flashcards») se
 * incluyen ya como `disabled` con un tooltip "Próximamente". El cableado
 * real se hace en la rama futura `ia-integration` con Gemini.
 */
export function NotePreviewPage() {
  const { id } = useParams();
  const { notify } = useNotification();

  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ok'
  const [note, setNote] = useState(null);

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

      {/* Acciones IA — disabled hasta la rama `ia-integration`. */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Button variant="primary" disabled title="Próximamente: integración con Gemini">
          <i className="fas fa-diagram-project" aria-hidden="true" />
          Generar mapa conceptual
        </Button>
        <Button variant="ghost" disabled title="Próximamente: integración con Gemini">
          <i className="fas fa-clone" aria-hidden="true" />
          Generar flashcards
        </Button>
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
        <Card padded className="text-center">
          <i className="fas fa-file-pdf text-4xl text-coral-500 mb-3" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-ink">Vista previa del PDF</h3>
          <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto">
            El visor embebido del PDF llegará en la siguiente subfase. Por
            ahora el archivo está guardado de forma segura en el servidor y
            podrá usarse para generar mapas y flashcards cuando se conecte
            la IA (Gemini).
          </p>
        </Card>
      )}
    </div>
  );
}
