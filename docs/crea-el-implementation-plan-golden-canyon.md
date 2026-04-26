# Plan de implementación · Fase Flashcards (StudyWeaver)

## Contexto

StudyWeaver es la plataforma de estudio personal (proyecto final DAW, entrega 3 mayo 2026) que pivotó desde NodeWeaver. El editor de mapas conceptuales con IA (Fase Maps · M0–M5) está cerrado en `FaseMaps`: backend completo (`mapController`, `aiController` con Ollama), frontend con `MapsListPage` + `MapEditorPage` con auto-save.

La Fase Flashcards es la siguiente del roadmap. Cierra el ciclo de estudio prometido en la landing pública: *"repasa con repetición espaciada las tarjetas generadas a partir de tus mapas. Algoritmo SM-2 simplificado"* (texto literal del placeholder en [`frontend/src/router.jsx:61`](frontend/src/router.jsx)). El DDL de la tabla `flashcards` ya está escrito en [`backend/DATA/migrations/003_create_flashcards.sql.planned`](backend/DATA/migrations/003_create_flashcards.sql.planned), pero no ejecutado.

Con la decisión del usuario (CRUD manual + IA + generación desde mapa), Flashcards aporta dos valores defendibles ante tribunal DAW:
- **Comprensión** vía mapa visual (ya implementado).
- **Retención** vía SM-2 espaciado, lo que diferencia StudyWeaver de un dibujador de mapas más.

## Estado actual del repo (verificado)

- Estructura migrada a `backend/`. Rutas existentes en [`backend/API/router/api.php`](backend/API/router/api.php): `auth/*`, `profile/*`, `maps/*`, `ai/expand`.
- [`backend/MODEL/Map.php`](backend/MODEL/Map.php) define el patrón canónico a replicar: PDO posicional (`?`), filtros `WHERE … AND user_id = ?`, helper `getUpdatedAt`.
- [`backend/API/controllers/aiController.php`](backend/API/controllers/aiController.php) define el patrón IA: 503 si Ollama cae, prompt en `AIClient::expand` (servicio en `backend/API/services/AIClient.php`).
- [`backend/DATA/migrations/003_create_flashcards.sql.planned`](backend/DATA/migrations/003_create_flashcards.sql.planned) tiene columnas exactas: `id, user_id, map_id NULL, front, back, ease_factor DECIMAL(3,2) DEFAULT 2.50, interval_days, repetitions, next_review_at DATE, last_reviewed_at, created_at, updated_at` + FK CASCADE/SET NULL + `idx_user_due`.
- [`frontend/src/api/client.js:97`](frontend/src/api/client.js) ya tiene `apiGet(route, params, signal)` con params como objeto serializado a query.
- [`frontend/src/router.jsx:55`](frontend/src/router.jsx) tiene `/flashcards` como `<PlaceholderPage icon="fa-clone">` listo para reemplazar.
- [`frontend/src/features/shell/navItems.js`](frontend/src/features/shell/navItems.js) tiene la entrada `Flashcards` activa (no disabled).
- [`frontend/src/features/maps/services/mapsService.js`](frontend/src/features/maps/services/mapsService.js) define el patrón de servicio (`apiGet`/`apiPost` + `ENDPOINTS.<feature>.*`).
- [`frontend/src/features/maps/pages/MapsListPage.jsx`](frontend/src/features/maps/pages/MapsListPage.jsx) define el patrón de listado (estados `loading|error|empty|ok`, `useNotification`, grid responsive).

Lo que **no existe** todavía:
- Tabla `flashcards` en MySQL (sólo `.planned`).
- `MODEL/Flashcard.php`, `flashcardController.php`, rutas `flashcards/*`.
- Método `AIClient::generateFlashcards()` (sólo está `expand`).
- Carpeta `frontend/src/features/flashcards/`.

## Decisiones de diseño

