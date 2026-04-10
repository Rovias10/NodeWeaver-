<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../controllers/authController.php';

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

$database = new Database();
$db = $database->getConnection();

$data = json_decode(file_get_contents('php://input'), true);

switch ($route) {
    case 'auth/login':
        if ($method === 'POST') {
            $controller = new AuthController($db);
            $controller->login($data);
        }
        break;

    case 'auth/register':
        if ($method === 'POST') {
            $controller = new AuthController($db);
            $controller->register($data);
        }
        break;
    case 'auth/forgot-password':
        if ($method === 'POST') {
            $controller = new AuthController($db);
            $controller->forgotPassword($data);
        }
        break;

    case 'auth/reset-password':
        if ($method === 'POST') {
            $controller = new AuthController($db);
            $controller->resetPassword($data);
        }
        break;

    case 'auth/google':
        if ($method === 'POST') {
            $controller = new AuthController($db);
            $controller->googleLogin($data);
        }
        break;
    default:
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Ruta de la API no encontrada: ' . $route]);
        break;
}
?>