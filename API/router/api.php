<?php
// backend/router/api.php
require_once __DIR__ . '/Router.php';

// Instantiate the router with the existing DB connection (passed from index.php)
$router = new Router($db);

/**
 * Define all API Routes here
 * Format: $router->[method]('route/path', 'controllerName', 'methodName');
 */

// Auth Routes
$router->post('auth/login', 'authController', 'login');
$router->post('auth/register', 'authController', 'register');
$router->post('auth/forgot-password', 'authController', 'forgotPassword');
$router->post('auth/reset-password', 'authController', 'resetPassword');
$router->post('auth/confirm-account', 'authController', 'confirmAccount');
$router->post('auth/google', 'authController', 'googleLogin');


// Receive the incoming request variables
$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Dispatch the router
$router->dispatch($method, $route);
?>
