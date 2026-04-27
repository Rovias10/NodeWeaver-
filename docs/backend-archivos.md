# Documentación del backend — StudyWeaver

> Capítulo orientado a la memoria del Proyecto Final 2 DAW. Describe **qué hace cada archivo del backend**, **por qué está donde está** y **cómo se llaman entre sí** durante una petición. Pensado para que cualquier evaluador (o cualquier desarrollador que aterrice por primera vez) pueda recorrer la API de arriba a abajo sin tener que abrir el código.
>
> Stack: PHP 8 nativo + PDO + MySQL/MariaDB. Sin frameworks. MVC clásico headless: el backend **sólo devuelve JSON**, nunca HTML.

---

## 1. Visión de conjunto

El backend de StudyWeaver implementa el patrón **Front Controller + MVC** que se imparte en el módulo de Desarrollo Web Entorno Servidor (0613). Todo el tráfico HTTP entra por un único punto de entrada (`backend/public/index.php`), que carga la plomería compartida (CORS, variables de entorno, conexión PDO) y delega en un router que mapea cada ruta a una pareja `Controller::método`.

Cada **Controller** valida los datos de entrada, comprueba la autenticación con `AuthMiddleware`, llama al **Model** correspondiente para tocar la base de datos y termina con `echo json_encode([...])`. Los Models contienen únicamente prepared statements PDO; no hay lógica de presentación dentro.

```
HTTP request
   │
   ▼
backend/public/index.php          ← document root público
   │ (require_once)
   ▼
backend/API/index.php             ← bootstrap: CORS + .env + PDO + try/catch global
   │ (require_once)
   ▼
backend/API/router/api.php        ← registra todas las rutas
   │ (Router::dispatch)
   ▼
Router → controller (camelCase)   ← p. ej. mapController.php
   │
   ├─→ AuthMiddleware::verifyToken() (si la ruta requiere usuario)
   │
   ├─→ MODEL/Map.php (PDO, prepared statements)
   │     │
   │     └─→ MySQL (base autoflow)
   │
   └─→ echo json_encode([...])    ← respuesta JSON al frontend React
```

Cada capa tiene una **única responsabilidad**:

| Capa | Carpeta | Qué hace | Qué NO hace |
| --- | --- | --- | --- |
| Entry point | `backend/public/` | Recibir la petición HTTP | Lógica de negocio |
| Bootstrap + Router | `backend/API/index.php`, `backend/API/router/` | Cargar config y elegir controller | Tocar BD |
| Middleware | `backend/API/middleware/` | Validar JWT antes de ejecutar el controller | Validación de negocio |
| Controllers | `backend/API/controllers/` | Validar input, orquestar models, formar JSON | Construir SQL a mano |
| Models | `backend/MODEL/` | Ejecutar SQL parametrizado | Decidir códigos HTTP |
| Servicios | `backend/API/services/` | Hablar con APIs externas (IA, email) | Conocer reglas de la BD |
| Configuración | `backend/DATA/` | Cargar `.env`, abrir PDO, generar JWT | Devolver respuestas al cliente |

---

## 2. Punto de entrada y bootstrap

### 2.1. `backend/public/index.php`

Único archivo PHP expuesto públicamente. En cualquier despliegue (servidor embebido `php -S`, Apache de XAMPP en local o un alojamiento cloud) este es el `DocumentRoot`. Su contenido es deliberadamente trivial:

```php
require_once __DIR__ . '/../API/index.php';
```

Hace una sola cosa: delegar inmediatamente en el bootstrap real. Mantenerlo así permite que el resto del backend viva fuera del directorio público, lo que evita exponer por HTTP archivos sensibles (controllers, modelos, `.env`).

### 2.2. `backend/API/index.php`

Bootstrap real de la API. Su responsabilidad es preparar el entorno y delegar en el router con un `try/catch` que blinda el contrato JSON del backend:

1. **Cabeceras CORS** (`require_once 'DATA/cors.php'`).
2. **Carga de variables de entorno** desde `.env` (`require_once 'DATA/env.php'`).
3. **Conexión PDO** (`require_once 'DATA/database.php'` + `new Database()`).
4. **Dispatch del router** envuelto en `try/catch (Throwable)`.

Si cualquier capa lanza una excepción no controlada (PDOException por una FK rota, RuntimeException de un servicio externo, TypeError…), el `catch` global responde un `500` con `{ success: false, message: "Error interno del servidor..." }` y registra los detalles en `error_log`. **El cliente nunca ve un stack trace de PHP.** Esto es lo que garantiza el contrato "toda respuesta es JSON" incluso ante fallos imprevistos.

### 2.3. `backend/API/router/Router.php`

Clase `Router` minimalista. Mantiene un array `$routes['GET'|'POST'][$path] = [controller, method]` y expone tres métodos públicos:

- `get($path, $controller, $method)`
- `post($path, $controller, $method)`
- `dispatch($method, $path)` — busca la ruta, lee el cuerpo (`php://input` para POST/PUT, `$_GET` para GET), localiza el archivo `controllers/<controller>.php`, instancia la clase con la conexión PDO y ejecuta el método.

La regla del nombre: el archivo se llama en **camelCase** (`mapController.php`) y la clase dentro en **PascalCase** (`MapController`). El router resuelve la conversión con `ucfirst()`. Esa convención es la causa de que todos los controllers del repositorio respeten esa pareja de nombres.

Si la ruta no existe responde `404` con JSON.

### 2.4. `backend/API/router/api.php`

Es el **mapa explícito de rutas** del proyecto. Crea el `Router`, registra cada endpoint con su controlador y método y, al final, llama a `dispatch($_SERVER['REQUEST_METHOD'], $_GET['route'])`.

Las rutas están agrupadas por feature, lo que sirve también como índice del backend:

| Grupo | Métodos registrados | Controlador |
| --- | --- | --- |
| Auth | `auth/login`, `auth/register`, `auth/forgot-password`, `auth/reset-password`, `auth/confirm-account`, `auth/google` | `authController` |
| Profile | `profile/me`, `profile/update`, `profile/password`, `profile/avatar`, `profile/delete` | `profileController` |
| Dashboard | `dashboard/stats` | `dashboardController` |
| Maps | `maps/list`, `maps/get`, `maps/save`, `maps/delete` | `mapController` |
| AI | `ai/expand`, `ai/from-note` | `aiController` |
| Notes | `notes/list`, `notes/get`, `notes/file`, `notes/upload`, `notes/delete` | `noteController` |
| Flashcards | `flashcards/list`, `flashcards/due`, `flashcards/save`, `flashcards/review`, `flashcards/delete`, `flashcards/delete-by-note`, `flashcards/generate-from-map` | `flashcardController` |
| Comunidad | `community/feed`, `community/map`, `community/profile`, `community/profile-maps`, `community/favorites`, `community/like`, `community/comments`, `community/comment`, `community/comment-delete` | `feedController`, `likeController`, `commentController` |

