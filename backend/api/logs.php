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

$filter = $_GET['filter'] ?? 'all';
$logs = $_SESSION['execution_logs'] ?? [];

$successMessages = [
    'Backup diario completado correctamente',
    'Email de bienvenida enviado a nuevo usuario',
    'Sincronización con FTP finalizada',
    'Webhook ejecutado sin errores',
    'Base de datos actualizada con éxito',
    'Notificación de Telegram enviada',
    'Archivos comprimidos y subidos',
    'Copia de seguridad realizada',
    'Reporte generado automáticamente',
    'API externa respondió correctamente'
];

$errorMessages = [
    'Error de conexión con servidor SMTP',
    'Fallo al conectar con FTP: timeout',
    'API respondió con código 500',
    'Credenciales inválidas',
    'Archivo no encontrado en la ruta especificada',
    'Error de autenticación en Telegram',
    'Límite de peticiones excedido',
    'Timeout en la ejecución',
    'Memoria insuficiente',
    'Formato de datos inválido'
];

$automationNames = [
    'Backup Diario - Servidor',
    'Email Marketing - Campaña',
    'Telegram Bot - Alertas',
    'Sincronización FTP',
    'Webhook API - Pagos',
    'Backup BBDD - Automático',
    'Notificación Slack',
    'Reporte Semanal'
];

if (empty($logs)) {
    for ($i = 0; $i < 30; $i++) {
        $status = rand(0, 10) > 2 ? 'success' : 'error';
        $message = $status === 'success' 
            ? $successMessages[array_rand($successMessages)]
            : $errorMessages[array_rand($errorMessages)];
        
        // Hacer que los más recientes tengan fechas más cercanas
        $hoursAgo = $i * rand(1, 3);
        
        $logs[] = [
            'id' => $i + 1,
            'automation_id' => rand(1, 8),
            'automation_name' => $automationNames[array_rand($automationNames)],
            'status' => $status,
            'message' => $message,
            'executed_at' => date('Y-m-d H:i:s', strtotime("-{$hoursAgo} hours")),
            'execution_time' => rand(1, 12) . 's',
            'details' => [
                'nodes' => rand(2, 8),
                'data_size' => rand(10, 500) . 'MB'
            ]
        ];
    }
}

// Filtrar por estado si es necesario
if ($filter !== 'all') {
    $logs = array_filter($logs, function($log) use ($filter) {
        return $log['status'] === $filter;
    });
}

// Ordenar por fecha (más reciente primero) y limitar a 50
$logs = array_slice(array_reverse($logs), 0, 50);

echo json_encode(array_values($logs), JSON_PRETTY_PRINT);
?>