1. **Algoritmo SM-2 simplificado** vive en `MODEL/Flashcard.php` como método estático `applyReview($card, $grade)`. Defendible: la BD guarda estado, el backend calcula la nueva fila tras cada repaso. Tres grados: `fail` (0), `good` (1), `easy` (2). Fórmula documentada en `database_context.md` §3.1 ya escrita.
2. **Endpoint `flashcards/review`** separado del `save`. Recibe `{id, grade}`, recalcula campos SM-2, persiste, devuelve la fila actualizada. Defendible: mezclar review con update genérico complica el controller.
3. **Endpoint `flashcards/generate-from-map`** separado del `flashcards/save` y separado del `aiController`. Vive en `flashcardController` porque su responsabilidad es crear filas en `flashcards`; sólo delega la llamada a `AIClient::generateFlashcards()`. Patrón: el controller orquesta, el servicio habla con Ollama.
4. **Dos vistas en `/flashcards`** mediante tabs internos (sin sub-rutas anidadas para no complicar el router): "Repasar" (default si hay due > 0) y "Mis tarjetas". La sesión de repaso vive en sub-ruta `/flashcards/repaso` para tener URL compartible y permitir back-button limpio.
5. **Sin paginación** en MVP. Una cuenta de estudiante con 200-500 tarjetas funciona en memoria. Si crece, paginar después con `LIMIT/OFFSET`.
6. **`note_id` (Fase Notes)** queda **fuera** de esta fase. La columna no se añade ahora; cuando llegue Fase Notes se hará `ALTER TABLE flashcards ADD COLUMN note_id`. Mantengo el `.planned` que ejecutamos sin tocar.

## Plan por subfases

### F0 · BD (≈ 0.5 h)

**Acción manual del usuario:** ejecutar [`backend/DATA/migrations/003_create_flashcards.sql.planned`](backend/DATA/migrations/003_create_flashcards.sql.planned) en phpMyAdmin (renombrando o no, da igual — basta con copiar el SQL). Verificar con `SHOW TABLES;` que aparece `flashcards` y con `DESCRIBE flashcards;` las 12 columnas.

Tras ejecutarlo, **Claude renombra** el archivo a `003_create_flashcards.sql` quitando el `.planned` (el archivo deja de ser planificado).

**Documentación:** actualizar [`backend/DATA/database_context.md`](backend/DATA/database_context.md) §2 moviendo `flashcards` de "tablas planificadas" a "tablas activas" (renumerar §2.3, etc.). Añadir reglas de negocio: ownership por `user_id`, FK SET NULL al borrar mapa, fórmula SM-2.

### F1 · Backend modelo y controller (≈ 2.5 h)

Crear [`backend/MODEL/Flashcard.php`](backend/MODEL/Flashcard.php) replicando el patrón de [`backend/MODEL/Map.php`](backend/MODEL/Map.php):

- `findByUser($userId)` — todas las del usuario, orden `next_review_at ASC, id DESC`.
- `findDue($userId, $today)` — `WHERE user_id=? AND next_review_at <= ?`.
- `findByIdForUser($id, $userId)` — anti-IDOR con `AND user_id=?`.
- `create($userId, $mapId, $front, $back, $nextReviewAt)` — defaults SM-2 los aplica el INSERT (DEFAULT 2.50, etc.).
- `createBatch($userId, $mapId, $cards)` — para `generate-from-map`. Una transacción, un INSERT con `VALUES (?,?,?,?,...)` repetido N veces.
- `update($id, $userId, $front, $back)` — solo edita front/back (los campos SM-2 se recalculan vía review, no editan a mano).
- `applyReview($id, $userId, $grade)` — recalcula SM-2 y persiste en una sola query UPDATE.
- `delete($id, $userId)` — devuelve `rowCount() > 0`.
- Helper estático **`computeReview($current, $grade)`** que dado `{ease_factor, interval_days, repetitions}` y un grado devuelve los nuevos valores. Aislada para poder testearse.

**Fórmula SM-2 simplificada (documentada ya en `003_create_flashcards.sql.planned` y `database_context.md` §3.1):**
```
grade=fail (0):
  repetitions = 0
  interval_days = 1
  ease_factor = max(1.30, ease_factor - 0.20)
grade=good (1):
  repetitions += 1
  interval_days = repetitions==1 ? 1 :
                  repetitions==2 ? 6 :
                  round(interval_days * ease_factor)
  ease_factor sin cambio
grade=easy (2):
  igual que good +
  ease_factor = min(2.50, ease_factor + 0.10)
next_review_at = today + interval_days días
```

Crear [`backend/API/controllers/flashcardController.php`](backend/API/controllers/flashcardController.php) replicando el patrón de [`backend/API/controllers/mapController.php`](backend/API/controllers/mapController.php):

