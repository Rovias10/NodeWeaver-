<?php
/**
 * Configuración CORS de la API StudyWeaver.
 *
 * Sustituye al wildcard `*` original por una whitelist explícita de
 * orígenes autorizados. Defensa frente al tribunal: ningún origen
 * desconocido puede leer las respuestas de la API desde un navegador,
 * aunque la URL sea pública y la propia clave JWT esté bien custodiada.
 *
 * Para añadir nuevos orígenes (p. ej. una rama de pruebas en otro
 * subdominio) basta con extender $allowedOrigins. Cualquier otra Origin
 * se ignora: el backend no devuelve `Access-Control-Allow-Origin`, por
 * lo que el navegador bloquea la respuesta cross-origin sin necesidad
 * de tocar nada en el cliente.
 */

$allowedOrigins = [
    // Desarrollo local (Vite dev server, ver vite.config.js).
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    // Producción: frontend desplegado en IONOS Hosting Plus (ADR-09).
    'https://villanuevarodrigo.com',
    'https://www.villanuevarodrigo.com',
];

header('Content-Type: application/json');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    // Indica a las cachés intermedias que la respuesta varía según Origin,
    // imprescindible para que un proxy no sirva una respuesta CORS pensada
    // para otro dominio.
    header('Vary: Origin');
}

header('Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT, DELETE, PATCH');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
// Cachea el preflight 10 minutos para reducir round-trips OPTIONS en flujos
// con muchas llamadas seguidas (p. ej. listado + apertura de cada apunte).
header('Access-Control-Max-Age: 600');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    // 204 es la respuesta canónica para preflights aceptados (sin cuerpo).
    http_response_code(204);
    exit();
}
?>