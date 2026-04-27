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
$router->post('profile/delete', 'profileController', 'deleteAccount');

// Map Routes — CRUD de mapas conceptuales StudyWeaver (Fase Maps · M1).
$router->get('maps/list',    'mapController', 'list');
$router->get('maps/get',     'mapController', 'get');
$router->post('maps/save',   'mapController', 'save');
$router->post('maps/delete', 'mapController', 'delete');

// AI Routes — integración con Gemini API (rama IA_Integration, ADR-07).
//   ai/expand       : Maps M4 — expande un concepto en sub-conceptos.
//   ai/from-note    : genera un mapa o flashcards a partir de un apunte.
$router->post('ai/expand',     'aiController', 'expand');
$router->post('ai/from-note',  'aiController', 'fromNote');

// Notes Routes — Fase Notes / Apuntes · N1+N3 (CRUD + servir PDF;
// la integración IA `ai/from-note` se cablea en la rama futura
// `ia-integration`).
$router->get ('notes/list',    'noteController', 'list');
$router->get ('notes/get',     'noteController', 'get');
$router->get ('notes/file',    'noteController', 'file');
$router->post('notes/upload',  'noteController', 'upload');
$router->post('notes/delete',  'noteController', 'delete');

// Flashcards Routes — Fase Flashcards · F2.
$router->get('flashcards/list',                'flashcardController', 'list');
$router->get('flashcards/due',                 'flashcardController', 'due');
$router->post('flashcards/save',               'flashcardController', 'save');
$router->post('flashcards/review',             'flashcardController', 'review');
$router->post('flashcards/delete',             'flashcardController', 'delete');
$router->post('flashcards/delete-by-note',     'flashcardController', 'deleteByNote');
$router->post('flashcards/generate-from-map',  'flashcardController', 'generateFromMap');

// Community Routes — Fase Comunidad · C1 (feed, likes, comments).
// Decisión confirmada: la comunidad es sólo para usuarios logueados
// (community-plan §9.1). Cada controller llama a verifyToken() y los
// 401 se manejan ya por el wrapper único de fetch en el frontend.
$router->get ('community/feed',           'feedController',    'list');
$router->get ('community/map',            'feedController',    'getPublicMap');
$router->get ('community/profile',        'feedController',    'getProfile');
$router->get ('community/profile-maps',   'feedController',    'getProfileMaps');
$router->get ('community/favorites',      'feedController',    'getMyFavorites');

$router->post('community/like',           'likeController',    'toggle');

$router->get ('community/comments',       'commentController', 'list');
$router->post('community/comment',        'commentController', 'create');
$router->post('community/comment-delete', 'commentController', 'delete');

// Receive the incoming request variables
$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Dispatch the router
$router->dispatch($method, $route);
?>