- `list()` — GET. Filtra por `user_id` del JWT.
- `due()` — GET. `findDue` con `CURDATE()`.
- `save()` — POST. Crea (sin id) o actualiza (con id). Validaciones: `front` y `back` no vacíos, ≤ 500 chars cada uno; `map_id` opcional, si llega verificar que el mapa pertenezca al usuario para evitar usar `map_id` ajeno.
- `review()` — POST. Body `{id, grade: "fail"|"good"|"easy"}`. Verifica ownership con `findByIdForUser`, llama a `applyReview`, devuelve la fila actualizada con `next_review_at` en `data`.
- `delete()` — POST. Body `{id}`. 404 si no existe o no es suyo.
- `generateFromMap()` — POST. Body `{map_id}`. Verifica ownership del mapa, parsea `drawflow_json`, extrae `nodes` con `{label, hint}`, llama a `AIClient::generateFlashcards($mapTitle, $nodes)`, persiste con `createBatch` (si la IA cae: 503 con mensaje, sin crear nada). Devuelve `{ created: N }`.

Auth: `AuthMiddleware::verifyToken()` al inicio de cada método (mismo patrón que `mapController`). Super User id=999 cortocircuita 403 en `save`/`review`/`generateFromMap` (mismo patrón).

### F2 · Backend IA (≈ 1.5 h)

Ampliar [`backend/API/services/AIClient.php`](backend/API/services/AIClient.php) añadiendo método estático `generateFlashcards($mapTitle, $nodes)`:

- Construye prompt:
  ```
  A partir de este mapa conceptual, genera entre 8 y 15 flashcards
  de repaso. Devuelve JSON estricto:
  { "cards": [{"front": "Pregunta…", "back": "Respuesta…"}] }
  Reglas: front pregunta breve, back respuesta corta (<200 chars cada
  uno), en español, sin texto fuera del JSON.

  Mapa: "{mapTitle}"
  Nodos:
  {nodes serializados como "- {label}: {hint}\n"}
  ```
- Misma plantilla HTTP que `expand`: misma URL Ollama, mismo modelo, `format: 'json'` para forzar JSON. Timeout 30s (más generoso que expand: el output es más largo).
- Si la respuesta no parsea o no tiene `cards[]`: lanza `RuntimeException`. El controller traduce a 503.

Registrar en [`backend/API/router/api.php`](backend/API/router/api.php) las rutas (justo después del bloque `ai/expand`):

```php
// Flashcards Routes — Fase Flashcards · F1
$router->get('flashcards/list',                  'flashcardController', 'list');
$router->get('flashcards/due',                   'flashcardController', 'due');
$router->post('flashcards/save',                 'flashcardController', 'save');
$router->post('flashcards/review',               'flashcardController', 'review');
$router->post('flashcards/delete',               'flashcardController', 'delete');
$router->post('flashcards/generate-from-map',    'flashcardController', 'generateFromMap');
```

### F3 · Frontend listado y CRUD manual (≈ 3 h)

Estructura nueva:

```
frontend/src/features/flashcards/
├── pages/
│   └── FlashcardsListPage.jsx        ← reemplaza el placeholder en /flashcards
├── components/
│   ├── FlashcardCard.jsx             (front truncado, back oculto, badge "vence en X días", acciones edit/delete)
│   ├── FlashcardEditDialog.jsx       (<dialog> nativo, igual que DeleteMapDialog; tabs front/back)
│   ├── DeleteFlashcardDialog.jsx     (réplica de DeleteMapDialog, sólo cambia el copy)
│   ├── DueBadge.jsx                  (cápsula color: "Hoy" / "Mañana" / "vence en N días")
│   └── EmptyFlashcardsState.jsx      (CTA "Crea tu primera tarjeta" + secundario "Generar desde un mapa")
└── services/
    └── flashcardsService.js          (listFlashcards, listDue, saveFlashcard, reviewFlashcard, deleteFlashcard, generateFromMap)
```

`FlashcardsListPage`:
- Tabs internos `Repasar` / `Mis tarjetas` (estado en `useState`, sin sub-rutas).
- Tab `Repasar`: muestra recuento `due.length`, botón grande "Empezar repaso" → `navigate('/flashcards/repaso')`.
- Tab `Mis tarjetas`: grid responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (cumple RA2 0615 Grid Layout) con `FlashcardCard`. Botón cabecera "+ Nueva tarjeta" abre `FlashcardEditDialog` en modo create.
- Refresh tras crear/editar/borrar (mismo patrón de borrado optimista que `MapsListPage`).