El frontend invoca cada ruta con un parámetro `?route=...` (por ejemplo `GET /backend/public/index.php?route=maps/list`). Esa URL la encapsula el wrapper de fetch del frontend, así que en React se llama simplemente a `apiGet('maps/list')`.

---

## 3. Capa de configuración (`backend/DATA/`)

Carpeta de "plomería compartida". No contiene lógica de negocio, sólo lo que el resto del backend necesita para funcionar.

### 3.1. `cors.php`

Emite las cabeceras `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods` y `Access-Control-Allow-Headers`, y responde directamente a cualquier `OPTIONS` con `200`. Esto es lo que permite que el frontend (que se sirve desde otro origen — `http://localhost:5173` durante el desarrollo, otro dominio en cloud) pueda llamar al backend sin que el navegador bloquee la petición preflight.

También fija `Content-Type: application/json` por defecto. La excepción la marca `noteController::file`, que sustituye la cabecera por `application/pdf` cuando sirve un binario.

### 3.2. `env.php`

Carga manual del archivo `.env` ubicado en `backend/.env`. Implementa una clase `EnvLoader` con dos métodos públicos:

- `EnvLoader::load($path)` — lee el archivo línea a línea, ignora comentarios y guarda los pares `clave=valor` en una caché interna y en `$_ENV`, `$_SERVER` y `getenv()`.
- `EnvLoader::get($key, $default)` — accede al valor con prioridad caché → `getenv()` → `$_ENV` → `$_SERVER`.

La carga es automática al final del propio archivo (`EnvLoader::load(__DIR__ . '/../.env')`). Variables que el resto del backend espera encontrar:

| Variable | Usada por | Para qué |
| --- | --- | --- |
| `JWT_SECRET`, `JWT_EXPIRATION` | `JWT::init()` | Firmar y validar tokens |
| `SUPER_USER_EMAIL`, `SUPER_USER_PASSWORD` | `authController::login` | Atajo de admin sin tabla `users` |
| `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME` | `EmailService` | Correos transaccionales |
| `FRONTEND_BASE_URL` | `EmailService` | Base URL para construir enlaces de los emails |
| `BACKEND_PUBLIC_URL` | `profileController::uploadAvatar` | Base URL pública para servir avatares |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | `AIClient` | Configuración de la IA |

Optar por un parser propio en lugar de `vlucas/phpdotenv` evita una dependencia Composer extra y es defendible ante tribunal: 50 líneas que el alumno entiende y puede explicar en pizarra.

### 3.3. `database.php`

Define la clase `Database`, responsable de abrir la conexión PDO. Devuelve la instancia con `getConnection()` o **null** si la conexión falla, registrando el error con `error_log`. Importante: nunca imprime nada en la respuesta HTTP. Si imprimiera, rompería el contrato JSON del backend (el texto se concatenaría con la salida del controller posterior y el cliente recibiría un body imposible de parsear). Esa decisión está documentada en el propio archivo y es uno de los puntos que se explican durante la defensa.

Configuración hardcoded para entorno local (`localhost`, base `autoflow`, usuario `root`, sin contraseña, configuración estándar de XAMPP). Cuando el proyecto se despliegue en cloud, esta clase es el único punto que debe leer las credenciales reales desde `.env`.

Activa `PDO::ATTR_ERRMODE = ERRMODE_EXCEPTION` para que cualquier error SQL lance una `PDOException` que el controller atrapa en su `try/catch`.

### 3.4. `jwt.php`

Implementación propia de JSON Web Tokens con algoritmo **HS256**. Métodos públicos:

- `JWT::generate($data)` — devuelve un string `header.payload.signature` con `data`, `iat` (issued at) y `exp` (expiración).
- `JWT::validate($token)` — verifica firma y expiración. Devuelve el payload `data` (id, name, email) o `false`.

Por qué propia y no `firebase/php-jwt` (que sí está en `vendor/`): la implementación tiene 70 líneas, encaja con la regla de "no usar librerías que el alumno no pueda explicar" y permite responder con detalle en defensa preguntas como "¿cómo verificas un JWT?" sin tener que decir "lo hace una librería". La librería de Firebase quedó en el `composer.json` como dependencia transitiva de SendGrid.

### 3.5. `sendgrid.php`

Define `EmailService`, fachada sobre el SDK oficial de SendGrid. Dos métodos públicos:

- `sendAccountConfirmation($email, $name, $token)` — enlace `FRONTEND_BASE_URL/confirmar?token=...`.
- `sendPasswordReset($email, $name, $token)` — enlace `FRONTEND_BASE_URL/reset?token=...`.

Las plantillas HTML de los correos están maquetadas con la paleta "Cielo Claro" de StudyWeaver (sky / sun / coral sobre fondo paper) y se renderizan con un helper privado `renderEmail($title, $body, $ctaLabel, $ctaLink)`. El `htmlspecialchars` con `ENT_QUOTES` evita inyecciones en el nombre del usuario.

Si SendGrid devuelve algo distinto a `202 Accepted`, el método registra el error en `error_log` y devuelve `false`. El controller decide cómo continuar (típicamente sigue adelante: el usuario ya está creado, el correo se reintenta manualmente).

### 3.6. `backend/DATA/migrations/`

Migraciones SQL ejecutadas a mano en phpMyAdmin sobre la base `autoflow`. Numeradas y comentadas con su contexto:

