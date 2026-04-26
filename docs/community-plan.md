# Plan Fase Comunidad · Feed público, likes y comentarios

> **Contexto y origen:** Tras cerrar Fase Maps (M0–M5) y con Fase Flashcards en plan ([`docs/maps-plan.md`](./maps-plan.md), `plans/crea-el-implementation-plan-golden-canyon.md`), queda abrir la **capa social** de StudyWeaver. La landing pública la promete: *"comparte tus mapas con la comunidad, descubre los de otros estudiantes y aprended juntos"*. El placeholder en [`frontend/src/router.jsx`](../frontend/src/router.jsx) dice: *"Descubre mapas públicos, da likes, comenta y guarda los que te ayuden a estudiar"*.
>
> Este plan asume leídos: [`CLAUDE.md`](../CLAUDE.md), [`Gemini.md`](../Gemini.md), [`docs/decisiones.md`](./decisiones.md), [`backend/DATA/database_context.md`](../backend/DATA/database_context.md), `docs/maps-plan.md`. La estructura del repo ya está migrada a `backend/`.

---

## 0. Modelo conceptual

```
Mapa (is_public=1) ──┬── (N) Likes      (toggle por usuario)
                     ├── (N) Comments   (planos, sin replies)
                     └── Autor (users) ── Perfil público /u/:id
```

- El mapa se vuelve público desde el editor con un switch que persiste en `maps.is_public` (backend ya lo soporta desde M1).
- **Likes:** toggle binario por usuario sobre un mapa. PK compuesta `(user_id, map_id)` impide duplicados a nivel de BD.
- **Comments:** texto plano. Sin árbol de respuestas (defendible: complejidad UX que no aporta valor académico).
- **Perfil público:** vista read-only con foto, nombre y mapas públicos del autor. Sin email, sin teléfono — sólo lo que el usuario decide compartir publicando mapas.
- **Bookmarks (guardar para luego):** se reutiliza `likes` como doble función (dar like = guardarlo en "Mis favoritos"). Sin tabla extra. Defendible: la PK compuesta ya garantiza unicidad y la información que aporta una tabla `bookmarks` separada es la misma.

---

## 1. Decisiones de diseño

1. **Solo mapas en el feed (no flashcards).** Flashcards son personales por diseño SM-2 — un repaso compartido pierde sentido didáctico. Si llega a tener interés, `flashcards` añadiría `is_public` en una migración futura.
2. **Vista pública del mapa en modo "fixed"** de Drawflow (`editor.editor_mode = 'fixed'`). Reusa `DrawflowEditor.jsx` con prop nueva `readOnly`. Defendible: misma librería, mismo componente, sólo cambia el modo. Sin reescribir un renderer SVG aparte.
3. **Sin replies en comments.** PK simple `id`, índice `(map_id, created_at)` para listado paginado por mapa.
4. **Búsqueda mínima** por `title` y `description` con `LIKE '%q%'`. Sin full-text search en MVP. Defendible para un MVP académico; documentado como mejora futura.
5. **Paginación load-more** con `LIMIT 12 OFFSET N`. Sin scroll infinito (más complicado de defender). Botón "Cargar más" al final.
6. **Ordenación del feed:** `recent` (default, por `updated_at DESC`) o `popular` (por `COUNT(likes) DESC` con tie-breaker `updated_at`). Sin "tendencia" ni algoritmos complejos.
7. **Toggle público desde editor** ya existe en `maps.is_public` en BD; falta UI en `MapEditorPage`. Esta fase añade el switch + confirmación al cambiar a público.
8. **Borrado de comentarios:** sólo el **autor del comentario** o el **autor del mapa** pueden borrar. Doble verificación en el controller.
9. **Auto-moderación mínima:** límite de longitud del comment (1000 chars), trim, escape al renderizar. Sin filtros de palabras (fuera de scope académico).
10. **Notas embebidas en perfil:** el perfil público `/u/:id` muestra solo nombre + avatar + grid de mapas públicos. **No expone email ni datos sensibles** (RGPD básico).

---

## 2. Cambios de BD

### 2.1 Ejecutar (sin tocar el contenido) las migraciones ya planificadas

Ambas viven en `backend/DATA/migrations/` con extensión `.planned`:

