# Plan Fase Notes · "Mis apuntes" como zona principal de StudyWeaver

> **Contexto y origen:** Tras cerrar Fase Maps (M0-M5 en [`docs/maps-plan.md`](./maps-plan.md)), se decide pivotar la **narrativa** del producto sin tirar nada de lo construido. El mapa deja de ser el destino y pasa a ser una **vista derivada** sobre un apunte. El producto real es el **repositorio de apuntes del estudiante** del que la IA genera mapas, flashcards y (futuro) quizzes.
>
> Esta decisión nace de una conversación honesta sobre la utilidad del mapa solo: visualmente útil pero no diferencial vs ChatGPT. La utilidad académica medible (Novak 1990; Hay et al. 2008) está en **construir** el mapa, no en consultarlo. Combinarlo con apuntes como origen y flashcards como salida da una narrativa con valor real medible (Anki + SM-2 lleva 20 años demostrándolo).
>
> Plan para retomar en chat nuevo. Asume que [`CLAUDE.md`](../CLAUDE.md), [`Gemini.md`](../Gemini.md), [`docs/maps-plan.md`](./maps-plan.md), [`docs/decisiones.md`](./decisiones.md) y [`DATA/database_context.md`](../DATA/database_context.md) están leídos.

---

## 0. Modelo conceptual

```
Usuario ─▶ Apunte (PDF / texto pegado / markdown)
              ├─▶ Mapa conceptual    (IA estructura el contenido)
              ├─▶ Flashcards SM-2     (IA genera tarjetas de repaso)
              └─▶ Resumen / Quiz      (futuro, opcional)
```

- El **apunte** es la fuente de verdad (texto plano extraído del PDF o pegado a mano).
- El **mapa** y las **flashcards** son artefactos derivados, editables independientemente, vinculados al apunte de origen vía FK.
- Si el alumno borra el apunte, los artefactos derivados **sobreviven** (FK `ON DELETE SET NULL`): no se pierde el trabajo de estudio.

---

## 1. Cambios de BD

### 1.1 Migración `006_create_notes.sql` (ejecutable)

```sql
CREATE TABLE IF NOT EXISTS notes (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    user_id            INT NOT NULL,
    title              VARCHAR(200) NOT NULL DEFAULT 'Apunte sin título',
    source_type        ENUM('pdf','text','markdown') NOT NULL DEFAULT 'text',
    original_filename  VARCHAR(255) NULL,        -- nombre original del PDF subido
    file_path          VARCHAR(500) NULL,        -- ruta relativa en backend/uploads/notes/
    extracted_text     LONGTEXT NULL,            -- texto plano que se manda a la IA
    char_count         INT NOT NULL DEFAULT 0,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_notes_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_user_updated (user_id, updated_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
```

### 1.2 Migración `007_alter_maps_source_note.sql` (ejecutable)

```sql
ALTER TABLE maps
    ADD COLUMN source_note_id INT NULL AFTER user_id,
    ADD CONSTRAINT fk_maps_source_note
        FOREIGN KEY (source_note_id) REFERENCES notes(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    ADD INDEX idx_source_note (source_note_id);
```

### 1.3 Actualizar `003_create_flashcards.sql.planned`

Añadir columna `note_id INT NULL` además del `map_id` que ya tiene. Con el mismo patrón `ON DELETE SET NULL`.

### 1.4 Documentación

Actualizar [`DATA/database_context.md`](../DATA/database_context.md) §2 añadiendo `notes` como tabla activa (§2.3) y reflejando el nuevo `source_note_id` en `maps` (§2.2). Actualizar el ERD de §1.

---

## 2. Backend nuevo

### 2.1 Archivos

```
API/controllers/noteController.php       (~150 líneas)
MODEL/Note.php                            (~80 líneas)
API/services/PDFParser.php                (~60 líneas, wrapper)
backend/uploads/notes/                    (storage físico, .gitignore)
```

### 2.2 Endpoints

| Método | Ruta | Body / Query | Respuesta éxito |
| --- | --- | --- | --- |
| GET  | `notes/list`   | — | `{ success, data: [{id, title, source_type, char_count, original_filename, created_at, updated_at}] }` (sin `extracted_text` para listado ligero) |
| GET  | `notes/get`    | `?id=N` | `{ success, data: {…incluye extracted_text} }` |
| POST | `notes/upload` | `multipart` con campo `pdf` (file) **o** `{title, body}` para texto pegado | `201 { success, data: {id, title, char_count} }` |
| POST | `notes/delete` | `{id}` | `{ success, message }` (borra fila + archivo físico si existe) |