Modificar:
- [`frontend/src/api/endpoints.js`](frontend/src/api/endpoints.js) añadir bloque `flashcards: { list, due, save, review, remove, generateFromMap }`.
- [`frontend/src/router.jsx`](frontend/src/router.jsx) sustituir el `<PlaceholderPage>` de `/flashcards` por `<FlashcardsListPage />` y añadir ruta `/flashcards/repaso` (creada en F4).

### F4 · Frontend sesión de repaso SM-2 (≈ 2.5 h)

Nuevo:
```
frontend/src/features/flashcards/
├── pages/
│   └── ReviewSessionPage.jsx         ← /flashcards/repaso
├── components/
│   ├── FlippableCard.jsx             (front + click "Mostrar" → revela back)
│   ├── GradeButtons.jsx              (3 botones: Fallo / Bien / Fácil)
│   └── ReviewSummary.jsx             (al terminar: stats "X tarjetas repasadas, Y aciertos")
```

Flujo:
1. Mount: `flashcardsService.listDue()` → mete en cola.
2. Si cola vacía → muestra `<ReviewSummary kind="empty">` con "No tienes tarjetas que repasar hoy" y botón "Volver".
3. Mientras haya cola: muestra `FlippableCard` con `current = queue[0]`.
4. Al pulsar grade: llama `flashcardsService.reviewFlashcard(id, grade)` → optimista (saca de la cola sin esperar respuesta) y enseña la siguiente. Si hay error: rollback + toast.
5. Al vaciar cola: `<ReviewSummary>` con stats locales.
6. Atajos teclado: `1=fail, 2=good, 3=easy, espacio=mostrar back`. Reusar el patrón de [`frontend/src/features/maps/hooks/useEditorKeybindings.js`](frontend/src/features/maps/hooks/useEditorKeybindings.js).

### F5 · Cableado IA "generar desde mapa" (≈ 1.5 h)

Nuevo botón en [`frontend/src/features/maps/pages/MapEditorPage.jsx`](frontend/src/features/maps/pages/MapEditorPage.jsx) — añadir handler `handleGenerateFlashcards` y botón en `EditorToolbar` (icono `fa-clone`, después de "Guardar"):

- Click → spinner overlay (mismo patrón que el `expandingNodeId`).
- Llama `flashcardsService.generateFromMap(mapId)`.
- Éxito → toast `"Generadas N flashcards. Ver en /flashcards"` con botón secundario que navega.
- Error 503 → toast `"La IA no está disponible ahora."`.
- Si el mapa tiene 0 nodos → toast info `"Añade conceptos al mapa antes de generar flashcards."` (validación frontend para no gastar llamada).

Modificar [`frontend/src/features/maps/components/EditorToolbar.jsx`](frontend/src/features/maps/components/EditorToolbar.jsx) para aceptar prop `onGenerateFlashcards` y `isGeneratingFlashcards`.

### F6 · Pulido (≈ 1 h)

- Copy castellano coherente en todos los componentes nuevos.
- Tooltips, `aria-label` en botones icónicos.
- Validación inline en `FlashcardEditDialog` (front/back ≤ 500 chars).
- Build + smoke (`npm run build --prefix frontend`).
- Verificar que no hay strings "automation" / "workflow" / "n8n" colados.

## Patrones a reusar (no reinventar)

