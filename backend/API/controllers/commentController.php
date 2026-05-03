<?php
/**
 * CommentController — listado, creación y borrado de comentarios
 * sobre mapas públicos.
 *
 * Métodos:
 *   - list    GET community/comments?map_id=N&page=N&page_size=20
 *   - create  POST community/comment           body { map_id, body }
 *   - delete  POST community/comment-delete    body { id }
 *
 * Convenciones (CLAUDE.md §9 + Gemini.md §4):
 *   - Headless: cada método termina con echo json_encode([...]).
 *   - Auth obligatoria con AuthMiddleware::verifyToken().
 *   - Códigos HTTP: 200 OK, 201 Created, 400 validación, 401 sin auth,
 *     403 prohibido, 404 no encontrado, 500 error servidor.
 *   - Sin endpoint de edición (decisión §1.3 community-plan: KISS y
 *     evita "padding ataques" donde alguien edita su comment después
 *     de ser likeado/respondido).
 *   - Borrado autorizado al autor del comment **o** al dueño del mapa
 *     — doble verificación en el modelo (findByIdForUserOrMapOwner).
 */

require_once __DIR__ . '/../middleware/verify-token.php';
require_once __DIR__ . '/../../MODEL/Comment.php';
require_once __DIR__ . '/../../MODEL/Map.php';

class CommentController {
    private $db;
    private $commentModel;
    private $mapModel;

    /** Tamaño de página para el hilo de un mapa. */
    const PAGE_SIZE_DEFAULT = 20;
    const PAGE_SIZE_MAX     = 100;

    /** Longitud admitida en el cuerpo del comentario (UI valida igual). */
    const BODY_MIN          = 1;
    const BODY_MAX          = 1000;

    public function __construct($db) {
        $this->db           = $db;
        $this->commentModel = new Comment($db);
        $this->mapModel     = new Map($db);
    }

