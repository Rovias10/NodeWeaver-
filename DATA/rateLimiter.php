<?php
/**
 * RateLimiter — limitador de peticiones con ventana fija por minuto.
 *
 * Implementación:
 *   - Tabla `rate_limits` con clave compuesta (key, window_start).
 *   - Ventana de 60 segundos alineada a `YYYY-MM-DD HH:MM:00`.
 *   - Cada `check(key, max)` hace INSERT ... ON DUPLICATE KEY UPDATE y
 *     devuelve `true` si la cuenta aún cabe en el límite, `false` si ya
 *     lo superó.
 *   - Purga filas antiguas (> 1 hora) cada 50 llamadas para mantener
 *     la tabla pequeña sin cron externo.
 *
 * Ventajas frente a APCu/Redis:
 *   - No requiere extensiones adicionales (PDO bastante).
 *   - Compartido entre procesos PHP (XAMPP/FPM-pool agnostico).
 *   - Sobrevive reinicios.
 *
 * Desventajas:
 *   - 1 INSERT/UPDATE por petición. Aceptable para endpoints de callback
 *     (webhook → n8n → report-log) donde el volumen es moderado.
 *     Para endpoints de alta frecuencia (>100 QPS) conviene migrar a
 *     Redis o a un bucket en memoria compartida.
 */
class RateLimiter {
    /** @var PDO */
    private $db;
    /** @var int */
    private static $callCounter = 0;

    public function __construct(PDO $db) {
        $this->db = $db;
        self::ensureSchema($db);
    }

    /**
     * Crea la tabla si no existe. Idempotente.
     * Se llama una sola vez por instancia de PHP (request) gracias al flag estático.
     */
    private static function ensureSchema(PDO $db): void {
        static $ensured = false;
        if ($ensured) return;
        $db->exec(
            "CREATE TABLE IF NOT EXISTS rate_limits (
                rl_key        VARCHAR(128) NOT NULL,
                window_start  DATETIME     NOT NULL,
                counter       INT UNSIGNED NOT NULL DEFAULT 0,
                updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (rl_key, window_start),
                KEY idx_window (window_start)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
        $ensured = true;
    }

    /**
     * Comprueba y consume una cuota.
     *
     * @param string $key   Clave lógica (p.ej. 'report-log:127.0.0.1' o 'login:email@x').
     * @param int    $max   Peticiones permitidas por minuto.
     * @return array{
     *     allowed:bool,
     *     remaining:int,
     *     retry_after_seconds:int,
     *     current_count:int
     * }
     */
    public function check(string $key, int $max): array {
        if ($max <= 0) $max = 1;

        // Ventana fija alineada al minuto (UTC local del servidor).
        $windowStart = date('Y-m-d H:i:00');

        // UPSERT atómico: incrementa o crea la fila.
        $stmt = $this->db->prepare(
            "INSERT INTO rate_limits (rl_key, window_start, counter)
             VALUES (:k, :w, 1)
             ON DUPLICATE KEY UPDATE counter = counter + 1"
        );
        $stmt->execute([':k' => $key, ':w' => $windowStart]);

        // Leer el valor resultante del contador.
        $sel = $this->db->prepare(
            "SELECT counter FROM rate_limits WHERE rl_key = :k AND window_start = :w"
        );
        $sel->execute([':k' => $key, ':w' => $windowStart]);
        $count = (int) ($sel->fetchColumn() ?: 1);

        // Purga periódica de ventanas antiguas para no inflar la tabla.
        self::$callCounter++;
        if (self::$callCounter % 50 === 0) {
            $this->db->exec(
                "DELETE FROM rate_limits WHERE window_start < (NOW() - INTERVAL 1 HOUR)"
            );
        }

        $allowed   = $count <= $max;
        $remaining = max(0, $max - $count);
        // Segundos hasta el próximo minuto.
        $retryAfter = $allowed ? 0 : (60 - (int) date('s'));

        return [
            'allowed'             => $allowed,
            'remaining'           => $remaining,
            'retry_after_seconds' => $retryAfter,
            'current_count'       => $count,
        ];
    }

    /**
     * Helper que aborta con HTTP 429 si la cuota está agotada.
     * Envía cabeceras estándar `Retry-After` y `X-RateLimit-*`.
     */
    public function enforce(string $key, int $max): void {
        $r = $this->check($key, $max);

        // Cabeceras informativas — cliente las puede leer en cada request.
        // Usamos @ para silenciar warnings si ya hubo output (CLI/tests).
        if (!headers_sent()) {
            @header('X-RateLimit-Limit: ' . $max);
            @header('X-RateLimit-Remaining: ' . $r['remaining']);
        }

        if (!$r['allowed']) {
            if (!headers_sent()) @header('Retry-After: ' . $r['retry_after_seconds']);
            http_response_code(429);
            echo json_encode([
                'success'     => false,
                'message'     => 'Rate limit excedido. Espera ' . $r['retry_after_seconds'] . 's.',
                'limit'       => $max,
                'retry_after' => $r['retry_after_seconds'],
            ]);
            exit;
        }
    }
}
?>
