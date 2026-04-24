<?php
require_once __DIR__ . '/../../DATA/jwt.php';
require_once __DIR__ . '/../../DATA/env.php';
require_once __DIR__ . '/../../DATA/vault.php';
require_once __DIR__ . '/../../DATA/rateLimiter.php';
require_once __DIR__ . '/../../MODEL/automation.php';
require_once __DIR__ . '/../../MODEL/executionLog.php';
require_once __DIR__ . '/../services/n8n/DrawflowToN8nParser.php';
require_once __DIR__ . '/../services/n8n/N8nClient.php';
require_once __DIR__ . '/../services/n8n/N8nException.php';

/**
 * AutomationController
 * ------------------------------------------------------------------
 * Orquestador del puente NodeWeaver ↔ n8n.
 *
 *   Plano de control (MySQL)       Plano de ejecución (n8n)
 *   ┌─────────────────────┐        ┌────────────────────┐
 *   │ automations         │◄──────►│ workflows          │
 *   │ webhooks            │        │ webhook endpoints  │
 *   │ execution_logs      │◄──────►│ executions         │
 *   └─────────────────────┘        └────────────────────┘
 *
 * Política de errores: FAIL-SOFT.
 *   Si MySQL va bien pero n8n falla, se persiste en DB igualmente y se
 *   marca n8n_sync_status='error'. El usuario puede reintentar con
 *   /automation/resync sin perder datos.
 */
class AutomationController {
    private $db;
    private $automationModel;
    private $executionLogModel;

    public function __construct($db) {
        $this->db = $db;
        $this->automationModel   = new Automation($db);
        $this->executionLogModel = new ExecutionLog($db);
    }

    // -------------------------------------------------------------
    //  Helpers
    // -------------------------------------------------------------

    private function getAuthenticatedUser() {
        $headers = apache_request_headers();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

        if (!$authHeader || !preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Token no proporcionado.']);
            exit;
        }

        $token = $matches[1];
        $data = JWT::validate($token);

        if (!$data || !isset($data['id'])) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Token inválido o expirado.']);
            exit;
        }

