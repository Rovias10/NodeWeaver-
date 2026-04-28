<?php
/**
 * Modelo Note — acceso a la tabla `notes` (Fase Notes / Apuntes).
 *
 * Convenciones (CLAUDE.md §9):
 *   - Recibe la conexión PDO por constructor.
 *   - Cada método público ejecuta UNA operación SQL con prepared
 *     statement posicional (?). Sin lógica de negocio: validación y
 *     formateo viven en NoteController.
 *   - Todos los métodos filtran por user_id cuando la operación es
 *     propietaria del usuario (anti-IDOR a nivel de query, no sólo
 *     en el controller).
 *
 * Esquema de la tabla en docs/database.md §3.2 y migración
 * backend/DATA/migrations/007_create_notes.sql.
 */
class Note {
    private $conn;
    private $table = 'notes';

    public function __construct($db) {
        $this->conn = $db;
    }

    /**
     * Lista los apuntes del usuario, ordenados por última edición.
     * Excluye `extracted_text` y `file_path` (datos pesados o internos)
     * para que el listado del menú "Mis apuntes" sea ligero.
     *
     * @param int $userId
     * @return array Filas asociativas con: id, title, source_type,
     *               char_count, original_filename, created_at, updated_at.
     */
    public function findByUser($userId) {
        $sql = "SELECT id, title, source_type, char_count,
                       original_filename, created_at, updated_at
                FROM {$this->table}
                WHERE user_id = ?
                ORDER BY updated_at DESC";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([$userId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Busca un apunte concreto que pertenezca al usuario indicado.
     * Devuelve la fila completa (incluye `extracted_text` y `file_path`)
     * o false si no existe o pertenece a otro usuario. La condición
     * compuesta (id + user_id) cierra la puerta a IDOR a nivel de
     * query, no sólo en el controller.
     *
     * @return array|false
     */
    public function findByIdForUser($id, $userId) {
        $sql = "SELECT id, user_id, title, source_type, original_filename,
                       file_path, extracted_text, char_count,
                       created_at, updated_at
                FROM {$this->table}
                WHERE id = ? AND user_id = ?
                LIMIT 1";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([$id, $userId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * Inserta un apunte nuevo. Devuelve el id insertado (string) o
     * false si la inserción falla.
     *
     * Para apuntes 'pdf': $extractedText queda NULL (la fase IA decidirá
     * si Gemini cachea texto). Para 'text', $extractedText es el body
     * íntegro pegado por el alumno.
     *
     * @param int         $userId
     * @param string      $title
     * @param string      $sourceType        'pdf' | 'text' (markdown reservado).
     * @param string|null $originalFilename  Nombre original del PDF subido. NULL en text.
     * @param string|null $filePath          Ruta relativa bajo backend/uploads/. NULL en text.
     * @param string|null $extractedText     Body íntegro del apunte (text). NULL en pdf.
     * @param int         $charCount         Longitud informativa del extracted_text.
     * @return string|false
     */
    public function create($userId, $title, $sourceType, $originalFilename, $filePath, $extractedText, $charCount) {
        $sql = "INSERT INTO {$this->table}
                (user_id, title, source_type, original_filename,
                 file_path, extracted_text, char_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)";
        $stmt = $this->conn->prepare($sql);
        if ($stmt->execute([$userId, $title, $sourceType, $originalFilename,
                            $filePath, $extractedText, $charCount])) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    /**
     * Elimina un apunte del usuario. Devuelve true si se borró una
     * fila, false si el apunte no existía o pertenecía a otro usuario.
     * El controller traduce ese false a 404. NO borra el archivo
     * físico — eso lo gestiona el controller con `unlink()` después
     * de leer `file_path` con findByIdForUser.
     */
    public function delete($id, $userId) {
        $sql = "DELETE FROM {$this->table} WHERE id = ? AND user_id = ?";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([$id, $userId]);
        return $stmt->rowCount() > 0;
    }

    /**
     * Lee el `updated_at` actual del apunte. Lo usa el controller
     * tras un upload para devolver al frontend la marca de tiempo
     * definitiva (la calculó el ON UPDATE CURRENT_TIMESTAMP).
     */
    public function getUpdatedAt($id) {
        $sql = "SELECT updated_at FROM {$this->table} WHERE id = ?";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row['updated_at'] ?? null;
    }
}
?>
