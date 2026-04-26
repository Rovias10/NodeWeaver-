<?php
/**
 * Modelo Comment — acceso a la tabla `comments` de StudyWeaver.
 *
 * Convenciones (CLAUDE.md §9 + Gemini.md §4.C):
 *   - Recibe la conexión PDO por constructor.
 *   - PDO posicional con prepared statements.
 *   - Sin lógica de presentación: validación, autorización y
 *     formato JSON viven en CommentController.
 *
 * Esquema en docs/database.md §2.4 y migración
 * backend/DATA/migrations/005_create_comments.sql.
 */
class Comment {
    private $conn;
    private $table = 'comments';

    public function __construct($db) {
        $this->conn = $db;
    }

    /**
     * Lista los comentarios de un mapa, paginados y ordenados
     * cronológicamente (los más antiguos arriba — UX coherente con
     * "leer la conversación"). JOIN con `users` para que el frontend
     * no tenga que hacer una llamada por comentario para resolver
     * autor.
     *
     * @return array Filas con: id, body, created_at, updated_at,
     *               author_id, author_name, author_avatar.
     */
    public function findByMap($mapId, $limit, $offset) {
        $sql = "SELECT c.id, c.body, c.created_at, c.updated_at,
                       u.id          AS author_id,
                       u.name        AS author_name,
                       u.avatar_url  AS author_avatar
                FROM {$this->table} c
                INNER JOIN users u ON u.id = c.user_id
                WHERE c.map_id = ?
                ORDER BY c.created_at ASC, c.id ASC
                LIMIT ? OFFSET ?";
        $stmt = $this->conn->prepare($sql);
        $stmt->bindValue(1, $mapId,  PDO::PARAM_INT);
        $stmt->bindValue(2, $limit,  PDO::PARAM_INT);
        $stmt->bindValue(3, $offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** Total de comentarios de un mapa (para `has_more` en paginación). */
    public function countByMap($mapId) {
        $stmt = $this->conn->prepare(
            "SELECT COUNT(*) FROM {$this->table} WHERE map_id = ?"
        );
        $stmt->execute([$mapId]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Devuelve la fila del comentario indicado SI el usuario está
     * autorizado a borrarlo: es el autor del comentario o el dueño
     * del mapa al que pertenece. Devuelve false en cualquier otro
     * caso, incluido "no existe" (mismo trato → 404 sin filtrar
     * existencia).
     *
     * Diseño: una sola query con la autorización en el WHERE evita
     * dos viajes a la BD y deja el control en SQL.
     *
     * @return array|false  {id, map_id, user_id, body} o false.
     */
    public function findByIdForUserOrMapOwner($commentId, $userId) {
        $sql = "SELECT c.id, c.map_id, c.user_id, c.body
                FROM {$this->table} c
                INNER JOIN maps m ON m.id = c.map_id
                WHERE c.id = ?
                  AND (c.user_id = ? OR m.user_id = ?)
                LIMIT 1";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([$commentId, $userId, $userId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * Inserta un comentario. El controller ya validó body y mapa.
     *
     * @return string|false Id insertado o false.
     */
    public function create($mapId, $userId, $body) {
        $sql = "INSERT INTO {$this->table} (map_id, user_id, body)
                VALUES (?, ?, ?)";
        $stmt = $this->conn->prepare($sql);
        if ($stmt->execute([$mapId, $userId, $body])) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    /**
     * Borra el comentario indicado. La autorización la hace el
     * controller con findByIdForUserOrMapOwner antes de llamar
     * aquí. Devuelve true si se eliminó una fila.
     */
    public function delete($commentId) {
        $sql = "DELETE FROM {$this->table} WHERE id = ?";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([$commentId]);
        return $stmt->rowCount() > 0;
    }

    /**
     * Devuelve un comentario con el autor JOINed (mismo formato que
     * findByMap). Lo usa el controller tras crear() para devolverlo
     * al cliente sin un round-trip extra.
     *
     * @return array|false
     */
    public function findByIdWithAuthor($commentId) {
        $sql = "SELECT c.id, c.body, c.created_at, c.updated_at,
                       u.id         AS author_id,
                       u.name       AS author_name,
                       u.avatar_url AS author_avatar
                FROM {$this->table} c
                INNER JOIN users u ON u.id = c.user_id
                WHERE c.id = ?
                LIMIT 1";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([$commentId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }
}
?>
