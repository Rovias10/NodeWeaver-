<?php
/**
 * MapController — endpoints CRUD de mapas conceptuales StudyWeaver.
 *
 * Convenciones (CLAUDE.md §9 + Gemini.md §4):
 *   - Headless: cada método termina con echo json_encode([...]). Nunca HTML.
 *   - Respuesta uniforme: { success: bool, message?: string, data?: ... }.
 *   - Auth: AuthMiddleware::verifyToken() (no se reimplementa el header
 *     parsing inline como hacía el legacy automationController).
 *   - Códigos HTTP coherentes: 200 OK, 201 Created, 400 validación,
 *     401 sin auth, 403 prohibido, 404 no encontrado, 500 error servidor.
 *   - try/catch alrededor de operaciones PDO: si el modelo lanza
 *     PDOException, el cliente ve un 500 genérico (no se filtran detalles
 *     SQL).
 *   - Ownership en cada endpoint: el modelo filtra por user_id en la
 *     query (anti-IDOR a nivel de BD), y el controller verifica
 *     existencia con findByIdForUser antes de update.
 */

require_once __DIR__ . '/../middleware/verify-token.php';
require_once __DIR__ . '/../../MODEL/Map.php';

class MapController {
    private $db;
    private $mapModel;

    public function __construct($db) {
        $this->db = $db;
        $this->mapModel = new Map($db);
    }

    /**
     * GET maps/list
     * Lista los mapas del usuario autenticado, ordenados por última edición.
     * No incluye drawflow_json para mantener la respuesta ligera.
     */
    public function list() {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        try {
            $maps = $this->mapModel->findByUser($userId);

            // Normalizamos tipos para que el frontend no tenga que casear
            // strings a int/bool.
            $maps = array_map(function ($m) {
                $m['id']        = (int)  $m['id'];
                $m['is_public'] = (bool) (int) $m['is_public'];
                return $m;
            }, $maps);

            http_response_code(200);
            echo json_encode(['success' => true, 'data' => $maps]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al consultar los mapas.',
            ]);
        }
    }

    /**
     * GET maps/get?id=123
     * Devuelve un mapa concreto del usuario, con drawflow_json incluido.
     * Si no existe o pertenece a otro usuario → 404 (mismo mensaje en
     * ambos casos para no filtrar la existencia ajena).
     */
    public function get($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        $id = isset($data['id']) ? (int) $data['id'] : 0;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'ID de mapa no válido.',
            ]);
            return;
        }

        try {
            $map = $this->mapModel->findByIdForUser($id, $userId);
            if (!$map) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Mapa no encontrado.',
                ]);
                return;
            }

            $map['id']        = (int)  $map['id'];
            $map['is_public'] = (bool) (int) $map['is_public'];

            http_response_code(200);
            echo json_encode(['success' => true, 'data' => $map]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al obtener el mapa.',
            ]);
        }
    }

    /**
     * POST maps/save
     * Crea (sin id) o actualiza (con id) un mapa del usuario.
     * Body esperado:
     *   {
     *     id?:            número (omitido o 0 → crear),
     *     title:          string no vacío, ≤ 200 chars,
     *     description?:   string,
     *     is_public?:     bool/int,
     *     drawflow_json?: objeto JSON (resultado de editor.export()) o
     *                     string JSON parseable.
     *   }
     */
    public function save($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        // El Super User es virtual y no tiene fila real en `users`, así que
        // un INSERT con user_id = 999 violaría la FK. Lo cortocircuitamos
        // con un 403 claro en lugar de exponer un error de BD.
        if ($userId == 999) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'El usuario administrador no puede crear ni modificar mapas.',
            ]);
            return;
        }

        $id           = isset($data['id']) ? (int) $data['id'] : 0;
        $title        = isset($data['title']) ? trim($data['title']) : '';
        $description  = isset($data['description']) ? trim($data['description']) : null;
        $isPublic     = !empty($data['is_public']) ? 1 : 0;
        $drawflowJson = $data['drawflow_json'] ?? null;

        // Validación del título (obligatorio, máx. 200 chars).
        if ($title === '') {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'El título es obligatorio.',
            ]);
            return;
        }
        if (mb_strlen($title) > 200) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'El título no puede superar 200 caracteres.',
            ]);
            return;
        }

        // Normalizamos drawflow_json a string JSON.
        // El editor del frontend manda el objeto resultado de
        // editor.export(); el router PHP ya lo decodifica a array
        // asociativo. Aceptamos también string JSON por compatibilidad
        // con clientes externos (curl, Thunder Client).
        if ($drawflowJson !== null) {
            if (is_array($drawflowJson)) {
                $drawflowJson = json_encode($drawflowJson, JSON_UNESCAPED_UNICODE);
            } elseif (is_string($drawflowJson)) {
                $decoded = json_decode($drawflowJson, true);
                if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
                    http_response_code(400);
                    echo json_encode([
                        'success' => false,
                        'message' => 'drawflow_json no es JSON válido.',
                    ]);
                    return;
                }
            } else {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'message' => 'drawflow_json tiene un tipo no soportado.',
                ]);
                return;
            }
        }

        try {
            if ($id > 0) {
                // ─── UPDATE ───
                // Verificamos primero ownership/existencia. Si el mapa no
                // existe o es de otro usuario, devolvemos 404 (mismo
                // mensaje, sin distinguir, para no filtrar info).
                $existing = $this->mapModel->findByIdForUser($id, $userId);
                if (!$existing) {
                    http_response_code(404);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Mapa no encontrado.',
                    ]);
                    return;
                }

                $ok = $this->mapModel->update($id, $userId, $title, $description, $isPublic, $drawflowJson);
                if (!$ok) {
                    http_response_code(500);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Error al actualizar el mapa.',
                    ]);
                    return;
                }

                http_response_code(200);
                echo json_encode([
                    'success' => true,
                    'message' => 'Mapa actualizado.',
                    'data'    => [
                        'id'         => $id,
                        'updated_at' => $this->mapModel->getUpdatedAt($id),
                    ],
                ]);
            } else {
                // ─── CREATE ───
                $newId = $this->mapModel->create($userId, $title, $description, $isPublic, $drawflowJson);
                if (!$newId) {
                    http_response_code(500);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Error al crear el mapa.',
                    ]);
                    return;
                }

                http_response_code(201);
                echo json_encode([
                    'success' => true,
                    'message' => 'Mapa creado.',
                    'data'    => [
                        'id'         => (int) $newId,
                        'updated_at' => $this->mapModel->getUpdatedAt((int) $newId),
                    ],
                ]);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al guardar el mapa.',
            ]);
        }
    }

    /**
     * POST maps/delete
     * Borra un mapa del usuario. Body: { id: número }.
     * 404 si el mapa no existe o pertenece a otro usuario (mismo
     * mensaje en ambos casos).
     */
    public function delete($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        $id = isset($data['id']) ? (int) $data['id'] : 0;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'ID de mapa no válido.',
            ]);
            return;
        }

        try {
            $ok = $this->mapModel->delete($id, $userId);
            if (!$ok) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Mapa no encontrado.',
                ]);
                return;
            }

            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'Mapa eliminado.',
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al eliminar el mapa.',
            ]);
        }
    }
}
?>
