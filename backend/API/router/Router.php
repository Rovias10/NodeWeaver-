<?php
/**
 * MVC Router Class
 * Handles dynamic routing for the backend API and Views.
 */
class Router {
    private $routes = [];
    private $db;

    public function __construct($db) {
        $this->db = $db;
    }

    public function post($path, $controller, $method) {
        $this->routes['POST'][$path] = ['controller' => $controller, 'method' => $method];
    }

    public function get($path, $controller, $method) {
        $this->routes['GET'][$path] = ['controller' => $controller, 'method' => $method];
    }

    public function dispatch($method, $path) {
        // Parse input data depending on HTTP method
        $data = [];
        if ($method === 'POST' || $method === 'PUT') {
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
        } else {
            $data = $_GET;
        }

        if (isset($this->routes[$method][$path])) {
            $action = $this->routes[$method][$path];
            $controllerPath = __DIR__ . '/../controllers/' . $action['controller'] . '.php';
            
            if (file_exists($controllerPath)) {
                require_once $controllerPath;
                // e.g. authController -> AuthController
                $controllerClass = ucfirst($action['controller']); 
                $controllerInstance = new $controllerClass($this->db);
                $methodName = $action['method'];
                
                if (method_exists($controllerInstance, $methodName)) {
                    // Call the mapped controller method
                    $controllerInstance->$methodName($data);
                    return;
                }
            }
        }
        
        // If route does not exist
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Ruta no encontrada: ' . $path]);
    }
}
?>
