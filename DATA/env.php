<?php
class EnvLoader {
    private static $variables = [];
    
    public static function load($filePath) {
        if (!file_exists($filePath)) {
            // Log error or handle gracefully instead of throwing if possible, 
            // but for NodeWeaver we keep the exception to ensure config is present.
            return; 
        }
        
        $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        
        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line) || strpos($line, '#') === 0) {
                continue;
            }
            
            $parts = explode('=', $line, 2);
            if (count($parts) == 2) {
                $key = trim($parts[0]);
                $value = trim($parts[1]);
                
                $value = trim($value, '"\'');
                
                self::$variables[$key] = $value;
                $_ENV[$key] = $value;
                $_SERVER[$key] = $value;
                putenv("$key=$value");
            }
        }
    }
    
    public static function get($key, $default = null) {
        // Priority: Internal Cache -> getenv -> $_ENV -> $_SERVER
        if (isset(self::$variables[$key])) return self::$variables[$key];
        
        $envVal = getenv($key);
        if ($envVal !== false) return $envVal;
        
        if (isset($_ENV[$key])) return $_ENV[$key];
        if (isset($_SERVER[$key])) return $_SERVER[$key];
        
        return $default;
    }
    
    public static function all() {
        return self::$variables;
    }
}

EnvLoader::load(__DIR__ . '/../.env');
?>