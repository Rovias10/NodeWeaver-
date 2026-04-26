# StudyWeaver — Database Context Map

> Mapa de la base de datos `autoflow` para que cualquier agente IA (Claude, Cursor, Gemini, Antigravity, Copilot...) y para el propio alumno entiendan el modelo de datos **sin necesidad de abrir MySQL**.
>
> Migraciones aplicadas a mano: [`backend/DATA/migrations/`](../backend/DATA/migrations/).
> Conexión: [`backend/DATA/database.php`](../backend/DATA/database.php) (PDO, MariaDB 10.4+, charset `utf8mb4`).

---

## 1. Estado actual

StudyWeaver vive físicamente en la base **`autoflow`** (nombre histórico heredado del repositorio `NodeWeaver-`, ver ADR-01). El nombre se mantiene para no tener que tocar `.env` ni `DATA/database.php`.

Tras las migraciones `001` (drop legacy), `002` (maps), `003` (flashcards), `004` (likes), `005` (comments), `006` (login tracking), `007` (notes), `008` (maps.source_note_id) y `009` (flashcards.note_id), la base contiene **6 tablas activas**:

```
users (1) ── (N) notes
        │       │
        │       ├── (referencia opcional source_note_id) ──► maps
        │       └── (referencia opcional note_id)        ──► flashcards
        │
        └── (N) maps ── (N) flashcards (map_id opcional, ON DELETE SET NULL)
                        ├── (N) likes
                        └── (N) comments
```

`ON DELETE CASCADE` propaga el borrado de la cuenta hacia el resto del rastro del usuario (RGPD); el borrado de un mapa arrastra sus likes y comments; el borrado de un apunte deja el mapa derivado y las flashcards derivadas intactos (FKs `source_note_id` y `note_id` con `ON DELETE SET NULL`) para no perder el trabajo de estudio. Las flashcards usan la misma estrategia sobre `map_id`: si el alumno borra el mapa origen, las tarjetas sobreviven y conservan su progreso SM-2.

> **Nota de estado:** la sección §3.1 (`flashcards`) sigue redactada como "tabla planificada" por inercia del orden histórico de fases. La tabla está activa desde la Fase Flashcards; mover su sección a §2 queda como limpieza pendiente (no bloquea esta documentación).

---

## 2. Tablas activas (StudyWeaver)

### 2.1 `users`

Tabla **heredada de NodeWeaver** que se mantiene tal cual. El backend StudyWeaver consume sólo las columnas marcadas como ✅. Las marcadas ⚠️ son inertes (no leídas ni escritas) y se eliminarán en una migración futura cuando StudyWeaver implemente 2FA o se simplifique para producción.

| Campo                  | Tipo                                  | Uso StudyWeaver | Notas                                                          |
| ---------------------- | ------------------------------------- | --------------- | -------------------------------------------------------------- |
| `id`                   | INT PK AUTO_INCREMENT                 | ✅              | Foreign key target para `maps.user_id` y futuras.              |
| `name`                 | VARCHAR(100) NOT NULL                 | ✅              | Nombre mostrado en perfil y navbar.                            |
| `email`                | VARCHAR(255) NOT NULL UNIQUE          | ✅              | Login primario.                                                |
| `password`             | VARCHAR(255) NULL                     | ✅              | bcrypt vía `password_hash()`. NULL si la cuenta entró por Google.|
| `google_id`            | VARCHAR(255) NULL                     | ✅              | `sub` del ID Token de Google (login social).                   |
| `phone`                | VARCHAR(20) NULL                      | ✅              | Editable desde perfil.                                         |
| `company_name`         | VARCHAR(100) NULL                     | ✅              | UI lo muestra como **"Institución educativa"** (decisión Fase 4); BD mantiene el nombre legacy `company_name` para no tocar `profileController`. |
| `locale`               | VARCHAR(10) DEFAULT 'es'              | ✅              | Idioma de la UI.                                               |
| `timezone`             | VARCHAR(50) DEFAULT 'UTC'             | ✅              | Para cálculos futuros de "racha de estudio diaria".            |
| `avatar_url`           | VARCHAR(500) NULL                     | ✅              | URL absoluta hacia `backend/uploads/avatars/` (configurable con `BACKEND_PUBLIC_URL` en `.env`). |
| `role`                 | ENUM('free','pro','admin')            | ✅              | StudyWeaver sólo crea `free` por defecto. `pro` queda inerte (sin pricing). `admin` reservado para uso futuro. |
| `status`               | ENUM('active','suspended','pending')  | ✅              | `pending` recién registrado, `active` tras confirmar email, `suspended` por moderación. |
| `verification_token`   | VARCHAR(100) NULL                     | ✅              | Token enviado por SendGrid en el registro. Se limpia al confirmar. |
| `verified_at`          | TIMESTAMP NULL                        | ⚠️ (no escrito) | El backend actual no lo rellena al confirmar (usa `status='active'` + `verification_token=NULL`). Queda como deuda. |
| `reset_token`          | VARCHAR(100) NULL                     | ✅              | Token de recuperación de contraseña.                           |
| `reset_expires`        | TIMESTAMP NULL                        | ✅              | Caducidad de `reset_token` (1 h).                              |
| `two_factor_enabled`   | TINYINT(1) DEFAULT 0                  | ⚠️ inerte       | StudyWeaver MVP no implementa 2FA.                             |
| `two_factor_secret`    | VARCHAR(255) NULL                     | ⚠️ inerte       | Idem.                                                          |
| `created_at`           | TIMESTAMP DEFAULT CURRENT_TIMESTAMP   | ✅              |                                                                |
| `updated_at`           | TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | ✅              |                                                                |

