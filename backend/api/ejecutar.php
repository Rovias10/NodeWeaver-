<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

session_start();

$input = json_decode(file_get_contents('php://input'), true);
$id = $input['id'] ?? 1;

// Simular tiempo de ejecución variable
$executionTime = rand(2, 6);
sleep($executionTime);

// Templates de resultados más variados y realistas
$resultTemplates = [
    [
        'success' => true,
        'output' => [
            'logs' => [
                ['time' => date('H:i:s', time()-$executionTime), 'message' => '🚀 Inicializando motor de automatización...'],
                ['time' => date('H:i:s', time()-$executionTime+1), 'message' => '📧 Conectando con servidor SMTP (smtp.gmail.com)...'],
                ['time' => date('H:i:s', time()-$executionTime+2), 'message' => '✅ Email enviado a cliente@empresa.com (ID: ' . rand(1000, 9999) . ')'],
                ['time' => date('H:i:s', time()-$executionTime+3), 'message' => '💾 Backup completado: ' . rand(50, 500) . 'MB subidos a FTP'],
                ['time' => date('H:i:s'), 'message' => '✨ Proceso finalizado con éxito']
            ],
            'stats' => [
                'emails_sent' => 1,
                'backup_size' => rand(50, 500) . 'MB',
                'nodes_executed' => rand(2, 5)
            ]
        ]
    ],
    [
        'success' => true,
        'output' => [
            'logs' => [
                ['time' => date('H:i:s', time()-$executionTime), 'message' => '⚡ Inicializando worker #' . rand(1, 5) . '...'],
                ['time' => date('H:i:s', time()-$executionTime+1), 'message' => '📱 Conectando con Telegram API (bot: AutoFlowBot)...'],
                ['time' => date('H:i:s', time()-$executionTime+2), 'message' => '✅ Mensaje enviado a canal #general (usuarios: ' . rand(50, 200) . ')'],
                ['time' => date('H:i:s', time()-$executionTime+3), 'message' => '📊 Procesando estadísticas de uso...'],
                ['time' => date('H:i:s', time()-$executionTime+4), 'message' => '📎 Adjuntando informe PDF...'],
                ['time' => date('H:i:s'), 'message' => '🎯 Ejecución completada (' . rand(3, 6) . ' nodos)']
            ],
            'stats' => [
                'telegram_chats' => rand(1, 5),
                'messages_sent' => 1,
                'nodes_executed' => rand(3, 6)
            ]
        ]
    ],
    [
        'success' => true,
        'output' => [
            'logs' => [
                ['time' => date('H:i:s', time()-$executionTime), 'message' => '🔍 Analizando condiciones del flujo...'],
                ['time' => date('H:i:s', time()-$executionTime+1), 'message' => '🌐 Llamando a webhook externo (api.ejemplo.com/v2)...'],
                ['time' => date('H:i:s', time()-$executionTime+2), 'message' => '📦 Procesando datos JSON (' . rand(100, 500) . ' registros)'],
                ['time' => date('H:i:s', time()-$executionTime+3), 'message' => '💾 Guardando en base de datos MySQL...'],
                ['time' => date('H:i:s', time()-$executionTime+4), 'message' => '📧 Enviando notificación a ' . rand(1, 3) . ' destinatarios'],
                ['time' => date('H:i:s'), 'message' => '✨ Flujo completado sin errores (código: 200)']
            ],
            'stats' => [
                'records_processed' => rand(100, 500),
                'api_calls' => rand(1, 3),
                'nodes_executed' => rand(4, 7)
            ]
        ]
    ]
];

$selected = $resultTemplates[array_rand($resultTemplates)];

$results = [
    'success' => $selected['success'],
    'output' => $selected['output'],
    'execution_time' => $executionTime . ' segundos',
    'execution_id' => uniqid('exec_'),
    'timestamp' => date('Y-m-d H:i:s')
];

// Guardar en historial
if (!isset($_SESSION['execution_logs'])) {
    $_SESSION['execution_logs'] = [];
}

$_SESSION['execution_logs'][] = [
    'automation_id' => $id,
    'result' => $results,
    'executed_at' => date('Y-m-d H:i:s')
];

echo json_encode($results, JSON_PRETTY_PRINT);
?>