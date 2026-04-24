<?php
require_once __DIR__ . '/../DATA/database.php';

class Automation {
    private $conn;
    private $table_name = "automations";

    public $id;
    public $user_id;
    public $name;
    public $flow_data;
    public $is_active;
    public $created_at;
    public $updated_at;

    public function __construct($db) {
        $this->conn = $db;
    }

    public function getByUser($userId) {
        $query = "SELECT * FROM " . $this->table_name . " WHERE user_id = :user_id ORDER BY updated_at DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':user_id', $userId);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getById($id, $userId) {
        $query = "SELECT * FROM " . $this->table_name . " WHERE id = :id AND user_id = :user_id LIMIT 0,1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':id', $id);
        $stmt->bindParam(':user_id', $userId);
        $stmt->execute();
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function create($userId, $name, $flowData) {
        $query = "INSERT INTO " . $this->table_name . " SET user_id=:user_id, name=:name, flow_data=:flow_data, is_active=1";
        $stmt = $this->conn->prepare($query);

        $stmt->bindParam(':user_id', $userId);
        $stmt->bindParam(':name', $name);
        $stmt->bindParam(':flow_data', $flowData);

        if($stmt->execute()) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    public function update($id, $userId, $name, $flowData, $isActive) {
        $query = "UPDATE " . $this->table_name . " 
                 SET name=:name, flow_data=:flow_data, is_active=:is_active 
                 WHERE id=:id AND user_id=:user_id";
        $stmt = $this->conn->prepare($query);

        $stmt->bindParam(':id', $id);
        $stmt->bindParam(':user_id', $userId);
        $stmt->bindParam(':name', $name);
        $stmt->bindParam(':flow_data', $flowData);
        $stmt->bindParam(':is_active', $isActive);

        return $stmt->execute();
    }

    public function delete($id, $userId) {
        $query = "DELETE FROM " . $this->table_name . " WHERE id=:id AND user_id=:user_id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':id', $id);
        $stmt->bindParam(':user_id', $userId);
        return $stmt->execute();
    }

    // =============================================================
    //  Puente n8n — métodos añadidos en Fase 4
    // =============================================================

    /**
     * Actualiza las 4 columnas puente (n8n_workflow_id, n8n_sync_status,
     * n8n_sync_error, n8n_last_sync_at) tras un push a n8n.
     *
     * @param int         $id              id local de la automation
     * @param int         $userId          dueño (anti-IDOR)
     * @param string|null $n8nWorkflowId   id devuelto por n8n (null si falló)
     * @param string      $status          'unsynced'|'syncing'|'synced'|'error'
     * @param string|null $error           mensaje de error (solo si status='error')
     */
    public function updateN8nBinding($id, $userId, $n8nWorkflowId, $status, $error = null) {
        $query = "UPDATE " . $this->table_name . "
                     SET n8n_workflow_id = :wfid,
                         n8n_sync_status = :status,
                         n8n_sync_error  = :err,
                         n8n_last_sync_at = CASE WHEN :status2 = 'synced' THEN CURRENT_TIMESTAMP ELSE n8n_last_sync_at END
                   WHERE id = :id AND user_id = :user_id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':wfid',    $n8nWorkflowId);
        $stmt->bindValue(':status',  $status);
        $stmt->bindValue(':status2', $status);
        $stmt->bindValue(':err',     $error);
        $stmt->bindValue(':id',      $id, PDO::PARAM_INT);
        $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
        return $stmt->execute();
    }

    /** Devuelve el n8n_workflow_id vinculado a una automation del usuario. */
    public function getN8nWorkflowId($id, $userId) {
        $query = "SELECT n8n_workflow_id FROM " . $this->table_name . "
                   WHERE id = :id AND user_id = :user_id LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':id',      $id, PDO::PARAM_INT);
        $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? $row['n8n_workflow_id'] : null;
    }

    /**
     * Sincroniza la tabla `webhooks` con las URLs reales que devuelve n8n.
     * Estrategia: DELETE + INSERT en transacción (es atómico y gestiona
     * altas, bajas y cambios de slug sin lógica de diff).
     *
     * @param int   $automationId
     * @param int   $userId
     * @param array $urls  Output de N8nClient::getWebhookUrls()
     *                     [{name, path, url, http_method}, ...]
     * @return array       Filas insertadas con sus secretos generados.
     */
    public function syncWebhooks($automationId, $userId, array $urls) {
        $this->conn->beginTransaction();
        try {
            $del = $this->conn->prepare("DELETE FROM webhooks WHERE automation_id = :aid AND user_id = :uid");
            $del->execute([':aid' => $automationId, ':uid' => $userId]);

            $ins = $this->conn->prepare(
                "INSERT INTO webhooks (automation_id, user_id, slug, http_method, secret, is_active)
                 VALUES (:aid, :uid, :slug, :method, :secret, 1)"
            );

            $inserted = [];
            foreach ($urls as $u) {
                $secret = bin2hex(random_bytes(32));
                $ins->execute([
                    ':aid'    => $automationId,
                    ':uid'    => $userId,
                    ':slug'   => $u['path'],
                    ':method' => $u['http_method'],
                    ':secret' => $secret,
                ]);
                $inserted[] = [
                    'slug'        => $u['path'],
                    'url'         => $u['url'],
                    'http_method' => $u['http_method'],
                    'secret'      => $secret,
                    'node_name'   => $u['name'] ?? null,
                ];
            }
            $this->conn->commit();
            return $inserted;
        } catch (Throwable $e) {
            $this->conn->rollBack();
            throw $e;
        }
    }

    /** Lista los webhooks de una automation del usuario.*/
    public function getWebhooksByAutomation($automationId, $userId) {
        $query = "SELECT id, slug, http_method, is_active, last_triggered_at, trigger_count
                    FROM webhooks
                   WHERE automation_id = :aid AND user_id = :uid
                   ORDER BY id ASC";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':aid', $automationId, PDO::PARAM_INT);
        $stmt->bindValue(':uid', $userId,       PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Actualiza last_run_at/last_run_status + incrementa contadores.
     * Llamado al disparar y al cerrar cada ejecución.
     *
     * @param int    $id
     * @param string $status  success|error|running|timeout
     */
    public function touchLastRun($id, $status) {
        $errIncr = ($status === 'error' || $status === 'timeout') ? 1 : 0;
        $sql = "UPDATE " . $this->table_name . "
                   SET last_run_at     = CURRENT_TIMESTAMP,
                       last_run_status = :s,
                       total_runs      = total_runs + 1,
                       total_errors    = total_errors + :e
                 WHERE id = :id";
        $stmt = $this->conn->prepare($sql);
        $stmt->bindValue(':s',  $status);
        $stmt->bindValue(':e',  $errIncr, PDO::PARAM_INT);
        $stmt->bindValue(':id', $id,      PDO::PARAM_INT);
        return $stmt->execute();
    }

    /** Cambia el is_active local. El push a n8n lo hace el controller. */
    public function setActive($id, $userId, $isActive) {
        $query = "UPDATE " . $this->table_name . "
                     SET is_active = :a
                   WHERE id = :id AND user_id = :user_id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':a',       $isActive ? 1 : 0, PDO::PARAM_INT);
        $stmt->bindValue(':id',      $id, PDO::PARAM_INT);
        $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
        return $stmt->execute();
    }
}
?>