### 2.3 Detalles de implementación

- **PDF parsing:** `Smalot/PDFParser` vía Composer (recomendado, sin dep externa de sistema). Alternativa: shell-out a `pdftotext` (menos defendible: depende del binario instalado).
  - ADR explícito comparando opciones.
  - `composer require smalot/pdfparser` en `backend/composer.json`.
- **Tamaño máximo:** 5 MB por PDF. `php.ini` (`upload_max_filesize`, `post_max_size`) puede requerir ajuste — documentar en README.
- **Validaciones controller:** mime `application/pdf` para PDFs; `title` 1-200 chars; `body` no vacío para texto.
- **Storage:** `backend/uploads/notes/<user_id>/<uuid>.pdf`. UUID para evitar colisiones y filtrado por dueño en el path. URL pública sólo si llega Fase Comunidad.
- **Ownership y anti-IDOR:** mismo patrón que `maps` — `WHERE user_id = :uid` en cada query.
- **Auth:** `AuthMiddleware::verifyToken()`.
- **Super User id=999:** cortocircuito 403 igual que en `mapController::save`.

### 2.4 Routing — `API/router/api.php`

```php
// Notes Routes
$router->get('notes/list',     'noteController', 'list');
$router->get('notes/get',      'noteController', 'get');
$router->post('notes/upload',  'noteController', 'upload');
$router->post('notes/delete',  'noteController', 'delete');
```

---

## 3. Frontend nuevo

### 3.1 Archivos

```
frontend/src/features/notes/
├── pages/
│   ├── NotesListPage.jsx            ← /apuntes (zona principal autenticada)
│   └── NotePreviewPage.jsx          ← /apuntes/:id
├── components/
│   ├── NoteCard.jsx                  (icono PDF/texto, título, char_count, fecha, acciones)
│   ├── UploadNoteDialog.jsx          (drag & drop PDF + tab "pegar texto")
│   ├── NoteActionsBar.jsx            (botones "Generar mapa" / "Generar flashcards")
│   └── EmptyNotesState.jsx           (CTA "Sube tus primeros apuntes")
└── services/
    └── notesService.js               (listNotes, getNote, uploadNote, uploadText, deleteNote)
```

### 3.2 Cambios de routing y navegación

- `frontend/src/router.jsx`:
  - Añadir `{ path: '/apuntes',     element: <NotesListPage /> }`
  - Añadir `{ path: '/apuntes/:id', element: <NotePreviewPage /> }`
- `frontend/src/features/shell/navItems.js`:
  - Reordenar: **Apuntes** (primero, icono `fa-file-lines`) → Mapas → Flashcards → Comunidad → Perfil.
  - Marcar `/apuntes` con `end: true` (índice).
- **Redirección post-login:** `LoginPage` después de éxito navega a `/apuntes` en lugar de `/dashboard`. Dashboard se mantiene como vista de "estadísticas de estudio" (placeholder por ahora).

### 3.3 Comportamiento de páginas

**NotesListPage** (`/apuntes`):
- `useEffect` carga `notesService.list()`. Estados loading / error / empty / ok.
- Botón "📤 Subir apunte" abre `UploadNoteDialog`.
- Grid responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (Grid Layout RA2 0615).
- Cada `NoteCard` con título, badge `PDF`/`Texto`, `char_count`, fecha relativa, botón "Abrir" → `/apuntes/:id`, papelera con `DeleteNoteDialog`.

**UploadNoteDialog**:
- Tabs: "📄 Subir PDF" / "✏️ Pegar texto".
- PDF: drag & drop o file input. Preview nombre + tamaño antes de subir. Llama `notesService.uploadNote(file, title?)`.
- Texto: input título + textarea body. Llama `notesService.uploadText({title, body})`.
- Tras éxito: cierra dialog + toast + recarga lista.

**NotePreviewPage** (`/apuntes/:id`):
- Cabecera: título editable inline + fecha + tipo.
- Cuerpo: texto extraído (read-only en MVP, scroll vertical, máx altura).
- `<NoteActionsBar>` arriba: dos botones grandes:
  - **🧠 Generar mapa conceptual** → `POST ai/from-note { note_id, target: 'map' }` → al volver, `navigate('/mapas/' + newMapId)`.
  - **📚 Generar flashcards** → `POST ai/from-note { note_id, target: 'flashcards' }` → toast con cantidad creada + link a `/flashcards`.
