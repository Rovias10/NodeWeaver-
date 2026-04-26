<?php
/**
 * AIController — endpoints de IA de StudyWeaver.
 *
 * Endpoints:
 *   POST ai/expand       → expande un concepto en 3-5 sub-conceptos
 *                          (usado desde el editor de mapas, Maps M4).
 *   POST ai/from-note    → genera un mapa o un set de flashcards a
 *                          partir de un apunte (rama IA_Integration).
 *
 * El cliente HTTP a Gemini vive en API/services/GeminiClient.php; la
 * fachada de producto (prompts y saneo) en API/services/AIClient.php.
 * Este controller sólo valida input, llama al servicio, persiste el
 * resultado y formatea la respuesta JSON.
 *
 * Convenciones (CLAUDE.md §9 + Gemini.md §4):
 *   - Auth con AuthMiddleware::verifyToken() en cada método.
 *   - Respuesta uniforme { success, message?, data? }.
 *   - Códigos HTTP coherentes: 200, 201, 400, 401, 403, 404, 410, 503.
 *   - Sin secrets: la API key vive en .env y la lee EnvLoader desde
 *     GeminiClient. El cliente nunca ve esos datos.
 */

require_once __DIR__ . '/../middleware/verify-token.php';
require_once __DIR__ . '/../services/AIClient.php';
require_once __DIR__ . '/../../MODEL/Note.php';
require_once __DIR__ . '/../../MODEL/Map.php';
require_once __DIR__ . '/../../MODEL/Flashcard.php';

class AIController {
    private $db;
    private $noteModel;
    private $mapModel;
    private $flashcardModel;

    public function __construct($db) {
        $this->db             = $db;
        $this->noteModel      = new Note($db);
        $this->mapModel       = new Map($db);
        $this->flashcardModel = new Flashcard($db);
    }