| Archivo | Tabla | Notas |
| --- | --- | --- |
| `001_init_studyweaver.sql` | (drops) | Limpia las tablas legacy de NodeWeaver (`automations`, `credentials`, `execution_logs`, `sessions`) tras la pivotación de dominio. Conserva `users`. |
| `002_create_maps.sql` | `maps` | Mapas conceptuales. Campo `drawflow_json LONGTEXT` con el `editor.export()` de Drawflow. |
| `003_create_flashcards.sql` | `flashcards` | Repaso espaciado SM-2. FK opcional `map_id` con `ON DELETE SET NULL`. |
| `004_create_likes.sql` | `likes` | PK compuesta `(user_id, map_id)` que impide duplicados a nivel de BD. |
| `005_create_comments.sql` | `comments` | Comentarios planos sobre mapas públicos. |
| `006_add_login_tracking.sql` | `users` | Añade `last_login_at`, `last_login_ip`, `failed_login_attempts`, `locked_until` para el bloqueo por brute-force. |
| `007_create_notes.sql` | `notes` | Apuntes (PDF subido o texto pegado). Es la zona principal del producto. |
| `008_alter_maps_source_note.sql` | `maps` | Añade `source_note_id` con FK a `notes(id)` `ON DELETE SET NULL` para vincular cada mapa con su apunte de origen sin perderlo si el apunte se borra. |
| `009_alter_flashcards_note_id.sql` | `flashcards` | Añade `note_id INT NULL` con FK a `notes(id)` `ON DELETE SET NULL` e índice `idx_flashcards_note`. Permite que las flashcards generadas desde un apunte (rama `IA_Integration`, endpoint `ai/from-note { target: 'flashcards' }`) preserven la trazabilidad de su origen. Habilita la **agrupación en carpetas por apunte** en el listado del frontend (LEFT JOIN con `notes` en `findByUser` para devolver `note_title`). |

Las migraciones están comentadas en castellano explicando el contexto, los trade-offs y el orden de ejecución. Son parte de la documentación entregable.

---

## 4. Capa Model (`backend/MODEL/`)

Cada modelo encapsula el acceso a una tabla concreta. Reglas comunes que se aplican en todos los archivos:

- Reciben la conexión PDO por constructor (inyección de dependencia simple).
- Cada método ejecuta **una** operación SQL con prepared statement posicional (`?`).
- **Ninguna validación de negocio**: el controller decide qué es válido y qué no.
- Cuando la operación es propietaria del usuario, el `WHERE` filtra por `user_id` además de por `id`. Esto es **anti-IDOR a nivel de query**, no sólo en el controller. Aunque el controller olvidara comprobar el ownership, la BD ya rechazaría la operación.

### 4.1. `User.php`

Tabla `users`. Métodos clave:

| Método | Para qué |
| --- | --- |
| `findByEmail($email)` | Login y comprobación de duplicados en registro. |
| `create($name, $email, $passwordHash, $phone, $companyName, $verificationToken)` | Alta tradicional. Devuelve el id insertado o `false`. |
| `findByVerificationToken($token)`, `verifyAccount($id)` | Confirmación por email. |
| `findByResetToken($token)`, `saveResetToken($id, $token, $expires)` | Reset de contraseña. La query de `findByResetToken` añade `reset_expires > NOW()` para invalidar tokens caducados directamente en SQL. |
| `updatePassword($id, $hash, $clearResetToken=true)` | Permite reutilizar el método tanto en el reset (limpia el token) como en el cambio desde el dashboard (lo conserva). |
| `createFromGoogle($name, $email, $googleId)` | Alta vía Google Sign-In con cuenta marcada `active` y `verified_at = NOW()`. |
| `recordSuccessfulLogin($id, $ip)`, `recordFailedLogin($id, $maxAttempts=5, $lockMinutes=15)` | Tracking de logins. El `CASE WHEN` dentro de `recordFailedLogin` bloquea la cuenta 15 minutos al quinto intento fallido consecutivo, todo en una sola query. |
| `searchById($id)`, `updateProfile(...)`, `updateAvatarUrl($id, $url)` | Perfil. |
| `deleteById($id)` | Borra la cuenta. Una sola sentencia `DELETE FROM users WHERE id = ?` que se apoya en las FKs `ON DELETE CASCADE` desde `users` hacia `maps`, `notes`, `likes` y `comments` (las flashcards van pegadas a maps/notes y caen en la misma cadena). Devuelve `true` si se borró exactamente una fila. Cumple el "derecho al olvido" del RGPD a nivel de datos relacionales. |

### 4.2. `Map.php`

Tabla `maps`. Tiene dos zonas claramente separadas:

- **Operaciones del propietario** (`findByUser`, `findByIdForUser`, `create`, `update`, `delete`, `getUpdatedAt`, `countByUser`). Todas filtran por `user_id`. `countByUser` alimenta la métrica `maps_total` del panel de inicio (`GET dashboard/stats`).
- **Operaciones públicas para la capa social**:
  - `findBasicById($id)` — lookup mínimo `{id, user_id, is_public}` para que `LikeController` y `CommentController` decidan autorización en una sola query.
  - `findPublicForFeed($currentUserId, $sort, $q, $limit, $offset)` — feed comunidad. Recibe el id del usuario actual para calcular `liked_by_me` por mapa. Hace JOIN con `users` para autor y subqueries `COUNT(*)` para likes y comentarios. El parámetro `$sort` admite `recent` (por `updated_at DESC`) y `popular` (por `(likes_count + comments_count) DESC, updated_at DESC` — suma sin peso de las dos señales de interacción social, con tie-break temporal para evitar orden aleatorio entre empates).
  - `findPublicByIdWithMeta($mapId, $currentUserId)` — detalle de un mapa público con autor, counts y `liked_by_me`. Filtra por `is_public = 1`. Si el mapa existe pero es privado, devuelve `false` (mismo trato que "no existe", para no filtrar la existencia ajena).
  - `findPublicByUser($currentUserId, $authorUserId, $limit, $offset)` y `countPublicByUser($authorUserId)` — listado paginado de mapas públicos del autor visitado, para el perfil público.
  - `countPublicForFeed($q)` — total para `has_more` en la paginación.

Las queries del feed usan `bindValue` con `PDO::PARAM_INT` para `LIMIT` y `OFFSET` porque el modo emulado de PDO citaría los placeholders como string y MySQL en modo estricto rechazaría la query.

### 4.3. `Note.php`

Tabla `notes` (apuntes). Métodos:

- `findByUser($userId)` — listado ligero (excluye `extracted_text` y `file_path`).
- `findByIdForUser($id, $userId)` — fila completa, incluye `extracted_text` y `file_path` (datos internos que sólo ve el controller, no el cliente).
- `create($userId, $title, $sourceType, $originalFilename, $filePath, $extractedText, $charCount)` — soporta los dos modos: `pdf` (file_path lleno, extracted_text NULL) y `text` (file_path NULL, extracted_text lleno).
- `delete($id, $userId)` — borra la fila. **No** borra el archivo físico; eso lo gestiona `NoteController` con `unlink()` después de leer `file_path`.
- `getUpdatedAt($id)` — para devolver al frontend la marca de tiempo definitiva tras un upload.

