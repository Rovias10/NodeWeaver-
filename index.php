<?php
// Redirección al servidor de desarrollo de la SPA (Vite).
// Este archivo sólo se usa cuando alguien abre la URL raíz del backend
// (http://localhost/NodeWeaver-/) directamente en el navegador. La app
// vive en frontend/ y se levanta con `npm run dev --prefix frontend`.
header('Location: http://localhost:5173/', true, 302);
exit;
