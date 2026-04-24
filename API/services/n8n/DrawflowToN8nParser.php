<?php
/**
 * DrawflowToN8nParser
 * ------------------------------------------------------------------
 * Traduce el JSON nativo de Drawflow (`drawflow.export()`) al schema
 * aceptado por la Public API de n8n (POST /workflows, PUT /workflows/{id}).
 *
 * Reglas críticas del schema de n8n que este parser respeta:
 *   - `connections` se indexa por el NOMBRE del nodo, no por su id.
 *     → Por eso generamos nombres únicos y deterministas en translate().
 *   - `position` es un array [x, y] con enteros.
 *   - Cada nodo necesita `typeVersion`, `parameters` y `type` válidos.
 *   - El trigger debe ser un nodo de tipo *Trigger (webhook, schedule...).
 *
 * Este servicio NO hace llamadas HTTP: solo transforma estructuras.
 * La Fase 6 reutiliza injectResponseManager() para añadir el callback HMAC.
 */

class DrawflowToN8nParser {

    /**
     * Tabla de equivalencias Drawflow → n8n.
     * Cada entrada describe:
     *   - type:        fully-qualified node type de n8n
     *   - typeVersion: versión del nodo (n8n la exige obligatoriamente)
     *   - isTrigger:   define si es un nodo de arranque (0 inputs)
     *   - params:      closure que recibe (nodeData, context) y devuelve
     *                  los `parameters` que entiende n8n
     */
    private const NODE_MAP = [
        'webhook' => [
            'type'        => 'n8n-nodes-base.webhook',
            'typeVersion' => 2,
            'isTrigger'   => true,
        ],
        'schedule' => [
            'type'        => 'n8n-nodes-base.scheduleTrigger',
            'typeVersion' => 1.2,
            'isTrigger'   => true,
        ],
        'http_request' => [
            'type'        => 'n8n-nodes-base.httpRequest',
            'typeVersion' => 4.2,
            'isTrigger'   => false,
        ],
        'email' => [
            'type'        => 'n8n-nodes-base.emailSend',
            'typeVersion' => 2.1,
            'isTrigger'   => false,
        ],
        'condition' => [
            'type'        => 'n8n-nodes-base.if',
            'typeVersion' => 2,
            'isTrigger'   => false,
        ],
        'delay' => [
            'type'        => 'n8n-nodes-base.wait',
            'typeVersion' => 1.1,
            'isTrigger'   => false,
        ],
        'log' => [
            'type'        => 'n8n-nodes-base.noOp',
            'typeVersion' => 1,
            'isTrigger'   => false,
        ],
        'backup' => [
            'type'        => 'n8n-nodes-base.noOp',
            'typeVersion' => 1,
            'isTrigger'   => false,
        ],
    ];

    /**
     * Punto de entrada principal.
     *
     * @param array $drawflowExport   Resultado de drawflow.export() ya decodificado
     * @param array $meta             ['name' => str, 'automation_id' => int,
     *                                 'user_id' => int, 'callback_url' => str|null,
     *                                 'callback_secret' => str|null]
     * @return array                   Payload listo para enviar a n8n
     */
    public function translate(array $drawflowExport, array $meta): array {
        $rawNodes = $drawflowExport['drawflow']['Home']['data'] ?? [];

        // 1) Asignar nombres únicos por (drawflow_id) — n8n conecta por nombre.
        $idToName = [];
        foreach ($rawNodes as $dfId => $node) {
            $idToName[(string)$dfId] = $this->buildNodeName($node, (string)$dfId);
        }

        // 2) Transformar cada nodo.
        $n8nNodes = [];
        foreach ($rawNodes as $dfId => $node) {
            $n8nNodes[] = $this->buildNode(
                $node,
                $idToName[(string)$dfId],
                $meta
            );
        }

        // 3) Construir el mapa de conexiones con los nombres ya resueltos.
        $connections = $this->buildConnections($rawNodes, $idToName);

        // 4) Inyectar el Response Manager si viene callback_url.
        if (!empty($meta['callback_url'])) {
            [$n8nNodes, $connections] = $this->injectResponseManager(
                $n8nNodes,
                $connections,
                $meta
            );
        }

        return [
            'name'        => $meta['name'] ?? ('NodeWeaver #' . ($meta['automation_id'] ?? '0')),
            'nodes'       => $n8nNodes,
            'connections' => (object)$connections, // forzar objeto JSON aunque esté vacío
            'settings'    => (object)[
                'executionOrder'  => 'v1',
                'saveDataSuccessExecution' => 'all',
                'saveDataErrorExecution'   => 'all',
            ],
        ];
    }