    /**
     * GET community/comments
     * Lista paginada de comentarios de un mapa. El mapa debe ser
     * público (excepción: el dueño ve los suyos en privado).
     *
     * Cada comentario incluye `can_delete` ya calculado para que el
     * frontend no tenga que cruzar IDs en cliente.
     */
    public function list($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = (int) $auth['id'];

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
            $map = $this->mapModel->findBasicById($mapId);
            if (!$map) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Mapa no encontrado.',
                ]);
                return;
            }
            $isPublic   = ((int) $map['is_public']) === 1;
            $isMapOwner = ((int) $map['user_id'])   === $userId;
            if (!$isPublic && !$isMapOwner) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Mapa no encontrado.',
                ]);
                return;
            }

            [$limit, $offset] = $this->resolvePagination($data);
            $rows  = $this->commentModel->findByMap($mapId, $limit, $offset);
            $total = $this->commentModel->countByMap($mapId);

            $rows = array_map(function ($r) use ($userId, $isMapOwner) {
                $authorId = (int) $r['author_id'];
                return [
                    'id'         => (int) $r['id'],
                    'body'       => (string) ($r['body'] ?? ''),
                    'created_at' => $r['created_at'] ?? null,
                    'author'     => [
                        'id'         => $authorId,
                        'name'       => $r['author_name'] ?? '',
                        'avatar_url' => $r['author_avatar'] ?? null,
                    ],
                    'can_delete' => ($authorId === $userId) || $isMapOwner,
                ];
            }, $rows);

            http_response_code(200);
            echo json_encode([
                'success'    => true,
                'data'       => $rows,
                'pagination' => $this->makePagination($total, $limit, $offset),
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[CommentController::list] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al cargar los comentarios.',
            ]);
        }
    }

    /**
     * POST community/comment
     * Body: { map_id: número, body: string 1-1000 chars }.
     * El mapa debe ser público (excepción: el dueño puede comentar
     * en su propio mapa privado).
     */
    public function create($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = (int) $auth['id'];

        if ($userId == 999) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'El usuario administrador no puede comentar.',
            ]);
            return;
        }

        $mapId = isset($data['map_id']) ? (int) $data['map_id'] : 0;
        $body  = isset($data['body'])   ? trim((string) $data['body']) : '';

        if ($mapId <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'map_id no válido.',
            ]);
            return;
        }
        if (mb_strlen($body) < self::BODY_MIN) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'El comentario no puede estar vacío.',
            ]);
            return;
        }
        if (mb_strlen($body) > self::BODY_MAX) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'El comentario no puede superar 1000 caracteres.',
            ]);
            return;
        }

        try {
            $map = $this->mapModel->findBasicById($mapId);
            if (!$map) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Mapa no encontrado.',
                ]);
                return;
            }
            $isPublic = ((int) $map['is_public']) === 1;
            $isOwner  = ((int) $map['user_id'])   === $userId;
            if (!$isPublic && !$isOwner) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Mapa no encontrado.',
                ]);
                return;
            }

            $newId = $this->commentModel->create($mapId, $userId, $body);
            if (!$newId) {
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'message' => 'Error al crear el comentario.',
                ]);
                return;
            }
            $row = $this->commentModel->findByIdWithAuthor((int) $newId);
            $authorId = (int) ($row['author_id'] ?? $userId);

            http_response_code(201);
            echo json_encode([
                'success' => true,
                'message' => 'Comentario publicado.',
                'data'    => [
                    'id'         => (int) ($row['id'] ?? $newId),
                    'body'       => (string) ($row['body'] ?? $body),
                    'created_at' => $row['created_at'] ?? null,
                    'author'     => [
                        'id'         => $authorId,
                        'name'       => $row['author_name']   ?? '',
                        'avatar_url' => $row['author_avatar'] ?? null,
                    ],
                    // El propio autor siempre puede borrar su comment;
                    // si además es el dueño del mapa, sigue pudiendo.
                    'can_delete' => true,
                ],
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[CommentController::create] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al publicar el comentario.',
            ]);
        }
    }

    /**
     * POST community/comment-delete
     * Body: { id: número }.
     * 404 si el comentario no existe **o** si el usuario no está
     * autorizado (no se distingue para no filtrar existencia).
     */
    public function delete($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = (int) $auth['id'];

        if ($userId == 999) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'El usuario administrador no puede borrar comentarios.',
            ]);
            return;
        }

        $id = isset($data['id']) ? (int) $data['id'] : 0;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'ID de comentario no válido.',
            ]);
            return;
        }

        try {
            // Autorización en una sola query: el modelo devuelve la
            // fila si el usuario es autor del comment o del mapa
            // donde se posteó. False en cualquier otro caso.
            $row = $this->commentModel->findByIdForUserOrMapOwner($id, $userId);
            if (!$row) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Comentario no encontrado.',
                ]);
                return;
            }
            $ok = $this->commentModel->delete($id);
            if (!$ok) {
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'message' => 'No se pudo eliminar el comentario.',
                ]);
                return;
            }
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'Comentario eliminado.',
            ]);
        } catch (PDOException $e) {
            error_log('[CommentController::delete] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al eliminar el comentario.',
            ]);
        }
    }

    private function resolvePagination($data) {
        $page = isset($data['page']) ? max(1, (int) $data['page']) : 1;
        $size = isset($data['page_size']) ? (int) $data['page_size'] : self::PAGE_SIZE_DEFAULT;
        if ($size < 1)                   $size = self::PAGE_SIZE_DEFAULT;
        if ($size > self::PAGE_SIZE_MAX) $size = self::PAGE_SIZE_MAX;
        return [$size, ($page - 1) * $size];
    }

    private function makePagination($total, $limit, $offset) {
        $page = (int) floor($offset / $limit) + 1;
        return [
            'page'      => $page,
            'page_size' => (int) $limit,
            'total'     => (int) $total,
            'has_more'  => ($offset + $limit) < $total,
        ];
    }
}
?>