### 4.4. `Flashcard.php`

Tabla `flashcards`. Concentra el **algoritmo SM-2 simplificado** en un único helper estático puro `Flashcard::computeReview($current, $grade)`, fácil de testear y de defender en pizarra:

- `grade='fail'` → `repetitions=0`, `interval=1 día`, `ease = max(1.30, ease-0.20)`.
- `grade='good'` → `repetitions++`, intervalo según `1, 6, round(prev*ease)`, ease igual.
- `grade='easy'` → como `good` + `ease = min(2.50, ease+0.10)`.
- En todos los casos `next_review_at = hoy + interval días`.

El método `applyReview($id, $userId, $current, $grade)` aplica el cálculo y persiste en una sola UPDATE. Devuelve los nuevos valores para que el controller no tenga que volver a consultar la BD.

`createBatch($userId, $mapId, $cards, $noteId=null)` inserta varias tarjetas en una única sentencia SQL (`INSERT ... VALUES (...), (...), ...`), envuelta en transacción. Pensado para `generateFromMap` y `ai/from-note { target: 'flashcards' }`: si la IA devuelve 12 tarjetas, las 12 entran atómicamente o ninguna. El parámetro `$noteId` permite persistir la FK al apunte de origen cuando la generación viene de un PDF (con `ON DELETE SET NULL`, las tarjetas sobreviven aunque se borre el apunte).

`findByUser($userId)` ya no es un `SELECT` plano: hace **LEFT JOIN con `notes`** filtrando además por `n.user_id = f.user_id` (cinturón anti-IDOR — si por bug `note_id` apuntase a un apunte ajeno, el JOIN devolvería `NULL` en `note_title` en vez de filtrar el título). De esta forma el frontend puede agrupar las flashcards en carpetas por apunte sin un segundo viaje a la BD.

`findDue($userId, $today, $noteFilter=null)` admite tres modos de filtrado por carpeta para alimentar la sesión de repaso filtrada (`?note=` en frontend):

- `null` → todas las pendientes (modo global).
- `'none'` → sólo las huérfanas (`note_id IS NULL`), usado por la carpeta "Sin apunte".
- entero positivo → sólo las de ese apunte concreto (`note_id = ?`).

El `WHERE` se construye en variables para que el prepared statement siga siendo seguro: la rama `'none'` añade SQL literal pero no parámetros; la rama entera añade un `?` y su valor.

`deleteByNote($userId, $noteId)` borra todas las flashcards de una carpeta en un único `DELETE`. Si `$noteId === null` aplica `note_id IS NULL` (carpeta "Sin apunte"); si es entero, `note_id = ?`. Devuelve el número de filas eliminadas para que el controller pueda traducir 0 filas en `404`.

Métricas para el panel de inicio (consumidas por `dashboardController::stats`):

- `countByUser($userId)` — total de flashcards del usuario.
- `countReviewedByUser($userId)` — total de flashcards con `last_reviewed_at IS NOT NULL`. Es la métrica más precisa que el modelo de datos actual permite: la BD no guarda historial de repasos individuales, así que cuenta tarjetas únicas que han recibido al menos un repaso (no el número total de repasos efectuados). Decisión documentada en el docstring del método.
- `computeStreakDays($userId)` — racha actual de días consecutivos con repaso. Una sola query (`SELECT DISTINCT DATE(last_reviewed_at)`) ordenada DESC y un recorrido en PHP. Política: el día semilla es **hoy** si hubo repaso hoy o **ayer** si no, para no romper la racha por no haber empezado todavía el día actual (alineado con Anki/Duolingo). Si el último repaso es anterior a ayer, la racha es 0.

### 4.5. `Like.php`

Tabla `likes`. Métodos:

- `toggle($userId, $mapId)` — comprueba si la fila existe (`SELECT 1`) y borra o inserta. Devuelve `true` si quedó likeado, `false` si quedó deslikeado. La PK compuesta de la tabla impide duplicados a nivel de BD; el `INSERT IGNORE` cubre la pequeña ventana de carrera entre los dos statements.
- `countByMap($mapId)` — contador para badges.
- `userHasLiked($userId, $mapId)` — bool para inicializar el corazón en el feed.
- `findFavoritesForUser($userId, $limit, $offset)` y `countFavoritesForUser($userId)` — los likes funcionan también como bookmarks ("Mis favoritos"). Filtra mapas privados ajenos pero permite que el dueño vea sus propios mapas privados favoriteados.

### 4.6. `Comment.php`

Tabla `comments`. Métodos:

- `findByMap($mapId, $limit, $offset)` y `countByMap($mapId)` — listado paginado del hilo de un mapa. JOIN con `users` para evitar N+1 desde el frontend.
- `findByIdForUserOrMapOwner($commentId, $userId)` — devuelve la fila si el usuario es **autor del comentario** o **dueño del mapa**. La autorización vive en el `WHERE`, no en código PHP, lo que evita dos round-trips a la BD.
- `create($mapId, $userId, $body)` y `delete($commentId)`.
- `findByIdWithAuthor($commentId)` — el controller la usa tras `create()` para devolver al cliente el comentario con su autor sin un `SELECT` adicional.

---

## 5. Capa Middleware

### 5.1. `backend/API/middleware/verify-token.php`

Define `AuthMiddleware::verifyToken()`. Cualquier controller que requiera usuario autenticado lo invoca **como primera acción** del método.

```php
$auth   = AuthMiddleware::verifyToken();
$userId = $auth['id'];
```

Lo que hace:

1. Lee la cabecera `Authorization`. Las cabeceras HTTP son case-insensitive según RFC 7230, pero bajo `php -S` el case del cliente se preserva tal cual; el código normaliza todas las claves a minúscula con `array_change_key_case` para que el endpoint funcione tanto bajo Apache (que las normaliza) como bajo el servidor embebido (que no).
2. Comprueba el formato `Bearer <token>` con regex.
3. Llama a `JWT::validate($token)` y, si es válido, devuelve el payload `{id, name, email}`.
4. Si falla cualquier paso, responde `401` con JSON y termina con `exit()` para que el controller no continúe operando con datos no autenticados.

Este patrón está repetido en todos los controllers protegidos. La única excepción es el legacy `profileController`, que mantiene un helper privado `getAuthenticatedUser()` con la misma lógica heredado de antes de extraer el middleware. Se mantiene así para no introducir cambios cosméticos a un archivo cerrado.

