<?php
/**
 * tests/ParserTest.php — suite standalone sin PHPUnit.
 *
 * Para mantener el proyecto cero-dependencias, usamos un micro-runner
 * con funciones `assert_*`. Cubre los invariantes críticos del parser
 * DrawflowToN8nParser que Fase 2/6 establecieron:
 *
 *   - Schema correcto para n8n (name/type/typeVersion/position/parameters).
 *   - Parámetros vacíos → stdClass (NO array) para que JSON haga `{}`.
 *   - Nombres únicos y deterministas (sobreviven a re-deployments).
 *   - Slugs de webhook con formato `nw-{auto}-{df}-{hash12}`.
 *   - Connections indexadas por NOMBRE, no por id.
 *   - Response Manager solo se inyecta si callback_url viene definida.
 *   - El Response Manager se conecta a todos los nodos "hoja" (sin outputs).
 */

require_once __DIR__ . '/../API/services/n8n/DrawflowToN8nParser.php';
require_once __DIR__ . '/_testutil.php';

$t = new TestRunner('Drawflow → n8n Parser');

// =================================================================
//  Fixtures
// =================================================================

/** Flujo mínimo: 1 webhook → 1 log. */
function fixtureSimpleFlow(): array {
    return ['drawflow' => ['Home' => ['data' => [
        '1' => [
            'id'      => 1,
            'name'    => 'webhook',
            'data'    => ['method' => 'POST'],
            'pos_x'   => 100,
            'pos_y'   => 150,
            'inputs'  => [],
            'outputs' => ['output_1' => ['connections' => [
                ['node' => '2', 'output' => 'input_1']
            ]]],
        ],
        '2' => [
            'id'      => 2,
            'name'    => 'log',
            'data'    => ['message' => 'hola'],
            'pos_x'   => 400,
            'pos_y'   => 150,
            'inputs'  => ['input_1' => ['connections' => [['node' => '1', 'input' => 'output_1']]]],
            'outputs' => ['output_1' => ['connections' => []]],
        ],
    ]]]];
}

/** Fan-out: webhook → (email, log). */
function fixtureFanOut(): array {
    return ['drawflow' => ['Home' => ['data' => [
        '1' => [
            'id' => 1, 'name' => 'webhook', 'data' => [], 'pos_x' => 0, 'pos_y' => 0,
            'inputs' => [], 'outputs' => ['output_1' => ['connections' => [
                ['node' => '2', 'output' => 'input_1'],
                ['node' => '3', 'output' => 'input_1'],
            ]]],
        ],
        '2' => ['id' => 2, 'name' => 'email', 'data' => ['to' => 'a@b.com'], 'pos_x' => 300, 'pos_y' => -50,
                'inputs' => [], 'outputs' => ['output_1' => ['connections' => []]]],
        '3' => ['id' => 3, 'name' => 'log',   'data' => [], 'pos_x' => 300, 'pos_y' => 50,
                'inputs' => [], 'outputs' => ['output_1' => ['connections' => []]]],
    ]]]];
}

$defaultMeta = [
    'name'            => 'TEST_FLOW',
    'automation_id'   => 42,
    'user_id'         => 1,
    'callback_url'    => null,
    'callback_secret' => null,
];

// =================================================================
//  Tests
// =================================================================

$t->test('Nodes count matches Drawflow input', function () use ($defaultMeta) {
    $parser = new DrawflowToN8nParser();
    $out = $parser->translate(fixtureSimpleFlow(), $defaultMeta);
    assert_equals(2, count($out['nodes']), 'Debe haber 2 nodos (webhook + log)');
});

$t->test('Every node has required n8n fields', function () use ($defaultMeta) {
    $parser = new DrawflowToN8nParser();
    $out = $parser->translate(fixtureSimpleFlow(), $defaultMeta);
    foreach ($out['nodes'] as $node) {
        foreach (['name','type','typeVersion','position','parameters'] as $f) {
            assert_true(isset($node[$f]), "Falta '$f' en nodo {$node['name']}");
        }
        assert_true(is_array($node['position']) && count($node['position']) === 2,
            'position debe ser [x,y]');
    }
});

$t->test('Empty parameters are encoded as JSON object {} not array []', function () use ($defaultMeta) {
    $parser = new DrawflowToN8nParser();
    $out = $parser->translate(fixtureSimpleFlow(), $defaultMeta);
    $logNode = null;
    foreach ($out['nodes'] as $n) if (strpos($n['name'], 'Log') === 0) $logNode = $n;
    assert_true($logNode !== null, 'Debe existir el nodo log');
    assert_true($logNode['parameters'] instanceof stdClass,
        'parameters vacíos deben ser stdClass para serializar como {}');
    $json = json_encode($out['nodes']);
    assert_true(strpos($json, '"parameters":{}') !== false,
        'El JSON serializado debe contener "parameters":{} y no "parameters":[]');
});

$t->test('Node names are unique and deterministic', function () use ($defaultMeta) {
    $parser = new DrawflowToN8nParser();
    $out1 = $parser->translate(fixtureSimpleFlow(), $defaultMeta);
    $out2 = $parser->translate(fixtureSimpleFlow(), $defaultMeta);
    $names1 = array_column($out1['nodes'], 'name');
    $names2 = array_column($out2['nodes'], 'name');
    assert_equals($names1, $names2, 'Los nombres deben ser deterministas');
    assert_equals(count($names1), count(array_unique($names1)),
        'Los nombres deben ser únicos');
});

