<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

session_start();

if (!isset($_SESSION['automations'])) {
    $_SESSION['automations'] = [];
}

$input = json_decode(file_get_contents('php://input'), true);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Guardamos la nueva automatización
    $id = count($_SESSION['automations']) + 1;
    $automation = [
        'id' => $id,
        'name' => $input['name'] ?? 'Sin nombre',
        'flow' => $input['flow'] ?? [],
        'config' => $input['config'] ?? [],
        'created' => date('Y-m-d H:i:s'),
        'status' => 'active',
        'node_count' => isset($input['flow']['drawflow']['Home']['data']) 
            ? count($input['flow']['drawflow']['Home']['data']) 
            : 0
    ];
    
    $_SESSION['automations'][$id] = $automation;
    
    echo json_encode([
        'success' => true,
        'message' => 'Automatización guardada correctamente',
        'id' => $id,
        'automation' => $automation
    ], JSON_PRETTY_PRINT);
} 
elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Devolver toda lo que hay
    echo json_encode([
        'success' => true,
        'automations' => array_values($_SESSION['automations'])
    ], JSON_PRETTY_PRINT);
}
?>