<?php
/**
 * backend/api/estadisticas.php — DEPRECATED (proxy legacy)
 * ------------------------------------------------------------------
 * Antes devolvía estadísticas con rand(). Desde Fase 6 proxifica al
 * endpoint MVC real que lee execution_logs / automation_stats.
 *
 *   GET /backend/api/estadisticas.php  →  proxy a
 *   GET /API/index.php?route=automation/stats
 *
 * Además adapta la forma del payload al contrato antiguo que espera el
 * frontend (total_executions, success_rate, daily_stats, etc.) mientras
 * no migremos dashboard.html en la Fase 7. Se eliminará en Fase 8.
 */

require_once __DIR__ . '/../../DATA/cors.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$scheme = !empty($_SERVER['HTTPS']) ? 'https' : 'http';
$host   = $_SERVER['HTTP_HOST']     ?? 'localhost';
$base   = dirname(dirname($_SERVER['SCRIPT_NAME']));
$target = $scheme . '://' . $host . rtrim($base, '/') . '/API/index.php?route=automation/stats';

$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;

$ch = curl_init($target);
$headers = ['Accept: application/json'];
if ($auth) $headers[] = 'Authorization: ' . $auth;
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_TIMEOUT        => 30,
]);
$resp   = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

header('Content-Type: application/json');
header('X-Deprecated: Use GET /API/index.php?route=automation/stats instead.');

$decoded = json_decode($resp ?: '{}', true);
if (!is_array($decoded) || !($decoded['success'] ?? false)) {
    http_response_code($status ?: 502);
    echo $resp ?: '{}';
    return;
}

$s = $decoded['stats'];
$byStatus = $s['by_status'] ?? [];
$success  = (int) ($byStatus['success'] ?? 0);
$errors   = (int) ($byStatus['error'] ?? 0) + (int) ($byStatus['timeout'] ?? 0);
$total    = (int) ($s['total'] ?? 0);

// Alinear el daily array a los 7 días (Lun..Dom).
$daysIndex = [];
foreach (($s['daily'] ?? []) as $r) $daysIndex[$r['d']] = (int) $r['n'];
$labels = []; $data = [];
for ($i = 6; $i >= 0; $i--) {
    $date = date('Y-m-d', strtotime("-{$i} days"));
    $labels[] = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][(int) date('w', strtotime($date))];
    $data[]   = $daysIndex[$date] ?? 0;
}

http_response_code(200);
echo json_encode([
    'total_executions'    => $total,
    'success_count'       => $success,
    'failed_count'        => $errors,
    'success_rate'        => ($total > 0 ? round(100 * $success / $total) : 0) . '%',
    'avg_execution_time'  => round(($s['avg_duration_ms'] ?? 0) / 1000, 2) . 's',
    'active_automations'  => null,           // se completará en Fase 7 con JOIN
    'daily_stats'         => ['labels' => $labels, 'data' => $data],
    'recent_activities'   => [],             // se completará en Fase 7 cruzando con execution_logs
    'last_update'         => date('Y-m-d H:i:s'),
    'server_status'       => 'healthy',
], JSON_PRETTY_PRINT);