- Spinner overlay mientras la IA trabaja (puede tardar 10-30s).

### 3.4 Endpoints (`api/endpoints.js`)

```javascript
notes: {
  list:    'notes/list',
  get:     'notes/get',
  upload:  'notes/upload',
  remove:  'notes/delete',
},
ai: {
  expand:   'ai/expand',
  fromNote: 'ai/from-note',   // nuevo
},
```

---

## 4. Endpoint IA `ai/from-note` (clave del producto)

### 4.1 Contrato

```
POST /API/index.php?route=ai/from-note
Authorization: Bearer <jwt>
Content-Type: application/json

Request:
{
  "note_id": 42,
  "target":  "map" | "flashcards"
}

Response 200 (map):
{
  "success": true,
  "data": {
    "map_id":    123,
    "title":     "Algoritmos de ordenación",
    "node_count": 12
  }
}

Response 200 (flashcards):
{
  "success": true,
  "data": {
    "created":  18    // nº de flashcards creadas
  }
}

Response 4xx/5xx:
{ "success": false, "message": "..." }
```

### 4.2 Implementación

- **Cliente IA:** mismo `API/services/AIClient.php` que ya existe en M4 (Ollama gpt-oss-20b en el PC remoto).
- **Prompt para `target='map'`:**
  ```
  Lee este texto de apuntes y devuelve un mapa conceptual en JSON.
  Estructura exacta de salida:
  {
    "title": "...",
    "nodes": [{"id": 1, "label": "...", "hint": "..."}],
    "edges": [{"source": 1, "target": 2}]
  }
  Reglas:
   - Máximo 15 nodos.
   - Un único nodo raíz (id=1) con el tema central.
   - El resto son sub-conceptos conectados al raíz o entre sí.
   - "label" ≤ 60 chars, "hint" ≤ 120 chars, ambos en español.
   - No incluyas texto fuera del JSON.

  Texto:
  """
  {extracted_text truncado a ~6000 chars si es muy largo}
  """
  ```
- Tras parsear: el controller construye el `drawflow_json` posicionando los nodos en grid o radial (algoritmo simple) e inserta una fila en `maps` con `source_note_id = note_id`.

- **Prompt para `target='flashcards'`:**
  ```
  Genera entre 8 y 15 flashcards de repaso a partir del siguiente
  texto. Formato JSON:
  { "cards": [{"front": "Pregunta…", "back": "Respuesta…"}] }
  Reglas:
   - "front" es una pregunta breve, "back" la respuesta corta.
   - Sin contenido fuera del JSON.
   - Cubre los conceptos más importantes del texto.

  Texto:
  """
  {extracted_text truncado}
  """
  ```
- Inserta filas en `flashcards` con `note_id = note_id`, `ease_factor=2.50`, `interval_days=0`, `next_review_at = CURDATE()`.

### 4.3 Modo stub sin IA

- Si Ollama no responde (timeout o conexión falla): devolver mapa stub con 3 nodos hardcoded a partir del título del apunte, o 5 flashcards stub. Misma filosofía que `ai/expand` en M4.

---

## 5. Plan de implementación por subfases

| Sub | Foco | Horas | Bloquea |
| --- | --- | --- | --- |
| **N0** | BD: migraciones 006 y 007 + actualizar `database_context.md` + ADR | 1 h | Todo lo demás |
| **N1** | Backend `noteController` + `Note` model + `PDFParser` service + Composer dep | 3-4 h | N2, N4 |
| **N2** | Frontend `NotesListPage` + `UploadNoteDialog` + `notesService` + redirección post-login | 3-4 h | N3 |
| **N3** | `NotePreviewPage` + `NoteActionsBar` (botones aún disabled si N4 no está) | 1-2 h | — |
| **N4** | Backend `ai/from-note` (target=map y target=flashcards) + cableado en `NoteActionsBar` | 3-4 h | (depende M4 backend Ollama) |
| **N5** | Tabla `flashcards` ejecutada + `flashcardController` mínimo (`list`, `review`) + página `/flashcards/repaso` con SM-2 | 4-5 h | Cierra el ciclo de estudio |
| **N6** | Pulido: copy castellano, tooltips, atajos, accesibilidad | 2 h | Defensa |

**Total realista: 17-22 h.** Encaja en 4-5 días de trabajo intensivo. Combinado con Figma + despliegue + memoria, es muy ajustado pero viable.

