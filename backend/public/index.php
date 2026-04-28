<?php
/**
 * Punto de entrada público (Apache / hosting cloud).
 *
 * Es el único PHP expuesto al exterior: cualquier petición
 * /backend/public/index.php?route=... entra aquí y se delega
 * al bootstrap de la API en backend/API/index.php, que se encarga
 * de cargar configuración (CORS, .env, BD) y despachar al router.
 *
 * Mantenemos el bootstrap dentro de backend/API/ para no romper los
 * paths relativos `__DIR__ . '/../DATA/...'` ya existentes.
 */
require_once __DIR__ . '/../API/index.php';