- [`004_create_likes.sql.planned`](../backend/DATA/migrations/004_create_likes.sql.planned) → tabla `likes(user_id, map_id, created_at)` con PK compuesta + índice `(map_id)` para `COUNT(*)`.
- [`005_create_comments.sql.planned`](../backend/DATA/migrations/005_create_comments.sql.planned) → tabla `comments(id, map_id, user_id, body, created_at, updated_at)` con índice `(map_id, created_at)`.

**Acción manual del usuario:** ejecutar ambas en phpMyAdmin sobre `autoflow`. Verificar:
- `SHOW TABLES;` → aparecen `likes` y `comments`.
- `DESCRIBE likes;` → 3 columnas + PK compuesta.
- `DESCRIBE comments;` → 6 columnas + 2 FK + índice compuesto.

Tras ejecutarlas, **Claude renombra** los archivos quitando `.planned` (deja de ser planificado).

### 2.2 Sin alters

No hace falta tocar `maps`. El campo `is_public` ya existe desde M0 (migración 002).

### 2.3 Documentación

Actualizar [`backend/DATA/database_context.md`](../backend/DATA/database_context.md) §2 moviendo `likes` y `comments` de "tablas planificadas" (§3.2 y §3.3) a "tablas activas" (§2.3 y §2.4). Actualizar §4 FKs y §5 índices reflejándolos como activos.

---

## 3. Backend nuevo

### 3.1 Modelos

```
backend/MODEL/Like.php
backend/MODEL/Comment.php
```

**`Like.php`** (siguiendo patrón [`Map.php`](../backend/MODEL/Map.php)):
- `toggle($userId, $mapId)` — Si existe la fila la borra y devuelve `false`; si no, hace `INSERT IGNORE` y devuelve `true`. Una sola transacción.
- `countByMap($mapId)` — `SELECT COUNT(*)`.
- `userHasLiked($userId, $mapId)` — `SELECT 1` para badges del feed (saber qué corazones llenar).
- `findFavoritesByUser($userId, $limit, $offset)` — para "Mis favoritos" (reuso de likes como bookmarks).

**`Comment.php`**:
- `findByMap($mapId, $limit, $offset)` — JOIN con `users` para devolver `{id, body, created_at, author: {id, name, avatar_url}}`.
- `countByMap($mapId)`.
- `findByIdForUserOrMapOwner($commentId, $userId)` — devuelve la fila si el usuario es autor del comment **o** del mapa donde se posteó (para borrar).
- `create($mapId, $userId, $body)`.
- `delete($commentId)`.

### 3.2 Controllers

```
backend/API/controllers/feedController.php       (GET feed + GET map público + perfil público)
backend/API/controllers/likeController.php       (toggle, count)
backend/API/controllers/commentController.php   (list, create, delete)
```

**`FeedController`:**

- `list()` — `GET community/feed?sort=recent|popular&q=keywords&page=N&page_size=12`. Devuelve mapas con `is_public=1`, JOIN `users` (autor: id, name, avatar_url), COUNT likes, COUNT comments. Sin `drawflow_json`.
- `getPublicMap()` — `GET community/map?id=N`. Devuelve mapa público completo (incluido `drawflow_json`) + autor + count likes + count comments + `liked_by_me` bool. Si el mapa existe pero `is_public=0`, devuelve 404 (no filtra existencia).
- `getProfile()` — `GET community/profile?user_id=N`. Devuelve `{id, name, avatar_url, public_maps_count}`. Sin email, sin teléfono.
- `getProfileMaps()` — `GET community/profile-maps?user_id=N&page=N`. Mapas públicos del usuario, mismo formato que `list`.
- `getMyFavorites()` — `GET community/favorites&page=N`. Mapas que el usuario actual ha "likeado" (reuso de likes como bookmarks).

**`LikeController`:**

- `toggle()` — `POST community/like`. Body `{map_id}`. Devuelve `{liked: bool, count: N}`.
  - Verifica que `map_id` existe y `is_public=1` antes de permitir like (no se puede likear privado de otro).
  - Excepción: el dueño del mapa puede likearse a sí mismo (UX coherente con "favoritos").

**`CommentController`:**

- `list()` — `GET community/comments?map_id=N&page=N&page_size=20`.
- `create()` — `POST community/comment`. Body `{map_id, body}`. Validaciones: body 1-1000 chars, mapa público (o el propio dueño puede comentar en el suyo aún privado).
- `delete()` — `POST community/comment-delete`. Body `{id}`. Permitido si autor del comment **o** dueño del mapa. 403 si no.