---

## 6. Capa Controller

Los controllers viven en `backend/API/controllers/`. Reglas comunes:

- Cada método público corresponde 1:1 con una ruta del `api.php`.
- Termina siempre con `echo json_encode([...])`. Nunca devuelve HTML.
- Respuesta uniforme: `{ success: bool, message?: string, data?: ..., pagination?: ... }`.
- Códigos HTTP coherentes: `200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `410 Gone`, `413 Payload Too Large`, `415 Unsupported Media Type`, `500 Internal Server Error`, `503 Service Unavailable`.
- `try/catch (PDOException)` alrededor de las llamadas al modelo. El detalle real va a `error_log`; el cliente recibe un mensaje genérico para no exponer información SQL.
- **Ownership en cada endpoint**: el modelo filtra por `user_id`, y antes de un `update` el controller verifica con `findByIdForUser` que la fila existe. Si no existe, `404` con el mismo mensaje que el caso "no existe", para no filtrar la existencia de recursos ajenos.

### 6.1. `authController.php`

Endpoints de autenticación. Seis métodos:

- **`login`** — credenciales por email/password, además de un atajo "Super User" (cuenta virtual con id `999`) configurada por `.env`. Comprueba bloqueo temporal (`locked_until > NOW()`), valida con `password_verify`, registra intento fallido o exitoso (que también desbloquea), exige cuenta verificada antes de emitir token, y devuelve un JWT firmado con id/name/email.
- **`register`** — alta clásica. Hashea con `password_hash(PASSWORD_DEFAULT)`, genera un `verification_token` con `random_bytes(32)`, persiste y dispara el email de confirmación a través de `EmailService` (`require_once` perezoso para no cargar SendGrid si el endpoint no lo necesita).
- **`forgotPassword`** — siempre responde lo mismo ("Si el email existe..."), genera token sólo si el usuario existe, lo guarda con expiración de 1 hora y envía el email. Esa respuesta uniforme es **antienumeración**: un atacante no puede usar el endpoint para descubrir qué emails están registrados.
- **`resetPassword`** — valida token vía `findByResetToken` (ya filtra por `reset_expires > NOW()`), exige longitud mínima, hashea y persiste con `clearResetToken=true`.
- **`confirmAccount`** — marca la cuenta como `active` y limpia `verification_token`.
- **`googleLogin`** — verifica el `id_token` contra `oauth2.googleapis.com/tokeninfo`, busca o crea al usuario (con `createFromGoogle`, que entra activo y verificado porque Google ya validó el email), y emite JWT.

### 6.2. `profileController.php`

Cinco endpoints autenticados. Único controller que no usa `AuthMiddleware`: tiene un helper privado `getAuthenticatedUser()` con la misma lógica, heredado del legacy.

- **`getProfile` (GET `profile/me`)** — devuelve el perfil completo, eliminando explícitamente los campos sensibles (`password`, `verification_token`, `reset_token`, `reset_expires`, `two_factor_secret`) antes de hacer `json_encode`. Además devuelve un objeto sintético si el usuario es el Super User virtual.
- **`updateProfile`** — actualiza `name`, `phone`, `company_name`, `locale`, `timezone`. Exige nombre no vacío.
- **`changePassword`** — pide la contraseña actual, la verifica con `password_verify` y, si coincide, sustituye por la nueva (sin tocar `reset_token`).
- **`uploadAvatar`** — recibe un `multipart/form-data` con campo `avatar`. Valida MIME y tamaño (máx 2 MB), normaliza la extensión, mueve el archivo a `backend/public/uploads/avatars/<file>`, construye la URL absoluta con `BACKEND_PUBLIC_URL` y persiste con `User::updateAvatarUrl`.
- **`deleteAccount` (POST `profile/delete`)** — borra definitivamente la cuenta del usuario autenticado. Pasos: (1) bloquea al Super User (id 999) con `403` porque no existe en BD y la operación devolvería un falso negativo; (2) exige en el body `{ email_confirmation }` y rechaza si está vacío; (3) busca al usuario y compara `email_confirmation` con `users.email` con `strcasecmp` (si no coincide → mensaje accionable); (4) llama a `User::deleteById` envuelto en `try/catch` para registrar internamente cualquier `Throwable`. La cascada `ON DELETE CASCADE` desde `users` hacia el resto del rastro del usuario (maps, notes, likes, comments y, por extensión, las flashcards que cuelgan de ellos) se aplica a nivel de BD: el controller emite un único `DELETE`. **Decisión de seguridad**: el JWT es la prueba de identidad real; el "tipea tu email" es UX anti-misclick (patrón Vercel/Cloudflare), no autenticación adicional. La validación del email se duplica también en backend como defensa en profundidad por si alguien llamase el endpoint a mano con el JWT pero un email distinto.

### 6.3. `mapController.php`

CRUD de mapas conceptuales. Cuatro métodos:

- **`list`** — `MapModel::findByUser`. Convierte `id` a int y `is_public` a bool antes de devolver.
- **`get`** — `MapModel::findByIdForUser`. Si no existe → `404`. Devuelve el mapa con `drawflow_json` incluido.
- **`save`** — método doble (crear si no llega `id`, actualizar si llega). Acepta `drawflow_json` como objeto (lo serializa a string JSON) o como string (valida que sea JSON parseable). Antes de un `update`, verifica con `findByIdForUser` que el mapa existe y pertenece al usuario; si no, `404` sin distinguir si "no existe" o "es de otro". Bloquea al Super User (id 999) con `403` para evitar romper la FK `fk_maps_user`.
- **`delete`** — `MapModel::delete` (que ya filtra por `user_id`). Si `rowCount == 0`, devuelve `404`.

### 6.4. `aiController.php`

Único endpoint actual (la fase IA de apuntes vive en otra rama):

- **`expand`** — recibe `node_label` y `parent_context`, valida longitudes, llama a `AIClient::expand` y devuelve `{ children: [{label, hint}, ...] }`. Si el cliente lanza `RuntimeException` (cualquier fallo de IA), responde `503` con mensaje canónico "La IA no está disponible ahora.". Si lanza `Throwable` inesperado, `500`.

### 6.5. `noteController.php`

CRUD de apuntes. Cinco métodos. La almacenamiento físico de PDFs vive bajo `backend/uploads/notes/<user_id>/<uuid>.pdf` (fuera del directorio público: nunca se sirve por URL estática, siempre vía endpoint autenticado).

- **`list`** — listado ligero sin `extracted_text` ni `file_path`.
- **`get`** — fila completa pero filtrando `file_path` antes de responder (es ruta interna del servidor, el cliente no debe conocerla). El método privado `normalizePublic()` hace ese stripping.
- **`upload`** — detecta el modo según `$_FILES['pdf']`:
  - **PDF**: valida MIME declarado y extensión, mueve con `move_uploaded_file` a `<uploads>/notes/<user_id>/<uuid>.pdf` (UUID generado con `random_bytes(16)`), y **revalida el MIME real** con `finfo` leyendo los magic bytes del archivo en disco. Si los magic bytes no coinciden con `application/pdf`, borra el huérfano y responde `415`. Esto evita que un atacante envíe un `.exe` etiquetado falsamente como `application/pdf`.
  - **Texto**: persiste el body en `extracted_text` con `char_count = mb_strlen()`. Límite defensivo 200 000 caracteres.
- **`file`** — sirve el binario PDF tras verificar ownership por JWT. Sustituye la cabecera `Content-Type` por `application/pdf`, fija `Content-Disposition: inline` (para iframe), `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`. El frontend lo envuelve con `URL.createObjectURL` para mostrarlo embebido. Si el archivo físico ha desaparecido pero la fila sigue → `410 Gone`.
- **`delete`** — borra la fila y, si había PDF, también el archivo físico con `unlink`. Si la limpieza del archivo falla, lo loguea pero no degrada la respuesta (el contrato del cliente es "el apunte ya no existe").

Helpers privados:
- `absolutePathForRelative($relative, $userId)` — convierte la ruta relativa de BD a absoluta y verifica que cae dentro de `backend/uploads/notes/<user_id>/`. Defensa en profundidad contra path traversal.
- `sanitizeFilenameForHeader($name)` — sanea el nombre que va al header `Content-Disposition` (sin saltos de línea, sin comillas, sin caracteres no ASCII).

### 6.6. `flashcardController.php`

CRUD + repaso SM-2 + generación IA + acciones de carpeta. Siete métodos:

- **`list`** — todas las flashcards del usuario, ordenadas por urgencia. Ahora incluye `note_title` por flashcard (LEFT JOIN con `notes` en el modelo) para que el frontend pueda agruparlas en carpetas por apunte sin un fetch extra.
- **`due`** — flashcards vencidas hoy o antes (cola de repaso). Acepta filtro opcional `?note_id=...` por query string para limitar la sesión a una sola carpeta: valor `'none'` → sólo huérfanas (`note_id IS NULL`); número entero → sólo de ese apunte concreto. Cualquier otro valor cae al modo global silenciosamente (no se rompe ni filtra de más). La validación usa `ctype_digit` antes de castear a entero.
- **`save`** — crea o actualiza. En `create` con `map_id` no nulo verifica que el mapa pertenece al usuario, para evitar que se cuelgue una tarjeta de un mapa ajeno. Devuelve la fila completa post-operación con tipos casteados.
- **`review`** — recibe `{id, grade}` con `grade ∈ {fail, good, easy}`. Verifica ownership, llama a `Flashcard::applyReview`, y devuelve la fila actualizada con `last_reviewed_at` y los nuevos `ease_factor`, `interval_days`, `repetitions`, `next_review_at`.
- **`delete`** — borrado individual con verificación de ownership a nivel de query.
- **`deleteByNote` (POST `flashcards/delete-by-note`)** — borrado masivo de una carpeta entera. Body: `{ note_id: number }` para una carpeta concreta o `{ note_id: null }` para la carpeta huérfanos (`note_id IS NULL`). El controller distingue "no enviaste la clave" de "la enviaste como `null`" con `array_key_exists` (`isset` trataría `null` como ausencia). Bloquea al Super User. Llama a `Flashcard::deleteByNote` que ejecuta un único `DELETE`; si `rowCount === 0` devuelve `404` con mensaje accionable ("Esa carpeta ya no tiene flashcards que borrar"). Si borró → `200 { data: { deleted: N } }`.
- **`generateFromMap`** — verifica que el mapa pertenece al usuario, parsea el `drawflow_json` con el helper `extractNodesFromDrawflow` (que lee la estructura `decoded.drawflow.Home.data` de Drawflow y extrae nodos como `{label, hint}`), llama a `AIClient::generateFlashcards` y persiste con `Flashcard::createBatch`. Si la IA no está disponible → `503`. Si el mapa no tiene nodos → `400` accionable.

El helper privado `normalize()` ahora añade `note_title` al objeto serializado. Es `null` cuando la fila viene de un endpoint que no hace JOIN (p. ej. `save` o `review` después de un UPDATE) — se gestiona con `isset && !== null` para que el front siempre reciba el campo aunque sea vacío.

### 6.7. `feedController.php`

Lectura de la capa social. Cinco métodos:

- **`list` (GET `community/feed`)** — feed de mapas públicos. Acepta `sort=recent|popular`, `q=texto` (LIKE sobre title/description, máx 100 chars), `page` y `page_size` (default 12, máx 50).
- **`getPublicMap`** — detalle de un mapa público con autor, counts y `liked_by_me`. `404` si no existe o no es público (mismo mensaje).
- **`getProfile`** — perfil público. **Sin email ni teléfono** (RGPD). Sólo `id`, `name`, `avatar_url` y `public_maps_count`.
- **`getProfileMaps`** — listado paginado de mapas públicos del autor visitado.
- **`getMyFavorites`** — los mapas que el usuario actual ha likeado. En esta lista, el controller fuerza `liked_by_me = true` para que el frontend no tenga que asumirlo.

Helpers privados `resolvePagination`, `makePagination`, `normalizeFeedRow` y `normalizePublicMap` evitan duplicar lógica entre los métodos. La normalización mete el autor en un subobjeto anidado (`{id, name, avatar_url}`) en lugar de columnas planas tipo `author_id`/`author_name`, lo que da al frontend una forma estable que consumir.

### 6.8. `likeController.php`

Único método: **`toggle`** (POST `community/like`). Recibe `{map_id}`. Comprueba que el mapa existe y es público (excepción: el dueño puede likear su propio mapa privado, comportamiento coherente con "guardar para luego"). Llama a `Like::toggle` y `Like::countByMap`, y devuelve `{liked: bool, count: int}` con la cuenta canónica recalculada con un `SELECT COUNT(*)` post-toggle. Bloquea al Super User con `403` (la FK `fk_likes_user` lo rechazaría).

### 6.9. `commentController.php`

Tres métodos:

- **`list`** — listado paginado de comentarios de un mapa. El mapa debe ser público (excepción dueño). Cada comentario incluye `can_delete` ya calculado para que el frontend no tenga que cruzar IDs.
- **`create`** — body 1-1000 caracteres. Verifica que el mapa es público. Devuelve el comentario completo con autor anidado.
- **`delete`** — autorización delegada al modelo (`findByIdForUserOrMapOwner`): el comentario lo puede borrar su autor o el dueño del mapa. Si no se cumple ninguna de las dos condiciones → `404` (mismo mensaje que "no existe").

No hay endpoint de edición. Decisión documentada en `community-plan §1.3`: KISS y evita ataques tipo "edito mi comentario después de que me lo respondan/likeen".

### 6.10. `dashboardController.php`

Agregador transversal para la página de Inicio (`/dashboard`). Único método:

- **`stats` (GET `dashboard/stats`)** — devuelve cuatro métricas del usuario autenticado: `maps_total`, `flashcards_total`, `flashcards_reviewed_total` y `streak_days`. Cada métrica se delega a un método del modelo correspondiente (`Map::countByUser`, `Flashcard::countByUser`, `Flashcard::countReviewedByUser`, `Flashcard::computeStreakDays`); el controller no construye SQL a mano, respeta la regla MVC del proyecto. Para el Super User (id 999) responde `200` con todos los contadores a 0 en lugar de `403`: no tiene fila en `users`, pero romperle el panel con un error sería peor UX y la lectura es inocua. Coherente con la doctrina del proyecto: bloqueamos al Super User en escrituras (mapController::save, etc.) pero no en lecturas.

**Por qué un controller propio en lugar de añadir el endpoint a `mapController` o `flashcardController`**: el dashboard es un agregador transversal que cruza varias features (mapas, flashcards y, en el futuro, apuntes). Meterlo en un controller de dominio rompería la regla 1 controller ↔ 1 feature que sigue el resto del backend. Un archivo dedicado es la decisión más limpia y la más fácil de defender en pizarra.

---

## 7. Capa Servicios

### 7.1. `backend/API/services/AIClient.php`

Cliente HTTP fino sobre Ollama, configurado por `OLLAMA_BASE_URL` y `OLLAMA_MODEL` en `.env`. Sólo curl nativo, sin SDKs Composer (encaja con la regla "no introduzcas librerías que el alumno no pueda explicar").

Comportamiento:

- **Sin configuración** (cualquiera de las dos variables vacía) → modo demo. El método `stubChildren($label)` devuelve 3 sub-conceptos genéricos. Esto permite que el editor sea funcional aunque Ollama no esté levantado en el momento de la defensa.
- **Con configuración** → llamada real a `POST <baseUrl>/api/chat` con `format: 'json'`, `stream: false`, `temperature: 0.5`, `num_predict: 800` (1500 para flashcards). Timeout 30 s, connect timeout 5 s.

Dos métodos públicos:

- **`expand($label, $context)`** — devuelve 3-5 hijos `[{label, hint}, ...]`. Saneamiento posterior: descarta hijos sin label, recorta a 100/200 chars y máximo 5.
- **`generateFlashcards($mapTitle, $nodes)`** — devuelve 8-15 tarjetas `[{front, back}, ...]`. Saneamiento: descarta tarjetas sin front/back, recorta a 200 chars, máximo 15.

Estrategia de errores: cualquier fallo (red, HTTP no-200, JSON inválido, falta de campos esperados) lanza `RuntimeException` con mensaje canónico. El controller la traduce a `503 "La IA no está disponible ahora."`. **Nunca cae en stub silencioso** ante un fallo real: es defendible que el usuario vea el problema en lugar de recibir datos demo cuando esperaba IA real.

Los prompts (helpers privados `buildPrompt` y `buildFlashcardsPrompt`) están escritos en castellano y especifican el schema JSON esperado palabra por palabra como refuerzo de `format: 'json'`.

> **Nota de evolución**: el archivo `CLAUDE.md` del proyecto documenta el plan de migrar de Ollama a Google Gemini (ADR-07). Esa migración vive en una rama futura `ia-integration`. La versión que se entrega como Fase Maps M4 es la que documenta este capítulo.

---

## 8. Cómo se llaman entre sí: ejemplos completos

### 8.1. Recorrido de `POST maps/save` (crear mapa)

1. **Frontend** → `apiPost('maps/save', { title: "Algoritmos", drawflow_json: editor.export(), is_public: 0 })`. El wrapper inyecta `Authorization: Bearer <jwt>` y serializa el body como JSON.
2. **`backend/public/index.php`** → `require_once 'API/index.php'`.
3. **`backend/API/index.php`** → carga `cors.php`, `env.php`, abre PDO, entra al `try` y hace `require_once 'router/api.php'`.
4. **`router/api.php`** → registra rutas, lee `$_GET['route'] = 'maps/save'` y `$_SERVER['REQUEST_METHOD'] = 'POST'`, llama `Router::dispatch('POST', 'maps/save')`.
5. **`Router::dispatch`** → encuentra la ruta, lee `php://input`, hace `json_decode` a `$data`, instancia `MapController` con `$db` y llama `save($data)`.
6. **`MapController::save`**:
   1. `AuthMiddleware::verifyToken()` → lee la cabecera, llama a `JWT::validate`, devuelve `{id, name, email}`.
   2. Bloquea Super User con `403` si procede.
   3. Valida título (no vacío, ≤ 200 chars).
   4. Normaliza `drawflow_json` a string JSON.
   5. Como `id` no llega → camino CREATE → `Map::create($userId, $title, $description, $isPublic, $drawflowJson)`.