        return $data['id'];
    }

    /**
     * Construye los metadatos que consume DrawflowToN8nParser::translate().
     * Si NODEWEAVER_CALLBACK_URL no está definida aún (Fase 6), simplemente
     * no se inyecta el Response Manager — el puente funciona igual, pero
     * los execution_logs no se cerrarán con datos reales hasta activarlo.
     */
    private function buildParserMeta($automationId, $userId, $name) {
        $callbackUrl    = EnvLoader::get('NODEWEAVER_CALLBACK_URL');
        // El secret de callback es sensible (valida firmas HMAC). Preferimos el
        // vault cifrado — SystemVault::get() hace fallback al .env automáticamente.
        $callbackSecret = SystemVault::get('N8N_CALLBACK_SECRET');

        return [
            'name'            => $name,
            'automation_id'   => (int) $automationId,
            'user_id'         => (int) $userId,
            'callback_url'    => $callbackUrl ?: null,
            'callback_secret' => $callbackSecret ?: null,
        ];
    }

    /**
     * Push completo a n8n (create/update + activate/deactivate + sync webhooks).
     * Devuelve el estado del puente para que save/resync lo incluyan en
     * la respuesta al frontend.
     *
     * @return array ['status' => 'synced'|'error', 'n8n_workflow_id' => string|null,
     *                'error' => string|null, 'webhooks' => array]
     */
    private function pushToN8n($automationId, $userId, $flowDataJson, $name, $isActive) {
        try {
            $flowData = is_string($flowDataJson) ? json_decode($flowDataJson, true) : $flowDataJson;
            if (!is_array($flowData)) {
                throw new N8nException('flow_data no es JSON válido');
            }

            $parser  = new DrawflowToN8nParser();
            $payload = $parser->translate($flowData, $this->buildParserMeta($automationId, $userId, $name));

            $client = new N8nClient();
            $existingId = $this->automationModel->getN8nWorkflowId($automationId, $userId);

            if ($existingId) {
                $client->updateWorkflow($existingId, $payload);
                $wfId = $existingId;
            } else {
                $created = $client->createWorkflow($payload);
                $wfId    = (string) ($created['id'] ?? '');
                if ($wfId === '') {
                    throw new N8nException('n8n createWorkflow no devolvió id');
                }
            }

            // Activar / desactivar según is_active local.
            // n8n devuelve 400 si se intenta (des)activar dos veces seguidas,
            // así que ignoramos ese error concreto.
            try {
                if ((int) $isActive === 1) {
                    $client->activateWorkflow($wfId);
                } else {
                    $client->deactivateWorkflow($wfId);
                }
            } catch (N8nException $e) {
                if ($e->getHttpStatus() !== 400) throw $e;
            }

            $urls     = $client->getWebhookUrls($wfId);
            $webhooks = $this->automationModel->syncWebhooks($automationId, $userId, $urls);

            // Derivar drawflow_id del slug determinístico (nw-{auto}-{df}-{hash})
            // para que el editor pueda asociarlo al nodo correspondiente.
            foreach ($webhooks as &$wh) {
                $slug = $wh['slug'] ?? '';
                if (preg_match('/^nw-\d+-(\d+)-/', $slug, $m)) {
                    $wh['drawflow_id'] = $m[1];
                }
            }
            unset($wh);

            $this->automationModel->updateN8nBinding($automationId, $userId, $wfId, 'synced', null);

            return [
                'status'          => 'synced',
                'n8n_workflow_id' => $wfId,
                'error'           => null,
                'webhooks'        => $webhooks,
            ];

        } catch (N8nException $e) {
            $this->automationModel->updateN8nBinding($automationId, $userId, null, 'error', $e->getMessage());
            return [
                'status'          => 'error',
                'n8n_workflow_id' => null,
                'error'           => $e->getMessage(),
                'webhooks'        => [],
            ];
        } catch (Throwable $e) {
            $this->automationModel->updateN8nBinding($automationId, $userId, null, 'error', $e->getMessage());
            return [
                'status'          => 'error',
                'n8n_workflow_id' => null,
                'error'           => $e->getMessage(),
                'webhooks'        => [],
            ];
        }
    }

    // -------------------------------------------------------------
    //  Endpoints
    // -------------------------------------------------------------

    public function list() {
        $user_id = $this->getAuthenticatedUser();
        $automations = $this->automationModel->getByUser($user_id);
        echo json_encode(['success' => true, 'automations' => $automations]);
    }

    public function get($data = []) {
        $user_id = $this->getAuthenticatedUser();
        $id = $data['id'] ?? $_GET['id'] ?? null;

        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'ID no proporcionado.']);
            return;
        }

        $automation = $this->automationModel->getById($id, $user_id);
        if ($automation) {
            $webhooks = $this->automationModel->getWebhooksByAutomation($id, $user_id);
            $automation['webhooks'] = $this->enrichWebhooks($webhooks);
            echo json_encode(['success' => true, 'automation' => $automation]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Automatización no encontrada.']);
        }
    }

    /**
     * Añade `url` (base + slug) y `drawflow_id` (extraído del slug determinístico
     * `nw-{automationId}-{drawflowId}-{hash}`) a las filas de la tabla webhooks.
     * Así el editor puede pintar la URL real en el panel del nodo correspondiente.
     */
    private function enrichWebhooks(array $rows): array {
        $base = rtrim((string) EnvLoader::get('N8N_WEBHOOK_BASE', ''), '/');
        foreach ($rows as &$row) {
            $slug = $row['slug'] ?? '';
            $row['url'] = $base !== '' ? $base . '/' . ltrim($slug, '/') : $slug;
            // Extraer drawflow_id del slug: nw-{auto}-{df}-{hash}
            if (preg_match('/^nw-\d+-(\d+)-/', $slug, $m)) {
                $row['drawflow_id'] = $m[1];
            } else {
                $row['drawflow_id'] = null;
            }
        }
        return $rows;
    }

    /**
     * Guarda + autodespliega en n8n.
     *
     *   1. INSERT/UPDATE en MySQL (plano de control).
     *   2. Traducir Drawflow → n8n con DrawflowToN8nParser.
     *   3. POST/PUT en n8n con N8nClient.
     *   4. Activar/desactivar según is_active.
     *   5. Refrescar la tabla webhooks con las URLs reales de n8n.
     *   6. Actualizar automations.n8n_workflow_id y n8n_sync_status.
     */
    public function save($data = []) {
        $user_id = $this->getAuthenticatedUser();

        $id        = $data['id'] ?? null;
        $name      = trim($data['name'] ?? 'Sin nombre');
        $flow_data = $data['flow_data'] ?? null;
        $is_active = $data['is_active'] ?? 1;

        if (!$flow_data) {
            echo json_encode(['success' => false, 'message' => 'Datos del flujo no proporcionados.']);
            return;
        }

        // 1) Plano de control
        if ($id) {
            $ok = $this->automationModel->update($id, $user_id, $name, $flow_data, $is_active);
            if (!$ok) {
                echo json_encode(['success' => false, 'message' => 'Error al actualizar.']);
                return;
            }
            $automationId = $id;
        } else {
            $automationId = $this->automationModel->create($user_id, $name, $flow_data);
            if (!$automationId) {
                echo json_encode(['success' => false, 'message' => 'Error al crear.']);
                return;
            }
        }

        // 2..6) Plano de ejecución (fail-soft)
        $bridge = $this->pushToN8n($automationId, $user_id, $flow_data, $name, $is_active);

        echo json_encode([
            'success'         => true,
            'message'         => $bridge['status'] === 'synced'
                                     ? 'Automatización guardada y desplegada en n8n.'
                                     : 'Automatización guardada, pero n8n devolvió un error. Revisa los detalles.',
            'id'              => (int) $automationId,
            'n8n_workflow_id' => $bridge['n8n_workflow_id'],
            'n8n_sync_status' => $bridge['status'],
            'n8n_sync_error'  => $bridge['error'],
            'webhooks'        => $bridge['webhooks'],
        ]);
    }

    public function delete($data = []) {
        $user_id = $this->getAuthenticatedUser();
        $id = $data['id'] ?? $_POST['id'] ?? null;

        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'ID no proporcionado.']);
            return;
        }

        // Borrar primero en n8n (si estaba vinculado). Si falla, seguimos
        // igualmente en local para no dejar filas huérfanas en MySQL.
        $wfId = $this->automationModel->getN8nWorkflowId($id, $user_id);
        $n8nMsg = null;
        if ($wfId) {
            try {
                (new N8nClient())->deleteWorkflow($wfId);
            } catch (N8nException $e) {
                $n8nMsg = 'No se pudo borrar en n8n (' . $e->getHttpStatus() . '): ' . $e->getMessage();
            } catch (Throwable $e) {
                $n8nMsg = 'No se pudo borrar en n8n: ' . $e->getMessage();
            }
        }

        if ($this->automationModel->delete($id, $user_id)) {
            echo json_encode([
                'success'  => true,
                'message'  => 'Automatización eliminada.',
                'n8n_note' => $n8nMsg,
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error al eliminar.']);
        }
    }

    /**
     * Activa la automatización en n8n y actualiza is_active en local.
     * Útil cuando el usuario la pausó y quiere reanudarla sin re-guardar.
     */
    public function activate($data = []) {
        return $this->toggleActive($data, 1);
    }

    public function deactivate($data = []) {
        return $this->toggleActive($data, 0);
    }

    private function toggleActive($data, int $flag) {
        $user_id = $this->getAuthenticatedUser();
        $id = $data['id'] ?? null;
        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'ID no proporcionado.']);
            return;
        }

        $wfId = $this->automationModel->getN8nWorkflowId($id, $user_id);
        if (!$wfId) {
            echo json_encode(['success' => false, 'message' => 'La automatización no está sincronizada con n8n. Guárdala primero.']);
            return;
        }

        try {
            $client = new N8nClient();
            if ($flag === 1) $client->activateWorkflow($wfId);
            else              $client->deactivateWorkflow($wfId);
            $this->automationModel->setActive($id, $user_id, $flag);
            echo json_encode([
                'success'   => true,
                'message'   => $flag === 1 ? 'Automatización activada.' : 'Automatización desactivada.',
                'is_active' => $flag,
            ]);
        } catch (N8nException $e) {
            // 400 de n8n cuando ya estaba en ese estado — lo tratamos como éxito.
            if ($e->getHttpStatus() === 400) {
                $this->automationModel->setActive($id, $user_id, $flag);
                echo json_encode(['success' => true, 'is_active' => $flag, 'message' => 'Sin cambios (ya estaba en ese estado).']);
                return;
            }
            echo json_encode(['success' => false, 'message' => 'n8n: ' . $e->getMessage()]);
        }
    }

    /**
     * Re-sincroniza una automatización existente con n8n sin tocar flow_data.
     * Útil cuando la última sync terminó en 'error' y el usuario quiere reintentar.
     */
    public function resync($data = []) {
        $user_id = $this->getAuthenticatedUser();
        $id = $data['id'] ?? null;
        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'ID no proporcionado.']);
            return;
        }

        $automation = $this->automationModel->getById($id, $user_id);
        if (!$automation) {
            echo json_encode(['success' => false, 'message' => 'Automatización no encontrada.']);
            return;
        }

        $bridge = $this->pushToN8n(
            $id,
            $user_id,
            $automation['flow_data'],
            $automation['name'],
            $automation['is_active']
        );

        echo json_encode([
            'success'         => $bridge['status'] === 'synced',
            'message'         => $bridge['status'] === 'synced'
                                     ? 'Re-sincronización correcta.'
                                     : 'Re-sincronización fallida: ' . $bridge['error'],
            'n8n_workflow_id' => $bridge['n8n_workflow_id'],
            'n8n_sync_status' => $bridge['status'],
            'webhooks'        => $bridge['webhooks'],
        ]);
    }

    /**
     * Dispara una ejecución manual del workflow en n8n.
     *
     * Pre-requisitos:
     *   - La automatización debe estar sincronizada (n8n_workflow_id != NULL).
     *   - El flujo debe contener al menos un nodo 'webhook' (es el punto de
     *     entrada que usamos para disparar manualmente). Si no hay, error 409.
     *
     * Flujo:
     *   1. Crear fila 'queued' en execution_logs.
     *   2. POST al webhook público de n8n → el worker arranca.
     *   3. Marcar la fila como 'running'.
     *   4. El cierre (success/error/timeout) lo hace Fase 6 (Response Manager).
     */
    public function execute($data = []) {
        $user_id = $this->getAuthenticatedUser();

        $id            = $data['id'] ?? null;
        $input_payload = $data['input_payload'] ?? [];
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'ID no proporcionado.']);
            return;
        }

        $automation = $this->automationModel->getById($id, $user_id);
        if (!$automation) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Automatización no encontrada.']);
            return;
        }

        if (empty($automation['n8n_workflow_id'])) {
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'message' => 'La automatización no está sincronizada con n8n. Guárdala primero.',
            ]);
            return;
        }

        // Necesitamos al menos un webhook para disparar la ejecución manual.
        $webhooks = $this->automationModel->getWebhooksByAutomation($id, $user_id);
        if (empty($webhooks)) {
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'message' => 'Añade un nodo "webhook" al flujo para poder ejecutarlo manualmente.',
            ]);
            return;
        }
        $webhook = $webhooks[0]; // si hay varios, usamos el primero registrado

        // Contar nodos del flow_data para la columna nodes_total.
        $flowData   = json_decode($automation['flow_data'], true);
        $nodesTotal = is_array($flowData['drawflow']['Home']['data'] ?? null)
                        ? count($flowData['drawflow']['Home']['data'])
                        : 0;

        // 1) Fila queued en execution_logs
        $executionId = $this->executionLogModel->create(
            (int) $id,
            (int) $user_id,
            'manual',
            (string) $webhook['id'],
            is_array($input_payload) ? $input_payload : [],
            $nodesTotal
        );

        // 2) Disparar el webhook público de n8n
        $webhookBase = rtrim((string) EnvLoader::get('N8N_WEBHOOK_BASE', ''), '/');
        $url         = $webhookBase . '/' . ltrim($webhook['slug'], '/');
        $method      = strtoupper((string) $webhook['http_method'] ?? 'POST');

        $startTs = microtime(true);
        $http    = $this->fireHttp($url, $method, is_array($input_payload) ? $input_payload : []);
        $elapsed = (int) round((microtime(true) - $startTs) * 1000);

        if ($http['ok']) {
            // 3) n8n aceptó el disparo → running (el callback lo cerrará)
            $this->executionLogModel->markRunning($executionId);

            // Si no hay Response Manager configurado, marcamos success inmediato
            // (el usuario verá al menos que n8n aceptó el trigger).
            if (!EnvLoader::get('NODEWEAVER_CALLBACK_URL')) {
                $this->executionLogModel->finalize($executionId, 'success', [
                    'duration_ms'   => $elapsed,
                    'nodes_executed'=> $nodesTotal,
                    'output_payload'=> $http['body'],
                ]);
                $this->automationModel->touchLastRun((int) $id, 'success');
            }

            http_response_code(202);
            echo json_encode([
                'success'          => true,
                'message'          => 'Ejecución disparada.',
                'execution_id'     => $executionId,
                'automation_id'    => (int) $id,
                'webhook_url'      => $url,
                'trigger_duration_ms' => $elapsed,
                'n8n_response'     => $http['body'],
                'awaiting_callback'=> (bool) EnvLoader::get('NODEWEAVER_CALLBACK_URL'),
            ]);
            return;
        }

        // n8n devolvió error al aceptar el trigger → marcamos error directo
        $this->executionLogModel->finalize($executionId, 'error', [
            'duration_ms'   => $elapsed,
            'error_message' => substr((string) $http['error'], 0, 2000),
        ]);
        $this->automationModel->touchLastRun((int) $id, 'error');

        http_response_code(502);
        echo json_encode([
            'success'       => false,
            'message'       => 'n8n rechazó el disparo del webhook.',
            'execution_id'  => $executionId,
            'http_status'   => $http['status'],
            'error'         => $http['error'],
        ]);
    }

    /**
     * POST/GET al webhook de n8n. Es HTTP simple: no necesita X-N8N-API-KEY
     * porque el endpoint es público (protegido por slug único).
     *
     * @return array{ok:bool, status:int, body:mixed, error:?string}
     */
    private function fireHttp(string $url, string $method, array $payload): array {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => false,
        ]);

        $headers = ['Accept: application/json'];
        if (!in_array($method, ['GET', 'HEAD'], true)) {
            $json = json_encode($payload ?: (object)[], JSON_UNESCAPED_UNICODE);
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        $raw    = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $cerr   = curl_errno($ch) ? curl_error($ch) : null;
        curl_close($ch);

        if ($cerr !== null) {
            return ['ok' => false, 'status' => 0, 'body' => null, 'error' => 'cURL: ' . $cerr];
        }

        $body = $raw === '' ? null : json_decode((string) $raw, true);
        if ($body === null && $raw !== '') $body = $raw;

        $ok = $status >= 200 && $status < 300;
        return [
            'ok'     => $ok,
            'status' => $status,
            'body'   => $body,
            'error'  => $ok ? null : ('HTTP ' . $status . ': ' . (is_string($body) ? substr($body, 0, 500) : json_encode($body))),
        ];
    }

    /**
     * Callback que llama n8n al final de cada ejecución (Response Manager).
     *
     * Seguridad:
     *   - Header `X-NodeWeaver-Signature` = HMAC-SHA256(rawBody, N8N_CALLBACK_SECRET)
     *   - Comparación timing-safe con hash_equals() para evitar side-channel attacks.
     *   - No requiere JWT: es tráfico servidor→servidor (n8n→PHP) autenticado por firma.
     *
     * Side-effects:
     *   1. UPDATE execution_logs (status final, duration, output).
     *   2. UPDATE automations.last_run_* + total_runs + total_errors.
     *   3. UPSERT automation_stats del día.
     *
     * @param array $data  Datos del router (no se usan: leemos el body crudo para firmar).
     */
    public function reportLog($data = []) {
        // 0) Rate limit por IP origen (n8n puede dispararse en bucle si hay
        // bugs en un flujo mal diseñado). 120 callbacks/min es un techo
        // generoso para uso normal y aún así contiene ataques/DoS.
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        (new RateLimiter($this->db))->enforce('report-log:' . $ip, 120);

        // 1) Leer body crudo ANTES de decodificar (la firma es sobre bytes exactos).
        $rawBody = file_get_contents('php://input');
        if ($rawBody === false || $rawBody === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Empty body']);
            return;
        }

        // 2) Verificar firma HMAC.
        //    El secret se lee desde el vault cifrado (con fallback a .env),
        //    así evitamos tenerlo en texto plano si el vault está activo.
        $headers   = function_exists('apache_request_headers') ? apache_request_headers() : [];
        $signature = $headers['X-NodeWeaver-Signature']
                  ?? $headers['x-nodeweaver-signature']
                  ?? ($_SERVER['HTTP_X_NODEWEAVER_SIGNATURE'] ?? '');
        $secret    = (string) SystemVault::get('N8N_CALLBACK_SECRET', '');

        if ($secret === '' || $signature === '') {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Missing signature or server secret']);
            return;
        }

        $expected = hash_hmac('sha256', $rawBody, $secret);
        if (!hash_equals($expected, $signature)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Invalid signature']);
            return;
        }

        // 3) Decodificar.
        $body = json_decode($rawBody, true);
        if (!is_array($body)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
            return;
        }

        $automationId   = (int) ($body['automation_id'] ?? 0);
        $n8nExecutionId = isset($body['n8n_execution_id']) ? (string) $body['n8n_execution_id'] : null;
        $status         = (string) ($body['status'] ?? 'success');
        $nodesExecuted  = (int) ($body['nodes_executed'] ?? 0);
        $output         = $body['output_payload']  ?? null;
        $errorMessage   = $body['error_message']   ?? null;
        $errorNodeId    = $body['error_node_id']   ?? null;
        $startedAtIso   = $body['started_at']      ?? null;
        $completedAtIso = $body['completed_at']    ?? null;

        if ($automationId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'automation_id missing']);
            return;
        }

        if (!in_array($status, ['success','error','timeout','cancelled'], true)) {
            $status = 'success';
        }

        // 4) Resolver el execution_log objetivo:
        //    a) Si ya hay una fila 'running'/'queued' con este n8n_execution_id → cerrar.
        //    b) Si no (caso schedule trigger → n8n arrancó sin que execute() creara fila) → crear+cerrar.
        $userId = (int) $this->db->query(
            "SELECT user_id FROM automations WHERE id = " . (int) $automationId . " LIMIT 1"
        )->fetchColumn();
        if ($userId <= 0) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Automation not found']);
            return;
        }

        $stmt = $this->db->prepare(
            "SELECT id, started_at
               FROM execution_logs
              WHERE automation_id = :aid
                AND user_id       = :uid
                AND status IN ('running', 'queued')
                AND (n8n_execution_id = :neid OR n8n_execution_id IS NULL)
              ORDER BY started_at DESC
              LIMIT 1"
        );
        $stmt->execute([
            ':aid'  => $automationId,
            ':uid'  => $userId,
            ':neid' => $n8nExecutionId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row) {
            $executionId = (int) $row['id'];
            $startedAt   = $row['started_at'];
        } else {
            // El callback viene de una ejecución disparada por n8n sin pasar
            // por execute() (p.ej. schedule trigger). Creamos la fila ahora.
            $executionId = $this->executionLogModel->create(
                $automationId,
                $userId,
                'schedule',
                $n8nExecutionId,
                null,
                $nodesExecuted
            );
            $startedAt = $startedAtIso ?: date('Y-m-d H:i:s');
        }

        // 5) Calcular duración.
        $durationMs = 0;
        if ($startedAtIso && $completedAtIso) {
            $ts1 = strtotime($startedAtIso);
            $ts2 = strtotime($completedAtIso);
            if ($ts1 && $ts2 && $ts2 >= $ts1) $durationMs = ($ts2 - $ts1) * 1000;
        }
        if ($durationMs === 0 && $startedAt) {
            $startTs    = strtotime($startedAt);
            if ($startTs) $durationMs = (time() - $startTs) * 1000;
        }
        $durationMs = max(0, (int) $durationMs);

        // 6) Finalizar execution_log.
        $this->executionLogModel->finalize($executionId, $status, [
            'duration_ms'      => $durationMs,
            'nodes_executed'   => $nodesExecuted,
            'output_payload'   => $output,
            'error_message'    => $errorMessage,
            'error_node_id'    => $errorNodeId,
            'n8n_execution_id' => $n8nExecutionId,
        ]);

        // 7) Actualizar stats de la automation + agregado diario.
        $this->automationModel->touchLastRun($automationId, $status);
        $this->executionLogModel->upsertDailyStats($automationId, $userId, $status, $durationMs);

        http_response_code(200);
        echo json_encode([
            'success'      => true,
            'execution_id' => $executionId,
            'automation_id'=> $automationId,
            'duration_ms'  => $durationMs,
            'status'       => $status,
        ]);
    }

    // -------------------------------------------------------------
    //  Listados / stats para frontend (Fase 6/7)
    // -------------------------------------------------------------

    /** GET /automation/logs?limit=50&status=all */
    public function logs($data = []) {
        $user_id = $this->getAuthenticatedUser();
        $limit   = (int) ($data['limit'] ?? $_GET['limit'] ?? 50);
        $status  = (string) ($data['status'] ?? $_GET['status'] ?? 'all');
        $logs    = $this->executionLogModel->listByUser($user_id, $status, $limit);

        echo json_encode([
            'success' => true,
            'count'   => count($logs),
            'logs'    => $logs,
        ]);
    }

    /** GET /automation/stats — agregados para el dashboard. */
    public function stats($data = []) {
        $user_id = $this->getAuthenticatedUser();
        $stats   = $this->executionLogModel->getStatsForUser($user_id);
        echo json_encode(['success' => true, 'stats' => $stats]);
    }
}
?>
