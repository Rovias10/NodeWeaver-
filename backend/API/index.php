<?php
/**
 * Bootstrap de la API.
 *
 * Captura todo el tráfico entrante, prepara CORS, variables de
 * entorno y conexión a base de datos, y delega en el router MVC.
 *
 * Garantía de salida: TODA respuesta de la API es JSON. Para que
 * eso se cumpla incluso ante excepciones no controladas, el
 * dispatch del router está envuelto en un try/catch global que
 * traduce cualquier Throwable en un JSON 500 con mensaje genérico.
 * El detalle del error queda en el log del servidor.
 */

// 1. Configuración inicial (cabeceras CORS y variables de entorno)
require_once __DIR__ . '/../DATA/cors.php';
require_once __DIR__ . '/../DATA/env.php';

// 2. Conexión a base de datos. Puede devolver null si MySQL falla;
//    en ese caso los controllers que necesiten BD lanzarán excepción
//    y el catch global de abajo emitirá un JSON limpio.
require_once __DIR__ . '/../DATA/database.php';
$database = new Database();
$db = $database->getConnection();

// 3. Despachar la petición al router MVC, blindado para que ningún
//    error de PHP escape como HTML al cliente.
try {
    require_once __DIR__ . '/router/api.php';
} catch (Throwable $e) {
    http_response_code(500);
    // Logueamos clase, mensaje, archivo y línea para poder diagnosticar
    // sin exponer el detalle al cliente. Bajo `php -S` aparece en stderr,
    // que es la propia terminal donde corre el servidor.
    error_log(sprintf(
        '[API] Excepción no controlada: %s en %s:%d — %s',
        get_class($e),
        $e->getFile(),
        $e->getLine(),
        $e->getMessage()
    ));
    echo json_encode([
        'success' => false,
        'message' => 'Error interno del servidor. Inténtalo más tarde.'
    ]);
}
?>