7. **`Map::create`** → `INSERT INTO maps (...) VALUES (?,?,?,?,?)`. Devuelve `lastInsertId`.
8. **`MapController::save`** → llama a `Map::getUpdatedAt($newId)` para devolver la marca de tiempo definitiva, formatea respuesta y `echo json_encode([...])` con `201`.
9. **Frontend** recibe `{ success: true, message: "Mapa creado.", data: { id, updated_at } }` y actualiza el estado de React.

### 8.2. Recorrido de `POST flashcards/generate-from-map`

1. **Frontend** → `apiPost('flashcards/generate-from-map', { map_id: 42 })`.
2. Bootstrap + Router idéntico al anterior.
3. **`FlashcardController::generateFromMap`**:
   1. `AuthMiddleware::verifyToken()`.
   2. Bloquea Super User.
   3. Valida `map_id`.
   4. `Map::findByIdForUser($mapId, $userId)` — verifica ownership y obtiene `drawflow_json`.
   5. `extractNodesFromDrawflow($map['drawflow_json'])` — parsea el JSON de Drawflow, extrae nodos `{label, hint}`. Si está vacío → `400`.
   6. `AIClient::generateFlashcards($map['title'], $nodes)` — POST a Ollama con prompt en castellano + schema. Si lanza `RuntimeException` → catch → `503`.
   7. `Flashcard::createBatch($userId, $mapId, $cards)` — un único `INSERT INTO flashcards VALUES (...), (...), ...` envuelto en transacción.
   8. Responde `201 { success: true, data: { created: 12 } }`.

