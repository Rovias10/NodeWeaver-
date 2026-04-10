<?php
class EnvLoader {
    private static $variables = [];
    
    public static function load($filePath) {
        if (!file_exists($filePath)) {
            throw new Exception("Archivo .env no encontrado: $filePath");
        }
        
        $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) {
                continue;
            }
            
            $parts = explode('=', $line, 2);
            if (count($parts) == 2) {
                $key = trim($parts[0]);
                $value = trim($parts[1]);
                
                $value = trim($value, '"\'');
                
                self::$variables[$key] = $value;
                
                $_ENV[$key] = $value;
                putenv("$key=$value");
            }
        }
    }
    
    public static function get($key, $default = null) {
        return self::$variables[$key] ?? $default;
    }
    
    public static function all() {
        return self::$variables;
    }
}

EnvLoader::load(__DIR__ . '/../.env');
?>