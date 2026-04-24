<?php
/**
 * ExecutionLog
 * ------------------------------------------------------------------
 * Entidad de alto volumen: una fila por corrida de workflow.
 * La crea AutomationController::execute() (Fase 5) como `queued/running`
 * y la cierra el callback Response Manager (Fase 6) con status final.
 *
 * Schema: ver §2.6 de DATA/database_context.md
 */
class ExecutionLog {
    private $conn;
    private $table = 'execution_logs';

    public function __construct($db) {
        $this->conn = $db;
    }

    /**
     * Crea una fila `queued`. Devuelve el id.
     *
     * @param int         $automationId
     * @param int         $userId
     * @param string      $triggerSource  manual|webhook|schedule|api|retry
     * @param string|null $triggerReference  id webhook / cron / run padre
     * @param array|null  $inputPayload
     * @param int         $nodesTotal
     */
    public function create(
        int $automationId,
        int $userId,
        string $triggerSource,
        ?string $triggerReference,
        ?array $inputPayload,
        int $nodesTotal
    ): int {
        $sql = "INSERT INTO {$this->table}
                (automation_id, user_id, trigger_source, trigger_reference,
                 status, input_payload, nodes_total, started_at)
                VALUES
                (:aid, :uid, :ts, :tref, 'queued', :payload, :ntot, CURRENT_TIMESTAMP(3))";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([
            ':aid'     => $automationId,
            ':uid'     => $userId,
            ':ts'      => $triggerSource,
            ':tref'    => $triggerReference,
            ':payload' => $inputPayload !== null ? json_encode($inputPayload, JSON_UNESCAPED_UNICODE) : null,
            ':ntot'    => $nodesTotal,
        ]);
        return (int) $this->conn->lastInsertId();
    }

    /** Pasa a `running` y guarda el n8n_execution_id si ya lo conocemos. */
    public function markRunning(int $id, ?string $n8nExecutionId = null): bool {
        $sql = "UPDATE {$this->table}
                   SET status = 'running',
                       n8n_execution_id = COALESCE(:neid, n8n_execution_id)
                 WHERE id = :id";
        $stmt = $this->conn->prepare($sql);
        return $stmt->execute([':neid' => $n8nExecutionId, ':id' => $id]);
    }

    /** Cierra la ejecución con un status final (success|error|timeout|cancelled). */
    public function finalize(int $id, string $status, array $fields = []): bool {
        $allowed = ['output_payload', 'error_message', 'error_node_id',
                    'duration_ms', 'nodes_executed', 'n8n_execution_id'];
        $set = ['status = :status', 'completed_at = CURRENT_TIMESTAMP(3)'];
        $params = [':status' => $status, ':id' => $id];

        foreach ($fields as $k => $v) {
            if (!in_array($k, $allowed, true)) continue;
            if ($k === 'output_payload' && is_array($v)) {
                $v = json_encode($v, JSON_UNESCAPED_UNICODE);
            }
            $set[]            = "$k = :$k";
            $params[":$k"]    = $v;
        }

        $sql = "UPDATE {$this->table} SET " . implode(', ', $set) . " WHERE id = :id";
        return $this->conn->prepare($sql)->execute($params);
    }

    /** Lectura rápida por id (scoping por user anti-IDOR). */
    public function getById(int $id, int $userId): ?array {
        $sql = "SELECT * FROM {$this->table} WHERE id = :id AND user_id = :uid LIMIT 1";
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([':id' => $id, ':uid' => $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /**
     * Lista paginada por usuario para el dashboard de logs (Fase 6/7).
     * @param int    $userId
     * @param string $filter  'all' | 'success' | 'error' | ...
     * @param int    $limit
     */
    public function listByUser(int $userId, string $filter = 'all', int $limit = 50): array {
        $sql = "SELECT el.*, a.name AS automation_name
                  FROM {$this->table} el
             LEFT JOIN automations a ON a.id = el.automation_id
                 WHERE el.user_id = :uid";
        $params = [':uid' => $userId];

        if ($filter !== 'all') {
            $sql            .= " AND el.status = :st";
            $params[':st']   = $filter;
        }

        $sql .= " ORDER BY el.started_at DESC LIMIT " . max(1, min(500, $limit));
        $stmt = $this->conn->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Upsert diario en `automation_stats`. Llamado por reportLog() al cerrar
     * cada ejecución. Mantiene runs_success/error/timeout, total/avg/max
     * duration_ms. La uniqueness se asume en (automation_id, stats_date).
     */
    public function upsertDailyStats(
        int $automationId,
        int $userId,
        string $status,
        int $durationMs
    ): bool {
        $col = match ($status) {
            'success'   => 'runs_success',
            'timeout'   => 'runs_timeout',
            default     => 'runs_error',
        };

        // Patrón "one-query" con ON DUPLICATE KEY UPDATE que recalcula la media.
        $sql = "INSERT INTO automation_stats
                  (automation_id, user_id, stats_date,
                   runs_success, runs_error, runs_timeout, runs_total,
                   total_duration_ms, max_duration_ms, avg_duration_ms)
                VALUES
                  (:aid, :uid, CURDATE(),
                   :succ, :err, :tmo, 1,
                   :dur, :dur, :dur)
                ON DUPLICATE KEY UPDATE
                  $col              = $col + 1,
                  runs_total        = runs_total + 1,
                  total_duration_ms = total_duration_ms + VALUES(total_duration_ms),
                  max_duration_ms   = GREATEST(max_duration_ms, VALUES(max_duration_ms)),
                  avg_duration_ms   = (total_duration_ms + VALUES(total_duration_ms)) / (runs_total + 1)";

        $stmt = $this->conn->prepare($sql);
        return $stmt->execute([
            ':aid'  => $automationId,
            ':uid'  => $userId,
            ':succ' => $status === 'success' ? 1 : 0,
            ':err'  => ($status === 'error' || $status === 'cancelled') ? 1 : 0,
            ':tmo'  => $status === 'timeout' ? 1 : 0,
            ':dur'  => max(0, $durationMs),
        ]);
    }

    /**
     * Agregados para el dashboard (Fase 6/7): cuenta por status + duración
     * media + distribución diaria de la última semana.
     */
    public function getStatsForUser(int $userId): array {
        $counts = $this->conn->prepare(
            "SELECT status, COUNT(*) AS n
               FROM {$this->table}
              WHERE user_id = :uid
              GROUP BY status"
        );
        $counts->execute([':uid' => $userId]);
        $byStatus = ['success' => 0, 'error' => 0, 'timeout' => 0,
                     'cancelled' => 0, 'queued' => 0, 'running' => 0];
        foreach ($counts->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $byStatus[$r['status']] = (int) $r['n'];
        }

        $avg = $this->conn->prepare(
            "SELECT AVG(duration_ms) AS avg_ms
               FROM {$this->table}
              WHERE user_id = :uid AND status = 'success'"
        );
        $avg->execute([':uid' => $userId]);
        $avgMs = (int) ($avg->fetchColumn() ?: 0);

        $week = $this->conn->prepare(
            "SELECT DATE(started_at) AS d, COUNT(*) AS n
               FROM {$this->table}
              WHERE user_id = :uid
                AND started_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
              GROUP BY DATE(started_at)
              ORDER BY d ASC"
        );
        $week->execute([':uid' => $userId]);
        $daily = $week->fetchAll(PDO::FETCH_ASSOC);

        return [
            'by_status'      => $byStatus,
            'total'          => array_sum($byStatus),
            'avg_duration_ms'=> $avgMs,
            'daily'          => $daily,
        ];
    }
}
?>
