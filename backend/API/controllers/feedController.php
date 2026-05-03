<?php
/**
 * FeedController — endpoints de lectura de la capa social.
 *
 * Métodos:
 *   - list             GET community/feed?sort=&q=&page=&page_size=
 *   - getPublicMap     GET community/map?id=N
 *   - getProfile       GET community/profile?user_id=N
 *   - getProfileMaps   GET community/profile-maps?user_id=N&page=N
 *   - getMyFavorites   GET community/favorites?page=N
 *
 * Convenciones (CLAUDE.md §9 + Gemini.md §4):
 *   - Headless: cada método termina con echo json_encode([...]).
 *   - Respuesta uniforme: { success, message?, data?, pagination? }.
 *   - Auth obligatoria con AuthMiddleware::verifyToken() (decisión §9.1
 *     del community-plan: comunidad sólo logueada).
 *   - Códigos HTTP: 200 OK, 400 validación, 401 sin auth, 404 no
 *     encontrado, 500 error servidor.
 *   - try/catch alrededor de PDO con `error_log` interno y mensaje
 *     genérico al cliente (no exponer detalles SQL).
 *   - Anti-IDOR: el feed sólo devuelve mapas con `is_public = 1`; el
 *     perfil público nunca expone email ni teléfono.
 */

require_once __DIR__ . '/../middleware/verify-token.php';
require_once __DIR__ . '/../../MODEL/Map.php';
require_once __DIR__ . '/../../MODEL/Like.php';
require_once __DIR__ . '/../../MODEL/Comment.php';
require_once __DIR__ . '/../../MODEL/User.php';

class FeedController {
    private $db;
    private $mapModel;
    private $likeModel;
    private $commentModel;
    private $userModel;

    /** Tamaño de página por defecto (mapas en grid 1/2/3 columnas). */
    const PAGE_SIZE_DEFAULT = 12;
    /** Cota superior para evitar payloads enormes desde el cliente. */
    const PAGE_SIZE_MAX     = 50;
    /** Longitud máxima admitida en la búsqueda libre. */
    const Q_MAX_LEN         = 100;

    public function __construct($db) {
        $this->db           = $db;
        $this->mapModel     = new Map($db);
        $this->likeModel    = new Like($db);
        $this->commentModel = new Comment($db);
        $this->userModel    = new User($db);
    }

    /**
     * GET community/feed
     * Lista los mapas públicos para el feed comunidad.
     * Query params:
     *   sort=recent|popular  (default 'recent')
     *   q=texto              (filtra por title/description con LIKE)
     *   page=N               (default 1)
     *   page_size=N          (default 12, max 50)
     */
    public function list($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = (int) $auth['id'];

        $sort = (isset($data['sort']) && $data['sort'] === 'popular')
            ? 'popular'
            : 'recent';
        $q = isset($data['q']) ? trim((string) $data['q']) : '';
        if (mb_strlen($q) > self::Q_MAX_LEN) {
            $q = mb_substr($q, 0, self::Q_MAX_LEN);
        }

        [$limit, $offset] = $this->resolvePagination($data);

        try {
            $rows  = $this->mapModel->findPublicForFeed($userId, $sort, $q, $limit, $offset);
            $total = $this->mapModel->countPublicForFeed($q);

            http_response_code(200);
            echo json_encode([
                'success'    => true,
                'data'       => array_map([$this, 'normalizeFeedRow'], $rows),
                'pagination' => $this->makePagination($total, $limit, $offset),
                'sort'       => $sort,
                'q'          => $q,
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[FeedController::list] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al cargar el feed.',
            ]);
        }
    }

