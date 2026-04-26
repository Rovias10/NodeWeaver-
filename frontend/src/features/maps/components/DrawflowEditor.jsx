import { useEffect, useRef } from 'react';
import Drawflow from 'drawflow';
import 'drawflow/dist/drawflow.min.css';
import '../styles/drawflow-summer.css';

/**
 * Wrapper React de la librería Drawflow.
 *
 * Drawflow es DOM-imperativo: muta el contenedor #drawflow añadiendo
 * y quitando nodos sin pasar por React. Aquí lo aislamos en un único
 * <div> y exponemos sólo callbacks declarativos (`onChange`,
 * `onExpandRequest`).
 *
 * Decisiones técnicas (justificadas en docs/maps-plan.md §1.3 y §5.7):
 *
 *  · Guard StrictMode: el efecto montaría dos veces en dev y eso
 *    duplica los listeners + nodos. El check `editorRef.current` y
 *    el cleanup con clear() + replaceChildren() corta el problema.
 *
 *  · Custom node con HTML inline: la API addNode(name, ins, outs, x,
 *    y, class, data, html) exige un STRING de HTML; no acepta JSX.
 *    Construir HTML como template string aquí es la única vía.
 *    React NO controla este DOM (vive dentro del wrapper).
 *
 *  · Eventos del nodo (botones "+ IA" y "✕"): los enganchamos por
 *    delegación en el contenedor. El listener lee data-action del
 *    target, busca el nodo padre con closest('.drawflow-node') y
 *    extrae su id desde el atributo `id` (formato "node-N").
 *
 *  · Edición inline (label, hint): los <div contenteditable> guardan
 *    cambios al perder foco invocando updateNodeDataFromId() y
 *    notificando con onChange.
 *
 *  · Modo lectura (`readOnly`): la Fase Comunidad necesita pintar
 *    mapas ajenos sin permitir editarlos. Activar `readOnly`:
 *      1. Pone `editor.editor_mode = 'fixed'` (Drawflow desactiva
 *         drag/connect/delete por sí solo).
 *      2. Tras `import()`, post-procesa el DOM para quitar los
 *         `.sw-node__actions` (botones "+ IA" / "✕") y desactivar
 *         los `[contenteditable]` del label/hint que quedan
 *         serializados en el HTML del nodo. Drawflow no expone API
 *         para regenerar el HTML de un nodo importado, así que
 *         tocamos el DOM una sola vez tras la carga.
 *      3. No bindea los handlers click/blur/paste de edición ni
 *         los eventos de cambio — el padre no necesita `onChange`.
 *      4. Expone una API minimal en `editorApiRef` con sólo
 *         zoom y export (no addNode, no removeSelected).
 *
 * Props:
 *  - initialJson:     export() previo de Drawflow o null para canvas vacío.
 *  - onChange:        callback(exportedJson) tras cualquier mutación.
 *                     Sólo se invoca en modo edición.
 *  - onExpandRequest: callback(nodeId, nodeData) al pulsar "+ IA"
 *                     (sólo en modo edición).
 *  - editorApiRef:    ref que el padre usa para invocar acciones del
 *                     editor (addNode, zoom, etc.) desde el toolbar.
 *  - readOnly:        si true, monta el editor en modo visor.
 */
