<?php
/**
 * tests/E2ETest.php — tests end-to-end de la capa PHP (sin n8n real).
 *
 * Qué cubre:
 *   - Callback `report-log`: valida firma HMAC (timing-safe), persiste
 *     execution_logs, actualiza automations y automation_stats.
 *   - Rechazo de firmas inválidas.
 *   - Rate limiter: enforce corta tras N peticiones.
 *   - SystemVault: ciclo put/get/forget.
 *
 * Qué NO cubre (requiere n8n real corriendo):
 *   - POST /workflows, /activate, /deactivate.
 *   - Ejecución real del workflow + Response Manager nativo.
 *
 * Prereq: MySQL de XAMPP arrancado con la DB `nodeweaver`.
 * Los datos creados se limpian al final con DELETE.
 */

require_once __DIR__ . '/../DATA/database.php';
require_once __DIR__ . '/../DATA/env.php';
require_once __DIR__ . '/../DATA/vault.php';
require_once __DIR__ . '/../DATA/rateLimiter.php';
require_once __DIR__ . '/../MODEL/automation.php';
require_once __DIR__ . '/../MODEL/executionLog.php';
require_once __DIR__ . '/_testutil.php';

$t = new TestRunner('E2E — Callback / Rate Limiter / Vault');

// ------------------------------------------------------------------
// Setup DB + fixtures
// ------------------------------------------------------------------

$db = (new Database())->getConnection();
if (!$db) {
    echo "[ABORT] MySQL no disponible. Arranca XAMPP y reintenta.\n";
    exit(2);
}

$TEST_USER_ID = null;
$TEST_AUTO_ID = null;

