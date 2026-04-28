<?php
/**
 * LikeController — toggle de likes sobre mapas públicos.
 *
 * Convenciones (CLAUDE.md §9 + Gemini.md §4):
 *   - Headless: cada método termina con echo json_encode([...]).
 *   - Auth obligatoria con AuthMiddleware::verifyToken().
 *   - Códigos HTTP: 200 OK, 400 validación, 401 sin auth, 403 prohibido,
 *     404 no encontrado, 500 error servidor.
 *   - Anti-IDOR: sólo se permite likear mapas con `is_public = 1`
 *     (excepción: el dueño puede likear su propio mapa privado, UX
 *     coherente con "Mis favoritos").
 */

require_once __DIR__ . '/../middleware/verify-token.php';
require_once __DIR__ . '/../../MODEL/Like.php';
require_once __DIR__ . '/../../MODEL/Map.php';

class LikeController {
    private $db;
    private $likeModel;
    private $mapModel;

    public function __construct($db) {
        $this->db        = $db;
        $this->likeModel = new Like($db);
        $this->mapModel  = new Map($db);
    }

    /**
     * POST community/like
     * Body: { map_id: número }.
     * Devuelve { liked: bool, count: int } reflejando el estado
     * resultante. La cuenta se recalcula con un SELECT COUNT(*) tras
     * el toggle para responder al frontend con un valor canónico (no
     * una estimación basada en lo que sabíamos antes).
     */
    public function toggle($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = (int) $auth['id'];

        // Super User virtual: no tiene fila real en `users` y por
        // tanto la FK fk_likes_user no podría persistir su like.
        if ($userId == 999) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'El usuario administrador no puede dar likes.',
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
            // Autorización: el mapa debe existir y ser público,
            // salvo que sea propiedad del usuario (un autor puede
            // marcarse como favorito su propio mapa privado).
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
            $isOwner  = ((int) $map['user_id']) === $userId;
            if (!$isPublic && !$isOwner) {
                // Mapa privado ajeno: 404 con el mismo mensaje que
                // "no existe", para no filtrar la existencia.
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Mapa no encontrado.',
                ]);
                return;
            }

            $liked = $this->likeModel->toggle($userId, $mapId);
            $count = $this->likeModel->countByMap($mapId);

            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => $liked ? 'Like añadido.' : 'Like retirado.',
                'data'    => [
                    'liked' => $liked,
                    'count' => $count,
                ],
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[LikeController::toggle] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al procesar el like.',
            ]);
        }
    }
}
?>