**Reglas de negocio:**

- Registro: `status='pending'` + `verification_token` no nulo. Login bloqueado mientras `verification_token` no sea NULL (cuenta sin verificar).
- Confirmación (`AuthController::confirmAccount`): pone `status='active'` y `verification_token=NULL`.
- Recuperación de contraseña: `forgotPassword` guarda `reset_token` + `reset_expires = NOW() + 1h`. `resetPassword` exige `reset_expires > NOW()` y limpia ambos campos.
- Super User: `id = 999` es **virtual**, no existe en la base. Vive sólo en `.env` (`SUPER_USER_EMAIL` / `SUPER_USER_PASSWORD`) y el controlador lo inyecta en el JWT.

**Índices:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY email (email)` — login O(1).

---

### 2.2 `maps`

Mapas conceptuales del usuario. **Tabla canónica de StudyWeaver**, creada por la migración [`002_create_maps.sql`](../backend/DATA/migrations/002_create_maps.sql).

| Campo           | Tipo                                  | Notas                                                                         |
| --------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| `id`            | INT PK AUTO_INCREMENT                 |                                                                               |
| `user_id`       | INT NOT NULL                          | → `users.id` ON DELETE CASCADE.                                               |
| `title`         | VARCHAR(200) NOT NULL                 | Default `'Mapa sin título'`. Editable inline en el editor.                    |
| `description`   | TEXT NULL                             | Subtítulo o resumen. NULL en mapas recién creados.                            |
| `is_public`     | TINYINT(1) NOT NULL DEFAULT 0         | `1` = visible en el feed público (Fase Comunidad futura).                     |
| `drawflow_json` | LONGTEXT NULL                         | **Fuente de verdad del mapa.** Resultado tal cual de `editor.export()` de Drawflow. NULL en mapas recién creados sin contenido. |
| `created_at`    | DATETIME DEFAULT CURRENT_TIMESTAMP    |                                                                               |
| `updated_at`    | DATETIME ON UPDATE CURRENT_TIMESTAMP  | Refleja el último auto-save.                                                  |

> **Columna añadida en Fase Notes:** `source_note_id INT NULL` con FK a `notes(id)` `ON DELETE SET NULL ON UPDATE CASCADE`. Permite saber de qué apunte salió cada mapa cuando se generen vía IA en la rama `ia-integration`. DDL en [`008_alter_maps_source_note.sql`](../backend/DATA/migrations/008_alter_maps_source_note.sql), **ya aplicada**. Detalle en [`docs/notes-plan.md`](./notes-plan.md) §1.2.

**Reglas de negocio:**

- Cada mapa pertenece exclusivamente a un usuario. **Ownership por `user_id` en cada query** (anti-IDOR). El controller siempre añade `WHERE user_id = :uid` en `SELECT`/`UPDATE`/`DELETE`.
- `drawflow_json` se guarda **sin parsear**: el frontend serializa con `editor.export()`, el backend valida que sea JSON parseable y persiste el string. Una sola fuente de verdad, sin riesgo de desincronización.
- No se denormalizan nodos/edges en tablas separadas en el MVP (justificado en ADR-05). Si en el futuro hace falta filtrar por concepto individual (búsqueda full-text, stats por nodo), se añade en una migración posterior.
- Auto-save: tras 1.5 s de inactividad en el editor, el frontend llama a `POST maps/save` con el `drawflow_json` actualizado.
- Mapas vacíos (recién creados): `drawflow_json IS NULL`. El frontend abre canvas vacío sin invocar `editor.import()`.

**Índices:**

- `PRIMARY KEY (id)`
- `INDEX idx_user_updated (user_id, updated_at)` — listado del dashboard ordenado por última edición.
- `FOREIGN KEY fk_maps_user (user_id)` → `users.id` ON DELETE CASCADE ON UPDATE CASCADE.

---

### 2.3 `likes`

Likes a mapas públicos. Creada por la migración [`004_create_likes.sql`](../backend/DATA/migrations/004_create_likes.sql) en la Fase Comunidad. **PK compuesta `(user_id, map_id)`** para impedir likes duplicados a nivel de BD (anti-spam por integridad, sin checks adicionales en el controller).

Reusada como tabla de **bookmarks**: dar like equivale a guardar el mapa en "Mis favoritos". Sin tabla extra; la PK compuesta ya garantiza la unicidad y la información que aporta una tabla `bookmarks` separada sería la misma. Justificado en [`docs/community-plan.md`](./community-plan.md) §0.

| Campo        | Tipo                                | Notas                              |
| ------------ | ----------------------------------- | ---------------------------------- |
| `user_id`    | INT NOT NULL                        | → `users.id` ON DELETE CASCADE. Parte de la PK compuesta. |
| `map_id`     | INT NOT NULL                        | → `maps.id`  ON DELETE CASCADE. Parte de la PK compuesta. |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP  |                                    |

**Reglas de negocio:**

- Sólo se puede dar like a mapas con `is_public = 1`. Excepción: el dueño del mapa puede likearse a sí mismo (UX coherente con "favoritos": el autor también necesita guardar referencias propias).
- **Patrón de inserción:** `INSERT IGNORE INTO likes ...` — los duplicados son no-op silencioso, no es necesario chequear existencia previa.
- **Toggle:** si la fila existe se borra (unlike), si no se inserta (like). Una operación por click.

**Índices:**

- `PRIMARY KEY (user_id, map_id)` — unicidad + lookup rápido para `userHasLiked`.
- `INDEX idx_map (map_id)` — `SELECT COUNT(*) WHERE map_id = ?` y orden "popular" del feed.
- `FOREIGN KEY fk_likes_user (user_id)` → `users.id` ON DELETE CASCADE ON UPDATE CASCADE.
- `FOREIGN KEY fk_likes_map  (map_id)`  → `maps.id`  ON DELETE CASCADE ON UPDATE CASCADE.

---

### 2.4 `comments`

Comentarios planos sobre mapas públicos. Creada por la migración [`005_create_comments.sql`](../backend/DATA/migrations/005_create_comments.sql) en la Fase Comunidad. **Sin replies/threading** en MVP — defendible: "el árbol de comentarios añade complejidad UI/UX que no aporta valor académico evaluable; queda como mejora futura en la memoria".

| Campo        | Tipo                                  | Notas                              |
| ------------ | ------------------------------------- | ---------------------------------- |
| `id`         | INT PK AUTO_INCREMENT                 |                                    |
| `map_id`     | INT NOT NULL                          | → `maps.id`  ON DELETE CASCADE.    |
| `user_id`    | INT NOT NULL                          | → `users.id` ON DELETE CASCADE.    |
| `body`       | TEXT NOT NULL                         | Texto plano. Saneado en backend (`trim` + longitud 1–1000). El frontend lo escapa al renderizar (sin `dangerouslySetInnerHTML`). |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP    |                                    |
| `updated_at` | DATETIME ON UPDATE CURRENT_TIMESTAMP  | El MVP no expone endpoint de edición; la columna queda para futuro. |

**Reglas de negocio:**

- Sólo se permiten comentarios sobre mapas con `is_public = 1`. Excepción: el dueño puede comentar en su propio mapa aunque sea privado.
- **Borrado autorizado:** lo permite el **autor del comentario** o el **autor del mapa**. Doble verificación en `CommentController::delete`.
- **Sin endpoint de edición** en MVP. Decisión defensiva: editar abre la puerta a "padding ataques" donde alguien edita su comment después de ser likeado/respondido. Si hace falta cambiarlo, el autor borra y vuelve a publicar.
- El borrado del mapa o del usuario propaga `ON DELETE CASCADE` y limpia los comentarios huérfanos.

**Índices:**

- `PRIMARY KEY (id)`
- `INDEX idx_map_created (map_id, created_at)` — listado paginado por mapa, ordenado cronológicamente.
- `FOREIGN KEY fk_comments_map  (map_id)`  → `maps.id`  ON DELETE CASCADE ON UPDATE CASCADE.
- `FOREIGN KEY fk_comments_user (user_id)` → `users.id` ON DELETE CASCADE ON UPDATE CASCADE.

---

### 2.5 `notes`

Apuntes del usuario (PDF subido o texto pegado). **Zona principal de StudyWeaver** según el pivote ADR-06: el apunte es la fuente de verdad de la que la IA derivará mapas conceptuales y flashcards en la rama futura `ia-integration` con Gemini multimodal. Creada por la migración [`007_create_notes.sql`](../backend/DATA/migrations/007_create_notes.sql).

| Campo               | Tipo                                  | Notas                                                                  |
| ------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `id`                | INT PK AUTO_INCREMENT                 |                                                                        |
| `user_id`           | INT NOT NULL                          | → `users.id` ON DELETE CASCADE.                                        |
| `title`             | VARCHAR(200) NOT NULL                 | Default `'Apunte sin título'`. Editable inline (endpoint pendiente).   |
| `source_type`       | ENUM('pdf','text','markdown')         | Default `'text'`. MVP frontend expone sólo `pdf` y `text`; `markdown` queda en el ENUM como reserva DDL para no requerir alter futuro. |
| `original_filename` | VARCHAR(255) NULL                     | Nombre del PDF subido (informativo). NULL si es text.                  |
| `file_path`         | VARCHAR(500) NULL                     | Ruta relativa en `backend/uploads/notes/<user_id>/<uuid>.pdf`. NULL si es text. NUNCA se devuelve al cliente. |
| `extracted_text`    | LONGTEXT NULL                         | Para `text` guarda el body íntegro del alumno. Para `pdf` queda NULL en MVP — la fase IA decidirá si Gemini cachea el texto extraído o si ingiere el PDF directamente sin tocar este campo. |
| `char_count`        | INT NOT NULL DEFAULT 0                | Longitud informativa de `extracted_text`. 0 mientras esté NULL.        |
| `created_at`        | DATETIME DEFAULT CURRENT_TIMESTAMP    |                                                                        |
| `updated_at`        | DATETIME ON UPDATE CURRENT_TIMESTAMP  |                                                                        |

**Reglas de negocio:**

- Storage físico en `backend/uploads/notes/<user_id>/<uuid>.pdf` (UUID hex de 128 bits con `random_bytes(16)` evita colisiones y enumeración; carpeta por usuario para borrar fácil al cerrar cuenta).
- Tamaño máximo 5 MB por PDF (validado en backend con `MAX_PDF_SIZE` y duplicado en frontend para feedback inmediato; `php.ini` ajustado en local).
- **Validación MIME real con `finfo`** sobre el archivo en disco: la cabecera declarada por el cliente (`$_FILES['pdf']['type']`) NO es de fiar y el controller la complementa leyendo los magic bytes ("%PDF-") tras `move_uploaded_file`.
- Anti-IDOR: ownership por `user_id` en cada query del modelo `Note`.
- Borrado: `ON DELETE CASCADE` desde `users` (purgar la cuenta limpia los apuntes y los archivos físicos asociados). Si el alumno borra un apunte concreto que tiene mapas o flashcards derivadas, esos artefactos SOBREVIVEN gracias a `ON DELETE SET NULL` en `maps.source_note_id` (y, en el futuro, `flashcards.note_id`) — no se pierde el progreso de estudio.
- Endpoint `notes/file?id=N` sirve el binario tras verificar JWT y ownership; el frontend lo envuelve en un Blob (`apiDownload` + `URL.createObjectURL`) y lo monta en un `<iframe>`. Storage NO público para evitar que un UUID filtrado equivalga a acceso.

**Índices:**

- `PRIMARY KEY (id)`
- `INDEX idx_user_updated (user_id, updated_at)` — listado de "Mis apuntes" ordenado por última edición.
- `FOREIGN KEY fk_notes_user (user_id)` → `users.id` ON DELETE CASCADE ON UPDATE CASCADE.

---

## 3. Tablas planificadas (DDL listo, ejecución diferida)

> Cada una vive en su archivo `.planned` dentro de [`backend/DATA/migrations/`](../backend/DATA/migrations/). Cuando llegue su Fase del roadmap, se renombra quitando `.planned` y se ejecuta en phpMyAdmin. Tener el DDL escrito desde ya cumple el RA "diseño completo de BD" del módulo 0613 sin obligar a implementar todo en MVP.

### 3.1 `flashcards` (Fase Flashcards) — [`003_create_flashcards.sql.planned`](../backend/DATA/migrations/003_create_flashcards.sql.planned)

Repetición espaciada con algoritmo **SM-2 simplificado**. Cada flashcard puede o no estar vinculada a un mapa concreto (campo `map_id` nullable).

| Campo              | Tipo                                  | Notas                                                          |
| ------------------ | ------------------------------------- | -------------------------------------------------------------- |
| `id`               | INT PK AUTO_INCREMENT                 |                                                                |
| `user_id`          | INT NOT NULL                          | → `users.id` ON DELETE CASCADE.                                |
| `map_id`           | INT NULL                              | → `maps.id` **ON DELETE SET NULL**: la tarjeta sobrevive si se borra el mapa origen (no perder progreso de estudio). |
| `note_id`          | INT NULL                              | → `notes.id` **ON DELETE SET NULL**. Añadida por migración 009 (rama `IA_Integration`) para vincular las flashcards generadas desde un apunte con su origen. NULL en flashcards creadas a mano o desde un mapa. |
| `front`            | TEXT NOT NULL                         | Pregunta o concepto.                                           |
| `back`             | TEXT NOT NULL                         | Respuesta o explicación.                                       |
| `ease_factor`      | DECIMAL(3,2) NOT NULL DEFAULT 2.50    | Facilidad subjetiva. Mínimo 1.30, típico 2.50.                 |
| `interval_days`    | INT NOT NULL DEFAULT 0                | Días hasta el próximo repaso. 0 = hoy.                         |
| `repetitions`      | INT NOT NULL DEFAULT 0                | Aciertos consecutivos. Resetea a 0 al fallar.                  |
| `next_review_at`   | DATE NOT NULL                         | Fecha del próximo repaso.                                      |
| `last_reviewed_at` | DATETIME NULL                         | Última sesión de repaso.                                       |
| `created_at`       | DATETIME DEFAULT CURRENT_TIMESTAMP    |                                                                |
| `updated_at`       | DATETIME ON UPDATE CURRENT_TIMESTAMP  |                                                                |

**Lógica SM-2 simplificada (en backend al recibir feedback del usuario):**

- "Acierto fácil" → `repetitions++`, `interval_days = max(1, round(interval_days * ease_factor * 1.3))`, `ease_factor += 0.10` (cap a 2.50).
- "Acierto" → `repetitions++`, `interval_days = max(1, round(interval_days * ease_factor))`, `ease_factor` sin cambio.
- "Fallo" → `repetitions = 0`, `interval_days = 1`, `ease_factor = max(1.30, ease_factor - 0.20)`.
- `next_review_at = CURDATE() + INTERVAL interval_days DAY`.

**Índices:**

- `idx_user_due (user_id, next_review_at)` — listado "tarjetas a repasar hoy" del dashboard.
- `idx_flashcards_note (note_id)` — añadido por la migración 009; acelera la query "flashcards derivadas de este apunte" si la UI llega a exponerla.

---

### 3.2 `flashcards.note_id` — APLICADA por migración 009

DDL aplicado en la rama `IA_Integration` mediante [`009_alter_flashcards_source_note.sql`](../backend/DATA/migrations/009_alter_flashcards_source_note.sql). Misma estrategia que `maps.source_note_id` (ON DELETE SET NULL): si el alumno borra el apunte, las flashcards generadas desde él sobreviven y conservan su progreso SM-2 — pierden únicamente la referencia al origen. Detalle de la columna en la tabla de §3.1 (fila `note_id`).

---

### 3.3 `quizzes` y `quiz_attempts` — sin DDL todavía

La Fase Quizzes (si se implementa) genera el quiz vía IA bajo demanda y no necesita cachearlo en BD para la primera versión. Si llega el momento de cachear, se añadirán dos tablas:

- `quizzes(id, map_id, user_id, questions_json, created_at)` — caché del quiz generado.
- `quiz_attempts(id, quiz_id, user_id, score, answers_json, completed_at)` — resultados.

DDL no escrito todavía: el alumno lo redactará si llega esa fase.

---

## 4. Capa heredada de NodeWeaver: ELIMINADA

> Histórico para que el tribunal y futuros agentes IA entiendan **por qué** el repo se llamaba NodeWeaver y la BD `autoflow`.

La base `autoflow` originalmente contenía 5 tablas del proyecto NodeWeaver (plataforma no-code de automatización con n8n):

| Tabla legacy     | Estado | Por qué se eliminó                                                      |
| ---------------- | ------ | ----------------------------------------------------------------------- |
| `users`          | **Conservada** | Compartida con StudyWeaver (ver §2.1). Columnas 2FA inertes documentadas. |
| `automations`    | **DROP** (migración 001) | Workflows n8n con `n8n_workflow_id`, `trigger_type`. Vocabulario fuera de dominio StudyWeaver. |
| `credentials`    | **DROP** (migración 001) | Bóveda de API keys de servicios externos para los flujos n8n. StudyWeaver guarda su única API key (`OPENAI_API_KEY`) en `.env` del backend. |
| `execution_logs` | **DROP** (migración 001) | Trazas de ejecución de cada workflow. Sin sentido sin workflows. |
| `sessions`       | **DROP** (migración 001) | Token JWT en claro + auditoría de logins. JWT es stateless por diseño (validación por firma + `exp`); esta tabla era redundante incluso en NodeWeaver. |

Decisión y alternativas en ADR-05 (que supera al ADR-04 inicial). El borrado se hace en el local del alumno ejecutando `001_init_studyweaver.sql` en phpMyAdmin.

---

## 5. Convenciones y decisiones de diseño

1. **Charset/collation.** Las tablas StudyWeaver nuevas usan `utf8mb4` con `utf8mb4_unicode_ci` (orden alfabético respeta acentos y `ñ`). La heredada `users` mantiene `utf8mb4_general_ci` para no tocar datos existentes.
2. **Timestamps.** `created_at` / `updated_at` en cada tabla mutable. No se usa `TIMESTAMP(3)` (precisión ms): MVP no necesita.
3. **IDs.** `INT AUTO_INCREMENT` para todo. No hay tablas de alto volumen que justifiquen `BIGINT`.
4. **JSON.** `LONGTEXT` con `editor.export()` directo (`maps.drawflow_json`). No se usa el tipo `JSON` nativo de MariaDB para mantener compatibilidad con MySQL 5.7 (despliegue cloud futuro podría toparse con esa versión).
5. **Soft delete.** No se usa borrado lógico. Todas las relaciones confían en `ON DELETE CASCADE` (RGPD: borrar la cuenta limpia el rastro).
6. **Anti-IDOR.** Cada controller que lee/modifica una entidad incluye `WHERE user_id = :uid` antes de servir o tocar la fila. No hay endpoints públicos sin filtro de ownership salvo el feed (`is_public = 1`) de la Fase Comunidad.
7. **Super User.** `id = 999` es virtual (sólo en `.env`). Ningún `SELECT` lo devuelve jamás. Los controladores deben cortocircuitar ese ID antes de consultar la BD.
8. **Migraciones.** Sistema artesanal sin runner: archivos `.sql` numerados en [`backend/DATA/migrations/`](../backend/DATA/migrations/), ejecutados a mano en phpMyAdmin. Idempotentes (`CREATE TABLE IF NOT EXISTS`, `DROP TABLE IF EXISTS`) cuando aplica. Los `.sql.planned` están escritos pero **no se ejecutan** hasta que llega su Fase.

---

## 6. Cómo usar este mapa (para agentes de IA)

Cuando necesites:

- **Escribir una query** → localiza la tabla en §2 y respeta sus columnas reales. **No inventes columnas** ni consultes tablas DROP del legacy. Si te falta una columna, crea migración nueva en `006_*.sql` y documéntala aquí.
- **Añadir una feature** → comprueba si cabe en las tablas activas (§2) o en una planificada (§3). Si no cabe, redacta nueva migración numerada y actualiza este documento en el mismo commit.
- **Crear migración** → `backend/DATA/migrations/NNN_descripcion.sql` (idempotente cuando aplique). Si la feature aún no se implementa pero quieres dejar el diseño listo, añade extensión `.planned`.
- **Depurar errores FK** → consulta §2/§3 para ver qué `ON DELETE` propaga cada relación.

> **Regla de oro**: si modificas el esquema o añades migración, **actualiza este documento en el mismo commit**. Los agentes IA confían en este archivo como fuente de verdad sin abrir MySQL.
