<?php

require_once __DIR__ . '/../../DATA/jwt.php';

/**
 * Middleware de autenticación por JWT en cabecera Authorization.
 *
 * Cualquier controller que requiera usuario autenticado debe llamar
 * a `AuthMiddleware::verifyToken()` como primera acción. La función
 * extrae el token, lo valida y devuelve el payload (`{id, name, email}`).
 * Si el token falta o es inválido, emite un JSON 401 y termina con
 * `exit`, así el controller no continúa con datos sin autenticar.
 */
class AuthMiddleware {

    /**
     * Lee el header Authorization, valida el JWT y devuelve el payload.
     * En caso de fallo, responde con 401 y termina la ejecución.
     */
    public static function verifyToken() {
        // HTTP header names son case-insensitive (RFC 7230 §3.2).
        // Bajo Apache, `getallheaders()` devuelve 'Authorization' tal cual
        // viene (típicamente con A mayúscula). Bajo el servidor embebido
        // de PHP los nombres llegan con el case del cliente; el navegador,
        // que usa la API Headers de fetch, los serializa en minúsculas
        // ('authorization'). Para que la autenticación funcione bajo
        // ambas SAPIs sin sorpresas, normalizamos todas las claves a
        // minúsculas antes de buscar.
        $headers = array_change_key_case(getallheaders() ?: [], CASE_LOWER);
        $auth_header = $headers['authorization'] ?? '';

        if (preg_match('/Bearer\s(\S+)/', $auth_header, $matches)) {
            $token = $matches[1];
            $user_data = JWT::validate($token);

            if ($user_data) {
                return $user_data;
            }
        }
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'No autorizado. Por favor, inicia sesión de nuevo.'
        ]);
        exit();
    }
}
?>
