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

// Profile Routes
$router->get('profile/me', 'profileController', 'getProfile');
$router->post('profile/update', 'profileController', 'updateProfile');
$router->post('profile/password', 'profileController', 'changePassword');
$router->post('profile/avatar', 'profileController', 'uploadAvatar');

// Map Routes — CRUD de mapas conceptuales StudyWeaver (Fase Maps · M1).
$router->get('maps/list',    'mapController', 'list');
$router->get('maps/get',     'mapController', 'get');
$router->post('maps/save',   'mapController', 'save');
$router->post('maps/delete', 'mapController', 'delete');

// Receive the incoming request variables
$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Dispatch the router
$router->dispatch($method, $route);
?>