| Necesidad | Reusar de |
| --- | --- |
| Auth en controller | `AuthMiddleware::verifyToken()` en [`backend/API/middleware/verify-token.php`](backend/API/middleware/verify-token.php) |
| Modelo PDO posicional + ownership | [`backend/MODEL/Map.php`](backend/MODEL/Map.php) |
| Controller try/catch + códigos HTTP | [`backend/API/controllers/mapController.php`](backend/API/controllers/mapController.php) |
| IA via Ollama | [`backend/API/services/AIClient.php`](backend/API/services/AIClient.php) extendiendo con `generateFlashcards()` |
| Servicio frontend | [`frontend/src/features/maps/services/mapsService.js`](frontend/src/features/maps/services/mapsService.js) |
| Página de listado con estados | [`frontend/src/features/maps/pages/MapsListPage.jsx`](frontend/src/features/maps/pages/MapsListPage.jsx) |
| Modal `<dialog>` nativo | [`frontend/src/features/maps/components/DeleteMapDialog.jsx`](frontend/src/features/maps/components/DeleteMapDialog.jsx) |
| Toasts | `useNotification()` de [`frontend/src/ui/useNotification.js`](frontend/src/ui/useNotification.js) |
| UI base (Button, Card, Spinner, Input) | `frontend/src/ui/` |
| Atajos teclado | [`frontend/src/features/maps/hooks/useEditorKeybindings.js`](frontend/src/features/maps/hooks/useEditorKeybindings.js) |
| Fecha relativa "hoy / hace 3 días" | [`frontend/src/utils/relativeTime.js`](frontend/src/utils/relativeTime.js) |
| Tarjeta con badge + acciones (estilo) | [`frontend/src/features/maps/components/MapCard.jsx`](frontend/src/features/maps/components/MapCard.jsx) |

## Resumen ejecutivo

| Subfase | Foco | Horas |
| --- | --- | --- |
| F0 | BD (ejecutar 003 + actualizar database_context) | 0.5 |
| F1 | `MODEL/Flashcard` + `flashcardController` con CRUD + review + generate-from-map | 2.5 |
| F2 | `AIClient::generateFlashcards` + 6 rutas en api.php | 1.5 |
| F3 | `FlashcardsListPage` con tabs + CRUD manual | 3.0 |
| F4 | `ReviewSessionPage` con SM-2 + atajos teclado | 2.5 |
| F5 | Botón "Generar flashcards" en `MapEditorPage` | 1.5 |
| F6 | Pulido + build + smoke | 1.0 |
| **Total** | | **~12.5 h** |

## Verificación end-to-end

Tras completar todas las subfases, con XAMPP arriba y migración 003 ejecutada:

1. **CRUD manual:** login → `/flashcards` → tab "Mis tarjetas" → "+ Nueva tarjeta" → guardar → la tarjeta aparece en grid → editar → borrar con confirmación → toast verde en cada paso.
2. **Generar desde mapa:** abrir un mapa con ≥3 nodos → toolbar → botón "🃏 Generar flashcards" → spinner → toast "N flashcards creadas" → ir a `/flashcards` → las N tarjetas tienen `map_id` correcto y `front`/`back` coherentes con los nodos.
3. **Repaso SM-2:** crear 3 tarjetas con `next_review_at = CURDATE()` (manual o desde mapa) → `/flashcards` muestra "3 tarjetas para repasar" → "Empezar repaso" → para cada tarjeta: "Mostrar" revela back → grade `easy` → siguiente. Tras la última: `<ReviewSummary>` con stats. En BD: `next_review_at` recalculado, `repetitions` incrementadas, `last_reviewed_at` con timestamp.
4. **Persistencia SM-2:** marcar `fail` en una tarjeta con `repetitions=5` → `repetitions` baja a 0, `interval_days=1`, `ease_factor` baja 0.20 (mín 1.30).
5. **IDOR:** intentar `POST flashcards/delete` con `id` de otra cuenta → 404. Intentar `generateFromMap` con `map_id` ajeno → 404.
6. **IA caída:** apagar Ollama → `generateFromMap` → 503 con mensaje "La IA no está disponible ahora.".
7. **Atajos:** en `/flashcards/repaso`, pulsar `2` evalúa "good" sin clic; `espacio` revela back.
8. **Build limpio:** `npm run build --prefix frontend` sin warnings nuevos. `php -l` sin errores en `Flashcard.php` y `flashcardController.php`.

## Pendientes manuales del usuario

1. **F0:** ejecutar [`backend/DATA/migrations/003_create_flashcards.sql.planned`](backend/DATA/migrations/003_create_flashcards.sql.planned) en phpMyAdmin sobre la BD `autoflow`.
2. **Verificar que Ollama responde** desde el backend XAMPP (la URL ya está en `.env` desde M4). Sin Ollama, F5 sólo funciona en modo error 503.
3. **Commits:** Claude no commitea (regla `feedback_no_commits` en memoria del proyecto). Una vez revisada cada subfase, el usuario commitea con su mensaje.
