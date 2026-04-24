<?php
/**
 * N8nClient
 * ------------------------------------------------------------------
 * Cliente HTTP thin-wrapper sobre la Public API de n8n (v1).
 * Lee `N8N_URL` y `NODEWEAVER_N8N_API_KEY` vía EnvLoader.
 *
 * Endpoints usados:
 *   POST    /workflows               crear
 *   PUT     /workflows/{id}          actualizar
 *   POST    /workflows/{id}/activate   activar
 *   POST    /workflows/{id}/deactivate deactivar
 *   DELETE  /workflows/{id}          borrar
 *   GET     /workflows/{id}          leer (para derivar webhook URLs)
 *
 * Todas las llamadas devuelven el body decodificado (array) o lanzan
 * N8nException con el código HTTP real.
 */

require_once __DIR__ . '/N8nException.php';
require_once __DIR__ . '/../../../DATA/env.php';
require_once __DIR__ . '/../../../DATA/vault.php';

class N8nClient {

    private string $baseUrl;
    private string $apiKey;
    private string $webhookBase;
    private int    $timeoutSeconds;

    public function __construct(?string $baseUrl = null, ?string $apiKey = null, int $timeoutSeconds = 15) {
        $this->baseUrl        = rtrim($baseUrl ?? (string) EnvLoader::get('N8N_URL', ''), '/');
        // Prioridad: vault cifrado → .env. SystemVault::get() ya implementa
        // ambas rutas de forma transparente, así que leemos una sola vez.
        $this->apiKey         = $apiKey ?? (string) SystemVault::get('NODEWEAVER_N8N_API_KEY', '');
        $this->webhookBase    = rtrim((string) EnvLoader::get('N8N_WEBHOOK_BASE', ''), '/');
        $this->timeoutSeconds = $timeoutSeconds;

        if ($this->baseUrl === '' || $this->apiKey === '') {
            throw new N8nException('N8N_URL o NODEWEAVER_N8N_API_KEY no están definidos (ni en .env ni en SystemVault).');
        }
    }

    // -------------------------------------------------------------
    // API pública
    // -------------------------------------------------------------

    /** Crea un workflow en n8n. Devuelve el workflow tal como lo guardó n8n. */
    public function createWorkflow(array $payload): array {
        return $this->request('POST', '/workflows', $this->sanitizeForCreate($payload));
    }

    /** Actualiza un workflow existente. */
    public function updateWorkflow(string $id, array $payload): array {
        return $this->request('PUT', '/workflows/' . rawurlencode($id), $this->sanitizeForUpdate($payload));
    }

    /** Activa el workflow: los triggers empiezan a escuchar. */
    public function activateWorkflow(string $id): array {
        return $this->request('POST', '/workflows/' . rawurlencode($id) . '/activate');
    }

    /** Desactiva el workflow: los triggers dejan de escuchar. */
    public function deactivateWorkflow(string $id): array {
        return $this->request('POST', '/workflows/' . rawurlencode($id) . '/deactivate');
    }

    /** Borra el workflow (llamado desde AutomationController::delete()). */
    public function deleteWorkflow(string $id): array {
        return $this->request('DELETE', '/workflows/' . rawurlencode($id));
    }

    /** Devuelve el workflow completo. Útil para derivar webhook URLs reales. */
    public function getWorkflow(string $id): array {
        return $this->request('GET', '/workflows/' . rawurlencode($id));
    }

    /**
     * Obtiene las URLs públicas de los nodos webhook de un workflow.
     * n8n guarda el path en `parameters.path`; se asume que el workflow
     * está activo → la URL definitiva es `{N8N_WEBHOOK_BASE}/{path}`.
     *
     * @return array<int, array{name:string, path:string, url:string, http_method:string}>
     */
    public function getWebhookUrls(string $id): array {
        $wf    = $this->getWorkflow($id);
        $out   = [];
        foreach (($wf['nodes'] ?? []) as $node) {
            if (($node['type'] ?? '') !== 'n8n-nodes-base.webhook') continue;
            $path   = (string) ($node['parameters']['path']       ?? '');
            $method = strtoupper((string) ($node['parameters']['httpMethod'] ?? 'POST'));
            if ($path === '') continue;
            $out[] = [
                'name'        => (string) ($node['name'] ?? ''),
                'path'        => $path,
                'url'         => $this->webhookBase . '/' . ltrim($path, '/'),
                'http_method' => $method,
            ];
        }
        return $out;
    }

    /**
     * Lanza manualmente un workflow y devuelve el resultado (modo síncrono
     * de n8n si está habilitado). Usado por AutomationController::execute()
     * cuando el trigger es 'manual'.
     */
    public function executeWorkflow(string $id, array $input = []): array {
        return $this->request('POST', '/workflows/' . rawurlencode($id) . '/execute', $input);
    }

    // -------------------------------------------------------------
    // HTTP core
    // -------------------------------------------------------------

    /**
     * @param string $method HTTP verb en mayúsculas.
     * @param string $path   Path relativo a $this->baseUrl, empezando por '/'.
     * @param array|null $body Payload. Si es null, no se envía body.
     */
    private function request(string $method, string $path, ?array $body = null): array {
        $url = $this->baseUrl . $path;
        $ch  = curl_init($url);

        $headers = [
            'Accept: application/json',
            'X-N8N-API-KEY: ' . $this->apiKey,
        ];

        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $this->timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => false,
        ]);

        if ($body !== null) {
            $json = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($json === false) {
                throw new N8nException('JSON encoding failed: ' . json_last_error_msg());
            }
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        $response = curl_exec($ch);
        $status   = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $cerr     = curl_errno($ch) ? curl_error($ch) : null;
        curl_close($ch);

        if ($cerr !== null) {
            throw new N8nException('cURL error: ' . $cerr, 0, '');
        }

        $decoded = $response === '' ? [] : json_decode((string) $response, true);
        if ($decoded === null && $response !== '' && $response !== 'null') {
            throw new N8nException('Respuesta no-JSON de n8n', $status, (string) $response);
        }

        if ($status < 200 || $status >= 300) {
            $msg = is_array($decoded) && isset($decoded['message'])
                ? 'n8n ' . $status . ': ' . $decoded['message']
                : 'n8n ' . $status . ' ' . $method . ' ' . $path;
            throw new N8nException($msg, $status, (string) $response);
        }

        // n8n envuelve algunas respuestas en { data: ... }; si es así, devuelve data directamente.
        if (is_array($decoded) && array_keys($decoded) === ['data']) {
            return $decoded['data'];
        }
        return is_array($decoded) ? $decoded : [];
    }

    // -------------------------------------------------------------
    // Sanitizers
    // -------------------------------------------------------------

    /**
     * n8n rechaza algunas propiedades en el POST de creación.
     * La API pública acepta: name, nodes, connections, settings, staticData.
     */
    private function sanitizeForCreate(array $p): array {
        $allowed = ['name', 'nodes', 'connections', 'settings', 'staticData'];
        return array_intersect_key($p, array_flip($allowed));
    }

    /** El PUT exige los mismos campos que el POST; no aceptan `active` por aquí. */
    private function sanitizeForUpdate(array $p): array {
        return $this->sanitizeForCreate($p);
    }
}
