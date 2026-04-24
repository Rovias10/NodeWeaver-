<?php
/**
 * backend/api/ejecutar.php — DEPRECATED (proxy legacy)
 * ------------------------------------------------------------------
 * Este endpoint ejecutaba flujos de forma SIMULADA (sleep + datos
 * aleatorios). Desde la Fase 5 del puente n8n ha sido reemplazado por
 * el endpoint MVC real:
 *
 *   POST /API/index.php?route=automation/execute
 *   Body: { "id": <automation_id>, "input_payload": { ... } }
 *   Headers: Authorization: Bearer <JWT>
 *
 * Este archivo queda como proxy de compatibilidad para no romper
 * integraciones externas que aún apunten aquí. Se eliminará en la
 * Fase 8 junto con guardar.php y listar.php.
 */

require_once __DIR__ . '/../../DATA/cors.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Construir la URL del endpoint MVC preservando query string.
$scheme = !empty($_SERVER['HTTPS']) ? 'https' : 'http';
$host   = $_SERVER['HTTP_HOST']     ?? 'localhost';
$base   = dirname(dirname($_SERVER['SCRIPT_NAME'])); // quita /backend/api
$target = $scheme . '://' . $host . rtrim($base, '/') . '/API/index.php?route=automation/execute';

$body = file_get_contents('php://input') ?: '{}';
$auth = $_SERVER['HTTP_AUTHORIZATION']
      ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
      ?? null;

$ch = curl_init($target);
$headers = ['Content-Type: application/json', 'Accept: application/json'];
if ($auth) $headers[] = 'Authorization: ' . $auth;

curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST  => 'POST',
    CURLOPT_POSTFIELDS     => $body,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_TIMEOUT        => 60,
]);

$resp   = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$cerr   = curl_errno($ch) ? curl_error($ch) : null;
curl_close($ch);

header('Content-Type: application/json');
header('X-Deprecated: Use POST /API/index.php?route=automation/execute instead.');

if ($cerr !== null) {
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => 'Proxy error: ' . $cerr]);
    return;
}

http_response_code($status);
echo $resp ?: '{"success":false,"message":"Empty response"}';