---

## 6. Ranking de prioridades para los 8 días restantes

1. 🔴 **M4 backend Ollama** (cierra mapas) — 2 h
2. 🔴 **N0-N2 Apuntes** (subir + listar + preview) — 5-6 h
3. 🔴 **N3-N4 Generar mapa/flashcards desde apunte** (la narrativa diferencial) — 4-6 h
4. 🟠 **N5 Flashcards repaso SM-2** — 4-5 h
5. 🟡 **Figma 3 devices** — 4-5 h
6. 🟡 **Despliegue cloud HTTPS** — 3-4 h
7. 🟡 **Memoria + sostenibilidad + cloud** — 6-8 h
8. ⚪ **Comunidad** — descartar del MVP, dejar como roadmap futuro
9. ⚪ **Quizzes, undo, PDF→mapa standalone** — descartar

---

## 7. Defensa al tribunal con la nueva narrativa

> "StudyWeaver convierte tus apuntes en herramientas de estudio activas. Subes el PDF de la asignatura, la IA local (Ollama gpt-oss-20b) lo estructura como mapa conceptual editable y, desde ahí o directamente desde el apunte, genera flashcards de repetición espaciada con algoritmo SM-2. El mapa es el esqueleto visual del temario; las flashcards son el músculo del repaso a largo plazo. Todo nace de un único origen: el apunte que ya tenías."

Defensa del por qué es útil: combina **comprensión** (mapa visual) y **retención** (SM-2 espaciado), las dos piezas del estudio efectivo. Bibliografía: Novak (mapas), Ebbinghaus (curva del olvido), SuperMemo / Anki (SM-2).

Defensa del por qué IA local y no cloud: privacidad de los apuntes del estudiante, cero coste por consulta, defendible desde sostenibilidad (1708190 RA4) — no se factura a OpenAI/Google por cada expansión.

---

## 8. Checklist para retomar en chat nuevo

Cuando arranques el chat nuevo, pásale:

1. Este archivo (`docs/notes-plan.md`).
2. Estado actual: `git log --oneline -10` desde `FaseMaps`.
3. Lo que está hecho: M0 BD + M1 backend maps + M2 listado + M3 editor + M4 frontend cableado (sólo falta backend Ollama).
4. Lo que está bloqueado por acción manual tuya:
   - Ejecutar `001_init_studyweaver.sql` y `002_create_maps.sql` en phpMyAdmin si aún no.
   - Confirmar que el PC remoto con Ollama y `gpt-oss-20b` está accesible vía red local desde XAMPP.
   - Añadir al `.env` la URL del Ollama (probable: `OLLAMA_BASE_URL=http://<ip-pc-remoto>:11434`) y el modelo (`OLLAMA_MODEL=gpt-oss-20b`).
5. Decisiones aún abiertas:
   - **Composer vs shell-out** para PDF parsing (mi voto: Composer `Smalot/PDFParser`, ADR-06).
   - **Tamaño máx PDF** (mi voto: 5 MB).
   - **Cómo almacenar el PDF físico** (mi voto: `backend/uploads/notes/<user_id>/<uuid>.pdf` + ruta relativa en BD).
   - **Truncado del texto** antes de mandarlo a Ollama (gpt-oss-20b acepta contexto largo, pero conviene cap a ~6000-8000 chars del prompt para evitar latencia + coste de VRAM).
6. Posible orden de ataque sugerido al chat nuevo:
   - M4 backend Ollama (cierra mapas)
   - N0 BD
   - N1 backend notes
   - N2 frontend listado + upload
   - N4 IA from-note (target=map primero, validar pipeline completo)
   - N5 flashcards (target=flashcards) + página de repaso
   - Figma
   - Despliegue
   - Memoria

---

## 9. Reglas que se mantienen del proyecto (recordatorio)

- Castellano en comentarios, mensajes UI, commits.
- Sin TypeScript, sin Redux, sin React Query.
- Wrapper único de fetch en `frontend/src/api/client.js`.
- Componentes funcionales con hooks.
- Backend headless: solo JSON, nunca HTML.
- Cada controller termina con `echo json_encode([...])`.
- `AuthMiddleware::verifyToken()` para auth en endpoints nuevos.
- Cada librería nueva → ADR en `docs/decisiones.md`.
- No tocar `.env` (pedir al usuario que añada variables).
- No commits sin permiso explícito (Claude sólo escribe, el alumno commitea).
- RTK manual en cada Bash command.