    /**
     * POST ai/expand
     * Body:
     *   {
     *     "node_label":     "Algoritmos de ordenación",
     *     "parent_context": "Estructuras de datos"   // opcional
     *   }
     * Respuesta éxito:
     *   200 { success: true, data: { children: [{label, hint}, ...] } }
     * Errores:
     *   400 validación
     *   401 sin auth (delegado al middleware)
     *   503 IA configurada pero no responde / responde mal
     */
    public function expand($data = []) {
        AuthMiddleware::verifyToken();

        $label   = isset($data['node_label']) ? trim((string) $data['node_label']) : '';
        $context = isset($data['parent_context']) ? trim((string) $data['parent_context']) : null;

        if ($label === '') {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'El concepto a expandir es obligatorio.',
            ]);
            return;
        }
        if (mb_strlen($label) > 200) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'El concepto no puede superar 200 caracteres.',
            ]);
            return;
        }
        if ($context !== null && mb_strlen($context) > 500) {
            // Recortamos en lugar de rechazar: el contexto es opcional y
            // mejor truncado que perder la petición.
            $context = mb_substr($context, 0, 500);
        }
        if ($context === '') $context = null;

        try {
            $children = AIClient::expand($label, $context);
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'data'    => ['children' => $children],
            ], JSON_UNESCAPED_UNICODE);
        } catch (RuntimeException $e) {
            // El detalle real ya quedó en error_log (AIClient/GeminiClient).
            // Al cliente le devolvemos el mensaje canónico acordado.
            http_response_code(503);
            echo json_encode([
                'success' => false,
                'message' => 'La IA no está disponible ahora.',
            ]);
        } catch (Throwable $e) {
            error_log('[AIController::expand] Excepción inesperada: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error interno al expandir el concepto.',
            ]);
        }
    }

    /**
     * POST ai/from-note
     * Body:
     *   {
     *     "note_id": 42,
     *     "target":  "map" | "flashcards"
     *   }
     *
     * Flujo:
     *   1. Verificar ownership del apunte (Note::findByIdForUser).
     *   2. Determinar fuente para Gemini:
     *        - source_type='pdf'  → ruta absoluta del archivo a inline_data.
     *        - source_type='text' → extracted_text inline en el prompt.
     *   3. Llamar al método correspondiente de AIClient.
     *   4. Persistir:
     *        - target='map'        → maps con source_note_id=note_id,
     *                                drawflow_json con grid 4 cols.
     *        - target='flashcards' → flashcards.createBatch con
     *                                note_id=note_id, mapId=NULL.
     *   5. Devolver { map_id, title, node_count } o { created: N }.
     *
     * Errores:
     *   400  validación o apunte sin contenido procesable.
     *   401  sin auth (middleware).
     *   403  super-user 999 (no puede crear mapas/flashcards).
     *   404  apunte no encontrado.
     *   410  apunte 'pdf' con archivo físico desaparecido.
     *   503  IA caída (RuntimeException).
     *   500  PDO o Throwable inesperado.
     */
    public function fromNote($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        // Super User virtual (id=999): no tiene fila real en `users`,
        // así que un INSERT con user_id=999 violaría la FK. Cortocircuito
        // antes de gastar una llamada IA.
        if ($userId == 999) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'El usuario administrador no puede generar mapas ni flashcards.',
            ]);
            return;
        }

        // ─── Validación de input ───────────────────────────────────────
        $noteId = isset($data['note_id']) ? (int) $data['note_id'] : 0;
        $target = isset($data['target']) ? trim((string) $data['target']) : '';

        if ($noteId <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'note_id no válido.',
            ]);
            return;
        }
        if ($target !== 'map' && $target !== 'flashcards') {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => "El parámetro 'target' debe ser 'map' o 'flashcards'.",
            ]);
            return;
        }

        try {
            // ─── Recuperar el apunte y verificar ownership ─────────────
            $note = $this->noteModel->findByIdForUser($noteId, $userId);
            if (!$note) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Apunte no encontrado.',
                ]);
                return;
            }

            // ─── Resolver fuente para la IA ────────────────────────────
            $title         = (string) ($note['title'] ?? 'Apunte sin título');
            $sourceType    = (string) ($note['source_type'] ?? 'text');
            $extractedText = $note['extracted_text'] ?? null;
            $pdfPath       = null;

            if ($sourceType === 'pdf') {
                $relative = (string) ($note['file_path'] ?? '');
                $absolute = $this->resolveNotePdfPath($relative, $userId);
                if ($absolute === null || !is_file($absolute)) {
                    error_log('[AIController::fromNote] PDF físico no encontrado para note_id=' . $noteId);
                    http_response_code(410);
                    echo json_encode([
                        'success' => false,
                        'message' => 'El archivo del apunte ya no está disponible.',
                    ]);
                    return;
                }
                $pdfPath = $absolute;
            } else {
                // 'text' (o 'markdown' reservado): exigimos contenido
                // procesable. Sin esto, AIClient lanzaría RuntimeException
                // con mensaje "apunte vacío" → preferimos detectarlo aquí
                // como 400 (input del usuario) en lugar de 503 (IA caída).
                if (!is_string($extractedText) || trim($extractedText) === '') {
                    http_response_code(400);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Este apunte no tiene contenido para procesar.',
                    ]);
                    return;
                }
            }

            // ─── Despachar según target ────────────────────────────────
            if ($target === 'map') {
                $this->fromNoteToMap($userId, $noteId, $title, $extractedText, $pdfPath);
            } else {
                $this->fromNoteToFlashcards($userId, $noteId, $title, $extractedText, $pdfPath);
            }
        } catch (RuntimeException $e) {
            // AIClient/GeminiClient lanzan RuntimeException en cualquier
            // fallo de IA. El detalle real ya está en error_log.
            http_response_code(503);
            echo json_encode([
                'success' => false,
                'message' => 'La IA no está disponible ahora.',
            ]);
        } catch (PDOException $e) {
            error_log('[AIController::fromNote] PDO: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al guardar el resultado generado.',
            ]);
        } catch (Throwable $e) {
            error_log('[AIController::fromNote] inesperado: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error interno al procesar el apunte.',
            ]);
        }
    }

    // ──────────────────────────────────────────────────────────────────
    // Helpers privados de fromNote
    // ──────────────────────────────────────────────────────────────────

    /**
     * Genera un mapa conceptual desde el apunte y lo persiste.
     */
    private function fromNoteToMap($userId, $noteId, $title, $extractedText, $pdfPath) {
        $map = AIClient::parseNoteToMap($title, $extractedText, $pdfPath);

        // El mapa que devuelve AIClient ya viene con title/nodes/edges
        // saneados (ver sanitizeMapResponse). Falta posicionar los
        // nodos y serializar al shape que entiende Drawflow.
        $drawflowJson = $this->buildDrawflowJsonFromMap($map);

        $newId = $this->mapModel->create(
            $userId,
            $map['title'],
            null,            // description
            0,               // is_public — privado por defecto
            $drawflowJson,
            $noteId          // source_note_id (FK al apunte origen)
        );
        if (!$newId) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al guardar el mapa generado.',
            ]);
            return;
        }

        http_response_code(201);
        echo json_encode([
            'success' => true,
            'message' => 'Mapa generado.',
            'data'    => [
                'map_id'     => (int) $newId,
                'title'      => $map['title'],
                'node_count' => count($map['nodes']),
            ],
        ], JSON_UNESCAPED_UNICODE);
    }

    /**
     * Genera flashcards desde el apunte y las persiste en lote.
     */
    private function fromNoteToFlashcards($userId, $noteId, $title, $extractedText, $pdfPath) {
        $cards = AIClient::parseNoteToFlashcards($title, $extractedText, $pdfPath);
        if (empty($cards)) {
            // AIClient ya lanzaría RuntimeException antes, pero por
            // defensa: si llegáramos aquí con array vacío, 503.
            http_response_code(503);
            echo json_encode([
                'success' => false,
                'message' => 'La IA no devolvió flashcards.',
            ]);
            return;
        }

        // mapId = null: las flashcards generadas desde un apunte no
        // están vinculadas a un mapa concreto. La FK que importa aquí
        // es note_id (vínculo al apunte origen).
        $created = $this->flashcardModel->createBatch($userId, null, $cards, $noteId);
        if ($created === 0) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'No se pudo guardar ninguna flashcard.',
            ]);
            return;
        }

        http_response_code(201);
        echo json_encode([
            'success' => true,
            'message' => "Generadas {$created} flashcards.",
            'data'    => ['created' => $created],
        ], JSON_UNESCAPED_UNICODE);
    }

    /**
     * Resuelve la ruta absoluta del PDF de un apunte y verifica que
     * cae dentro de `backend/uploads/notes/<user_id>/`. Defensa en
     * profundidad contra path traversal: aunque el `file_path` lo
     * genera el backend en `noteController::uploadPdf`, validamos al
     * leerlo para no asumir confianza ciega.
     *
     * Devuelve null si la ruta intenta salir del subárbol del usuario
     * o si el formato del relativo no es el esperado.
     *
     * @param string $relative  `notes/<user_id>/<uuid>.pdf`.
     * @param int    $userId    Usuario propietario (para acotar el subárbol).
     * @return string|null      Ruta absoluta o null si inválida.
     */
    private function resolveNotePdfPath($relative, $userId) {
        if (!is_string($relative) || $relative === '') return null;

        $clean = str_replace('\\', '/', $relative);
        if (strpos($clean, '..') !== false) return null;

        $expectedPrefix = "notes/{$userId}/";
        if (strpos($clean, $expectedPrefix) !== 0) return null;

        $uploadsRoot = __DIR__ . '/../../uploads';
        return $uploadsRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $clean);
    }

    /**
     * Convierte el shape `{ title, nodes, edges }` que devuelve
     * `AIClient::parseNoteToMap` al `drawflow_json` que `editor.import()`
     * de Drawflow espera.
     *
     * Estructura esperada por Drawflow (mismo shape que produce
     * `editor.export()` desde el frontend, ver DrawflowEditor.jsx):
     *
     *   {
     *     "drawflow": {
     *       "Home": {
     *         "data": {
     *           "1": {
     *             "id": 1, "name": "concept",
     *             "data": { "label": "...", "hint": "..." },
     *             "class": "concept-node",
     *             "html": "<div class='sw-node'>...</div>",
     *             "typenode": false,
     *             "inputs":  { "input_1":  { "connections": [...] } },
     *             "outputs": { "output_1": { "connections": [...] } },
     *             "pos_x": 540, "pos_y": 60
     *           },
     *           ...
     *         }
     *       }
     *     }
     *   }
     *
     * Las connections son bidireccionales: para un edge A→B el JSON
     * registra la salida en A.outputs.output_1 y la entrada en
     * B.inputs.input_1 (ambos con el id del otro nodo como string).
     *
     * Posicionado de nodos:
     *   - Raíz (id=1): centro horizontal arriba (540, 60).
     *   - Hijos: grid 4 columnas, stride 240×180, partiendo de (60, 260).
     *
     * Defendible: posición inicial razonable para 6-15 nodos sin
     * solape; el alumno puede arrastrar después y el auto-save
     * persiste las nuevas coordenadas.
     */
    private function buildDrawflowJsonFromMap($map) {
        $nodes = $map['nodes']; // [{id, label, hint}, ...]
        $edges = $map['edges']; // [{source, target}, ...]

        // Identificamos la raíz: id=1 si existe, primer nodo si no.
        // sanitizeMapResponse no garantiza que haya un nodo con id=1
        // (sólo lo recomienda el prompt al modelo).
        $rootId = null;
        foreach ($nodes as $n) {
            if ((int) $n['id'] === 1) { $rootId = 1; break; }
        }
        if ($rootId === null && !empty($nodes)) {
            $rootId = (int) $nodes[0]['id'];
        }

        // Posiciones precalculadas por id.
        $positions = [];
        $childIndex = 0;
        foreach ($nodes as $n) {
            $id = (int) $n['id'];
            if ($id === $rootId) {
                $positions[$id] = ['pos_x' => 540, 'pos_y' => 60];
                continue;
            }
            $col = $childIndex % 4;
            $row = intdiv($childIndex, 4);
            $positions[$id] = [
                'pos_x' => 60 + $col * 240,
                'pos_y' => 260 + $row * 180,
            ];
            $childIndex++;
        }

        // Pre-calcular conexiones por nodo en O(N + E).
        $outgoing = []; // id → [target_id, ...]
        $incoming = []; // id → [source_id, ...]
        foreach ($edges as $e) {
            $s = (int) $e['source'];
            $t = (int) $e['target'];
            $outgoing[$s][] = $t;
            $incoming[$t][] = $s;
        }

        $data = [];
        foreach ($nodes as $n) {
            $id    = (int) $n['id'];
            $label = (string) $n['label'];
            $hint  = (string) $n['hint'];

            // Conexiones de salida (output_1 → input_1 del destino).
            $outConns = [];
            foreach (($outgoing[$id] ?? []) as $tgt) {
                $outConns[] = [
                    'node'   => (string) $tgt,
                    'output' => 'input_1',
                ];
            }

            // Conexiones de entrada (input_1 ← output_1 del origen).
            $inConns = [];
            foreach (($incoming[$id] ?? []) as $src) {
                $inConns[] = [
                    'node'  => (string) $src,
                    'input' => 'output_1',
                ];
            }

            $pos = $positions[$id] ?? ['pos_x' => 0, 'pos_y' => 0];

            $data[(string) $id] = [
                'id'       => $id,
                'name'     => 'concept',
                'data'     => ['label' => $label, 'hint' => $hint],
                'class'    => 'concept-node',
                'html'     => $this->buildConceptNodeHtml($label, $hint),
                'typenode' => false,
                'inputs'   => ['input_1'  => ['connections' => $inConns]],
                'outputs'  => ['output_1' => ['connections' => $outConns]],
                'pos_x'    => $pos['pos_x'],
                'pos_y'    => $pos['pos_y'],
            ];
        }

        $structure = [
            'drawflow' => [
                'Home' => ['data' => $data],
            ],
        ];

        return json_encode($structure, JSON_UNESCAPED_UNICODE);
    }

    /**
     * Replica el HTML del custom node "concept" del frontend
     * (DrawflowEditor.jsx → buildNodeHtml). Mantener este HTML
     * sincronizado con el frontend es crítico: si Drawflow re-importa
     * un mapa cuyo HTML no coincide con la plantilla esperada, los
     * affordances de edición (botones "+ IA"/"✕", contenteditable)
     * dejan de funcionar.
     *
     * Escapado anti-XSS con htmlspecialchars: aunque el saneo en
     * AIClient ya recorta longitudes, no escapa caracteres HTML; el
     * label/hint del modelo podría contener '<', '>', '"' o '&'.
     */
    private function buildConceptNodeHtml($label, $hint) {
        $safe = function ($s) {
            return htmlspecialchars((string) $s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        };
        $labelHtml = $safe($label);
        $hintHtml  = $safe($hint);

        return '
    <div class="sw-node">
      <div class="sw-node__label" contenteditable="true" data-field="label" spellcheck="false">' . $labelHtml . '</div>
      <div class="sw-node__hint"  contenteditable="true" data-field="hint"  spellcheck="false">' . $hintHtml . '</div>
      <div class="sw-node__actions">
        <button type="button" data-action="expand" title="Expandir con IA">+ IA</button>
        <button type="button" data-action="delete" title="Eliminar nodo">✕</button>
      </div>
    </div>
    ';
    }
}
?>