    /**
     * Devuelve los nodos de Drawflow cuyo `name` es 'webhook' para que el
     * controller pueda sincronizar la tabla `webhooks` con slugs y secretos.
     *
     * @return array<int, array{drawflow_id:string, http_method:string, slug:string}>
     */
    public function extractWebhookNodes(array $drawflowExport, int $automationId): array {
        $rawNodes = $drawflowExport['drawflow']['Home']['data'] ?? [];
        $out = [];
        foreach ($rawNodes as $dfId => $node) {
            if (($node['name'] ?? '') !== 'webhook') continue;

            $out[] = [
                'drawflow_id' => (string)$dfId,
                'http_method' => strtoupper($node['data']['method'] ?? 'POST'),
                'slug'        => $this->buildWebhookSlug($automationId, (string)$dfId),
            ];
        }
        return $out;
    }

    // -------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------

    /** Nombre único y determinista (sobrevive a re-deployments). */
    private function buildNodeName(array $node, string $dfId): string {
        $base = ucfirst($node['name'] ?? 'Node');
        return $base . ' #' . $dfId;
    }

    /** Slug estable por (automation, drawflow_id). Máx 63 chars. */
    private function buildWebhookSlug(int $automationId, string $dfId): string {
        return 'nw-' . $automationId . '-' . $dfId . '-' . substr(
            hash('sha256', $automationId . ':' . $dfId),
            0,
            12
        );
    }

    /** Construye un nodo n8n a partir de un nodo Drawflow. */
    private function buildNode(array $df, string $name, array $meta): array {
        $kind   = $df['name'] ?? 'log';
        $mapping = self::NODE_MAP[$kind] ?? self::NODE_MAP['log'];

        $x = (int) round((float)($df['pos_x'] ?? 0));
        $y = (int) round((float)($df['pos_y'] ?? 0));

        $params = $this->buildParameters($kind, $df, $meta);
        // n8n exige que `parameters` sea SIEMPRE un objeto JSON, nunca un array.
        // Array vacío PHP → `[]` en JSON → 400. Forzamos stdClass para `{}`.
        if (empty($params)) $params = new stdClass();

        return [
            'name'        => $name,
            'type'        => $mapping['type'],
            'typeVersion' => $mapping['typeVersion'],
            'position'    => [$x, $y],
            'parameters'  => $params,
        ];
    }

    /**
     * Traduce los `data` del nodo Drawflow a `parameters` del nodo n8n.
     * Cada rama conoce los atributos mínimos viables; lo demás queda
     * en default (se puede enriquecer luego en el showNodeConfig del editor).
     */
    private function buildParameters(string $kind, array $df, array $meta): array {
        $data = $df['data'] ?? [];

        switch ($kind) {
            case 'webhook':
                $dfId = (string)($df['id'] ?? '0');
                return [
                    'httpMethod'    => strtoupper($data['method'] ?? 'POST'),
                    'path'          => $this->buildWebhookSlug(
                        (int)($meta['automation_id'] ?? 0),
                        $dfId
                    ),
                    'responseMode'  => 'onReceived',
                    'options'       => (object)[],
                ];

            case 'schedule':
                // Si el usuario pasa un cron, úsalo; si no, cada 15 minutos.
                $cron = $data['cron'] ?? '*/15 * * * *';
                return [
                    'rule' => [
                        'interval' => [[
                            'field'           => 'cronExpression',
                            'expression'      => $cron,
                        ]],
                    ],
                ];

            case 'http_request':
                return [
                    'method' => strtoupper($data['method'] ?? 'GET'),
                    'url'    => $data['url'] ?? 'https://example.com',
                    'options'=> (object)[],
                ];

            case 'email':
                return [
                    'fromEmail' => $data['from']    ?? 'no-reply@nodeweaver.local',
                    'toEmail'   => $data['to']      ?? '',
                    'subject'   => $data['subject'] ?? 'Mensaje de NodeWeaver',
                    'text'      => $data['body']    ?? '',
                    'options'   => (object)[],
                ];

            case 'condition':
                return [
                    'conditions' => [
                        'options' => [
                            'caseSensitive' => true,
                            'typeValidation'=> 'strict',
                        ],
                        'combinator' => 'and',
                        'conditions' => [],
                    ],
                ];

            case 'delay':
                $secs = (int)($data['seconds'] ?? 5);
                return [
                    'amount' => $secs,
                    'unit'   => 'seconds',
                ];

            case 'log':
            case 'backup':
            default:
                return (array)(object)[];
        }
    }

