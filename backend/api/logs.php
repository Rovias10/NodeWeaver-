<?php
/**
 * backend/api/logs.php — DEPRECATED (proxy legacy)
 * ------------------------------------------------------------------
 * Reemplaza el antiguo endpoint que generaba logs SIMULADOS con
 * array_rand(). Desde Fase 6 leemos de execution_logs real.
 *
 *   GET /backend/api/logs.php?filter=all   →  proxy a
 *   GET /API/index.php?route=automation/logs&status=all&limit=50
 *
 * El frontend recibe el payload envuelto en `logs[]`; para mantener la
 * forma antigua (array plano), desempaquetamos aquí.
 * Se eliminará en Fase 8.
 */

require_once __DIR__ . '/../../DATA/cors.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$filter = $_GET['filter'] ?? 'all';
$limit  = (int) ($_GET['limit'] ?? 50);

$scheme = !empty($_SERVER['HTTPS']) ? 'https' : 'http';
$host   = $_SERVER['HTTP_HOST']     ?? 'localhost';
$base   = dirname(dirname($_SERVER['SCRIPT_NAME']));
$target = $scheme . '://' . $host . rtrim($base, '/') . '/API/index.php?route=automation/logs'
        . '&status=' . urlencode($filter) . '&limit=' . $limit;

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
header('X-Deprecated: Use GET /API/index.php?route=automation/logs instead.');
http_response_code($status);

// Formato legacy: array plano. Desempaquetar { success, logs: [...] }.
$decoded = json_decode($resp ?: '{}', true);
if (is_array($decoded) && ($decoded['success'] ?? false) && isset($decoded['logs'])) {
    echo json_encode($decoded['logs'], JSON_PRETTY_PRINT);
} else {
    echo $resp ?: '[]';
}
