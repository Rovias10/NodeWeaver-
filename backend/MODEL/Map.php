<?php
/**
 * Modelo Map — acceso a la tabla `maps` de StudyWeaver.
 *
 * Convenciones (CLAUDE.md §9):
 *   - Recibe la conexión PDO por constructor.
 *   - Cada método público ejecuta UNA operación SQL con prepared statement
 *     posicional (?). Sin lógica de negocio: validación y formateo viven
 *     en MapController.
 *   - Todos los métodos de lectura/escritura filtran por user_id cuando
 *     la operación es propietaria del usuario (anti-IDOR a nivel de
 *     query, no sólo en el controller).
 *
 * Esquema de la tabla en DATA/database_context.md §2.2 y migración
 * DATA/migrations/002_create_maps.sql.
 */
class Map {
    private $conn;
    private $table = 'maps';

    public function __construct($db) {
        $this->conn = $db;
    }

    /**
     * Devuelve la lista de mapas del usuario, ordenados por última edición.
     * Excluye el campo `drawflow_json` para que el listado del dashboard
     * sea ligero (un mapa puede pesar decenas de KB).
     *
     * @param int $userId
     * @return array Filas asociativas con: id, title, description, is_public, created_at, updated_at.
     */
    public function findByUser($userId) {
        $query = "SELECT id, title, description, is_public, created_at, updated_at
                  FROM {$this->table}
                  WHERE user_id = ?
                  ORDER BY updated_at DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([$userId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Busca un mapa concreto que pertenezca al usuario indicado.
     * Devuelve la fila completa (incluido drawflow_json) o false si no
     * existe o pertenece a otro usuario. La condición compuesta
     * (id + user_id) cierra la puerta a IDOR a nivel de query.
     *
     * @param int $id      Id del mapa.
     * @param int $userId  Id del usuario propietario.
     * @return array|false
     */
    public function findByIdForUser($id, $userId) {
        $query = "SELECT id, title, description, is_public, drawflow_json, created_at, updated_at
                  FROM {$this->table}
                  WHERE id = ? AND user_id = ?
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([$id, $userId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * Inserta un mapa nuevo. Devuelve el id insertado (string) o false
     * si la inserción falla.
     *
     * @param int         $userId
     * @param string      $title
     * @param string|null $description
     * @param int         $isPublic       0 ó 1.
     * @param string|null $drawflowJson   String JSON ya validado por el controller.
     * @param int|null    $sourceNoteId   FK opcional al apunte de origen
     *                                    (rama IA_Integration, columna
     *                                    `maps.source_note_id` con ON
     *                                    DELETE SET NULL). NULL para
     *                                    mapas creados a mano sin apunte.
     * @return string|false
     */
    public function create($userId, $title, $description, $isPublic, $drawflowJson, $sourceNoteId = null) {
        $query = "INSERT INTO {$this->table}
                  (user_id, source_note_id, title, description, is_public, drawflow_json)
                  VALUES (?, ?, ?, ?, ?, ?)";
        $stmt = $this->conn->prepare($query);
        if ($stmt->execute([$userId, $sourceNoteId, $title, $description, $isPublic, $drawflowJson])) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    /**
     * Actualiza los campos editables de un mapa del usuario. Devuelve
     * el resultado de execute() (true en éxito). Importante: NO usa
     * rowCount() como criterio de éxito porque MySQL devuelve 0 cuando
     * los datos coinciden con los ya almacenados (caso típico de
     * auto-save sin cambios visibles); el controller verifica la
     * existencia previa con findByIdForUser() antes de llamar a update.
     *
     * @return bool
     */
    public function update($id, $userId, $title, $description, $isPublic, $drawflowJson) {
        $query = "UPDATE {$this->table}
                  SET title = ?, description = ?, is_public = ?, drawflow_json = ?
                  WHERE id = ? AND user_id = ?";
        $stmt = $this->conn->prepare($query);
        return $stmt->execute([$title, $description, $isPublic, $drawflowJson, $id, $userId]);
    }

    /**
     * Elimina un mapa del usuario. Devuelve true si se borró una fila,
     * false si el mapa no existía o no pertenecía al usuario (en ambos
     * casos, rowCount() == 0). El controller traduce ese false a 404.
     *
     * @return bool
     */
    public function delete($id, $userId) {
        $query = "DELETE FROM {$this->table} WHERE id = ? AND user_id = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([$id, $userId]);
        return $stmt->rowCount() > 0;
    }

    /**
     * Cuenta cuántos mapas tiene el usuario. Métrica para el panel
     * de inicio (`GET dashboard/stats`). Filtra por user_id en la
     * query (anti-IDOR a nivel de BD); el COUNT siempre devuelve
     * un entero, así que se castea sin necesidad de fallback.
     *
     * @param int $userId
     * @return int
     */
    public function countByUser($userId) {
        $stmt = $this->conn->prepare(
            "SELECT COUNT(*) FROM {$this->table} WHERE user_id = ?"
        );
        $stmt->execute([$userId]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Lee el updated_at actual del mapa. Lo usa el controller tras un
     * save() para devolver al frontend la marca de tiempo definitiva
     * (la calculó el ON UPDATE CURRENT_TIMESTAMP de la tabla).
     *
     * @return string|null Cadena en formato MySQL "Y-m-d H:i:s" o null.
     */
    public function getUpdatedAt($id) {
        $query = "SELECT updated_at FROM {$this->table} WHERE id = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row['updated_at'] ?? null;
    }

    // ──────────────────────────────────────────────────────────────────
    // Métodos para la capa social (Fase Comunidad · C1).
    //
    // A diferencia de findByIdForUser, estos NO filtran por user_id
    // de propietario: sirven mapas con `is_public = 1` a cualquier
    // usuario autenticado y enriquecen la fila con autor + counts +
    // liked_by_me. El filtro de seguridad ahora es `is_public`, no
    // ownership.
    // ──────────────────────────────────────────────────────────────────

    /**
     * Lookup mínimo por id, sin filtro de ownership ni de is_public.
     * Devuelve sólo {id, user_id, is_public}. Lo usan los controllers
     * de la capa social (LikeController, CommentController) para
     * decidir autorización en una sola query antes de actuar.
     *
     * Importante: NO usar para servir datos al cliente — es un helper
     * interno. Las lecturas con datos sensibles van por findByIdForUser
     * o findPublicByIdWithMeta según el caso.
     *
     * @return array|false
     */
    public function findBasicById($id) {
        $stmt = $this->conn->prepare(
            "SELECT id, user_id, is_public FROM {$this->table} WHERE id = ? LIMIT 1"
        );
        $stmt->execute([$id]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * Mapas públicos para el feed comunidad. Soporta ordenación,
     * búsqueda simple y paginación posicional.
     *
     *   sort = 'recent'  → updated_at DESC (default).
     *   sort = 'popular' → (likes_count + comments_count) DESC,
     *                      tie-breaker updated_at DESC.
     *   q              → filtro `LIKE '%q%'` sobre title o description
     *                    (vacío = sin filtro).
     *
     * Decisión de la fórmula "popular" (defendible ante tribunal):
     * sumamos likes y comentarios sin ponderar para tratar ambas
     * señales de interacción como equivalentes. Un like y un
     * comentario son los dos compromisos sociales que ofrece la
     * plataforma; ponderar uno sobre otro requeriría datos de uso que
     * todavía no tenemos. El tie-break por `updated_at DESC` evita
     * orden aleatorio entre mapas con la misma actividad y favorece
     * los más vivos. Los alias `likes_count` / `comments_count` se
     * pueden usar en ORDER BY (MySQL los resuelve tras el SELECT)
     * pero no en WHERE, por eso aquí no hay filtro adicional.
     *
     * Excluye `drawflow_json` (la lista del feed sería pesada). El
     * detalle del mapa se sirve por findPublicByIdWithMeta.
     *
     * @return array Filas con: id, title, description, is_public,
     *               created_at, updated_at, author_id, author_name,
     *               author_avatar, likes_count, comments_count,
     *               liked_by_me (0/1).
     */
    public function findPublicForFeed($currentUserId, $sort, $q, $limit, $offset) {
        $sortSql = ($sort === 'popular')
            ? '(likes_count + comments_count) DESC, m.updated_at DESC'
            : 'm.updated_at DESC';

        $hasQ   = ($q !== null && $q !== '');
        $whereQ = $hasQ ? 'AND (m.title LIKE ? OR m.description LIKE ?)' : '';

        $sql = "SELECT m.id, m.title, m.description, m.is_public,
                       m.created_at, m.updated_at,
                       u.id          AS author_id,
                       u.name        AS author_name,
                       u.avatar_url  AS author_avatar,
                       (SELECT COUNT(*) FROM likes    WHERE map_id = m.id) AS likes_count,
                       (SELECT COUNT(*) FROM comments WHERE map_id = m.id) AS comments_count,
                       EXISTS (SELECT 1 FROM likes WHERE map_id = m.id AND user_id = ?) AS liked_by_me
                FROM {$this->table} m
                INNER JOIN users u ON u.id = m.user_id
                WHERE m.is_public = 1
                {$whereQ}
                ORDER BY {$sortSql}
                LIMIT ? OFFSET ?";

        $stmt = $this->conn->prepare($sql);
        $idx = 1;
        $stmt->bindValue($idx++, $currentUserId, PDO::PARAM_INT);
        if ($hasQ) {
            $like = '%' . $q . '%';
            $stmt->bindValue($idx++, $like, PDO::PARAM_STR);
            $stmt->bindValue($idx++, $like, PDO::PARAM_STR);
        }
        $stmt->bindValue($idx++, $limit,  PDO::PARAM_INT);
        $stmt->bindValue($idx++, $offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Total de mapas públicos que coinciden con el filtro `q`.
     * Necesario para `has_more` en la paginación load-more.
     */
    public function countPublicForFeed($q) {
        $hasQ   = ($q !== null && $q !== '');
        $whereQ = $hasQ ? 'AND (title LIKE ? OR description LIKE ?)' : '';
        $sql = "SELECT COUNT(*) FROM {$this->table}
                WHERE is_public = 1 {$whereQ}";
        $stmt = $this->conn->prepare($sql);
        if ($hasQ) {
            $like = '%' . $q . '%';
            $stmt->execute([$like, $like]);
        } else {
            $stmt->execute();
        }
        return (int) $stmt->fetchColumn();
    }

    /**
     * Mapa público completo (incluye drawflow_json) más metadatos:
     * autor, counts y liked_by_me. Devuelve false si el mapa no
     * existe o si `is_public = 0` — el controller traduce a 404 con
     * el mismo mensaje en ambos casos para no filtrar la existencia
     * de mapas privados ajenos.
     *
     * @return array|false
     */
    public function findPublicByIdWithMeta($mapId, $currentUserId) {
        $sql = "SELECT m.id, m.title, m.description, m.is_public, m.drawflow_json,
                       m.created_at, m.updated_at,
                       m.user_id     AS owner_user_id,
                       u.id          AS author_id,
                       u.name        AS author_name,
                       u.avatar_url  AS author_avatar,
                       (SELECT COUNT(*) FROM likes    WHERE map_id = m.id) AS likes_count,
                       (SELECT COUNT(*) FROM comments WHERE map_id = m.id) AS comments_count,
                       EXISTS (SELECT 1 FROM likes WHERE map_id = m.id AND user_id = ?) AS liked_by_me
                FROM {$this->table} m
                INNER JOIN users u ON u.id = m.user_id
                WHERE m.id = ? AND m.is_public = 1
                LIMIT 1";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([$currentUserId, $mapId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * Mapas públicos del autor indicado, paginados, ordenados por
     * última edición. Misma forma de fila que findPublicForFeed.
     */
    public function findPublicByUser($currentUserId, $authorUserId, $limit, $offset) {
        $sql = "SELECT m.id, m.title, m.description, m.is_public,
                       m.created_at, m.updated_at,
                       u.id          AS author_id,
                       u.name        AS author_name,
                       u.avatar_url  AS author_avatar,
                       (SELECT COUNT(*) FROM likes    WHERE map_id = m.id) AS likes_count,
                       (SELECT COUNT(*) FROM comments WHERE map_id = m.id) AS comments_count,
                       EXISTS (SELECT 1 FROM likes WHERE map_id = m.id AND user_id = ?) AS liked_by_me
                FROM {$this->table} m
                INNER JOIN users u ON u.id = m.user_id
                WHERE m.user_id = ? AND m.is_public = 1
                ORDER BY m.updated_at DESC, m.id DESC
                LIMIT ? OFFSET ?";
        $stmt = $this->conn->prepare($sql);
        $stmt->bindValue(1, $currentUserId, PDO::PARAM_INT);
        $stmt->bindValue(2, $authorUserId,  PDO::PARAM_INT);
        $stmt->bindValue(3, $limit,         PDO::PARAM_INT);
        $stmt->bindValue(4, $offset,        PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Total de mapas públicos del autor (perfil público + paginación).
     */
    public function countPublicByUser($authorUserId) {
        $stmt = $this->conn->prepare(
            "SELECT COUNT(*) FROM {$this->table}
             WHERE user_id = ? AND is_public = 1"
        );
        $stmt->execute([$authorUserId]);
        return (int) $stmt->fetchColumn();
    }
}
?>
