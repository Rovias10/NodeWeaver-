<?php
/**
 * Modelo Like — acceso a la tabla `likes` de StudyWeaver.
 *
 * Convenciones (CLAUDE.md §9 + Gemini.md §4.C):
 *   - Recibe la conexión PDO por constructor.
 *   - PDO posicional con prepared statements; sin lógica de negocio.
 *   - Filtros por user_id en la propia query (anti-IDOR a nivel de BD).
 *
 * Esquema en docs/database.md §2.3 y migración
 * backend/DATA/migrations/004_create_likes.sql.
 *
 * Usos:
 *   - Toggle de like en mapas públicos (Fase Comunidad · C1).
 *   - Conteo y badges para el feed.
 *   - "Mis favoritos": los likes funcionan también como bookmarks
 *     (justificado en docs/community-plan.md §0).
 */
class Like {
    private $conn;
    private $table = 'likes';

    public function __construct($db) {
        $this->conn = $db;
    }

    /**
     * Alterna el like del usuario sobre el mapa: si la fila existe la
     * borra (unlike); si no, la inserta (like). Devuelve true cuando
     * el resultado final es "likeado", false si quedó "deslikeado".
     *
     * Hay una pequeña ventana de carrera entre el SELECT y la acción
     * si el mismo usuario hace dos clicks simultáneos. La PK
     * compuesta de la tabla impide duplicados a nivel de BD (de ahí
     * el INSERT IGNORE), por lo que en el peor caso el contador
     * queda un tic desincronizado y el siguiente click vuelve a
     * cuadrar. Aceptable para MVP; documentado para defensa.
     *
     * @param int $userId
     * @param int $mapId
     * @return bool true → ahora likeado · false → ahora deslikeado.
     */
    public function toggle($userId, $mapId) {
        $check = $this->conn->prepare(
            "SELECT 1 FROM {$this->table} WHERE user_id = ? AND map_id = ? LIMIT 1"
        );
        $check->execute([$userId, $mapId]);
        if ($check->fetch()) {
            $del = $this->conn->prepare(
                "DELETE FROM {$this->table} WHERE user_id = ? AND map_id = ?"
            );
            $del->execute([$userId, $mapId]);
            return false;
        }
        $ins = $this->conn->prepare(
            "INSERT IGNORE INTO {$this->table} (user_id, map_id) VALUES (?, ?)"
        );
        $ins->execute([$userId, $mapId]);
        return true;
    }

    /**
     * Número de likes que tiene un mapa. Lo usa el feed para mostrar
     * el contador y el LikeController tras cada toggle.
     *
     * @return int
     */
    public function countByMap($mapId) {
        $stmt = $this->conn->prepare(
            "SELECT COUNT(*) FROM {$this->table} WHERE map_id = ?"
        );
        $stmt->execute([$mapId]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * ¿El usuario ha dado like al mapa? Útil para inicializar el
     * estado del corazón en el feed cuando no se traen los counts
     * agregados.
     */
    public function userHasLiked($userId, $mapId) {
        $stmt = $this->conn->prepare(
            "SELECT 1 FROM {$this->table} WHERE user_id = ? AND map_id = ? LIMIT 1"
        );
        $stmt->execute([$userId, $mapId]);
        return (bool) $stmt->fetch();
    }

    /**
     * Lista los mapas favoritos del usuario (los que ha likeado),
     * paginados, con los metadatos que necesita el feed: autor,
     * counts y fecha del like (`liked_at`) para ordenación.
     *
     * Filtra mapas privados ajenos: si el autor cambia un mapa a
     * privado, el like sigue en BD pero ya no debe ser accesible al
     * resto de usuarios. El propio dueño sí ve sus mapas privados
     * favoriteados — UX coherente con "guardar para luego".
     *
     * Orden: por `liked_at DESC` (lo más recientemente guardado
     * primero); tie-breaker por id de mapa descendente.
     *
     * @param int $userId
     * @param int $limit
     * @param int $offset
     * @return array
     */
    public function findFavoritesForUser($userId, $limit, $offset) {
        $sql = "SELECT m.id, m.title, m.description, m.is_public,
                       m.created_at, m.updated_at,
                       u.id          AS author_id,
                       u.name        AS author_name,
                       u.avatar_url  AS author_avatar,
                       (SELECT COUNT(*) FROM likes    WHERE map_id = m.id) AS likes_count,
                       (SELECT COUNT(*) FROM comments WHERE map_id = m.id) AS comments_count,
                       l.created_at  AS liked_at
                FROM {$this->table} l
                INNER JOIN maps  m ON m.id = l.map_id
                INNER JOIN users u ON u.id = m.user_id
                WHERE l.user_id = ?
                  AND (m.is_public = 1 OR m.user_id = ?)
                ORDER BY l.created_at DESC, m.id DESC
                LIMIT ? OFFSET ?";
        $stmt = $this->conn->prepare($sql);
        // bindValue con PARAM_INT: PDO emulado citaria los placeholders
        // de LIMIT/OFFSET como string si se pasan vía execute([...]),
        // lo que rompe la query en MySQL en modo estricto.
        $stmt->bindValue(1, $userId, PDO::PARAM_INT);
        $stmt->bindValue(2, $userId, PDO::PARAM_INT);
        $stmt->bindValue(3, $limit,  PDO::PARAM_INT);
        $stmt->bindValue(4, $offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Total de favoritos visibles del usuario (mismo filtro que
     * findFavoritesForUser, sin LIMIT). Necesario para `has_more`
     * en la paginación load-more.
     */
    public function countFavoritesForUser($userId) {
        $sql = "SELECT COUNT(*)
                FROM {$this->table} l
                INNER JOIN maps m ON m.id = l.map_id
                WHERE l.user_id = ?
                  AND (m.is_public = 1 OR m.user_id = ?)";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([$userId, $userId]);
        return (int) $stmt->fetchColumn();
    }
}
?>