    /**
     * Mapa de conexiones listo para n8n.
     *   n8n espera:
     *   connections[<sourceNodeName>].main[<outputIndex>][] = {
     *       node: <targetNodeName>, type: 'main', index: <inputIndex>
     *   }
     */
    private function buildConnections(array $rawNodes, array $idToName): array {
        $connections = [];

        foreach ($rawNodes as $dfId => $node) {
            $outputs = $node['outputs'] ?? [];
            if (empty($outputs)) continue;

            $sourceName = $idToName[(string)$dfId] ?? null;
            if ($sourceName === null) continue;

            foreach ($outputs as $outputKey => $output) {
                // output_1 → índice 0, output_2 → índice 1, etc.
                $outputIndex = max(0, ((int) str_replace('output_', '', $outputKey)) - 1);

                foreach (($output['connections'] ?? []) as $conn) {
                    $targetId   = (string)($conn['node'] ?? '');
                    $targetName = $idToName[$targetId] ?? null;
                    if ($targetName === null) continue;

                    // input_1 → índice 0
                    $inputIndex = max(0, ((int) str_replace('input_', '', $conn['output'] ?? 'input_1')) - 1);

                    $connections[$sourceName]['main'][$outputIndex][] = [
                        'node'  => $targetName,
                        'type'  => 'main',
                        'index' => $inputIndex,
                    ];
                }
            }
        }

        return $connections;
    }

    /**
     * Añade un único nodo Code al final (Response Manager) que:
     *   1. Construye el body del callback con execution_id de n8n y status.
     *   2. Firma el body con HMAC-SHA256 usando el secret compartido.
     *   3. Hace POST a NodeWeaver mediante $helpers.httpRequest.
     *
     * Usamos un Code node en vez de un HTTP Request porque:
     *   - La función $crypto no está disponible en expresiones {{ }} en
     *     todas las versiones de n8n; pero `require('crypto')` SÍ lo está
     *     siempre dentro de un Code node (Node.js builtin).
     *   - Permite serializar el body UNA sola vez y firmar ese mismo string
     *     exacto (evita discrepancias JSON.stringify ↔ Content-Type).
     *
     * Se engancha a las "hojas" (nodos sin conexiones salientes).
     *
     * @return array{0: array, 1: array}  [nodes, connections]
     */
    private function injectResponseManager(array $nodes, array $connections, array $meta): array {
        $respName = 'NodeWeaver Response Manager';

        $automationId   = (int)($meta['automation_id'] ?? 0);
        $callbackUrl    = (string)($meta['callback_url']    ?? '');
        $callbackSecret = (string)($meta['callback_secret'] ?? '');

        // Escape para empotrar las 3 cadenas dentro de JavaScript.
        $jsUrl    = $this->jsString($callbackUrl);
        $jsSecret = $this->jsString($callbackSecret);

        $code = <<<JS
// NodeWeaver Response Manager — autogenerado por DrawflowToN8nParser
const crypto = require('crypto');

const CALLBACK_URL = {$jsUrl};
const CALLBACK_SECRET = {$jsSecret};
const AUTOMATION_ID = {$automationId};

const items = \$input.all();
const output = items.map(i => i.json);

const body = {
  automation_id:    AUTOMATION_ID,
  n8n_execution_id: String(\$execution.id),
  n8n_mode:         \$execution.mode,
  status:           'success',
  started_at:       \$execution.startedAt,
  completed_at:     new Date().toISOString(),
  nodes_executed:   items.length,
  output_payload:   output,
};

const bodyJson = JSON.stringify(body);
const signature = crypto
  .createHmac('sha256', CALLBACK_SECRET)
  .update(bodyJson)
  .digest('hex');

try {
  await \$helpers.httpRequest({
    method:  'POST',
    url:     CALLBACK_URL,
    headers: {
      'Content-Type':           'application/json',
      'X-NodeWeaver-Signature': signature,
      'X-NodeWeaver-Automation':String(AUTOMATION_ID),
    },
    body:     bodyJson,
    returnFullResponse: true,
    timeout:  10000,
  });
} catch (err) {
  // No rompas el workflow si NodeWeaver está caído: deja traza en logs.
  console.log('[NodeWeaver callback] error:', err.message);
}

return [{ json: { nodeweaver_callback: 'sent', automation_id: AUTOMATION_ID } }];
JS;

        $respNode = [
            'name'        => $respName,
            'type'        => 'n8n-nodes-base.code',
            'typeVersion' => 2,
            'position'    => [2000, 200],
            'parameters'  => [
                'mode'          => 'runOnceForAllItems',
                'language'      => 'javaScript',
                'jsCode'        => $code,
            ],
        ];
        $nodes[] = $respNode;

        // Conectar todas las hojas (nodos sin conexiones salientes) al Response Manager.
        $sources = array_keys($connections);
        foreach ($nodes as $n) {
            $name = $n['name'];
            if ($name === $respName) continue;
            if (!in_array($name, $sources, true)) {
                $connections[$name]['main'][0][] = [
                    'node'  => $respName,
                    'type'  => 'main',
                    'index' => 0,
                ];
            }
        }

        return [$nodes, $connections];
    }

    /** Serializa un string PHP como literal JavaScript seguro (`"..."`). */
    private function jsString(string $s): string {
        // json_encode produce un string JS válido (escapa \, ", control chars, unicode).
        return json_encode($s, JSON_UNESCAPED_SLASHES);
    }
}