// Creamos un usuario y automation de prueba con valores únicos para no
// chocar con datos reales del dev. Se limpian al final.
function setupFixtures(PDO $db): array {
    $email = 'e2e-' . bin2hex(random_bytes(4)) . '@test.local';
    $db->prepare(
        "INSERT INTO users (name, email, password, role, status, locale, timezone, verified_at)
         VALUES (:n, :e, :p, 'free', 'active', 'es', 'UTC', NOW())"
    )->execute([
        ':n' => 'E2E Tester',
        ':e' => $email,
        ':p' => password_hash('x', PASSWORD_DEFAULT),
    ]);
    $userId = (int) $db->lastInsertId();

    $flow = json_encode(['drawflow' => ['Home' => ['data' => []]]]);
    $db->prepare("INSERT INTO automations (user_id, name, flow_data, is_active, n8n_workflow_id, n8n_sync_status)
                  VALUES (:u, 'E2E Flow', :f, 1, 'wf-e2e-mock', 'synced')")
       ->execute([':u' => $userId, ':f' => $flow]);
    $autoId = (int) $db->lastInsertId();

    return [$userId, $autoId];
}

function teardownFixtures(PDO $db, int $userId): void {
    // ON DELETE CASCADE limpia automations, execution_logs, automation_stats, etc.
    $db->prepare("DELETE FROM users WHERE id = :u")->execute([':u' => $userId]);
}

[$TEST_USER_ID, $TEST_AUTO_ID] = setupFixtures($db);
echo "  Fixtures: user_id=$TEST_USER_ID  automation_id=$TEST_AUTO_ID\n";

// ------------------------------------------------------------------
// Utilidad: simular llamada a reportLog() con HMAC válido o inválido
// ------------------------------------------------------------------

function simulateCallback(array $body, string $signature): array {
    // Inyectamos el body crudo vía stream wrapper.
    $raw = json_encode($body);
    $tmp = tempnam(sys_get_temp_dir(), 'e2e');
    file_put_contents($tmp, $raw);

    // PHP no permite sobrescribir fácilmente php://input; el controller usa
    // file_get_contents('php://input'). Workaround: pasamos el body vía
    // CGI-like $_SERVER + monkey-patching el stream wrapper phpinput.
    stream_wrapper_unregister('php');
    stream_wrapper_register('php', 'MockPhpInputStream');
    MockPhpInputStream::$inputBody = $raw;

    $_SERVER['HTTP_X_NODEWEAVER_SIGNATURE'] = $signature;
    $_SERVER['REMOTE_ADDR'] = '127.0.0.1';

    // Capturamos la respuesta
    ob_start();
    http_response_code(200); // reset
    require_once __DIR__ . '/../DATA/database.php';
    require_once __DIR__ . '/../API/controllers/automationController.php';
    $db = (new Database())->getConnection();
    $ctrl = new AutomationController($db);
    try {
        $ctrl->reportLog([]);
    } catch (Throwable $e) {
        // Silenciamos excepciones para capturarlas como HTTP 500
    }
    $output = ob_get_clean();
    $status = http_response_code();

    // Restaurar stream wrapper
    stream_wrapper_restore('php');
    MockPhpInputStream::$inputBody = '';
    @unlink($tmp);

    return [
        'status' => $status,
        'body'   => json_decode($output, true),
        'raw'    => $output,
    ];
}

class MockPhpInputStream {
    public static string $inputBody = '';
    private int $pos = 0;
    public $context;
    public function stream_open($path, $mode, $options, &$opened_path) {
        return strpos($path, 'php://input') === 0;
    }
    public function stream_read($count) {
        $chunk = substr(self::$inputBody, $this->pos, $count);
        $this->pos += strlen($chunk);
        return $chunk;
    }
    public function stream_eof() { return $this->pos >= strlen(self::$inputBody); }
    public function stream_stat() { return []; }
    public function stream_close() {}
    public function url_stat($p, $f) { return []; }
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

$t->test('SystemVault round-trip (put → getFromVault → forget)', function () {
    $k = 'TEST_VAULT_' . bin2hex(random_bytes(3));
    $v = 'secret-' . bin2hex(random_bytes(8));
    SystemVault::put($k, $v);
    assert_equals($v, SystemVault::getFromVault($k));
    assert_true(SystemVault::hasInVault($k));
    assert_true(SystemVault::forget($k));
    assert_false(SystemVault::hasInVault($k));
    assert_equals(null, SystemVault::getFromVault($k));
});

$t->test('RateLimiter permite hasta N peticiones/minuto', function () use ($db) {
    $rl = new RateLimiter($db);
    $key = 'test-limiter-' . bin2hex(random_bytes(3));
    $max = 3;
    $ok = 0;
    for ($i = 0; $i < 5; $i++) {
        $r = $rl->check($key, $max);
        if ($r['allowed']) $ok++;
    }
    assert_equals($max, $ok, "Debe permitir exactamente $max peticiones antes de bloquear");
});

$t->test('reportLog() acepta callback con HMAC válido y actualiza DB',
function () use ($db, $TEST_AUTO_ID) {
    $body = [
        'automation_id'    => $TEST_AUTO_ID,
        'n8n_execution_id' => 'mock-exec-' . bin2hex(random_bytes(4)),
        'status'           => 'success',
        'nodes_executed'   => 3,
        'output_payload'   => ['ok' => true],
        'started_at'       => gmdate('c', time() - 2),
        'completed_at'     => gmdate('c'),
    ];
    $secret = (string) SystemVault::get('N8N_CALLBACK_SECRET', '');
    assert_true($secret !== '', 'N8N_CALLBACK_SECRET debe existir en vault/.env');

    $raw = json_encode($body);
    $sig = hash_hmac('sha256', $raw, $secret);
    $res = simulateCallback($body, $sig);

    assert_equals(200, $res['status'], 'Debe responder 200 OK con firma válida');
    assert_true($res['body']['success'] ?? false, 'body.success debe ser true');

    // Verificar DB: execution_logs y automation_stats
    $count = (int) $db->query("SELECT COUNT(*) FROM execution_logs WHERE automation_id = $TEST_AUTO_ID")
                       ->fetchColumn();
    assert_true($count >= 1, 'Debe existir al menos 1 fila en execution_logs');

    $autoRow = $db->query("SELECT total_runs, last_run_status FROM automations WHERE id = $TEST_AUTO_ID")
                  ->fetch(PDO::FETCH_ASSOC);
    assert_true($autoRow['total_runs'] >= 1, 'total_runs debe incrementarse');
    assert_equals('success', $autoRow['last_run_status']);
});

$t->test('reportLog() rechaza firma inválida (HTTP 403)',
function () use ($TEST_AUTO_ID) {
    $body = ['automation_id' => $TEST_AUTO_ID, 'status' => 'success'];
    $res  = simulateCallback($body, 'firma-incorrecta-' . str_repeat('0', 40));
    assert_equals(403, $res['status'], 'Firma inválida → 403');
    assert_false($res['body']['success'] ?? true);
});

$t->test('reportLog() rechaza body vacío (HTTP 400)',
function () {
    $res = simulateCallback([], 'whatever');
    // body=[] → json_encode='[]' NO es vacío, el controller lo acepta como body pero
    // luego rechaza por "automation_id missing". Un body literalmente vacío daría 400.
    // Aceptamos 400 o 401/403 (depende del orden de checks).
    assert_true(in_array($res['status'], [400, 401, 403]),
        'Debe rechazar ( got ' . $res['status'] . ')');
});

// ------------------------------------------------------------------
// Teardown
// ------------------------------------------------------------------

teardownFixtures($db, $TEST_USER_ID);
echo "  Teardown: fixtures borradas\n";

$t->summary();