### 3.3 Routing — añadir en [`backend/API/router/api.php`](../backend/API/router/api.php)

```php
// Community Routes — Fase Comunidad · C1
$router->get('community/feed',           'feedController',    'list');
$router->get('community/map',            'feedController',    'getPublicMap');
$router->get('community/profile',        'feedController',    'getProfile');
$router->get('community/profile-maps',   'feedController',    'getProfileMaps');
$router->get('community/favorites',      'feedController',    'getMyFavorites');

$router->post('community/like',          'likeController',    'toggle');

$router->get('community/comments',       'commentController', 'list');
$router->post('community/comment',       'commentController', 'create');
$router->post('community/comment-delete','commentController', 'delete');
```

---

## 4. Frontend nuevo

### 4.1 Estructura

```
frontend/src/features/community/
├── pages/
│   ├── CommunityFeedPage.jsx            ← /comunidad   (feed público)
│   ├── PublicMapPage.jsx                ← /comunidad/mapa/:id   (mapa público read-only)
│   ├── PublicProfilePage.jsx            ← /u/:userId   (perfil público)
│   └── MyFavoritesPage.jsx              ← /comunidad/favoritos   (mapas que he likeado)
├── components/
│   ├── PublicMapCard.jsx                (cabecera autor avatar+nombre, título, like count, comments count, fecha)
│   ├── FeedToolbar.jsx                  (tabs Recientes/Populares + buscador + acceso a Favoritos)
│   ├── LikeButton.jsx                   (corazón outline/filled, optimista, tooltip count)
│   ├── CommentsSection.jsx              (lista paginada + form de añadir + borrar propio)
│   ├── CommentItem.jsx                  (autor avatar+nombre, body, fecha relativa, papelera si autorizado)
│   ├── ShareToggle.jsx                  (switch "Público/Privado" usado en MapEditorPage)
│   └── EmptyFeedState.jsx               (CTA "Comparte tu primer mapa" si vienes sin contenido)
└── services/
    └── communityService.js              (fetchFeed, fetchPublicMap, toggleLike, fetchComments, createComment, deleteComment, fetchProfile, fetchProfileMaps, fetchFavorites)
```

### 4.2 Cambios fuera de community

- [`frontend/src/api/endpoints.js`](../frontend/src/api/endpoints.js): añadir bloque `community: { feed, map, profile, profileMaps, favorites, like, comments, comment, commentDelete }`.
- [`frontend/src/router.jsx`](../frontend/src/router.jsx): sustituir `<PlaceholderPage>` de `/comunidad` por `<CommunityFeedPage />`. Añadir 3 rutas nuevas: `/comunidad/mapa/:id`, `/comunidad/favoritos`, `/u/:userId`.
- [`frontend/src/features/maps/components/DrawflowEditor.jsx`](../frontend/src/features/maps/components/DrawflowEditor.jsx): aceptar prop `readOnly` (default `false`). Si `true`, hacer `editor.editor_mode = 'fixed'` tras `start()`. Ocultar/no enganchar handlers de edición de label/hint y botones del custom node.
- [`frontend/src/features/maps/pages/MapEditorPage.jsx`](../frontend/src/features/maps/pages/MapEditorPage.jsx): añadir `<ShareToggle>` en cabecera (al lado del `SaveIndicator`) que llama a `mapsService.saveMap({id, is_public: bool})`.
- [`frontend/src/features/shell/navItems.js`](../frontend/src/features/shell/navItems.js): la entrada `Comunidad` ya está; sin cambios.

### 4.3 Comportamiento por página