    /**
     * GET community/map?id=N
     * Devuelve un mapa público completo con autor, counts y
     * liked_by_me. 404 si no existe o si is_public=0 (mismo mensaje
     * en ambos casos para no filtrar existencia de mapas privados
     * ajenos).
     */
    public function getPublicMap($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = (int) $auth['id'];

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
            $row = $this->mapModel->findPublicByIdWithMeta($id, $userId);
            if (!$row) {
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
                'data'    => $this->normalizePublicMap($row),
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[FeedController::getPublicMap] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al cargar el mapa.',
            ]);
        }
    }

    /**
     * GET community/profile?user_id=N
     * Devuelve el perfil público del usuario indicado: nombre, avatar
     * y número de mapas públicos. **Sin email ni teléfono** (RGPD).
     */
    public function getProfile($data = []) {
        AuthMiddleware::verifyToken();

        $authorUserId = isset($data['user_id']) ? (int) $data['user_id'] : 0;
        if ($authorUserId <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'user_id no válido.',
            ]);
            return;
        }

        try {
            $user = $this->userModel->searchById($authorUserId);
            if (!$user) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Usuario no encontrado.',
                ]);
                return;
            }
            $publicCount = $this->mapModel->countPublicByUser($authorUserId);

            http_response_code(200);
            echo json_encode([
                'success' => true,
                'data'    => [
                    'id'                => (int) $user['id'],
                    'name'              => $user['name'] ?? '',
                    'avatar_url'        => $user['avatar_url'] ?? null,
                    'public_maps_count' => $publicCount,
                ],
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[FeedController::getProfile] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al cargar el perfil.',
            ]);
        }
    }

    /**
     * GET community/profile-maps?user_id=N&page=N
     * Lista paginada de mapas públicos del autor indicado.
     */
    public function getProfileMaps($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = (int) $auth['id'];

        $authorUserId = isset($data['user_id']) ? (int) $data['user_id'] : 0;
        if ($authorUserId <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'user_id no válido.',
            ]);
            return;
        }

        [$limit, $offset] = $this->resolvePagination($data);

        try {
            $rows  = $this->mapModel->findPublicByUser($userId, $authorUserId, $limit, $offset);
            $total = $this->mapModel->countPublicByUser($authorUserId);

            http_response_code(200);
            echo json_encode([
                'success'    => true,
                'data'       => array_map([$this, 'normalizeFeedRow'], $rows),
                'pagination' => $this->makePagination($total, $limit, $offset),
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[FeedController::getProfileMaps] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al cargar los mapas del perfil.',
            ]);
        }
    }

    /**
     * GET community/favorites?page=N
     * Mapas que el usuario actual ha likeado (los likes funcionan
     * también como bookmarks). Filtra mapas privados ajenos.
     */
    public function getMyFavorites($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = (int) $auth['id'];

        if ($userId == 999) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'El usuario administrador no puede tener favoritos.',
            ]);
            return;
        }

        [$limit, $offset] = $this->resolvePagination($data);

        try {
            $rows  = $this->likeModel->findFavoritesForUser($userId, $limit, $offset);
            $total = $this->likeModel->countFavoritesForUser($userId);

            // En "Mis favoritos" todo está likeado por definición,
            // así que sobrescribimos liked_by_me=1 para que el
            // frontend no tenga que asumirlo.
            $rows = array_map(function ($r) {
                $r['liked_by_me'] = 1;
                return $this->normalizeFeedRow($r);
            }, $rows);

            http_response_code(200);
            echo json_encode([
                'success'    => true,
                'data'       => $rows,
                'pagination' => $this->makePagination($total, $limit, $offset),
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[FeedController::getMyFavorites] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al cargar tus favoritos.',
            ]);
        }
    }

    private function resolvePagination($data) {
        $page = isset($data['page']) ? max(1, (int) $data['page']) : 1;
        $size = isset($data['page_size']) ? (int) $data['page_size'] : self::PAGE_SIZE_DEFAULT;
        if ($size < 1)                        $size = self::PAGE_SIZE_DEFAULT;
        if ($size > self::PAGE_SIZE_MAX)      $size = self::PAGE_SIZE_MAX;
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

    private function normalizeFeedRow($r) {
        return [
            'id'             => isset($r['id']) ? (int) $r['id'] : null,
            'title'          => $r['title'] ?? '',
            'description'    => $r['description'] ?? null,
            'is_public'      => (bool) (int) ($r['is_public'] ?? 1),
            'created_at'     => $r['created_at'] ?? null,
            'updated_at'     => $r['updated_at'] ?? null,
            'liked_at'       => $r['liked_at']   ?? null,
            'author'         => [
                'id'         => isset($r['author_id']) ? (int) $r['author_id'] : null,
                'name'       => $r['author_name'] ?? '',
                'avatar_url' => $r['author_avatar'] ?? null,
            ],
            'likes_count'    => isset($r['likes_count'])    ? (int) $r['likes_count']    : 0,
            'comments_count' => isset($r['comments_count']) ? (int) $r['comments_count'] : 0,
            'liked_by_me'    => (bool) (int) ($r['liked_by_me'] ?? 0),
        ];
    }

    private function normalizePublicMap($r) {
        return [
            'id'             => (int) $r['id'],
            'title'          => $r['title'] ?? '',
            'description'    => $r['description'] ?? null,
            'is_public'      => (bool) (int) ($r['is_public'] ?? 1),
            'drawflow_json'  => $r['drawflow_json'] ?? null,
            'created_at'     => $r['created_at'] ?? null,
            'updated_at'     => $r['updated_at'] ?? null,
            'owner_user_id'  => isset($r['owner_user_id']) ? (int) $r['owner_user_id'] : null,
            'author'         => [
                'id'         => isset($r['author_id']) ? (int) $r['author_id'] : null,
                'name'       => $r['author_name'] ?? '',
                'avatar_url' => $r['author_avatar'] ?? null,
            ],
            'likes_count'    => isset($r['likes_count'])    ? (int) $r['likes_count']    : 0,
            'comments_count' => isset($r['comments_count']) ? (int) $r['comments_count'] : 0,
            'liked_by_me'    => (bool) (int) ($r['liked_by_me'] ?? 0),
        ];
    }
}
?>
