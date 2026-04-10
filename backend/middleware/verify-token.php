<?php

require_once __DIR__ . '/../config/jwt.php';

class AuthMiddleware {
    
    public static function verifyToken() {
        $headers = getallheaders();
        $auth_header = $headers['Authorization'] ?? '';

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