**`CommunityFeedPage`** (`/comunidad`):
- `<FeedToolbar>` con tabs Recientes/Populares + input de búsqueda con debounce 400ms + link "Mis favoritos".
- Grid responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` con `<PublicMapCard>`.
- Botón "Cargar más" al final si `data.length === page_size` (heurística de "puede haber siguiente página").
- Empty state si no hay resultados o si el usuario aún no ha hecho público nada (CTA "Haz público tu primer mapa").

**`PublicMapCard`**:
- Avatar + nombre del autor (link a `/u/:userId`).
- Título (link a `/comunidad/mapa/:id`).
- Descripción truncada.
- `<LikeButton>` + contador de comentarios + fecha relativa.
- Hover sutil tipo el `MapCard` actual.

**`PublicMapPage`** (`/comunidad/mapa/:id`):
- Cabecera: avatar+nombre del autor (link), título, fecha, `<LikeButton>`, contador comentarios.
- Cuerpo principal: `<DrawflowEditor readOnly initialJson={...} />` con altura grande pero scrollable.
- Lateral o debajo (responsive): `<CommentsSection>`.
- Si el visitante NO está logueado → vista read-only sin botones de like/comment + CTA "Inicia sesión para participar".
- Si el visitante es el autor del mapa → botón "Editar" que lleva a `/mapas/:id`.

**`PublicProfilePage`** (`/u/:userId`):
- Avatar grande + nombre + número total de mapas públicos.
- Grid de `<PublicMapCard>` con sus mapas públicos paginados.
- Si el visitante es ese usuario → indicador "Este es tu perfil público".

**`MyFavoritesPage`** (`/comunidad/favoritos`):
- Mismo grid que el feed, pero con `community/favorites`.
- Empty state CTA → ir al feed.

**`ShareToggle`** (en `MapEditorPage`):
- Switch on/off. Al activar pide confirmación: *"¿Hacer público este mapa? Cualquier usuario podrá verlo, darle like y comentar"*.
- Al guardar, refresca el `auto.lastSavedAt` y muestra toast.

---

## 5. Plan de implementación por subfases

| Sub | Foco | Horas |
| --- | --- | --- |
| **C0** | BD: ejecutar migraciones 004 y 005 + actualizar `database_context.md` | 0.5 |
| **C1** | Backend: `Like.php` + `Comment.php` + 3 controllers + 9 rutas | 4 |
| **C2** | Frontend feed: `CommunityFeedPage` + `PublicMapCard` + `FeedToolbar` + `LikeButton` + `communityService` + endpoints + búsqueda | 3 |
| **C3** | Vista pública mapa: `PublicMapPage` + prop `readOnly` en `DrawflowEditor` + `CommentsSection` + `CommentItem` | 3 |
| **C4** | Perfil público + favoritos: `PublicProfilePage` + `MyFavoritesPage` + rutas | 1.5 |
| **C5** | `ShareToggle` en `MapEditorPage` + refresh de `is_public` tras toggle | 0.5 |
| **C6** | Pulido: copy castellano, accesibilidad, empty states, tooltips, build smoke | 1 |
| **Total** | | **~13.5 h** |

---

## 6. Patrones a reusar (no reinventar)

| Necesidad | Reusar de |
| --- | --- |
| Modelo PDO posicional + ownership | [`backend/MODEL/Map.php`](../backend/MODEL/Map.php) |
| Controller try/catch + códigos HTTP | [`backend/API/controllers/mapController.php`](../backend/API/controllers/mapController.php) |
| Auth en controller | `AuthMiddleware::verifyToken()` |
| Paginación posicional `LIMIT/OFFSET` | nueva, pero con la misma firma `?page=N&page_size=12` en todos los endpoints del feed |
| Servicio frontend | [`frontend/src/features/maps/services/mapsService.js`](../frontend/src/features/maps/services/mapsService.js) |
| Página de listado con estados | [`frontend/src/features/maps/pages/MapsListPage.jsx`](../frontend/src/features/maps/pages/MapsListPage.jsx) |
| Tarjeta con badge + acciones | [`frontend/src/features/maps/components/MapCard.jsx`](../frontend/src/features/maps/components/MapCard.jsx) |
| DrawflowEditor read-only | añadir prop `readOnly` al componente existente |
| Modal `<dialog>` nativo | [`frontend/src/features/maps/components/DeleteMapDialog.jsx`](../frontend/src/features/maps/components/DeleteMapDialog.jsx) |
| Toasts | `useNotification()` |
| Fecha relativa | [`frontend/src/utils/relativeTime.js`](../frontend/src/utils/relativeTime.js) |
| UI base | `frontend/src/ui/Button,Card,Input,Spinner` |

---

## 7. Defensa al tribunal

- **RA8 0613 (web dinámica + servicios):** `feedController` con joins SQL agregando likes y comments en una query.
- **RA6 0613 (acceso seguro a datos):** validación de ownership doble en `community/comment-delete` (autor del comment o del mapa); nunca se expone `email`/`phone` en `community/profile`.
- **RA7 0612 (web cliente asíncrono):** búsqueda con debounce, paginación load-more sin recarga, like optimista con rollback.
- **RA2 0615 (Grid Layout):** mismo patrón ya usado en `MapsListPage`.
- **Diferenciación frente a una red social genérica:** la comunidad de StudyWeaver es **read-mostly y enfocada al estudio** (mapas conceptuales), no un timeline genérico. Los likes funcionan también como bookmarks. Sin algoritmo de tendencia que distrae al estudiante.

---

## 8. Verificación end-to-end

Tras completar las subfases, con XAMPP arriba y migraciones 004 + 005 ejecutadas:

1. **Compartir un mapa:** entrar a un mapa propio → toggle "Público" → confirmar → toast verde. Verificar `is_public=1` en BD.
2. **Feed público:** logout y entrar en otra cuenta → `/comunidad` → ver el mapa publicado en el grid → click → `PublicMapPage` con DrawflowEditor en modo `fixed` (no permite editar nodos).
3. **Like:** dar like → corazón se rellena, contador sube. Recargar → estado persistido. Volver a clickar → toggle off.
4. **Comentar:** escribir comentario en `PublicMapPage` → aparece en lista. Probar borrarlo → desaparece. Probar borrar uno ajeno → 403 + toast.
5. **Borrar como dueño del mapa:** entrar al mapa propio (`/comunidad/mapa/:id`), borrar comentario de otro → permitido.
6. **Perfil público:** click en avatar del autor → `/u/:userId` → ver mapas públicos. Sin email visible.
7. **Mis favoritos:** ir a `/comunidad/favoritos` → ver los mapas que he likeado.
8. **Búsqueda:** buscar palabra clave → filtra resultados (respeta `is_public=1`).
9. **Paginación:** publicar >12 mapas y verificar "Cargar más".
10. **Anti-IDOR:** intentar `GET community/map?id=X` con un mapa privado ajeno → 404. Intentar `POST community/like` con map_id privado ajeno → 403.
11. **Sin sesión:** abrir `/comunidad/mapa/:id` sin login → mapa visible read-only, like y comment ocultos. (Si decidimos mantener `/comunidad` privada, redirigir a /login en su lugar — decidir en C2.)
12. **Build limpio:** `npm run build --prefix frontend` sin warnings nuevos. `php -l` sin errores.

---

## 9. Decisiones abiertas (para confirmar antes de empezar)

1. **¿Comunidad pública o sólo logueada?** Voto: **logueada** (consistente con el resto de la app y simplifica auth en todos los endpoints). Si se decide pública, hay que añadir un middleware "auth opcional" que distingue anon de logueado.
2. **¿Dejar la búsqueda en MVP o posponerla?** Voto: **dejarla simple** (`LIKE '%q%'`) — coste 30 min, beneficio defensivo claro.
3. **¿Permitir editar comentarios?** Voto: **no** (sólo borrar). Editar abre la puerta a "padding ataques" donde alguien edita un comment después de ser likeado. KISS.
4. **¿"Mis favoritos" como página separada o tab dentro del feed?** Voto: **página separada** `/comunidad/favoritos` para tener URL compartible.
5. **¿Notificar al autor cuando alguien comenta su mapa?** Voto: **fuera de scope** (requiere tabla `notifications`, websocket o polling). Roadmap futuro.

---

## 10. Acciones manuales del usuario antes de empezar

1. Ejecutar [`backend/DATA/migrations/004_create_likes.sql.planned`](../backend/DATA/migrations/004_create_likes.sql.planned) en phpMyAdmin sobre `autoflow`.
2. Ejecutar [`backend/DATA/migrations/005_create_comments.sql.planned`](../backend/DATA/migrations/005_create_comments.sql.planned) idem.
3. Confirmar las 5 decisiones abiertas de §9.
4. Decidir si se ataca antes que Flashcards o después. Mi voto: **antes** Flashcards (Comunidad es 13h vs 12h y aporta narrativa más visible al tribunal — el mapa público es vistoso en demo).

---

## 11. Reglas que se mantienen del proyecto

- Castellano en comentarios, mensajes UI, commits.
- Sin TypeScript, sin Redux, sin React Query.
- Wrapper único de fetch en `frontend/src/api/client.js`.
- Componentes funcionales con hooks.
- Backend headless: solo JSON.
- `AuthMiddleware::verifyToken()` para auth en endpoints nuevos.
- Cada librería nueva → ADR (en este plan no se introduce ninguna).
- No tocar `.env`.
- Claude no commitea (regla `feedback_no_commits`).
- RTK manual en cada Bash command.
