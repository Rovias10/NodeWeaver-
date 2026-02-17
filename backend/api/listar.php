<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$dataFile = '../data/automations.json';

if (file_exists($dataFile)) {
    $automations = json_decode(file_get_contents($dataFile), true) ?: [];
} else {
    $automations = [
        [
            'id' => 1,
            'name' => 'Backup diario automático',
            'created' => date('Y-m-d H:i:s', strtotime('-2 days')),
            'status' => 'active',
            'node_count' => 3
        ],
        [
            'id' => 2,
            'name' => 'Email de bienvenida',
            'created' => date('Y-m-d H:i:s', strtotime('-5 days')),
            'status' => 'active',
            'node_count' => 2
        ],
        [
            'id' => 3,
            'name' => 'Telegram noticias',
            'created' => date('Y-m-d H:i:s', strtotime('-1 week')),
            'status' => 'inactive',
            'node_count' => 4
        ]
    ];
}

echo json_encode([
    'success' => true,
    'automations' => $automations
]);
?>