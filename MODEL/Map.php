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
     * @return string|false
     */
    public function create($userId, $title, $description, $isPublic, $drawflowJson) {
        $query = "INSERT INTO {$this->table}
                  (user_id, title, description, is_public, drawflow_json)
                  VALUES (?, ?, ?, ?, ?)";
        $stmt = $this->conn->prepare($query);
        if ($stmt->execute([$userId, $title, $description, $isPublic, $drawflowJson])) {
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
}
?>
