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

// Map Routes — pendientes de implementar en la subfase M1 del plan Maps
// (ver docs/maps-plan.md §3). Cuando MapController y MODEL/Map estén
// listos, se registran aquí las 4 rutas: maps/list, maps/get, maps/save,
// maps/delete. De momento se deja sólo el comentario para que quede
// reservado el sitio y el router quede limpio sin restos de automation/*.

// Receive the incoming request variables
$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Dispatch the router
$router->dispatch($method, $route);
?>