### 8.3. Recorrido de `GET community/feed`

1. **Frontend** → `apiGet('community/feed?sort=popular&page=1&page_size=12')`.
2. Router instancia `FeedController` y llama `list($_GET)`.
3. **`FeedController::list`**:
   1. `AuthMiddleware::verifyToken()` → necesita usuario autenticado para calcular `liked_by_me` por mapa.
   2. Sanea `sort`, `q`, paginación.
   3. `Map::findPublicForFeed($userId, $sort, $q, $limit, $offset)` — hace JOIN con `users`, dos subqueries `COUNT(*)` (likes y comments) y un `EXISTS` para `liked_by_me`, todo en una sola query.
   4. `Map::countPublicForFeed($q)` para `has_more`.
   5. Normaliza con `normalizeFeedRow` (anida autor, castea bools).
   6. Responde `200 { data: [...], pagination: {...}, sort, q }`.

### 8.4. Recorrido de `GET notes/file?id=N`

Caso especial: el endpoint **no devuelve JSON**, devuelve un binario.

1. **Frontend** → `apiDownload('notes/file?id=7')` (helper distinto al `apiGet` normal: envuelve la respuesta como `Blob` y la pasa a `URL.createObjectURL`).
2. **`NoteController::file`**:
   1. `AuthMiddleware::verifyToken()`.
   2. `Note::findByIdForUser` — ownership a nivel de query.
   3. Si el apunte es de tipo `text` (no hay PDF) → `409`.
   4. Resuelve la ruta absoluta, comprueba que cae bajo `backend/uploads/notes/<user_id>/`. Si el archivo físico no existe → `410 Gone`.
   5. Sustituye el header `Content-Type: application/json` (puesto por `cors.php` por defecto) por `application/pdf`, añade `Content-Length`, `Content-Disposition: inline`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
   6. `readfile($absolute)` — emite el binario directamente.

