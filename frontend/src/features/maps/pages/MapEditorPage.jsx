import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Spinner } from '@/ui/Spinner.jsx';
import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';
import { useNotification } from '@/ui/useNotification.js';
import { getMap } from '../services/mapsService.js';
import { expandNode } from '../services/aiService.js';
import { useMapAutoSave } from '../hooks/useMapAutoSave.js';
import { DrawflowEditor } from '../components/DrawflowEditor.jsx';
import { EditorToolbar } from '../components/EditorToolbar.jsx';
import { MapTitleEditor } from '../components/MapTitleEditor.jsx';
import { SaveIndicator } from '../components/SaveIndicator.jsx';

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
      {/* Cabecera: título + indicador de guardado */}
      <header className="flex items-start justify-between gap-4">
        <MapTitleEditor value={title} onChange={handleTitleChange} />
        <div className="pt-2 shrink-0">
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
        isSaving={auto.status === 'saving'}
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
            evitar que el usuario dispare un segundo expand encima. */}
        {expandingNodeId !== null && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-paper/60 backdrop-blur-sm"
            aria-live="polite"
          >
            <div className="flex items-center gap-3 bg-glass border border-line rounded-2xl px-6 py-4 shadow-card">
              <span
                aria-hidden="true"
                className="inline-block w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"
              />
              <span className="text-sm font-semibold text-ink">Generando sub-conceptos…</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
