<?php
/**
 * FlashcardController — endpoints CRUD + repaso SM-2 + generación IA
 * de flashcards de StudyWeaver.
 *
 * Convenciones (CLAUDE.md §9 + Gemini.md §4):
 *   - Headless: cada método termina con echo json_encode([...]).
 *   - Respuesta uniforme: { success: bool, message?: string, data?: ... }.
 *   - Auth con AuthMiddleware::verifyToken() al inicio de cada método.
 *   - Códigos HTTP: 200 OK, 201 Created, 400 validación, 401 sin
 *     auth, 403 prohibido, 404 no encontrado, 500 error servidor,
 *     503 IA caída.
 *   - try/catch alrededor de PDO: se devuelve 500 genérico al cliente
 *     y se loguea el detalle real (nunca exponer mensajes SQL).
 *   - Ownership en cada endpoint: el modelo filtra por user_id en la
 *     query (anti-IDOR a nivel de BD).
 */

require_once __DIR__ . '/../middleware/verify-token.php';
require_once __DIR__ . '/../services/AIClient.php';
require_once __DIR__ . '/../../MODEL/Flashcard.php';
require_once __DIR__ . '/../../MODEL/Map.php';

class FlashcardController {
    private $db;
    private $flashcardModel;
    private $mapModel;

    /** Límite de longitud de front/back (también validado en el frontend). */
    const TEXT_MAX_LEN = 500;

    public function __construct($db) {
        $this->db             = $db;
        $this->flashcardModel = new Flashcard($db);
        $this->mapModel       = new Map($db);
    }

