<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

session_start();

// Calcular uptime desde inicio de año
$startTime = strtotime('2024-01-01 00:00:00');
$uptime = time() - $startTime;
$days = floor($uptime / 86400);
$hours = floor(($uptime % 86400) / 3600);

// Generar estadísticas simuladas con variedad
$stats = [
    'total_executions' => rand(1250, 3450),
    'success_count' => rand(1100, 3200),
    'failed_count' => rand(50, 250),
    'success_rate' => rand(94, 99) . '%',
    'avg_execution_time' => rand(2, 8) . 's',
    'active_automations' => rand(8, 24),
    'daily_stats' => [
        'labels' => ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
        'data' => [
            rand(45, 120),
            rand(52, 135),
            rand(38, 148),
            rand(65, 162),
            rand(70, 189),
            rand(22, 67),
            rand(18, 53)
        ]
    ],
    'node_usage' => [
        ['name' => 'Email', 'count' => rand(234, 567)],
        ['name' => 'Schedule', 'count' => rand(189, 432)],
        ['name' => 'Telegram', 'count' => rand(145, 378)],
        ['name' => 'Backup', 'count' => rand(98, 256)],
        ['name' => 'Webhook', 'count' => rand(67, 189)]
    ],
    'recent_activities' => [
        ['time' => 'Hace 2m', 'event' => 'Backup diario - servidor principal', 'status' => 'success'],
        ['time' => 'Hace 15m', 'event' => 'Email marketing - campaña verano', 'status' => 'success'],
        ['time' => 'Hace 1h', 'event' => 'Sincronización FTP - documentos', 'status' => 'success'],
        ['time' => 'Hace 2h', 'event' => 'Telegram notification - alerta servidor', 'status' => 'error'],
        ['time' => 'Hace 3h', 'event' => 'Webhook API - pago recibido', 'status' => 'success'],
        ['time' => 'Hace 5h', 'event' => 'Backup BBDD - automático', 'status' => 'success']
    ],
    'popular_nodes' => [
        ['name' => 'Email', 'count' => rand(45, 80)],
        ['name' => 'Schedule', 'count' => rand(30, 60)],
        ['name' => 'Telegram', 'count' => rand(20, 50)],
        ['name' => 'Backup', 'count' => rand(15, 40)],
        ['name' => 'Webhook', 'count' => rand(10, 30)]
    ],
    'uptime' => "{$days}d {$hours}h",
    'version' => 'v2.0.' . rand(1, 9),
    'last_update' => date('Y-m-d H:i:s'),
    'server_status' => 'healthy'
];

echo json_encode($stats, JSON_PRETTY_PRINT);
?>