---

## 9. Decisiones transversales y por qué se defienden

| Decisión | Por qué se eligió |
| --- | --- |
| **MVC headless (sólo JSON)** | Separa frontend (React) y backend (PHP) por contrato HTTP. Permite que el frontend evolucione (o se sustituya por una app móvil) sin tocar el backend. |
| **JWT propio en lugar de sesiones** | Stateless: no requiere tabla `sessions` ni storage compartido. Defendible en pizarra (70 líneas en `jwt.php`). |
| **Prepared statements posicionales (`?`) en todos los modelos** | Imposibilita SQL injection por construcción. Cumple 0613 RA6. |
| **Filtrado por `user_id` en cada query del propietario (anti-IDOR)** | Defensa en profundidad: aunque el controller olvidara comprobar, la BD ya no devolvería filas ajenas. |
| **Mismo mensaje 404 para "no existe" y "es de otro usuario"** | Antienumeración: un atacante no puede usar 404/403 para descubrir qué IDs existen. |
| **Respuesta 503 canónica `"La IA no está disponible ahora."` ante cualquier fallo de IA** | Mensaje único protege detalles internos y simplifica la UX en frontend. |
| **Try/catch global en `API/index.php`** | Cualquier excepción no controlada se traduce en JSON `500` en lugar de un stack trace HTML. |
| **Migraciones SQL comentadas a mano** | Documentan contexto y trade-offs del schema. Cumplen función de documentación adicional. |
| **MIME real de PDFs validado con `finfo` después del upload** | Evita que un cliente declare MIME falso para subir un binario distinto. Defensa en profundidad sobre la confianza de `$_FILES['type']`. |
| **Algoritmo SM-2 aislado en `Flashcard::computeReview` puro** | Testeable sin BD, una sola fuente de verdad para la fórmula. |

---

## 10. Mapa rápido de archivos backend

```
backend/
├── public/index.php                    Document root público
├── API/
│   ├── index.php                       Bootstrap + try/catch global
│   ├── router/
│   │   ├── Router.php                  Clase dispatcher
│   │   └── api.php                     Registro de rutas
│   ├── middleware/
│   │   └── verify-token.php            AuthMiddleware::verifyToken (JWT)
│   ├── controllers/
│   │   ├── authController.php          Login, registro, reset, Google, confirm
│   │   ├── profileController.php       /me, update, password, avatar
│   │   ├── dashboardController.php     Métricas agregadas página Inicio
│   │   ├── mapController.php           CRUD mapas conceptuales
│   │   ├── aiController.php            ai/expand
│   │   ├── noteController.php          CRUD apuntes + servir PDF
│   │   ├── flashcardController.php     CRUD + SM-2 + generate-from-map
│   │   ├── feedController.php          Feed comunidad (5 endpoints lectura)
│   │   ├── likeController.php          Toggle de likes
│   │   └── commentController.php       Hilo de comentarios
│   └── services/
│       └── AIClient.php                Cliente HTTP a Ollama (curl)
├── DATA/
│   ├── cors.php                        Cabeceras CORS + preflight
│   ├── env.php                         EnvLoader (.env)
│   ├── database.php                    PDO MySQL
│   ├── jwt.php                         JWT HS256 propio
│   ├── sendgrid.php                    EmailService
│   └── migrations/                     Migraciones SQL numeradas
├── MODEL/
│   ├── user.php                        Tabla users
│   ├── Map.php                         Tabla maps + queries comunidad
│   ├── Note.php                        Tabla notes (apuntes)
│   ├── Flashcard.php                   Tabla flashcards + SM-2 puro
│   ├── Like.php                        Tabla likes + favoritos
│   └── Comment.php                     Tabla comments
├── uploads/                            Storage privado (PDFs notes)
├── public/uploads/avatars/             Storage público (avatares perfil)
└── vendor/                             Dependencias Composer (SendGrid, php-jwt)
```