    /**
     * GET flashcards/list
     * Devuelve todas las flashcards del usuario, ordenadas por
     * urgencia (next_review_at ASC). Lista normalizada para que el
     * frontend no tenga que casear strings → int/float.
     */
    public function list() {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        try {
            $rows = $this->flashcardModel->findByUser($userId);
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'data'    => array_map([$this, 'normalize'], $rows),
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[FlashcardController::list] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al consultar las flashcards.',
            ]);
        }
    }

    /**
     * GET flashcards/due
     * Devuelve sólo las flashcards que vencen hoy o antes (cola de
     * repaso). Usa CURDATE() del servidor para evitar diferencias de
     * zona horaria con el cliente.
     */
    public function due() {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        $today = (new DateTimeImmutable('today'))->format('Y-m-d');

        // Filtro opcional por carpeta de apunte. Lo lee de la query
        // string (?note_id=123 o ?note_id=none) para que la URL del
        // repaso sea compartible/recargable. Validamos antes de pasar
        // al modelo: cualquier valor que no sea 'none' o entero > 0
        // se ignora silenciosamente y se cae al modo global.
        $noteFilter = null;
        $rawNote    = $_GET['note_id'] ?? null;
        if ($rawNote === 'none') {
            $noteFilter = 'none';
        } elseif ($rawNote !== null && ctype_digit((string) $rawNote) && (int) $rawNote > 0) {
            $noteFilter = (int) $rawNote;
        }

        try {
            $rows = $this->flashcardModel->findDue($userId, $today, $noteFilter);
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'data'    => array_map([$this, 'normalize'], $rows),
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[FlashcardController::due] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al consultar las flashcards pendientes.',
            ]);
        }
    }

    /**
     * POST flashcards/delete-by-note
     * Borra todas las flashcards del usuario que pertenezcan a un
     * apunte (carpeta) o las huérfanas (carpeta "Sin apunte").
     *
     * Body:
     *   { note_id: number }  → borra las de ese apunte concreto.
     *   { note_id: null }    → borra las huérfanas (note_id IS NULL).
     *
     * Devuelve { data: { deleted: N } }. Si no había nada que borrar
     * responde 404 con un mensaje claro (ayuda al frontend a no
     * mostrar un toast de éxito vacío).
     */
    public function deleteByNote($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        if ($userId == 999) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'El usuario administrador no puede borrar flashcards.',
            ]);
            return;
        }

        // Distinguimos "no enviaron la clave" de "la enviaron como null":
        // la clave puede llegar literalmente como null desde el JSON y
        // significa "carpeta huérfanas". array_key_exists conserva esa
        // diferencia (isset trataría null como ausencia).
        $noteId = null;
        if (array_key_exists('note_id', $data) && $data['note_id'] !== null) {
            if (!is_numeric($data['note_id']) || (int) $data['note_id'] <= 0) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'message' => 'note_id no válido.',
                ]);
                return;
            }
            $noteId = (int) $data['note_id'];
        }

        try {
            $deleted = $this->flashcardModel->deleteByNote($userId, $noteId);
            if ($deleted === 0) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Esa carpeta ya no tiene flashcards que borrar.',
                ]);
                return;
            }

            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => "Eliminadas {$deleted} flashcards.",
                'data'    => ['deleted' => $deleted],
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[FlashcardController::deleteByNote] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al eliminar la carpeta de flashcards.',
            ]);
        }
    }

    /**
     * POST flashcards/save
     * Crea (sin id) o actualiza (con id) una flashcard del usuario.
     * Body:
     *   {
     *     id?:     número (omitido o 0 → crear),
     *     map_id?: número o null (sólo en CREATE; al UPDATE se ignora
     *              porque no permitimos reasignar mapa de origen),
     *     front:   string no vacío, ≤ 500 chars,
     *     back:    string no vacío, ≤ 500 chars
     *   }
     */
    public function save($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        // Super User virtual: no tiene fila real en `users`, romperia la FK.
        if ($userId == 999) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'El usuario administrador no puede crear ni modificar flashcards.',
            ]);
            return;
        }

        $id    = isset($data['id'])    ? (int)  $data['id']    : 0;
        $front = isset($data['front']) ? trim((string) $data['front']) : '';
        $back  = isset($data['back'])  ? trim((string) $data['back'])  : '';

        if ($front === '' || $back === '') {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'La pregunta y la respuesta son obligatorias.',
            ]);
            return;
        }
        if (mb_strlen($front) > self::TEXT_MAX_LEN || mb_strlen($back) > self::TEXT_MAX_LEN) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'La pregunta y la respuesta no pueden superar 500 caracteres.',
            ]);
            return;
        }

        try {
            if ($id > 0) {
                // Verificamos ownership antes de tocar nada. 404 con
                // el mismo mensaje que "no existe" para no filtrar la
                // existencia de tarjetas ajenas.
                $existing = $this->flashcardModel->findByIdForUser($id, $userId);
                if (!$existing) {
                    http_response_code(404);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Flashcard no encontrada.',
                    ]);
                    return;
                }

                $ok = $this->flashcardModel->update($id, $userId, $front, $back);
                if (!$ok) {
                    http_response_code(500);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Error al actualizar la flashcard.',
                    ]);
                    return;
                }

                $row = $this->flashcardModel->findByIdForUser($id, $userId);
                http_response_code(200);
                echo json_encode([
                    'success' => true,
                    'message' => 'Flashcard actualizada.',
                    'data'    => $this->normalize($row ?: []),
                ], JSON_UNESCAPED_UNICODE);
                return;
            }

            // map_id es opcional. Si llega, debemos verificar que el
            // mapa pertenece al usuario; si no, podríamos colgar la
            // tarjeta de un map_id ajeno (no leakea datos pero permite
            // contaminar el grafo del propietario real).
            $mapId = null;
            if (isset($data['map_id']) && $data['map_id'] !== null && $data['map_id'] !== '') {
                $mapId = (int) $data['map_id'];
                if ($mapId <= 0) {
                    http_response_code(400);
                    echo json_encode([
                        'success' => false,
                        'message' => 'map_id no válido.',
                    ]);
                    return;
                }
                $owned = $this->mapModel->findByIdForUser($mapId, $userId);
                if (!$owned) {
                    http_response_code(404);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Mapa no encontrado.',
                    ]);
                    return;
                }
            }

            $today = (new DateTimeImmutable('today'))->format('Y-m-d');
            $newId = $this->flashcardModel->create($userId, $mapId, $front, $back, $today);
            if (!$newId) {
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'message' => 'Error al crear la flashcard.',
                ]);
                return;
            }

            $row = $this->flashcardModel->findByIdForUser((int) $newId, $userId);
            http_response_code(201);
            echo json_encode([
                'success' => true,
                'message' => 'Flashcard creada.',
                'data'    => $this->normalize($row ?: []),
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[FlashcardController::save] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al guardar la flashcard.',
            ]);
        }
    }

    /**
     * POST flashcards/review
     * Aplica un repaso a una flashcard del usuario.
     * Body: { id: número, grade: 'fail' | 'good' | 'easy' }.
     * Devuelve la fila actualizada con el nuevo next_review_at.
     */
    public function review($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        if ($userId == 999) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'El usuario administrador no puede repasar flashcards.',
            ]);
            return;
        }

        $id    = isset($data['id'])    ? (int) $data['id'] : 0;
        $grade = isset($data['grade']) ? (string) $data['grade'] : '';

        if ($id <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'ID de flashcard no válido.',
            ]);
            return;
        }
        if (!array_key_exists($grade, Flashcard::GRADES)) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => "Grado de repaso no válido. Usa 'fail', 'good' o 'easy'.",
            ]);
            return;
        }

        try {
            $existing = $this->flashcardModel->findByIdForUser($id, $userId);
            if (!$existing) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Flashcard no encontrada.',
                ]);
                return;
            }

            $next = $this->flashcardModel->applyReview($id, $userId, $existing, $grade);

            // Devolvemos la fila completa post-update para que el
            // frontend pueda mostrar el nuevo "vence en N días" sin
            // hacer otra llamada.
            $updated = array_merge($existing, $next, [
                'last_reviewed_at' => date('Y-m-d H:i:s'),
            ]);

            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'Repaso registrado.',
                'data'    => $this->normalize($updated),
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[FlashcardController::review] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al registrar el repaso.',
            ]);
        }
    }

    /**
     * POST flashcards/delete
     * Body: { id: número }. 404 si la flashcard no existe o pertenece
     * a otro usuario (mismo mensaje en ambos casos).
     */
    public function delete($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        $id = isset($data['id']) ? (int) $data['id'] : 0;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'ID de flashcard no válido.',
            ]);
            return;
        }

        try {
            $ok = $this->flashcardModel->delete($id, $userId);
            if (!$ok) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Flashcard no encontrada.',
                ]);
                return;
            }

            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'Flashcard eliminada.',
            ]);
        } catch (PDOException $e) {
            error_log('[FlashcardController::delete] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al eliminar la flashcard.',
            ]);
        }
    }

    /**
     * POST flashcards/generate-from-map
     * Body: { map_id: número }.
     *
     * Flujo:
     *   1. Verificar ownership del mapa.
     *   2. Parsear drawflow_json y extraer nodos como {label, hint}.
     *   3. Si no hay nodos → 400 (no gastamos llamada IA en vacío).
     *   4. Llamar a AIClient::generateFlashcards.
     *   5. Persistir con createBatch (atómico).
     *   6. Devolver { created: N }.
     *
     * Errores específicos:
     *   - IA caída → 503 con mensaje canónico.
     *   - Mapa sin nodos → 400 con mensaje accionable.
     */
    public function generateFromMap($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        if ($userId == 999) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'El usuario administrador no puede generar flashcards.',
            ]);
            return;
        }

        $mapId = isset($data['map_id']) ? (int) $data['map_id'] : 0;
        if ($mapId <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'map_id no válido.',
            ]);
            return;
        }

        try {
            $map = $this->mapModel->findByIdForUser($mapId, $userId);
            if (!$map) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Mapa no encontrado.',
                ]);
                return;
            }

            $nodes = $this->extractNodesFromDrawflow($map['drawflow_json'] ?? null);
            if (empty($nodes)) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'message' => 'El mapa no tiene conceptos suficientes para generar flashcards.',
                ]);
                return;
            }

            $cards = AIClient::generateFlashcards((string) $map['title'], $nodes);
            if (empty($cards)) {
                // Defensivo: AIClient ya lanza RuntimeException en sus
                // fallos canónicos, pero si por algún motivo devuelve
                // [] sin lanzar, no insertamos nada y respondemos 503.
                http_response_code(503);
                echo json_encode([
                    'success' => false,
                    'message' => 'La IA no devolvió flashcards.',
                ]);
                return;
            }

            $created = $this->flashcardModel->createBatch($userId, $mapId, $cards);
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
        } catch (RuntimeException $e) {
            // AIClient lanza RuntimeException en cualquier fallo de IA.
            // Detalle real ya en error_log (lo escribe AIClient).
            http_response_code(503);
            echo json_encode([
                'success' => false,
                'message' => 'La IA no está disponible ahora.',
            ]);
        } catch (PDOException $e) {
            error_log('[FlashcardController::generateFromMap] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al guardar las flashcards generadas.',
            ]);
        } catch (Throwable $e) {
            error_log('[FlashcardController::generateFromMap] inesperado: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error interno al generar flashcards.',
            ]);
        }
    }

    /**
     * Convierte una fila bruta de la BD a su forma de respuesta JSON:
     * tipos numéricos casteados, fechas tal cual (strings), claves
     * estables. Mantenemos los nombres snake_case del backend para
     * que el frontend reciba lo mismo que en las otras features.
     */
    private function normalize($row) {
        if (empty($row)) return $row;
        return [
            'id'               => isset($row['id'])             ? (int)   $row['id']             : null,
            'user_id'          => isset($row['user_id'])        ? (int)   $row['user_id']        : null,
            'map_id'           => isset($row['map_id']) && $row['map_id'] !== null
                                    ? (int) $row['map_id']
                                    : null,
            // note_id se rellena cuando la flashcard se generó desde un
            // apunte (rama IA_Integration: aiController::fromNote target=
            // flashcards). El frontend lo usa para pintar el badge
            // "Apunte" como contraparte del badge "Mapa", manteniendo la
            // trazabilidad del origen de cada tarjeta.
            'note_id'          => isset($row['note_id']) && $row['note_id'] !== null
                                    ? (int) $row['note_id']
                                    : null,
            // note_title sólo viene relleno desde findByUser (LEFT JOIN con
            // notes). En save/review el normalize se ejecuta sobre filas que
            // no traen esa columna, así que cae a null sin estorbar.
            'note_title'       => isset($row['note_title']) && $row['note_title'] !== null
                                    ? (string) $row['note_title']
                                    : null,
            'front'            => isset($row['front']) ? (string) $row['front'] : '',
            'back'             => isset($row['back'])  ? (string) $row['back']  : '',
            'ease_factor'      => isset($row['ease_factor'])   ? (float) $row['ease_factor']    : null,
            'interval_days'    => isset($row['interval_days']) ? (int)   $row['interval_days']  : null,
            'repetitions'      => isset($row['repetitions'])   ? (int)   $row['repetitions']    : null,
            'next_review_at'   => $row['next_review_at']   ?? null,
            'last_reviewed_at' => $row['last_reviewed_at'] ?? null,
            'created_at'       => $row['created_at']       ?? null,
            'updated_at'       => $row['updated_at']       ?? null,
        ];
    }

    /**
     * Parsea el `drawflow_json` (LONGTEXT del mapa) y extrae la lista
     * de nodos como [{ label, hint }, ...].
     *
     * Estructura interna de Drawflow tras editor.export():
     *   {
     *     "drawflow": {
     *       "Home": {
     *         "data": {
     *           "1": { "data": { "label": "...", "hint": "..." }, ... },
     *           "2": { ... }
     *         }
     *       }
     *     }
     *   }
     *
     * Si el JSON está vacío, corrupto o no tiene nodos válidos
     * (label vacío), devuelve []. El controller decide el código
     * HTTP en función de esa lista.
     *
     * @param string|null $drawflowJson
     * @return array
     */
    private function extractNodesFromDrawflow($drawflowJson) {
        if (!is_string($drawflowJson) || $drawflowJson === '') return [];

        $decoded = json_decode($drawflowJson, true);
        if (!is_array($decoded)) return [];

        $rawNodes = $decoded['drawflow']['Home']['data'] ?? [];
        if (!is_array($rawNodes)) return [];

        $nodes = [];
        foreach ($rawNodes as $node) {
            if (!is_array($node)) continue;
            $label = isset($node['data']['label']) ? trim((string) $node['data']['label']) : '';
            $hint  = isset($node['data']['hint'])  ? trim((string) $node['data']['hint'])  : '';
            if ($label === '') continue;
            $nodes[] = ['label' => $label, 'hint' => $hint];
        }
        return $nodes;
    }
}
?>
