<?php
/**
 * Entry Point (Bootstrap)
 * This file captures all incoming traffic from the server.
 * It initializes core configurations and passes the baton to the Router.
 */

// 1. Initial configurations
require_once __DIR__ . '/../DATA/cors.php';
require_once __DIR__ . '/../DATA/env.php';

// 2. Database Connection
require_once __DIR__ . '/../DATA/database.php';
$database = new Database();
$db = $database->getConnection();

// 3. Delegate to the MVC Router
require_once __DIR__ . '/router/api.php';
?>