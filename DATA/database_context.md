# NodeWeaver - Database Context Map

> Mapa de la base de datos `autoflow` para que cualquier agente de IA (Cursor, Gemini, Antigravity, Copilot...) entienda el modelo de datos **sin necesidad de consultar el servidor MySQL**.
>
> Fuente de verdad: [`DATA/schema.sql`](./schema.sql).
> Conexión: [`DATA/database.php`](./database.php) (PDO, MariaDB 10.4+, charset `utf8mb4_unicode_ci`).

---

## 1. Visión general

NodeWeaver es una plataforma de automatización tipo n8n con:

- **Backend**: PHP clásico MVC (`MODEL/`, `API/controllers/`, `API/router/`).
- **Frontend**: HTML/JS vanilla + [Drawflow](https://github.com/jerosoler/Drawflow) que produce un JSON serializado almacenado en `automations.flow_data`.
- **Auth**: JWT (emisión en `DATA/jwt.php`, validación por controlador). Flujos activos: registro, login clásico, Google OAuth2 y recuperación por email.
- **Persistencia**: 8 tablas en MariaDB/MySQL.

### ERD lógico (texto)

```
users (1) ──┬── (N) automations ──┬── (N) execution_logs ── (N) execution_node_logs
            │                     ├── (N) webhooks
            │                     └── (N) automation_stats
            ├── (N) sessions
            └── (N) credentials_vault
```

Todas las tablas hijas propagan `ON DELETE CASCADE` desde `users` / `automations`: borrar una cuenta limpia TODO el rastro del usuario (obligación RGPD).

---

## 2. Tablas

### 2.1 `users`

Cuenta, perfil y seguridad.

| Campo                      | Tipo          | Obligatorio | Notas                                                 |
| -------------------------- | ------------- | ----------- | ----------------------------------------------------- |
| `id`                       | INT PK        | sí          | Autoincremental                                       |
| `name`                     | VARCHAR(100)  | sí          |                                                       |
| `email`                    | VARCHAR(255)  | sí (UNIQUE) | Login primario                                        |
| `password`                 | VARCHAR(255)  | no          | bcrypt. NULL solo si el usuario entró por Google      |
| `google_id`                | VARCHAR(255)  | no (UNIQUE) | `sub` del ID Token de Google                          |
| `phone`                    | VARCHAR(20)   | no          |                                                       |
| `company_name`             | VARCHAR(100)  | no          |                                                       |
| `avatar_url`               | VARCHAR(500)  | no          | URL absoluta hacia `backend/uploads/avatars/` (configurable con `BACKEND_PUBLIC_URL` en .env) |
| `locale`                   | VARCHAR(10)   | sí          | Default `es`                                          |
| `timezone`                 | VARCHAR(50)   | sí          | Default `UTC`                                         |
| `role`                     | ENUM          | sí          | `free` \| `pro` \| `enterprise` \| `admin`            |
| `status`                   | ENUM          | sí          | `pending` \| `active` \| `suspended` \| `deleted`     |
| `two_factor_enabled`       | TINYINT(1)    | sí          | 0/1                                                   |
| `two_factor_secret`        | VARCHAR(255)  | no          | TOTP (base32) cifrado                                 |
| `two_factor_backup_codes`  | JSON          | no          | Array de códigos de un solo uso (hash)                |
| `two_factor_verified_at`   | TIMESTAMP     | no          | Fecha de activación confirmada del 2FA                |
| `verification_token`       | VARCHAR(100)  | no          | Token de confirmación de email                        |
| `verified_at`              | TIMESTAMP     | no          | Fecha en que se verificó el email                     |
| `reset_token`              | VARCHAR(100)  | no          | Token de recuperación de contraseña                   |
| `reset_expires`            | TIMESTAMP     | no          | Caducidad de `reset_token` (1h)                       |
| `last_login_at`            | TIMESTAMP     | no          |                                                       |
| `last_login_ip`            | VARCHAR(45)   | no          | IPv4/IPv6                                             |
| `failed_login_attempts`    | INT UNSIGNED  | sí          | Default 0                                             |
| `locked_until`             | TIMESTAMP     | no          | Bloqueo temporal tras N fallos                        |
| `preferences`              | JSON          | no          | UI, notificaciones, etc.                              |
| `created_at` / `updated_at`| TIMESTAMP     | sí          |                                                       |

**Reglas de negocio:**

- Un usuario se crea con `status = 'pending'` y `verification_token` no nulo (ver `AuthController::register`).
- `AuthController::confirmAccount` pone `status = 'active'` y deja `verification_token = NULL`.
- El login falla si `verification_token` no es NULL (cuenta sin verificar).
- `AuthController::forgotPassword` guarda `reset_token` + `reset_expires = NOW + 1h`.
- `AuthController::resetPassword` exige `reset_expires > NOW()` y limpia ambos campos al tener éxito.
- El Super User (`id = 999`) es virtual: **NO existe en DB**, vive solo en `.env` (`SUPER_USER_EMAIL` / `SUPER_USER_PASSWORD`) y el controlador lo inyecta en el JWT.

**Enums válidos:**

- `role`: `free` (default) | `pro` | `enterprise` | `admin`.
- `status`: `pending` (recién registrado) | `active` (email verificado) | `suspended` (bloqueado por admin) | `deleted` (soft-delete).

---

### 2.2 `automations`

Flujos de Drawflow del usuario.

| Campo                | Tipo         | Notas                                                                    |
| -------------------- | ------------ | ------------------------------------------------------------------------ |
| `id`                 | INT PK       |                                                                          |
| `user_id`            | INT FK       | → `users.id` ON DELETE CASCADE                                           |
| `name`               | VARCHAR(255) | Default `'Sin nombre'`                                                   |
| `description`        | TEXT         |                                                                          |
| `trigger_type`       | ENUM         | `manual` \| `webhook` \| `schedule` \| `event` \| `email`                |
| `schedule_expression`| VARCHAR(100) | Cron (p. ej. `*/5 * * * *`) cuando `trigger_type='schedule'`             |
| `flow_data`          | JSON         | **Resultado de `drawflow.export()`**. Estructura: `{drawflow: {Home: {data: {nodeId: {...}}}}}` |
| `tags`               | JSON         | Array de strings para filtrar en la UI                                   |
| `version`            | INT UNSIGNED | Versionado incremental en cada `update`                                  |
| `is_active`          | TINYINT(1)   | 0 = en borrador, 1 = escucha triggers                                    |
| `last_run_at`        | TIMESTAMP    | Se actualiza al terminar cada ejecución                                  |
| `last_run_status`    | ENUM         | `success` \| `error` \| `running` \| `timeout`                           |
| `total_runs`         | INT UNSIGNED | Contador acumulado                                                       |
| `total_errors`       | INT UNSIGNED | Contador acumulado                                                       |

**Reglas de negocio:**

- `AutomationController::save` hace upsert: sin `id` → `create`, con `id` → `update` (el modelo lo restringe por `user_id` para evitar IDOR).
- `flow_data` se guarda **tal cual** llega del frontend (ya es JSON válido).
- `last_run_*` y los contadores se actualizan desde el worker de ejecución (ver `execution_logs`).

---

### 2.3 `sessions`

Sesiones JWT activas. Sirve para logout global y auditoría de inicios de sesión.

| Campo        | Tipo          | Notas                                                       |
| ------------ | ------------- | ----------------------------------------------------------- |
| `id`         | BIGINT PK     |                                                             |
| `user_id`    | INT FK        |                                                             |
| `token_hash` | VARCHAR(128)  | **SHA-256 hex del JWT**, nunca el token en claro            |
| `ip_address` | VARCHAR(45)   |                                                             |
| `user_agent` | TEXT          |                                                             |
| `revoked_at` | TIMESTAMP     | NULL mientras esté activa                                   |
| `expires_at` | TIMESTAMP     | Coincide con `exp` del JWT                                  |
| `created_at` | TIMESTAMP     |                                                             |

**Reglas:** middleware de autenticación rechaza tokens cuyo hash aparece con `revoked_at` no nulo o `expires_at < NOW()`.

---

### 2.4 `credentials_vault`

Bóveda cifrada del usuario.

| Campo             | Tipo         | Notas                                                                           |
| ----------------- | ------------ | ------------------------------------------------------------------------------- |
| `id`              | INT PK       |                                                                                 |
| `user_id`         | INT FK       |                                                                                 |
| `name`            | VARCHAR(100) | Alias que verá el usuario                                                       |
| `description`     | VARCHAR(255) |                                                                                 |
| `service`         | VARCHAR(50)  | `github`, `openai`, `aws`, `slack`, `mysql`...                                  |
| `credential_type` | ENUM         | `api_key` \| `oauth2` \| `basic_auth` \| `ssh_key` \| `bearer_token` \| `custom`|
| `encrypted_data`  | TEXT         | Payload en base64 cifrado con **AES-256-GCM**                                   |
| `encryption_iv`   | VARCHAR(64)  | IV/Nonce en base64                                                              |
| `encryption_tag`  | VARCHAR(64)  | Auth tag GCM en base64                                                          |
| `fingerprint`     | VARCHAR(64)  | SHA-256 no reversible, sirve para detectar duplicados y para mostrar `••••xxxx` |
| `is_valid`        | TINYINT(1)   | Marcado a 0 si una validación externa falla                                     |
| `last_used_at`    | TIMESTAMP    |                                                                                 |
| `expires_at`      | TIMESTAMP    | Para tokens OAuth2 o certificados con caducidad                                 |

**Reglas de cifrado (obligatorias):**

1. La clave maestra vive en `.env` como `APP_VAULT_KEY` (32 bytes base64). **Nunca en DB**.
2. Algoritmo: `openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag)`.
3. Estructura del payload en claro antes de cifrar: JSON `{ "value": "...", "meta": {...} }`.
4. El `fingerprint` = `hash('sha256', $service . ':' . $plaintextValue)`, útil para evitar re-guardar la misma clave.

---

### 2.5 `webhooks`

Endpoints HTTP públicos que disparan automatizaciones.

| Campo               | Tipo          | Notas                                                         |
| ------------------- | ------------- | ------------------------------------------------------------- |
| `id`                | INT PK        |                                                               |
| `automation_id`     | INT FK        | → `automations.id`                                            |
| `user_id`           | INT FK        | Denormalizado para filtrar por dueño sin JOIN                 |
| `slug`              | VARCHAR(64)   | UNIQUE. URL pública: `/api/webhooks/{slug}`                   |
| `http_method`       | ENUM          | `GET` \| `POST` \| `PUT` \| `PATCH` \| `DELETE`               |
| `secret`            | VARCHAR(128)  | HMAC secret → valida cabecera `X-NodeWeaver-Signature`        |
| `is_active`         | TINYINT(1)    | 0 = pausado                                                   |
| `rate_limit`        | INT UNSIGNED  | Peticiones/minuto (NULL = sin límite)                         |
| `allowed_ips`       | JSON          | Array de IPs o CIDR; si es NULL se aceptan todas              |
| `last_triggered_at` | TIMESTAMP     |                                                               |
| `trigger_count`     | INT UNSIGNED  | Contador acumulado                                            |

**Reglas:**

- Al crear un webhook, el backend genera `slug` como nanoid de 21 chars y `secret` como `bin2hex(random_bytes(32))`.
- Al recibir un request: validar `is_active`, `http_method`, opcional firma HMAC y whitelist de IPs; luego encolar una `execution_logs` con `trigger_source='webhook'` y `trigger_reference = webhooks.id`.

---

### 2.6 `execution_logs`

Log maestro de cada ejecución (una fila por run).

| Campo               | Tipo            | Notas                                                              |
| ------------------- | --------------- | ------------------------------------------------------------------ |
| `id`                | BIGINT PK       |                                                                    |
| `automation_id`     | INT FK          |                                                                    |
| `user_id`           | INT FK          | Denormalizado (mismo owner que la automation)                      |
| `trigger_source`    | ENUM            | `manual` \| `webhook` \| `schedule` \| `api` \| `retry`            |
| `trigger_reference` | VARCHAR(128)    | ID del webhook, cron job o la ejecución padre (si es retry)        |
| `status`            | ENUM            | `queued` \| `running` \| `success` \| `error` \| `timeout` \| `cancelled` |
| `input_payload`     | JSON            | Lo que entra al primer nodo                                        |
| `output_payload`    | JSON            | Lo que devuelve el último nodo                                     |
| `error_message`     | TEXT            | Stacktrace abreviado                                               |
| `error_node_id`     | VARCHAR(64)     | `node_id` de Drawflow donde falló                                  |
| `duration_ms`       | INT UNSIGNED    | `completed_at - started_at` en milisegundos                        |
| `nodes_total`       | INT UNSIGNED    | Nº total de nodos en el flujo                                      |
| `nodes_executed`    | INT UNSIGNED    | Nodos realmente atravesados                                        |
| `started_at`        | TIMESTAMP(3)    | Precisión de milisegundos                                          |
| `completed_at`      | TIMESTAMP(3)    | NULL mientras status ∈ {queued, running}                           |

**Ciclo de vida del status:**

```
queued ──> running ──> success
                  └──> error      (guarda error_message/error_node_id)
                  └──> timeout    (ejecución > límite configurado)
                  └──> cancelled  (usuario pausa/desactiva la automation)
```

---

### 2.7 `execution_node_logs`

Traza granular nodo a nodo. Se crea una fila por cada nodo procesado dentro de un run.

| Campo          | Tipo          | Notas                                               |
| -------------- | ------------- | --------------------------------------------------- |
| `id`           | BIGINT PK     |                                                     |
| `execution_id` | BIGINT FK     | → `execution_logs.id`                               |
| `node_id`      | VARCHAR(64)   | Mismo id que en `automations.flow_data`             |
| `node_type`    | VARCHAR(64)   | `http_request`, `email`, `if`, `transform`, ...    |
| `sequence`     | INT UNSIGNED  | Orden topológico (1, 2, 3, ...)                     |
| `status`       | ENUM          | `success` \| `error` \| `skipped`                   |
| `input_data`   | JSON          |                                                     |
| `output_data`  | JSON          |                                                     |
| `error_message`| TEXT          |                                                     |
| `duration_ms`  | INT UNSIGNED  |                                                     |
| `started_at`   | TIMESTAMP(3)  |                                                     |

Ideal para la vista "debugger" del dashboard: reproducir paso a paso lo que vio cada nodo.

---

### 2.8 `automation_stats`

Rollup diario precalculado para los KPIs del dashboard.

| Campo               | Tipo            | Notas                                      |
| ------------------- | --------------- | ------------------------------------------ |
| `id`                | BIGINT PK       |                                            |
| `automation_id`     | INT FK          | UNIQUE junto a `stats_date`                |
| `user_id`           | INT FK          | Denormalizado                              |
| `stats_date`        | DATE            | Día natural (UTC) del agregado             |
| `runs_success`      | INT UNSIGNED    |                                            |
| `runs_error`        | INT UNSIGNED    |                                            |
| `runs_timeout`      | INT UNSIGNED    |                                            |
| `runs_total`        | INT UNSIGNED    | = success + error + timeout (+ cancelled)  |
| `avg_duration_ms`   | INT UNSIGNED    |                                            |
| `max_duration_ms`   | INT UNSIGNED    |                                            |
| `total_duration_ms` | BIGINT UNSIGNED |                                            |

Actualización: cron nocturno que hace `INSERT ... ON DUPLICATE KEY UPDATE` desde `execution_logs` del día anterior, o trigger en tiempo real al cerrar cada ejecución.

---

## 3. Diccionario de ENUMs (resumen rápido)

| Tabla.Columna                        | Valores                                                           |
| ------------------------------------ | ----------------------------------------------------------------- |
| `users.role`                         | `free`, `pro`, `enterprise`, `admin`                              |
| `users.status`                       | `pending`, `active`, `suspended`, `deleted`                       |
| `automations.trigger_type`           | `manual`, `webhook`, `schedule`, `event`, `email`                 |
| `automations.last_run_status`        | `success`, `error`, `running`, `timeout`                          |
| `credentials_vault.credential_type`  | `api_key`, `oauth2`, `basic_auth`, `ssh_key`, `bearer_token`, `custom` |
| `webhooks.http_method`               | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`                           |
| `execution_logs.trigger_source`      | `manual`, `webhook`, `schedule`, `api`, `retry`                   |
| `execution_logs.status`              | `queued`, `running`, `success`, `error`, `timeout`, `cancelled`   |
| `execution_node_logs.status`         | `success`, `error`, `skipped`                                     |

---

## 4. Relaciones (Foreign Keys)

Todas con `ON DELETE CASCADE ON UPDATE CASCADE`.

| FK                                | Padre            | Hijo                   |
| --------------------------------- | ---------------- | ---------------------- |
| `fk_automations_user`             | `users.id`       | `automations.user_id`  |
| `fk_sessions_user`                | `users.id`       | `sessions.user_id`     |
| `fk_credentials_user`             | `users.id`       | `credentials_vault.user_id` |
| `fk_webhooks_user`                | `users.id`       | `webhooks.user_id`     |
| `fk_webhooks_automation`          | `automations.id` | `webhooks.automation_id`|
| `fk_exec_user`                    | `users.id`       | `execution_logs.user_id` |
| `fk_exec_automation`              | `automations.id` | `execution_logs.automation_id` |
| `fk_node_execution`               | `execution_logs.id` | `execution_node_logs.execution_id` |
| `fk_stats_user`                   | `users.id`       | `automation_stats.user_id` |
| `fk_stats_automation`             | `automations.id` | `automation_stats.automation_id` |

---

## 5. Índices de performance clave

- `users(email)` UNIQUE — login O(1).
- `users(verification_token)`, `users(reset_token)` — lookup directo en los flujos de auth.
- `automations(user_id)` + `automations(is_active)` — listado del dashboard.
- `sessions(token_hash)` UNIQUE — validación de JWT en cada request.
- `execution_logs(user_id, started_at)` compuesto — timeline del usuario.
- `execution_logs(status)` — workers que hacen `WHERE status='queued'`.
- `automation_stats(automation_id, stats_date)` UNIQUE — upsert del rollup.
- `webhooks(slug)` UNIQUE — routing O(1) desde URL pública.

---

## 6. Convenciones y decisiones de diseño

1. **Charset**: `utf8mb4_unicode_ci` en todas las tablas (soporta emoji y normalización Unicode correcta).
2. **Timestamps**: `created_at` / `updated_at` en cada tabla mutable. Los logs usan `TIMESTAMP(3)` para precisión de ms.
3. **IDs**: `INT` para entidades estables (users, automations, credentials, webhooks); `BIGINT UNSIGNED` para tablas de alto volumen (sessions, execution_logs, execution_node_logs, automation_stats).
4. **JSON**: se prefiere a tablas pivote para estructuras que solo lee/edita la aplicación (Drawflow, payloads, preferencias, IPs whitelist).
5. **Soft delete**: no se usa borrado lógico salvo `users.status='deleted'`. Resto confía en `ON DELETE CASCADE`.
6. **Privacidad**: nunca se guardan tokens JWT en claro (solo su hash SHA-256 en `sessions`) ni secretos en claro (todo en `credentials_vault` pasa por AES-256-GCM).
7. **Super User**: `id=999` es virtual, sólo vive en `.env`. Ningún SELECT/JOIN lo devuelve jamás. Los controladores deben cortocircuitar ese ID antes de tocar la DB.

---

## 7. Cómo usar este mapa (para agentes de IA)

Cuando necesites:

- **Escribir una query** → localiza la tabla en §2, respeta sus enums en §3 y no inventes columnas.
- **Añadir una feature** → comprueba si cabe en las tablas existentes antes de proponer nuevas.
- **Crear migraciones** → añade el DDL al final de `schema.sql` y documenta el cambio aquí en §2 y §3.
- **Depurar errores FK** → consulta §4 para entender qué cascadas dispara un DELETE.
- **Optimizar consultas** → revisa §5; si tu query no pega contra un índice, justifica añadir uno nuevo.

> **Regla de oro**: si modificas `schema.sql`, **tienes que actualizar este documento en el mismo commit**. Los agentes de IA confían en este archivo como fuente de verdad sin abrir la DB.
