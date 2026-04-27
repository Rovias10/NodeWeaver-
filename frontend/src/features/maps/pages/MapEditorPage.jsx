import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Spinner } from '@/ui/Spinner.jsx';
import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';
import { useNotification } from '@/ui/useNotification.js';
import { getMap, saveMap } from '../services/mapsService.js';
import { expandNode } from '../services/aiService.js';
import { generateFromMap as generateFlashcardsFromMap } from '@/features/flashcards/services/flashcardsService.js';
import { useMapAutoSave } from '../hooks/useMapAutoSave.js';
import { useEditorKeybindings } from '../hooks/useEditorKeybindings.js';
import { DrawflowEditor } from '../components/DrawflowEditor.jsx';
import { EditorToolbar } from '../components/EditorToolbar.jsx';
import { MapTitleEditor } from '../components/MapTitleEditor.jsx';
import { MapMetadataDialog } from '../components/MapMetadataDialog.jsx';
import { SaveIndicator } from '../components/SaveIndicator.jsx';
import { ShareToggle } from '@/features/community/components/ShareToggle.jsx';

/**
 * Cuenta los nodos visibles en un export de Drawflow. Sirve para
 * cortocircuitar la generación de flashcards en frontend cuando el
 * mapa está vacío y evitar gastar la llamada a la IA.
 */
function countNodesInDrawflow(drawflowJson) {
  if (!drawflowJson || typeof drawflowJson !== 'object') return 0;
  const data = drawflowJson?.drawflow?.Home?.data;
  if (!data || typeof data !== 'object') return 0;
  return Object.keys(data).length;
}

/**
 * Página del editor de un mapa concreto. Carga el mapa por :id, lo
 * monta en DrawflowEditor y orquesta auto-save + título + toolbar.
 *
 * Estados:
 *   loading → spinner mientras se carga maps/get.
 *   error   → mensaje + botón "Volver al listado".
 *   ok      → editor montado.
 *
 * Layout: el canvas ocupa toda la altura disponible (cabecera +
 * toolbar fijos arriba, drawflow flex-1 abajo). Sin overflow propio:
 * Drawflow gestiona pan/zoom internamente.
 *
 * La ruta `/mapas/:id` se registra en router.jsx anidada bajo
 * AppLayout (requiere sesión).
 */