export function DrawflowEditor({
  initialJson,
  onChange,
  onExpandRequest,
  editorApiRef,
  readOnly = false,
}) {
  const containerRef = useRef(null);
  const editorRef    = useRef(null);

  useEffect(() => {
    // Guard StrictMode: si ya hay editor montado, no inicializar otro.
    if (editorRef.current || !containerRef.current) return;

    const editor = new Drawflow(containerRef.current);
    editor.reroute = true;
    editor.reroute_fix_curvature = true;
    editor.editor_mode = readOnly ? 'fixed' : 'edit';
    editor.start();

    // Restauramos el JSON si existe; si está vacío o null, dejamos
    // canvas en blanco y será el usuario quien añada el primer nodo.
    if (initialJson && Object.keys(initialJson?.drawflow ?? {}).length > 0) {
      try {
        editor.import(initialJson);
      } catch (err) {
        console.error('[DrawflowEditor] No se pudo importar el JSON inicial:', err);
      }
    }

    const container = containerRef.current;

    // En modo lectura, neutralizamos los affordances de edición que
    // Drawflow ha reconstruido a partir del HTML serializado en cada
    // nodo. Los botones de acción se eliminan; los contenteditable
    // pasan a "false" para bloquear también la edición por teclado.
    if (readOnly) {
      container.classList.add('drawflow-readonly');
      container.querySelectorAll('.drawflow-node').forEach((el) => {
        el.querySelectorAll('.sw-node__actions').forEach((a) => a.remove());
        el.querySelectorAll('[contenteditable]').forEach((c) => {
          c.setAttribute('contenteditable', 'false');
        });
      });
    }

    // Cleanup específico del modo edición: declarado fuera del bloque
    // para que el return del effect pueda invocarlo si existe.
    let cleanupEdit = null;

    if (!readOnly) {
      // ── Notificar cambios al padre ──
      const events = [
        'nodeCreated', 'nodeRemoved', 'nodeMoved',
        'connectionCreated', 'connectionRemoved',
        'nodeDataChanged',
      ];
      const notifyChange = () => onChange?.(editor.export());
      events.forEach((evt) => editor.on(evt, notifyChange));

      // ── Delegación de eventos para los botones del custom node ──
      const handleClick = (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        const nodeEl = e.target.closest('.drawflow-node');
        if (!nodeEl) return;
        const nodeId = parseInt(nodeEl.id.replace('node-', ''), 10);
        if (Number.isNaN(nodeId)) return;

        e.preventDefault();
        e.stopPropagation();

        if (action === 'delete') {
          editor.removeNodeId('node-' + nodeId);
        } else if (action === 'expand') {
          const data = editor.getNodeFromId(nodeId)?.data ?? {};
          onExpandRequest?.(nodeId, data);
        }
      };

      // ── Edición inline de label/hint (contenteditable) ──
      const handleBlur = (e) => {
        const target = e.target;
        if (!(target.dataset?.field)) return;
        const nodeEl = target.closest('.drawflow-node');
        if (!nodeEl) return;
        const nodeId = parseInt(nodeEl.id.replace('node-', ''), 10);
        if (Number.isNaN(nodeId)) return;

        const node = editor.getNodeFromId(nodeId);
        if (!node) return;

        const newValue = target.innerText.trim();
        if (node.data?.[target.dataset.field] === newValue) return;

        const newData = { ...node.data, [target.dataset.field]: newValue };
        editor.updateNodeDataFromId(nodeId, newData);
        notifyChange();
      };

      // ── Pegar texto plano en contenteditable (sin HTML enriquecido) ──
      const handlePaste = (e) => {
        if (!e.target.dataset?.field) return;
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      };

      container.addEventListener('click', handleClick);
      container.addEventListener('blur', handleBlur, true); // capture: blur no burbujea.
      container.addEventListener('paste', handlePaste);

      cleanupEdit = () => {
        container.removeEventListener('click', handleClick);
        container.removeEventListener('blur', handleBlur, true);
        container.removeEventListener('paste', handlePaste);
      };
    }

    editorRef.current = editor;

    // ── API expuesta al padre vía editorApiRef ──
    if (editorApiRef) {
      if (readOnly) {
        // Subset minimal para visor: zoom + export. Sin addNode ni
        // removeSelected — el visor no debe poder modificar el grafo.
        editorApiRef.current = {
          zoomIn:    () => editor.zoom_in(),
          zoomOut:   () => editor.zoom_out(),
          zoomReset: () => editor.zoom_reset(),
          export:    () => editor.export(),
        };
      } else {
        editorApiRef.current = {
          addConceptNode: (label = 'Nuevo concepto', hint = '') => {
            const { x, y } = getCanvasCenter(editor);
            const id = editor.addNode(
              'concept', 1, 1, x, y, 'concept-node',
              { label, hint },
              buildNodeHtml(label, hint),
            );
            return id;
          },
          addChildNodes: (parentId, children = []) => {
            // Coloca hijos en abanico alrededor del padre y los conecta.
            const parent = editor.getNodeFromId(parentId);
            if (!parent) return [];
            const N = children.length;
            const radius = 240;
            const ids = [];
            children.forEach((child, i) => {
              const angle = ((i + 1) / (N + 1)) * Math.PI - Math.PI / 2;
              const cx = parent.pos_x + radius + 200 * Math.cos(angle);
              const cy = parent.pos_y + 180 * Math.sin(angle);
              const id = editor.addNode(
                'concept', 1, 1, cx, cy, 'concept-node',
                { label: child.label ?? '', hint: child.hint ?? '' },
                buildNodeHtml(child.label ?? '', child.hint ?? ''),
              );
              editor.addConnection(parentId, id, 'output_1', 'input_1');
              ids.push(id);
            });
            return ids;
          },
          zoomIn:   () => editor.zoom_in(),
          zoomOut:  () => editor.zoom_out(),
          zoomReset:() => editor.zoom_reset(),
          export:   () => editor.export(),
          removeSelected: () => {
            const selected = container.querySelector('.drawflow-node.selected');
            if (selected) {
              const id = parseInt(selected.id.replace('node-', ''), 10);
              if (!Number.isNaN(id)) editor.removeNodeId('node-' + id);
            }
          },
        };
      }
    }

    // ── Cleanup robusto para StrictMode ──
    return () => {
      cleanupEdit?.();
      try { editor.clear(); } catch { /* noop */ }
      container.replaceChildren();
      container.classList.remove('drawflow-readonly');
      editorRef.current = null;
      if (editorApiRef) editorApiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Inicialización única; el padre fuerza remount con key={mapId}.

  return (
    <div
      ref={containerRef}
      id="drawflow"
      className="w-full h-full"
    />
  );
}

/* ──────────────────────────────────────────────────────────────────── */

/**
 * Devuelve coordenadas aproximadas del centro del viewport visible
 * del canvas (compensando el zoom y pan actuales).
 */
function getCanvasCenter(editor) {
  // Drawflow expone canvas_x/y (pan) y zoom; el center visible es
  // simplemente -pan + viewport/2 / zoom. Lo aproximamos con valores
  // razonables si no podemos leer el rect.
  const rect = editor.container.getBoundingClientRect?.();
  const w = rect?.width  ?? 800;
  const h = rect?.height ?? 600;
  const z = editor.zoom || 1;
  return {
    x: (-editor.canvas_x + w / 2) / z - 110,
    y: (-editor.canvas_y + h / 2) / z - 30,
  };
}

/**
 * Plantilla HTML del nodo "concept". String porque la API de Drawflow
 * lo exige así. Los atributos data-field/data-action los lee la
 * delegación de eventos del wrapper.
 */
function buildNodeHtml(label, hint) {
  // Escapado mínimo del texto de usuario (XSS): reemplazamos
  // caracteres peligrosos antes de inyectarlos como contenido inicial.
  // Después de la creación, contenteditable maneja sólo texto plano
  // (el handler de paste lo fuerza con execCommand insertText).
  const safe = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `
    <div class="sw-node">
      <div class="sw-node__label" contenteditable="true" data-field="label" spellcheck="false">${safe(label)}</div>
      <div class="sw-node__hint"  contenteditable="true" data-field="hint"  spellcheck="false">${safe(hint)}</div>
      <div class="sw-node__actions">
        <button type="button" data-action="expand" title="Expandir con IA">+ IA</button>
        <button type="button" data-action="delete" title="Eliminar nodo">✕</button>
      </div>
    </div>
  `;
}
