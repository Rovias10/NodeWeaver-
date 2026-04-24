<?php
require_once __DIR__ . '/env.php';

class JWT {
    private static $secret_key;
    private static $encrypt = ['HS256'];
    private static $expiration;
    
    public static function init() {
        self::$secret_key = EnvLoader::get('JWT_SECRET', 'default_secret_change_this');
        self::$expiration = EnvLoader::get('JWT_EXPIRATION', 86400);
    }
    
    public static function generate($data) {
        self::init();
        
        $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
        $payload = json_encode([
            'data' => $data,
            'iat' => time(),
            'exp' => time() + self::$expiration
        ]);

        $base64_header = self::base64UrlEncode($header);
        $base64_payload = self::base64UrlEncode($payload);
        
        $signature = hash_hmac('sha256', 
            $base64_header . '.' . $base64_payload, 
            self::$secret_key, 
            true
        );
        $base64_signature = self::base64UrlEncode($signature);

        return $base64_header . '.' . $base64_payload . '.' . $base64_signature;
    }
    
    public static function validate($token) {
        self::init();
        
        $parts = explode('.', $token);
        if (count($parts) != 3) return false;

        $header = $parts[0];
        $payload = $parts[1];
        $signature = $parts[2];

        $valid = hash_hmac('sha256', 
            $header . '.' . $payload, 
            self::$secret_key, 
            true
        );
        $valid = self::base64UrlEncode($valid);

        if ($signature !== $valid) return false;

        $payload_data = json_decode(self::base64UrlDecode($payload), true);
        if ($payload_data['exp'] < time()) return false;

        return $payload_data['data'];
    }
    
    private static function base64UrlEncode($text) {
        return str_replace(
            ['+', '/', '='],
            ['-', '_', ''],
            base64_encode($text)
        );
    }
    
    private static function base64UrlDecode($text) {
        return base64_decode(str_replace(
            ['-', '_'],
            ['+', '/'],
            $text
        ));
    }
}
?>