export function MapEditorPage() {
  const { id: rawId } = useParams();
  const mapId = Number(rawId);
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ok'
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [initialJson, setInitialJson] = useState(null);

  const editorApiRef = useRef(null);
  const lastJsonRef  = useRef(null);

  const auto = useMapAutoSave(mapId);
  const [expandingNodeId, setExpandingNodeId] = useState(null);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [isSharingPending, setIsSharingPending] = useState(false);
  const [showMetadataDialog, setShowMetadataDialog] = useState(false);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);

  // ── Carga inicial ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const res = await getMap(mapId);
        if (cancelled) return;
        if (!res.success || !res.data) {
          setStatus('error');
          notify(res.message || 'Mapa no encontrado.', 'error');
          return;
        }
        const m = res.data;
        setTitle(m.title ?? '');
        setDescription(m.description ?? '');
        setIsPublic(Boolean(m.is_public));
        // El backend devuelve drawflow_json como STRING (LONGTEXT). Si
        // viene null, lo dejamos null para que el wrapper abra canvas
        // vacío. Si viene string, lo parseamos a objeto.
        if (m.drawflow_json) {
          try {
            setInitialJson(typeof m.drawflow_json === 'string'
              ? JSON.parse(m.drawflow_json)
              : m.drawflow_json);
          } catch {
            notify('No se pudo leer el contenido del mapa.', 'error');
            setInitialJson(null);
          }
        } else {
          setInitialJson(null);
        }
        setStatus('ok');
      } catch {
        if (!cancelled) {
          setStatus('error');
          notify('Error de red al cargar el mapa.', 'error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [mapId, notify]);

  // ── Disparar auto-save cuando cambia algo persistible ────────────
  const triggerSave = useCallback((overrides = {}) => {
    if (status !== 'ok') return;
    auto.requestSave({
      title:        overrides.title        ?? title,
      description:  overrides.description  ?? description,
      is_public:    overrides.is_public    ?? isPublic,
      drawflow_json: overrides.drawflow_json ?? lastJsonRef.current,
    });
  }, [auto, status, title, description, isPublic]);

  // Cambios desde el editor: guardamos snapshot y notificamos.
  const handleEditorChange = useCallback((exported) => {
    lastJsonRef.current = exported;
    triggerSave({ drawflow_json: exported });
  }, [triggerSave]);

  // Cambios de título.
  const handleTitleChange = useCallback((next) => {
    setTitle(next);
    triggerSave({ title: next });
  }, [triggerSave]);

  // Toolbar handlers.
  const handleAddConcept = () => editorApiRef.current?.addConceptNode('Nuevo concepto');
  const handleZoomIn     = () => editorApiRef.current?.zoomIn();
  const handleZoomOut    = () => editorApiRef.current?.zoomOut();
  const handleZoomReset  = () => editorApiRef.current?.zoomReset();
  const handleSaveNow    = () => auto.flushSave();
  const handleBack       = () => navigate('/mapas');
  const handleDeleteSel  = () => editorApiRef.current?.removeSelected();

  // Atajos: Ctrl+S guarda, Delete/Backspace borra seleccionado. Sólo
  // activos cuando el editor está montado (status === 'ok') y nunca
  // mientras la IA está trabajando (overlay bloquea interacción).
  useEditorKeybindings({
    enabled:     status === 'ok' && expandingNodeId === null && !isGeneratingFlashcards,
    onSaveNow:   handleSaveNow,
    onDeleteSel: handleDeleteSel,
  });

  // Handler del botón "Flashcards" del toolbar: genera un lote de
  // tarjetas a partir de los nodos del mapa actual.
  // - Validación frontend: si el mapa está vacío, mostramos un toast
  //   info y NO llamamos a la IA (ahorra una petición y un 400 del
  //   backend que sería redundante).
  // - Mientras está generando, el botón muestra spinner, los atajos
  //   se desactivan y se pinta un overlay (igual que con expand).
  // - El backend devuelve 503 si Ollama está caído; lo traducimos a
  //   un toast claro al usuario sin destapar el detalle.
  const handleGenerateFlashcards = useCallback(async () => {
    if (isGeneratingFlashcards) return;
    if (expandingNodeId !== null) return; // no solapamos dos operaciones IA

    const currentJson = lastJsonRef.current ?? initialJson;
    const nodeCount   = countNodesInDrawflow(currentJson);
    if (nodeCount === 0) {
      notify('Añade conceptos al mapa antes de generar flashcards.', 'info');
      return;
    }

    setIsGeneratingFlashcards(true);
    try {
      const res = await generateFlashcardsFromMap(mapId);
      if (!res.success) {
        notify(res.message || 'No se pudieron generar las flashcards.', 'error');
        return;
      }
      const created = Number(res.data?.created ?? 0);
      notify(
        `Generadas ${created} flashcard${created === 1 ? '' : 's'}. Las encontrarás en la sección Flashcards del menú.`,
        'success',
      );
    } catch {
      notify('La IA no está disponible ahora.', 'error');
    } finally {
      setIsGeneratingFlashcards(false);
    }
  }, [isGeneratingFlashcards, expandingNodeId, initialJson, mapId, notify]);

  // Handler del switch "Público/Privado" del toolbar de cabecera.
  //
  // Política:
  //  - Al pasar de privado → público pedimos confirmación (el cambio
  //    es visible al instante en el feed comunidad y abre el mapa
  //    a likes/comments). Al pasar de público → privado guardamos
  //    sin preguntar — el usuario sabe lo que hace.
  //  - Cancelamos el auto-save pendiente para evitar carrera con un
  //    payload viejo que pisaría el cambio recién confirmado.
  //  - Persistimos con saveMap directo en lugar de pasar por el
  //    auto-save debounced: queremos respuesta síncrona para el
  //    spinner del switch y el toast.
  const handleSharingChange = useCallback(async (next) => {
    if (next === isPublic) return;
    if (next === true) {
      const ok = window.confirm(
        '¿Hacer público este mapa? Cualquier usuario podrá verlo, darle like y comentar.'
      );
      if (!ok) return;
    }
    setIsSharingPending(true);
    auto.cancelSave();
    try {
      const res = await saveMap({
        id: mapId,
        title,
        description,
        is_public: next,
        drawflow_json: lastJsonRef.current ?? initialJson,
      });
      if (!res.success) {
        notify(res.message || 'No se pudo cambiar la visibilidad.', 'error');
        return;
      }
      setIsPublic(next);
      notify(
        next ? 'Mapa publicado en la comunidad.' : 'Mapa marcado como privado.',
        'success',
      );
    } catch {
      notify('Error de red al cambiar la visibilidad.', 'error');
    } finally {
      setIsSharingPending(false);
    }
  }, [isPublic, mapId, title, description, initialJson, notify, auto]);

  // Handler del dialog "Editar metadatos": persiste título + descripción
  // a la vez. Mismo patrón que handleSharingChange (saveMap directo en
  // lugar de pasar por el auto-save debounced) para que el spinner del
  // botón refleje el estado real de la petición y para evitar carrera
  // con un payload viejo del auto-save.
  //
  // Si el guardado va bien, sincronizamos el estado local con los nuevos
  // valores y cerramos el dialog. Si falla, dejamos el dialog abierto
  // para que el usuario pueda corregir o reintentar.
  const handleSaveMetadata = useCallback(async ({ title: newTitle, description: newDescription }) => {
    setIsSavingMetadata(true);
    auto.cancelSave();
    try {
      const res = await saveMap({
        id: mapId,
        title: newTitle,
        description: newDescription,
        is_public: isPublic,
        drawflow_json: lastJsonRef.current ?? initialJson,
      });
      if (!res.success) {
        notify(res.message || 'No se pudieron guardar los metadatos.', 'error');
        return;
      }
      setTitle(newTitle);
      setDescription(newDescription);
      setShowMetadataDialog(false);
      notify('Metadatos actualizados.', 'success');
    } catch {
      notify('Error de red al guardar los metadatos.', 'error');
    } finally {
      setIsSavingMetadata(false);
    }
  }, [mapId, isPublic, initialJson, notify, auto]);

  // Handler de "+ IA": llama a /api/ai/expand con el label del nodo
  // y, si hay hijos, los pinta con addChildNodes (que también los
  // conecta al padre). El auto-save se dispara solo gracias a los
  // eventos nodeCreated/connectionCreated del editor.
  const handleExpandRequest = useCallback(async (nodeId, nodeData) => {
    if (expandingNodeId !== null) return; // un expand a la vez
    const label = (nodeData?.label ?? '').trim();
    if (label === '') {
      notify('Escribe primero el nombre del concepto antes de expandir.', 'info');
      return;
    }
    setExpandingNodeId(nodeId);
    try {
      const res = await expandNode(label, nodeData?.hint ?? '');
      if (!res.success) {
        notify(res.message || 'La IA no está disponible ahora.', 'error');
        return;
      }
      const children = res.data?.children ?? [];
      if (children.length === 0) {
        notify('La IA no devolvió sub-conceptos.', 'info');
        return;
      }
      editorApiRef.current?.addChildNodes(nodeId, children);
      notify(`Añadidos ${children.length} sub-conceptos.`, 'success');
    } catch {
      notify('La IA no está disponible ahora.', 'error');
    } finally {
      setExpandingNodeId(null);
    }
  }, [expandingNodeId, notify]);

  // ── Render ───────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="max-w-md mx-auto">
        <Card padded className="text-center">
          <i className="fas fa-cloud-bolt text-3xl text-coral-500" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">No pudimos cargar este mapa</p>
          <p className="text-sm text-ink-muted mt-1">
            Puede que se haya eliminado o que no tengas permiso para verlo.
          </p>
          <div className="mt-5">
            <Button variant="ghost" onClick={handleBack}>
              <i className="fas fa-arrow-left" aria-hidden="true" />
              Volver al listado
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100dvh-160px)] min-h-[520px]">
      {/* Cabecera: título (editable inline) + botón "Editar metadatos"
          (dialog con título + descripción) + visibilidad + indicador
          de guardado.

          El botón "Editar metadatos" se agrupa visualmente con el
          título porque ambos controlan los datos del mapa. La
          visibilidad queda separada (gestionada por ShareToggle) para
          mantener un único punto de edición por dato. */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0 flex items-start gap-2">
          <MapTitleEditor value={title} onChange={handleTitleChange} />
          <button
            type="button"
            onClick={() => setShowMetadataDialog(true)}
            disabled={status !== 'ok'}
            className="shrink-0 mt-1 sm:mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-line text-sm text-ink-muted hover:text-ink hover:bg-paper/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Editar título y descripción"
            aria-label="Editar metadatos del mapa"
          >
            <i className="fas fa-pen" aria-hidden="true" />
            <span className="hidden md:inline">Editar metadatos</span>
          </button>
        </div>
        <div className="flex items-center gap-4 shrink-0 pt-1 sm:pt-2 flex-wrap">
          <ShareToggle
            isPublic={isPublic}
            onChange={handleSharingChange}
            isPending={isSharingPending}
            disabled={status !== 'ok'}
          />
          <SaveIndicator
            status={auto.status}
            lastSavedAt={auto.lastSavedAt}
            lastError={auto.lastError}
          />
        </div>
      </header>

      {/* Toolbar */}
      <EditorToolbar
        onAddConcept={handleAddConcept}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onSaveNow={handleSaveNow}
        onBack={handleBack}
        onGenerateFlashcards={handleGenerateFlashcards}
        isSaving={auto.status === 'saving'}
        isGeneratingFlashcards={isGeneratingFlashcards}
      />

      {/* Canvas Drawflow */}
      <Card padded={false} className="flex-1 min-h-0 overflow-hidden relative">
        {/* key={mapId} fuerza remount si el usuario navega de un mapa
            a otro sin desmontar la página (no ocurre con la ruta
            actual, pero es defensivo). */}
        <DrawflowEditor
          key={mapId}
          initialJson={initialJson}
          onChange={handleEditorChange}
          onExpandRequest={handleExpandRequest}
          editorApiRef={editorApiRef}
        />

        {/* Overlay mientras la IA piensa. Bloquea interacciones para
            evitar que el usuario dispare otra operación IA encima.
            Sirve para "expand" (sub-conceptos) y "generar flashcards"
            con copy distinto según la operación activa. */}
        {(expandingNodeId !== null || isGeneratingFlashcards) && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-paper/60 backdrop-blur-sm"
            aria-live="polite"
          >
            <div className="flex items-center gap-3 bg-glass border border-line rounded-2xl px-6 py-4 shadow-card">
              <span
                aria-hidden="true"
                className="inline-block w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"
              />
              <span className="text-sm font-semibold text-ink">
                {isGeneratingFlashcards ? 'Generando flashcards…' : 'Generando sub-conceptos…'}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Dialog de edición de metadatos. Renderizado fuera del Card del
          canvas para que el backdrop cubra toda la pantalla y no quede
          atrapado en el contenedor con overflow hidden. */}
      <MapMetadataDialog
        open={showMetadataDialog}
        title={title}
        description={description}
        isSaving={isSavingMetadata}
        onSubmit={handleSaveMetadata}
        onCancel={() => {
          if (isSavingMetadata) return;
          setShowMetadataDialog(false);
        }}
      />
    </div>
  );
}