$t->test('Webhook slug format nw-{auto}-{df}-{hash12}', function () use ($defaultMeta) {
    $parser = new DrawflowToN8nParser();
    $out = $parser->translate(fixtureSimpleFlow(), $defaultMeta);
    $wh = null;
    foreach ($out['nodes'] as $n) if ($n['type'] === 'n8n-nodes-base.webhook') $wh = $n;
    assert_true($wh !== null, 'Debe existir el nodo webhook');
    $slug = $wh['parameters']['path'] ?? null;
    assert_true((bool) preg_match('/^nw-42-1-[a-f0-9]{12}$/', $slug),
        "slug '$slug' no cumple el formato nw-42-1-<12hex>");
});

$t->test('Connections are indexed by NAME (not by drawflow id)', function () use ($defaultMeta) {
    $parser = new DrawflowToN8nParser();
    $out = $parser->translate(fixtureSimpleFlow(), $defaultMeta);
    $conns = (array) $out['connections'];
    // La clave debe ser 'Webhook #1', no '1'.
    assert_true(isset($conns['Webhook #1']),
        'Las conexiones deben indexarse por nombre del nodo, no por id');
    assert_false(isset($conns['1']),
        'No debe existir la clave "1" en connections');
    $target = $conns['Webhook #1']['main'][0][0]['node'] ?? null;
    assert_equals('Log #2', $target, 'El target también debe ser el NOMBRE');
});

$t->test('Fan-out produces multiple targets in the same output slot', function () use ($defaultMeta) {
    $parser = new DrawflowToN8nParser();
    $out = $parser->translate(fixtureFanOut(), $defaultMeta);
    $conns = (array) $out['connections'];
    $webhookKey = null;
    foreach (array_keys($conns) as $k) if (strpos($k, 'Webhook') === 0) $webhookKey = $k;
    assert_true($webhookKey !== null, 'Debe existir la clave Webhook #x');
    $targets = $conns[$webhookKey]['main'][0] ?? [];
    assert_equals(2, count($targets), 'Webhook debe conectar a 2 targets');
    $targetNames = array_column($targets, 'node');
    sort($targetNames);
    assert_equals(['Email #2','Log #3'], $targetNames);
});

$t->test('Response Manager NOT injected when callback_url is null', function () use ($defaultMeta) {
    $parser = new DrawflowToN8nParser();
    $out = $parser->translate(fixtureSimpleFlow(), $defaultMeta);
    foreach ($out['nodes'] as $n) {
        assert_false(strpos($n['name'], 'Response Manager') !== false,
            'No debe inyectarse Response Manager si callback_url=null');
    }
});

$t->test('Response Manager injected when callback_url is set', function () use ($defaultMeta) {
    $parser = new DrawflowToN8nParser();
    $meta = array_merge($defaultMeta, [
        'callback_url'    => 'http://example.local/cb',
        'callback_secret' => 'test-secret',
    ]);
    $out = $parser->translate(fixtureSimpleFlow(), $meta);
    $hasRM = false;
    foreach ($out['nodes'] as $n) if (strpos($n['name'], 'Response Manager') !== false) $hasRM = true;
    assert_true($hasRM, 'Debe existir el nodo Response Manager');
});

$t->test('Response Manager is connected to all leaf nodes', function () use ($defaultMeta) {
    $parser = new DrawflowToN8nParser();
    $meta = array_merge($defaultMeta, [
        'callback_url'    => 'http://example.local/cb',
        'callback_secret' => 'test-secret',
    ]);
    $out = $parser->translate(fixtureFanOut(), $meta);
    $conns = (array) $out['connections'];
    // Email y Log son hojas (sin outputs) → deben conectar al Response Manager
    $rmName = null;
    foreach ($out['nodes'] as $n) if (strpos($n['name'], 'Response Manager') !== false) $rmName = $n['name'];
    assert_true($rmName !== null);

    $leafConnections = 0;
    foreach ($conns as $source => $data) {
        if ($source === 'Webhook #1' || strpos($source, 'Response Manager') === 0) continue;
        foreach ($data['main'][0] ?? [] as $edge) {
            if ($edge['node'] === $rmName) $leafConnections++;
        }
    }
    assert_equals(2, $leafConnections,
        'Las 2 hojas (email, log) deben conectar al Response Manager');
});

$t->test('extractWebhookNodes returns correct metadata', function () {
    $parser = new DrawflowToN8nParser();
    $nodes = $parser->extractWebhookNodes(fixtureSimpleFlow(), 42);
    assert_equals(1, count($nodes));
    assert_equals('1',    $nodes[0]['drawflow_id']);
    assert_equals('POST', $nodes[0]['http_method']);
    assert_true((bool) preg_match('/^nw-42-1-[a-f0-9]{12}$/', $nodes[0]['slug']));
});

$t->test('Empty flow produces empty nodes but valid schema', function () use ($defaultMeta) {
    $parser = new DrawflowToN8nParser();
    $out = $parser->translate(['drawflow' => ['Home' => ['data' => []]]], $defaultMeta);
    assert_equals(0, count($out['nodes']));
    assert_true($out['connections'] instanceof stdClass,
        'connections vacío debe ser stdClass para serializar como {}');
    assert_equals('TEST_FLOW', $out['name']);
});

$t->test('Unknown node type falls back to noOp (no crash)', function () use ($defaultMeta) {
    $flow = ['drawflow' => ['Home' => ['data' => [
        '1' => ['id' => 1, 'name' => 'unknown_type_xyz', 'data' => [], 'pos_x' => 0, 'pos_y' => 0,
                'inputs' => [], 'outputs' => []],
    ]]]];
    $parser = new DrawflowToN8nParser();
    $out = $parser->translate($flow, $defaultMeta);
    assert_equals(1, count($out['nodes']));
    assert_equals('n8n-nodes-base.noOp', $out['nodes'][0]['type']);
});

$t->summary();
