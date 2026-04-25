# Plan Fase Maps · Editor visual de mapas conceptuales con Drawflow + IA

> **Contexto**: Cierra el rediseño NodeWeaver → StudyWeaver con la **feature core** de la app: el editor visual donde el usuario crea mapas conceptuales (cada nodo = concepto), los persiste contra MySQL y los enriquece pidiéndole a la IA que expanda un nodo en hijos.
>
> Plan rector previo: [`docs/redesign-plan.md`](./redesign-plan.md). Documentos canónicos: [`CLAUDE.md`](../CLAUDE.md), [`Gemini.md`](../Gemini.md), [`docs/arquitectura.md`](./arquitectura.md), [`docs/criterios-daw.md`](./criterios-daw.md), [`DATA/database_context.md`](../DATA/database_context.md).
>
> Entrega: **3 mayo 2026**. Modalidad: solo, defensa ante tribunal DAW.

---

## 0. Auditoría del estado actual

### 0.1 Backend heredado de NodeWeaver (lo que **se elimina** en M0)

| Archivo | Estado | Por qué se elimina |
| --- | --- | --- |
| [API/controllers/automationController.php](../API/controllers/automationController.php) | A borrar | Vocabulario "automatización"; reimplementa `verifyToken` inline (anti-DRY); todas sus respuestas usan la clave `automation`/`automations` que mezclaría dos lenguajes con `mapController`. |
| [MODEL/automation.php](../MODEL/automation.php) | A borrar | Modela una entidad que ya no existe en el dominio. |
| Líneas 28-31 de [API/router/api.php](../API/router/api.php) | A borrar | Rutas `automation/list\|get\|save\|delete` sustituidas por `maps/*`. |
| Tabla `automations` (BD) | A dejar como **zombie** + ADR | NO se hace `DROP TABLE` en este sprint para no perder histórico de la fase pre-pivote ni romper backups. Se documenta en ADR como deuda a limpiar al desplegar a cloud. |

> Decisión consciente: el alumno explica en defensa que la tabla `automations` pertenece a la fase NodeWeaver original y se eliminaría al provisionar el esquema en producción cloud. No se reusa, no se renombra.

### 0.2 Backend que se reutiliza tal cual (no tocar)

| Activo | Razón |
| --- | --- |
| [API/controllers/authController.php](../API/controllers/authController.php) | Login, register, forgot, reset, confirm, google ya estables. |
| [API/controllers/profileController.php](../API/controllers/profileController.php) | Cubierto en Fase 4. |
| [DATA/jwt.php](../DATA/jwt.php), [DATA/sendgrid.php](../DATA/sendgrid.php), [DATA/cors.php](../DATA/cors.php), [DATA/env.php](../DATA/env.php), [DATA/database.php](../DATA/database.php) | Plomería compartida. CORS ya abierto a `*`, no requiere ampliación para Vite. |
| [API/middleware/verify-token.php](../API/middleware/verify-token.php) | `AuthMiddleware::verifyToken()` será **el** método para auth en `mapController` y `aiController` (en lugar de copiar y pegar como hace `automationController`). |
| [MODEL/user.php](../MODEL/user.php) | Sin cambios. |
| [API/router/Router.php](../API/router/Router.php) | Despachador genérico (`ucfirst(controller)` → instancia clase). Funciona tal cual con los nuevos controllers. |

### 0.3 Frontend (estado tras Fase 4)

- [frontend/src/router.jsx](../frontend/src/router.jsx) ya define `/mapas` como `<PlaceholderPage>` anidado bajo `<AppLayout>`. La ruta se sustituye por la real en M2.
- [frontend/src/features/shell/navItems.js](../frontend/src/features/shell/navItems.js) ya enlaza `/mapas` con icono `fa-diagram-project`. No se toca.
- [frontend/src/api/client.js](../frontend/src/api/client.js) ya expone `apiGet/apiPost/apiUpload` con JWT. Se reusa tal cual.
- [frontend/src/api/endpoints.js](../frontend/src/api/endpoints.js) sólo tiene `auth` y `profile` — añadir `maps` y `ai`.
- [frontend/src/auth/AuthContext.jsx](../frontend/src/auth/AuthContext.jsx) + `useAuth` + `ProtectedRoute` ya estables.
- [frontend/src/ui/](../frontend/src/ui/) ya tiene `Button`, `Input`, `Card`, `Spinner`, `NotificationProvider`, `useNotification`, `AmbientBackground`. Se reutilizan en M2/M3/M4.
- [frontend/src/main.jsx](../frontend/src/main.jsx) usa `<StrictMode>` → **importante**: Drawflow se montará dos veces en dev. Se mitiga con un flag de inicialización en el `useEffect` (ver §1.3).

### 0.4 Activos Drawflow disponibles

| Asset | Estado | Decisión |
| --- | --- | --- |
| [SERVER/libs/drawflow/drawflow.min.js](../SERVER/libs/drawflow/drawflow.min.js) | Local, sin versión declarada. | **No usar.** Importarlo como módulo ES desde React requiere shim manual. |
| [SERVER/libs/drawflow/drawflow.min.css](../SERVER/libs/drawflow/drawflow.min.css) | Estilos base sin tema. | **No usar.** Vendrá del paquete npm. |
| [SERVER/css/drawflow.css](../SERVER/css/drawflow.css), [SERVER/css/drawflow-theme.css](../SERVER/css/drawflow-theme.css) | Tema premium oscuro morado/cyan/glass. | **No portar 1:1.** Es paleta antigua. Sí se reutiliza el patrón conceptual (border-left de color por categoría, bordes redondeados, ports redondos) traducido a paleta veraniega "Cielo Claro". |
| `SERVER/js/editor.js` | **Eliminado** en commit `1b6370e` (Fase Profile). | No disponible como referencia. La inicialización se reescribe siguiendo docs oficiales (ver `mcp__context7__query-docs /jerosoler/drawflow`). |

### 0.5 Esquema BD actual y el que añadimos

Detallado en [DATA/database_context.md §2.2](../DATA/database_context.md). Resumen relevante:

- `users` ya tiene todo lo necesario (`id`, `name`, `email`, `avatar_url`).
- `automations` con 17 columnas n8n-específicas (`trigger_type`, `schedule_expression`, `last_run_*`, `total_runs`, `total_errors`, `tags`, `version`, `is_active`...) que **no aplican** a un mapa conceptual.
- Resto de tablas NodeWeaver (`sessions`, `credentials_vault`, `webhooks`, `execution_logs`, `execution_node_logs`, `automation_stats`) quedan como zombies fuera del flujo. El alumno explica en defensa que pertenecen a la fase NodeWeaver y se eliminarían al desplegar.

---

## 1. Decisiones canónicas

### 1.1 BD — Crear nueva tabla `maps` (opción 2 de las propuestas)

**Decisión:** crear una tabla `maps` nueva con esquema mínimo viable, en lugar de reciclar `automations` o crear una vista.

**Esquema (versión M0, mínimo defendible):**

```sql
CREATE TABLE maps (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    title           VARCHAR(200) NOT NULL DEFAULT 'Mapa sin título',
    description     TEXT NULL,
    is_public       TINYINT(1) NOT NULL DEFAULT 0,
    drawflow_json   LONGTEXT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_maps_user FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_user_updated (user_id, updated_at)
) ENGINE=InnoDB CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Justificación para tribunal:**

1. **Reciclar `automations`** dejaría 11 columnas inertes (`trigger_type`, `schedule_expression`, `last_run_status`, `total_runs`, ...). En defensa, la primera pregunta sería: «¿qué hace `trigger_type='webhook'` en un mapa conceptual?». Indefendible.
2. **Vista** no resuelve nada — la tabla física sigue ahí con su deuda.
3. **Tabla nueva** = vocabulario limpio (`title`, `description`, `is_public`, `drawflow_json`), sin nada que el alumno no pueda explicar línea a línea. Coste de migración ≈ 5 minutos (un `CREATE TABLE`).

**Lo que NO se denormaliza en esta fase** (y por qué):

El [arquitectura.md §2](./arquitectura.md) plantea como ideal final tablas separadas `nodes` y `edges` además de `maps.drawflow_json`. **No se implementan en Fase Maps.** La denormalización aporta cuando hay queries que filtran por nodo individual (búsqueda full-text, stats por concepto), features que no llegan al MVP. Mantener una sola fuente de verdad (`drawflow_json`) evita el clásico bug de "guardas en JSON, olvidas guardar en `nodes`, lectura desincronizada". Defendible: «en el MVP el JSON es la fuente de verdad; la denormalización se añadiría cuando aparezcan queries que la justifiquen». Documentar como ADR.

**Migración:**

- Archivo nuevo: `DATA/migrations/001_create_maps.sql` con el `CREATE TABLE` arriba. Se ejecuta una vez en phpMyAdmin local.
- Actualizar `DATA/database_context.md` añadiendo la sección §2.9 con el esquema y reglas de negocio (auto-save, ownership por `user_id`).
- ADR-04 documenta esta decisión.

### 1.2 Endpoints — Nuevo `mapController` con `maps/*`

**Decisión:** crear `API/controllers/mapController.php` y `MODEL/Map.php` nuevos, registrar 4 rutas `maps/*` en `API/router/api.php`. Eliminar `automationController.php`, `MODEL/automation.php` y las 4 rutas `automation/*`.

**Rutas:**

| Método | Ruta | Método controller | Body / query | Respuesta éxito |
| --- | --- | --- | --- | --- |
| `GET` | `maps/list` | `MapController::list` | (none) | `{ success, data: [{id, title, description, is_public, updated_at, created_at}] }` |
| `GET` | `maps/get` | `MapController::get` | `?id=123` | `{ success, data: {id, title, description, is_public, drawflow_json, created_at, updated_at} }` |
| `POST` | `maps/save` | `MapController::save` | `{id?, title, description?, is_public?, drawflow_json}` | `{ success, message, data: {id, updated_at} }` |
| `POST` | `maps/delete` | `MapController::delete` | `{id}` | `{ success, message }` |

**Por qué nombres nuevos y no reuso:**

- Mezclar `automation/*` y `maps/*` genera commit history confuso y memoria académica más difícil de defender («¿por qué este endpoint dice "automation" si guardo mapas?»).
- Coste real de crear desde cero: ~150 líneas PHP, 30-40 minutos.

**Convenciones que sigo del código existente:**

- Controller en camelCase (`mapController.php` → clase `MapController`) — exigido por el dispatcher en [Router.php:38](../API/router/Router.php#L38) (`ucfirst($action['controller'])`).
- Modelo en PascalCase (`Map.php` → clase `Map`).
- Auth con `AuthMiddleware::verifyToken()` (NO copiar el inline buggy de `automationController`).
- Respuesta uniforme `{ success, message, data }` siguiendo lo que ya hacen `auth` y `profile`.
- Ownership: cada query incluye `WHERE user_id = :uid` — sin ello, IDOR (el clásico que pregunta el tribunal en RA6).
- `drawflow_json` se guarda **tal cual** llega del frontend (es el resultado de `editor.export()`). Validamos sólo que sea string no vacío y JSON parseable.

**Validaciones en el controller:**

- `title`: no vacío, longitud ≤ 200. Trim al guardar.
- `drawflow_json`: si llega, debe ser JSON válido (`json_decode($v) !== null` o vacío permitido).
- `id`: numérico positivo en `get`/`save`/`delete`.
- En `save`: si llega `id`, verificar ownership antes de update; si no llega, hacer create.

### 1.3 Drawflow — paquete npm + wrapper React con guard StrictMode

**Decisión:**

1. Instalar Drawflow vía `npm i drawflow` en `frontend/`. Versión vigente declarada por mantenedor: `0.0.60+`. Verificada disponibilidad y API estable vía `mcp__context7__query-docs`.
2. Importar como módulo ES + su CSS:
   ```javascript
   import Drawflow from 'drawflow';
   import 'drawflow/dist/drawflow.min.css';
   ```
3. Crear `frontend/src/features/maps/components/DrawflowEditor.jsx` que envuelve la librería en un componente React con `useRef` + `useEffect`.

**Por qué npm y no `SERVER/libs/drawflow/drawflow.min.js`:**

- El archivo local es UMD sin export ES → integrarlo en Vite obligaría a inyectarlo como `<script>` global o hacer un import side-effect raro. Sucio.
- El paquete npm trae `dist/drawflow.min.css` y `dist/drawflow.min.js` con `package.json` correcto, build de Vite lo trata como cualquier dep.
- Versión fijada en `package.json` → defendible y reproducible.
- ADR-05 documenta la elección.

**Estrategia de wrapper:**

```jsx
// DrawflowEditor.jsx (esquema, no código final)
import Drawflow from 'drawflow';
import 'drawflow/dist/drawflow.min.css';
import { useEffect, useRef } from 'react';

export function DrawflowEditor({ initialJson, onChange, onExpandRequest }) {
  const containerRef = useRef(null);
  const editorRef    = useRef(null);

  useEffect(() => {
    // Guard StrictMode: si ya hay un editor montado, no inicializar otro.
    // En dev, React 18.3 monta el efecto dos veces.
    if (editorRef.current || !containerRef.current) return;

    const editor = new Drawflow(containerRef.current);
    editor.reroute = true;
    editor.start();
    if (initialJson) editor.import(initialJson);

    // Notificar cambios al padre con debounce (auto-save lo gestiona el padre).
    const events = ['nodeCreated', 'nodeRemoved', 'nodeMoved', 'connectionCreated', 'connectionRemoved'];
    events.forEach(evt => editor.on(evt, () => onChange?.(editor.export())));

    editorRef.current = editor;

    return () => {
      // Cleanup robusto: clear() + descartar la ref para que el segundo
      // mount de StrictMode pueda volver a inicializar limpio.
      editor.clear();
      containerRef.current?.replaceChildren();
      editorRef.current = null;
    };
  }, []); // [] intencional — Drawflow se inicializa una sola vez por instancia.

  return <div ref={containerRef} id="drawflow" className="w-full h-full" />;
}
```

**Riesgos identificados y mitigación:**

| Riesgo | Mitigación |
| --- | --- |
| **StrictMode doble-mount** monta y desmonta dos veces el efecto en dev. Sin guard, Drawflow asocia listeners al DOM dos veces y los nodos aparecen duplicados. | Guard con `editorRef.current` en la entrada + `editor.clear()` + `replaceChildren()` en cleanup. Probado en docs Drawflow + reportado en [issue #336 del repo](https://github.com/jerosoler/Drawflow/issues) como patrón usado. |
| **Drawflow muta el DOM dentro del contenedor**, React no controla esos hijos. | El contenedor `<div ref={containerRef}>` no recibe children React. React sólo monta el div vacío; Drawflow lo rellena. Sin conflicto. |
| **Tema oscuro por defecto** de Drawflow choca con paleta veraniega. | Crear `frontend/src/features/maps/styles/drawflow-summer.css` con overrides usando los tokens existentes (`--color-paper`, `--color-brand-200`, `--color-glass`, `--color-ink`). El `drawflow.min.css` se importa primero, los overrides ganan por orden. |
| **React 19 incompatibility** rumored. | Ya forzado `react@^18.3.1` en `package.json`. ADR-02 cubre esto. |
| **Custom node con HTML inline** (la API de Drawflow es `addNode(name, ...args, html)`) parece un anti-patrón React. | Defendible: el HTML se construye **desde el componente padre** como template string, sirve solamente como plantilla DOM que Drawflow inyecta. No es JSX renderizado, es DOM-imperativo dentro del wrapper. Se documenta en comentario y en ADR-05. |
| **Rendimiento al re-renderizar** el componente padre puede disparar el `useEffect` si las deps cambian. | Las deps son `[]` → el editor se inicializa una sola vez. Cambios externos al `initialJson` no recargan el editor (lo cual es correcto: si el padre quisiera "abrir otro mapa", desmonta y vuelve a montar el componente con `key={mapId}`). |

### 1.4 IA — OpenAI gpt-4o-mini vía HTTP, endpoint único `/api/ai/expand`

**Decisión:**

- Proveedor: **OpenAI**, modelo `gpt-4o-mini`. Razones: barato (~$0.15/M tokens input), determinista con `response_format: { type: 'json_object' }`, doc abundante para defensa, alumno puede mostrar la respuesta JSON parseada en la consola del navegador como evidencia.
- Cliente HTTP en backend: `API/services/AIClient.php`, usa `curl_*` nativo de PHP. Sin SDK Composer (cumple regla CLAUDE.md §3 «sin SDKs pesados»).
- Endpoint único en esta fase: `POST api/ai/expand`.

**Contrato del endpoint:**

```
POST /API/index.php?route=ai/expand
Authorization: Bearer <jwt>
Content-Type: application/json

Request body:
{
  "node_label":     "Algoritmos de ordenación",
  "parent_context": "Estructura de datos / Algoritmos"   // opcional
}

Response 200:
{
  "success": true,
  "data": {
    "children": [
      { "label": "QuickSort",  "hint": "Divide y vencerás, O(n log n) media" },
      { "label": "MergeSort",  "hint": "Estable, O(n log n) garantizado"   },
      { "label": "BubbleSort", "hint": "Didáctico, O(n²)"                  }
    ]
  }
}

Response 4xx/5xx:
{ "success": false, "message": "<descripción>" }
```

**Prompt (versión inicial, en castellano):**

```
Eres un asistente de estudio. Dado un concepto, devuelve entre 3 y 5
sub-conceptos directamente relacionados, en formato JSON estricto.

Concepto: "{node_label}"
Contexto: "{parent_context}"

Devuelve SOLO un objeto JSON con esta forma exacta:
{ "children": [ { "label": "...", "hint": "..." } ] }

Reglas:
- "label" ≤ 60 caracteres, español, en mayúscula inicial.
- "hint" ≤ 120 caracteres, una frase explicativa breve.
- 3 a 5 elementos.
- No incluyas texto fuera del JSON.
```

Llamada a OpenAI:
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Model: `gpt-4o-mini`
- `response_format: { type: 'json_object' }` para forzar JSON parseable.
- Timeout: 20 segundos.
- Si la respuesta no parsea, se devuelve `success: false, message: "Respuesta IA inválida"` (no se cae el endpoint).

**Variable de entorno necesaria:**

> ⚠️ **No edito `.env`. Te pido que añadas tú:**
>
> ```
> OPENAI_API_KEY=sk-...
> ```
>
> en la raíz del proyecto, donde ya estén el resto de variables (`JWT_SECRET`, `SENDGRID_*`, etc.). El loader [DATA/env.php](../DATA/env.php) la cargará. Confirmar antes de M4 que existe; si no, M4 queda bloqueada.

**Modo demo sin API key (para defensa offline):**

Si `OPENAI_API_KEY` está vacía o ausente, `AIClient::expand` devuelve un stub con 3 hijos hardcodeados (`"Subtema 1"`, `"Subtema 2"`, `"Subtema 3"`). Ventaja: el alumno puede defender el editor incluso sin internet o si la cuenta OpenAI está caducada. Defendible: «el sistema degrada con elegancia, no se cae».

### 1.5 PDF parsing — fuera de scope (Fase Maps+1)

Por timebox, **no entra** en Fase Maps. El plan documenta el contrato esperado para que la fase posterior (si hay tiempo antes del 3 de mayo, o como roadmap futuro en la memoria) lo implemente sin replantearse arquitectura:

```
POST /API/index.php?route=ai/parse-pdf
Authorization: Bearer <jwt>
Content-Type: multipart/form-data

Form field "pdf": archivo PDF, ≤ 5 MB.

Response 200:
{
  "success": true,
  "data": {
    "map": {
      "title":         "Algoritmos y Estructuras de Datos",
      "drawflow_json": { ... export() listo para Drawflow.import() ... }
    }
  }
}
```

Implementación futura: `API/services/PDFParser.php` con `Smalot/PDFParser` (Composer) o `pdftotext` shell-out. Se chunkifica el texto, se manda al modelo con prompt estructurado, se devuelve el `export()` ya con nodos posicionados en grid.

### 1.6 Variables de entorno necesarias (te las pido para que las añadas tú)

| Variable | Cuándo se necesita | Valor |
| --- | --- | --- |
| `OPENAI_API_KEY` | Antes de M4 | Tu API key de OpenAI (`sk-...`). Si no la añades, M4 funciona en modo demo con stub. |

Si en algún momento queremos cambiar el modelo o el provider, añadiremos otras variables (`AI_MODEL`, `AI_PROVIDER`) con su ADR. Por ahora hardcodeamos `gpt-4o-mini` en `AIClient.php` para mantenerlo simple.

---

## 2. Subfase M0 · Limpieza backend + esquema BD

**Objetivo:** dejar el backend en un estado coherente con el dominio "mapas conceptuales": eliminar el código legacy `automation*`, crear la tabla `maps` y registrar las decisiones.

### 2.1 Archivos a tocar

| Acción | Archivo |
| --- | --- |
| Crear | `DATA/migrations/001_create_maps.sql` |
| Modificar | `DATA/database_context.md` (añadir §2.9 "maps", marcar §2.2 "automations" como **DEPRECATED — pre-pivote**) |
| Modificar | `docs/decisiones.md` (ADR-04 BD nueva tabla, ADR-05 Drawflow npm, ADR-06 OpenAI gpt-4o-mini) |
| Borrar | `API/controllers/automationController.php` |
| Borrar | `MODEL/automation.php` |
| Modificar | `API/router/api.php` (eliminar rutas `automation/*`) |

### 2.2 Acción manual del usuario

- Ejecutar `001_create_maps.sql` en phpMyAdmin sobre la base de datos `autoflow` (la del XAMPP local). El plan deja el `.sql` listo, **el alumno lo ejecuta** (no se automatiza).

### 2.3 Criterio de DONE

1. `SELECT * FROM maps LIMIT 1` en phpMyAdmin devuelve estructura correcta sin filas (tabla recién creada).
2. `git grep -i "automation"` en `API/`, `MODEL/`, `frontend/src/` devuelve **cero coincidencias**.
3. Petición a `?route=automation/list` devuelve `404 Ruta no encontrada` (verifica que el router quedó limpio).
4. `docs/decisiones.md` contiene ADR-04, ADR-05 y ADR-06 con contexto, decisión, alternativas y consecuencias.
5. `DATA/database_context.md` actualizado: §2.9 documenta `maps`, §2.2 marcado como DEPRECATED.
6. Commit: `chore(backend): eliminar legado automation y crear esquema maps`.

### 2.4 Horas estimadas: **1–1.5 h**

### 2.5 Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Borrar `automationController.php` rompe alguna llamada residual del frontend antiguo. | El frontend nuevo (`/frontend/src/`) no llama a `automation/*` — verificado con `grep` en `frontend/src/`. SERVER/ legacy ya no se sirve. |
| El alumno olvida ejecutar la migración. | M1 fallará al primer `SELECT FROM maps`. El error es obvio y se documenta en el commit que la migración se ejecuta a mano (no es un sistema de migrations automatizado). |

---

## 3. Subfase M1 · Endpoints `maps/*` (CRUD sin IA)

**Objetivo:** dar de alta `MapController` + `Map` model + 4 rutas REST funcionando contra la nueva tabla, probables vía Thunder Client / curl antes de tocar el frontend.

### 3.1 Archivos a crear

| Archivo | Líneas aprox |
| --- | --- |
| `MODEL/Map.php` (clase `Map`, métodos `getByUser`, `getById`, `create`, `update`, `delete`) | 60 |
| `API/controllers/mapController.php` (clase `MapController`, métodos `list`, `get`, `save`, `delete`) | 120 |

### 3.2 Modificar

- `API/router/api.php`: añadir bloque
  ```php
  // Rutas de mapas conceptuales
  $router->get('maps/list',    'mapController', 'list');
  $router->get('maps/get',     'mapController', 'get');
  $router->post('maps/save',   'mapController', 'save');
  $router->post('maps/delete', 'mapController', 'delete');
  ```

### 3.3 Convenciones aplicadas

- Auth vía `AuthMiddleware::verifyToken()` (no copiar y pegar el `getAuthenticatedUser` inline del antiguo `automationController`).
- `Map::*` recibe `$db` por constructor, ejecuta `prepare()` + `execute([...])`, sin lógica de negocio.
- `MapController::*` valida input, gestiona ownership, formatea respuesta JSON con `{ success, message, data }`.
- Códigos HTTP: 200 OK, 201 Created (en `save` cuando crea), 400 validación, 401 sin auth, 403 sin permiso (mapa de otro usuario), 404 no encontrado, 500 error servidor.
- PHPDoc breve en castellano en cada método público (regla CLAUDE.md §9).

### 3.4 Criterio de DONE

1. Con un JWT válido en `Authorization`, `GET ?route=maps/list` devuelve `{ success: true, data: [] }` en cuenta sin mapas.
2. `POST ?route=maps/save` con `{title, description, drawflow_json}` crea fila, devuelve `id`. Verificable con `SELECT * FROM maps`.
3. `POST ?route=maps/save` con `{id, title, ...}` actualiza fila. `updated_at` cambia.
4. `GET ?route=maps/get&id=<otro_user_id>` devuelve `404` (ownership funciona).
5. `POST ?route=maps/delete` con `id` propio borra fila; con `id` ajeno devuelve `404`.
6. Sin token o token inválido → `401`.
7. Cualquier excepción PDO → `500` con mensaje genérico (sin filtrar SQL al cliente).
8. Commit: `feat(api): endpoints CRUD maps con MapController y modelo Map`.

### 3.5 Horas estimadas: **1.5–2 h**

### 3.6 Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `AuthMiddleware::verifyToken()` no estaba siendo usado por `automationController`; puede que su firma no sea exactamente lo que espero. | Antes de M1, leer [API/middleware/verify-token.php](../API/middleware/verify-token.php) y replicar la firma exacta. Si la firma no encaja con el patrón "devuelve user_id o exit", refactorizar mínimo. |
| `drawflow_json` puede ser muy grande (LONGTEXT 4 GB teórico, pero MySQL `max_allowed_packet` por defecto 16 MB). | Validación: si el body POST excede 4 MB, devolver 413. En la práctica un mapa de 50 nodos ronda los 30 KB. |

---

## 4. Subfase M2 · Frontend `MapsListPage` (lista, crear, borrar)

**Objetivo:** sustituir el `<PlaceholderPage>` actual de `/mapas` por una página real que lista los mapas del usuario, permite crear uno nuevo y borrarlo. Sin editor todavía (eso es M3).

### 4.1 Archivos a crear

```
frontend/src/features/maps/
├── pages/
│   └── MapsListPage.jsx
├── components/
│   ├── MapCard.jsx                 (tarjeta resumen: título, fecha, botones abrir/borrar)
│   ├── EmptyMapsState.jsx          (CTA "Crea tu primer mapa")
│   └── DeleteMapDialog.jsx         (modal confirmación)
└── services/
    └── mapsService.js              (wrapper sobre apiClient: list, get, save, remove)
```

### 4.2 Modificar

- `frontend/src/api/endpoints.js`: añadir bloque `maps: { list, get, save, delete }`.
- `frontend/src/router.jsx`: importar `MapsListPage`, sustituir el `<PlaceholderPage title="Mis mapas">` por `<MapsListPage />`.

### 4.3 Comportamiento

- Al montar, `useEffect` llama `mapsService.list()`. Estados: `loading | error | empty | ok`.
- Botón **"+ Nuevo mapa"** en cabecera: llama `mapsService.save({ title: "Mapa sin título", drawflow_json: null })`, redirige a `/mapas/<id>` (la URL del editor que se implementa en M3 — en M2 esa ruta aún devuelve placeholder, pero ya queda la navegación lista).
- Cada `MapCard` muestra: título, descripción truncada, fecha relativa (`hace 3 días`, helper en `frontend/src/utils/relativeTime.js` nuevo), badges (`Privado`/`Público`), botones "Abrir" y "Borrar".
- "Borrar" abre `DeleteMapDialog` con confirmación; al confirmar, llama `mapsService.remove(id)`, refresca la lista, muestra toast `"Mapa eliminado"`.

### 4.4 Reglas de UI

- Usa `<Card>` y tokens veraniegos existentes.
- Lista en `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6` (cumple criterio Grid Layout RA2 0615).
- Errores mostrados como toast vía `useNotification`, NUNCA `alert()`.
- Texto en castellano, accesibilidad: cada botón con `aria-label`.

### 4.5 Criterio de DONE

1. `/mapas` con sesión activa muestra:
   - Si `list` devuelve `[]` → `<EmptyMapsState>` con CTA "Crea tu primer mapa".
   - Si tiene mapas → grid de `MapCard`.
2. Botón "+ Nuevo mapa" crea fila en BD y navega a `/mapas/<id>` (en M2 puede caer en placeholder, eso lo resuelve M3).
3. Borrar mapa pide confirmación, ejecuta DELETE, refresca lista, toast verde.
4. Pruebas Playwright (manual): login → /mapas → crear → ver tarjeta → borrar → ver vacío.
5. Build OK: `npm run build --prefix frontend`.
6. Commit: `feat(maps): página de listado de mapas conectada al backend`.

### 4.6 Horas estimadas: **2–2.5 h**

### 4.7 Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Al crear un mapa "vacío", `drawflow_json` se guarda como `null`. M3 debe tolerar abrir un mapa con `null` (no llamar `editor.import(null)`). | Documentado en M3 §5.3. |
| Confirmar borrado con `window.confirm` es feo. | Implementar `DeleteMapDialog` simple con `<dialog>` HTML5 nativo + Tailwind. Sin librería de modales. |

---

## 5. Subfase M3 · Editor Drawflow envuelto en React (sin IA, con persistencia)

**Objetivo:** abrir un mapa en `/mapas/:id`, ver el editor Drawflow funcional con sus nodos restaurados, poder añadir nodos manualmente, conectarlos, mover, borrar, y que se persista automáticamente.

### 5.1 Archivos a crear

```
frontend/src/features/maps/
├── pages/
│   └── MapEditorPage.jsx           (carga el mapa por :id, monta editor, gestiona auto-save)
├── components/
│   ├── DrawflowEditor.jsx          (wrapper React de Drawflow, ver §1.3)
│   ├── EditorToolbar.jsx           (botones: + Concepto, deshacer, zoom in/out, ajustar, guardar)
│   ├── MapTitleEditor.jsx          (input inline con debounce para editar título)
│   └── SaveIndicator.jsx           (badge: "Guardado", "Guardando...", "Error al guardar")
├── hooks/
│   ├── useDebouncedCallback.js     (helper genérico, ~15 líneas)
│   └── useMapAutoSave.js           (encapsula la lógica: cuando export() cambia, guardar a los 1.5s de inactividad)
└── styles/
    └── drawflow-summer.css         (overrides paleta veraniega para Drawflow)
```

### 5.2 Modificar

- `frontend/package.json`: `npm i drawflow` (añade `"drawflow": "^0.0.60"` o versión vigente).
- `frontend/src/router.jsx`: añadir ruta `{ path: '/mapas/:id', element: <MapEditorPage /> }` anidada bajo `<AppLayout>`.

### 5.3 Comportamiento detallado

**Carga:**

1. `MapEditorPage` lee `useParams()`, llama `mapsService.get(id)`.
2. Si `404` → toast error + `navigate('/mapas')`.
3. Si OK, parsea `drawflow_json` (puede ser `null` si el mapa es nuevo) y lo pasa a `<DrawflowEditor initialJson={parsedOrNull}>`.

**Layout:**

- `<MapEditorPage>` ocupa todo el área de `<main>`. Estructura:
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │ MapTitleEditor    ←─ "Mapa de Algoritmos"   SaveIndicator  │
  ├─────────────────────────────────────────────────────────────┤
  │ EditorToolbar  [+Concepto] [↺] [-] [+] [⊡]                  │
  ├─────────────────────────────────────────────────────────────┤
  │                                                             │
  │              DrawflowEditor (canvas)                        │
  │              h-[calc(100dvh-260px)] (aprox)                 │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
  ```
- El canvas Drawflow necesita altura fija para gestionar el scroll/zoom internamente. Se usa `h-[calc(100dvh-260px)]` o `flex-1 min-h-0` dentro de un `flex flex-col` que llena la vista.

**Custom node template:**

- Cada nodo "concepto" se crea con `editor.addNode('concept', 1, 1, x, y, 'concept-node', { label, hint }, htmlTemplate)`.
- `htmlTemplate` (string) contiene:
  ```html
  <div class="sw-node">
    <div class="sw-node__label">Etiqueta del concepto</div>
    <div class="sw-node__hint">Pista opcional</div>
    <div class="sw-node__actions">
      <button data-action="expand" title="Expandir con IA">+ IA</button>
      <button data-action="delete" title="Eliminar">✕</button>
    </div>
  </div>
  ```
- Los botones se enganchan vía event delegation: `containerRef.current.addEventListener('click', handleNodeAction)`. `handleNodeAction` lee `data-action` del target, identifica el nodo padre con `closest('.drawflow-node')`, extrae su `id` y dispara el callback correspondiente (`onExpandRequest(nodeId)` o `editor.removeNodeId(nodeId)`).
- Los textos editables (`label`, `hint`) son `<div contenteditable>` para edición inline. Los cambios disparan `editor.updateNodeDataFromId(nodeId, newData)` en `blur`.

**Auto-save:**

- `useMapAutoSave({ mapId, drawflowJson, title, description, isPublic })` mantiene un `useRef(lastSaved)` con la última versión guardada y compara.
- Cuando hay cambio, debounce 1.5s, llama `mapsService.save({...})`, actualiza `SaveIndicator` (`Guardando...` → `Guardado` → `Guardado hace 2s`).
- En caso de error: indicador rojo `Error al guardar`, toast con detalle, mantiene los cambios en memoria (no se pierden) y reintenta al próximo cambio.

**Toolbar:**

- `+ Concepto`: añade nodo en el centro del viewport con texto `Nuevo concepto`.
- `↺ Deshacer`: en M3 NO se implementa undo (Drawflow no lo trae out-of-the-box; implementarlo correctamente es 4 horas más). Botón se deja **deshabilitado con tooltip "Próximamente"**, defendible: «el undo se planificó como mejora post-entrega».
- `Zoom -/+/Ajustar`: usa `editor.zoom_out()`, `editor.zoom_in()`, `editor.zoom_reset()` (API nativa Drawflow).
- `Guardar`: forzar save inmediato (bypass debounce).

### 5.4 Tema veraniego para Drawflow

`frontend/src/features/maps/styles/drawflow-summer.css` (~80 líneas) sobrescribe variables de Drawflow para encajar con Cielo Claro:

```css
/* Carga después de drawflow.min.css para que estos overrides ganen */
.drawflow {
  background-color: transparent;
  background-image:
    linear-gradient(rgba(14, 165, 233, 0.10) 1px, transparent 1px),
    linear-gradient(90deg, rgba(14, 165, 233, 0.10) 1px, transparent 1px);
  background-size: 40px 40px;
}

.drawflow .drawflow-node {
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(14, 165, 233, 0.28);
  border-left: 4px solid var(--color-brand-500);
  border-radius: 14px;
  color: var(--color-ink);
  box-shadow: 0 4px 20px -8px rgba(15, 23, 42, 0.10);
  min-width: 220px;
  padding: 0;
}
.drawflow .drawflow-node.selected {
  border-color: var(--color-brand-500);
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.20);
}
.drawflow .connection .main-path {
  stroke: var(--color-brand-500);
  stroke-width: 2.5px;
}
.drawflow .drawflow-node .input,
.drawflow .drawflow-node .output {
  background: var(--color-brand-500);
  border: 2px solid var(--color-paper);
}

.sw-node            { padding: 12px 14px; font-family: inherit; }
.sw-node__label     { font-weight: 600; font-size: 14px; }
.sw-node__hint      { color: var(--color-ink-muted); font-size: 12px; margin-top: 4px; }
.sw-node__actions   { display: flex; gap: 6px; margin-top: 8px; }
.sw-node__actions button {
  font-size: 11px; padding: 3px 8px; border-radius: 999px;
  background: var(--color-brand-50); color: var(--color-brand-700);
  border: 1px solid var(--color-brand-200); cursor: pointer;
}
.sw-node__actions button:hover { background: var(--color-brand-100); }
```

### 5.5 Criterio de DONE

1. `/mapas/:id` carga el mapa, restaura nodos y conexiones desde `drawflow_json`.
2. `+ Concepto` añade nodo visible y editable inline.
3. Conectar nodos arrastrando puerto con puerto funciona y persiste.
4. Mover y borrar nodos funciona.
5. Auto-save dispara tras 1.5s de inactividad; `SaveIndicator` refleja estados correctamente.
6. Recargar la página → mapa restaurado tal cual estaba.
7. Editar título inline persiste.
8. Tema visual coherente con paleta Cielo Claro (sin restos morado/cyan/oscuro).
9. Sin warnings de StrictMode (el guard funciona; en React DevTools no aparecen dos editores).
10. Build OK: `npm run build --prefix frontend`.
11. Commit: `feat(maps): editor Drawflow envuelto en React con auto-save`.

### 5.6 Horas estimadas: **4–5 h** (la subfase más cara del plan)

### 5.7 Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **Doble-mount StrictMode** mete dos editores. | Guard ya descrito en §1.3. Prueba inmediata: en dev abrir `/mapas/:id`, comprobar en consola que `console.count('drawflow init')` se llama una sola vez. |
| **Custom node con HTML inline** suena anti-React. | Comentario explícito en `DrawflowEditor.jsx` justificando: «el contenido del nodo es DOM-imperativo dentro del wrapper, fuera del árbol React; React sólo controla el contenedor». ADR-05. |
| **Auto-save spam** si el usuario arrastra un nodo, dispara muchísimos eventos `nodeMoved`. | Debounce 1.5s ya cubre. Verificar con throttle de logs que no haya >1 POST por segundo. |
| **Conflicto z-index** entre AmbientBackground (`z-[-7..-10]`) y Drawflow. | AmbientBackground usa `pointer-events-none` y `z-[-7]` mínimo; Drawflow vive en el flujo normal (`z-auto`) dentro de `<main>`. Sin colisión. Verificado leyendo [AmbientBackground.jsx](../frontend/src/ui/AmbientBackground.jsx). |
| **`editor.import(null)` o `import("")` puede crashear** Drawflow. | Wrapper comprueba `if (initialJson && Object.keys(initialJson).length > 0) editor.import(initialJson)`. Si vacío, deja editor en estado inicial (un canvas en blanco con un nodo demo opcional). |
| **`contenteditable` borra el HTML al pegar** texto enriquecido. | Listener `paste` que llama `e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))`. Defendible y simple. |

---

## 6. Subfase M4 · Endpoint IA `expand` + integración en editor

**Objetivo:** que pulsar "+ IA" en un nodo dispare una llamada al backend, éste consulte OpenAI y devuelva 3-5 hijos, y el editor los añada conectados al nodo padre, con auto-save subsecuente.

### 6.1 Archivos a crear

| Archivo | Líneas aprox |
| --- | --- |
| `API/services/AIClient.php` (clase `AIClient`, método `expand($label, $context)`, lee `OPENAI_API_KEY` de env, hace `curl_*`, devuelve array PHP) | 90 |
| `API/controllers/aiController.php` (clase `AIController`, método `expand`) | 50 |
| `frontend/src/features/maps/services/aiService.js` (wrapper sobre apiClient: `expandNode(label, parentContext)`) | 20 |

### 6.2 Modificar

- `API/router/api.php`: añadir `$router->post('ai/expand', 'aiController', 'expand');`.
- `frontend/src/api/endpoints.js`: añadir `ai: { expand: 'ai/expand' }`.
- `MapEditorPage.jsx`: implementar `handleExpandRequest(nodeId)` que:
  1. Lee data del nodo: `editor.getNodeFromId(nodeId).data` → `{label, hint}`.
  2. Lee data del nodo padre (si existe, mirando `inputs.input_1.connections[0].node`).
  3. Muestra spinner overlay sobre el nodo.
  4. Llama `aiService.expandNode(label, parentLabel)`.
  5. Por cada hijo devuelto: `editor.addNode('concept', 1, 1, x+offset, y+offset, 'concept-node', {label, hint}, htmlTemplate)`.
  6. Conecta cada hijo al padre: `editor.addConnection(parentNodeId, newChildId, 'output_1', 'input_1')`.
  7. Auto-save dispara solo (porque `nodeCreated` y `connectionCreated` ya están enganchados).
  8. Quita spinner.

### 6.3 AIClient en detalle

```php
<?php
// API/services/AIClient.php (esquema)

class AIClient {
    /**
     * Expande un concepto en 3-5 sub-conceptos consultando OpenAI.
     * Si no hay API key, devuelve un stub para defensa offline.
     */
    public static function expand(string $label, ?string $context = null): array {
        $apiKey = $_ENV['OPENAI_API_KEY'] ?? '';
        if (!$apiKey) return self::stub($label);

        $prompt = self::buildPrompt($label, $context);
        $body   = json_encode([
            'model'           => 'gpt-4o-mini',
            'messages'        => [
                ['role' => 'system', 'content' => 'Devuelves siempre JSON válido.'],
                ['role' => 'user',   'content' => $prompt],
            ],
            'response_format' => ['type' => 'json_object'],
            'temperature'     => 0.5,
        ]);

        $ch = curl_init('https://api.openai.com/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_TIMEOUT        => 20,
        ]);
        $raw  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code !== 200 || !$raw) {
            throw new RuntimeException("OpenAI HTTP $code");
        }
        $payload = json_decode($raw, true);
        $content = $payload['choices'][0]['message']['content'] ?? '';
        $parsed  = json_decode($content, true);

        if (!isset($parsed['children']) || !is_array($parsed['children'])) {
            throw new RuntimeException('Respuesta IA no contiene "children" array');
        }
        return $parsed['children'];
    }

    private static function stub(string $label): array {
        return [
            ['label' => "Subtema A de $label", 'hint' => 'Ejemplo demo (sin API key).'],
            ['label' => "Subtema B de $label", 'hint' => 'Ejemplo demo (sin API key).'],
            ['label' => "Subtema C de $label", 'hint' => 'Ejemplo demo (sin API key).'],
        ];
    }

    private static function buildPrompt(string $label, ?string $context): string { /* ... */ }
}
```

### 6.4 Criterio de DONE

1. Con `OPENAI_API_KEY` configurada: pulsar "+ IA" sobre un nodo "Algoritmos" añade 3-5 nodos hijos coherentes (verificable a ojo: incluye palabras como "QuickSort", "MergeSort", etc.).
2. Sin `OPENAI_API_KEY`: pulsar "+ IA" añade 3 hijos stub `"Subtema A de X"`, `"Subtema B..."`. La app no se rompe.
3. Mientras la IA tarda, el botón muestra spinner; al terminar, vuelve al estado normal.
4. Si OpenAI devuelve error o JSON malformado: toast rojo `"La IA no pudo expandir este concepto"`, sin cambiar el editor.
5. Los hijos generados aparecen conectados al padre y persisten tras recargar (auto-save funcionó).
6. `POST ?route=ai/expand` con body `{"node_label": "Test"}` desde curl/Thunder devuelve JSON con `children[]`.
7. `aiController` usa `AuthMiddleware::verifyToken()` (no expone IA a anónimos).
8. Commit: `feat(ai): endpoint expand con OpenAI gpt-4o-mini y stub demo`.

### 6.5 Horas estimadas: **2.5–3 h**

### 6.6 Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **Coste OpenAI** se descontrola si el alumno expande 100 nodos en defensa. | `gpt-4o-mini` cuesta ~$0.0001 por expansión (≤500 tokens). Aún expandiendo 1000 nodos durante desarrollo, gasto < $0.10. Aceptable. |
| **Quota / rate limit** durante demo. | Modo stub asegura que la defensa no depende de internet. El alumno puede demostrarlo desactivando temporalmente la API key. |
| **Respuesta IA en otro idioma** o con texto fuera del JSON. | Prompt en español + `response_format: json_object` minimizan. Validación en el cliente: si `children[i].label` >120 chars o vacío, descartar. |
| **CORS preflight** para POST al backend desde Vite (5173 → XAMPP 80). | `DATA/cors.php` ya devuelve `Access-Control-Allow-Origin: *` y atiende `OPTIONS`. Verificado. |
| **Posicionamiento de hijos** si no calculo offset, todos aparecen apilados. | Offset radial: `for (i in children) { angle = (i / N) * 2π; childX = parentX + 240 * cos(angle); childY = parentY + 180 * sin(angle); }`. Suficientemente legible. |

---

## 7. Subfase M5 · Pulido y defensibilidad

**Objetivo:** dejar el editor presentable, accesible, y con mensajes de error claros. Esta subfase es la diferencia entre "funciona" y "se defiende bien".

### 7.1 Tareas

| Tarea | Estimación |
| --- | --- |
| Toast de éxito en cada operación crítica (`Mapa creado`, `Eliminado`, `Hijos generados`). | 15 min |
| Tooltip "Próximamente" en botones deshabilitados (Deshacer, Compartir). | 10 min |
| Mensaje claro cuando no hay sesión y el JWT expira en medio de la edición (toast + redirect a `/login`). Ya está cubierto por `apiClient` 401 → `auth:logout`, sólo verificar UX. | 15 min |
| Validación: título mín 1 char, máx 200. Mostrar error inline. | 15 min |
| Atajos teclado básicos: `Delete` borra nodo seleccionado, `Ctrl+S` fuerza save. | 30 min |
| Vista responsive: en `<lg` el editor ocupa pantalla completa pero el toolbar se compacta a iconos sin labels. Test en 1024 / 768 / 360. | 30 min |
| Copy en castellano coherente, sin "automation"/"workflow" en ningún sitio (grep final). | 10 min |
| Comentarios en castellano en cada función pública nueva. | 20 min |

### 7.2 Criterio de DONE

1. `git grep -i "automation\|workflow\|n8n"` en `frontend/src/features/maps/`, `API/controllers/`, `MODEL/`: cero resultados.
2. Atajos `Delete` y `Ctrl+S` funcionan.
3. Editor usable en 1024px sin scroll horizontal.
4. Toasts coherentes en todas las operaciones.
5. Comentarios castellano en `MapController`, `Map`, `AIController`, `AIClient`, `DrawflowEditor`, `MapEditorPage`.
6. Tribunal-friendly: el alumno puede explicar cada archivo en ≤ 2 minutos.
7. Build OK + sin warnings nuevos.
8. Commit: `polish(maps): UX, atajos teclado, copy y accesibilidad`.

### 7.3 Horas estimadas: **2 h**

---

## 8. Resumen ejecutivo

### 8.1 Tabla maestra

| Subfase | Foco | Horas | Acumulado |
| --- | --- | --- | --- |
| M0 | Limpieza backend + esquema BD + ADRs | 1–1.5 | 1.5 |
| M1 | Endpoints `maps/*` | 1.5–2 | 3.5 |
| M2 | `MapsListPage` (lista, crear, borrar) | 2–2.5 | 6 |
| M3 | Editor Drawflow + auto-save | 4–5 | 11 |
| M4 | IA `expand` + integración | 2.5–3 | 14 |
| M5 | Pulido + accesibilidad + atajos | 2 | 16 |
| **Total** | | **13–16 h** | **~2 días hábiles** |

Cabe holgadamente en miércoles 29 (resto del día tras Fase 4) + jueves 30. Deja viernes 1 para Figma + despliegue cloud, sábado 2 para memoria + ensayo, domingo 3 buffer.

### 8.2 Reglas transversales

1. **Comentarios y docstrings en castellano** en cada función pública nueva (CLAUDE.md §9).
2. **Sin librerías extra** salvo `drawflow` (declarada en §1.3, ADR-05). Cualquier otra → ADR.
3. **Commits pequeños**: uno por subfase mínimo, idealmente uno por archivo grande dentro de cada subfase.
4. **Build + smoke test** después de cada subfase: `npm run build --prefix frontend` y al menos un curl manual al endpoint nuevo.
5. **Cada subfase termina con check de defendibilidad**: ¿el alumno puede explicar cada decisión ante el tribunal? Si no, simplificar.
6. **No tocar `.env`** — pedir al usuario que añada `OPENAI_API_KEY` antes de M4.
7. **No tocar la rama `n8nConection`** ni copiar de ahí.

### 8.3 RAs DAW que cubre esta fase

| RA | Cómo lo cubre Fase Maps |
| --- | --- |
| 0612 RA7 | Editor SPA reactivo conectado al backend con `fetch + JWT`. Auto-save asíncrono. Wrapper Drawflow que muestra dominio del DOM imperativo dentro de React. |
| 0613 RA6 | `Map` model con prepared statements + ownership por `user_id` (anti-IDOR). `try/catch` + códigos HTTP coherentes en `MapController` y `AIController`. |
| 0613 RA8 | `AIClient::expand` integra **servicio externo** (OpenAI HTTP API). `MapController` es el servicio propio. |
| 0613 (MVC) | M (Map.php) + C (mapController.php, aiController.php) + Routing (`api.php`) + V (React). |
| 0615 RA1/RA2 | `MapsListPage` usa `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (Grid Layout explícito). Editor responsive con toolbar compacto. |

### 8.4 Próximo paso: lo que necesito de ti antes de empezar

Antes de mi luz verde para implementar, confirma:

1. **¿OK el plan?** Especialmente: BD nueva tabla `maps` (no reciclar), endpoints `maps/*` (no reusar `automation/*`), Drawflow vía npm, OpenAI gpt-4o-mini.
2. **¿Cuándo añades `OPENAI_API_KEY`** a `.env`? Si no la quieres añadir, M4 funciona en modo stub y se documenta como tal.
3. **¿Quieres registrar los 3 ADRs (04, 05, 06)** en el commit de M0 o prefieres que vayan en commits separados?
4. **¿Empezamos por M0** (limpieza + esquema) o quieres revisar el plan primero con calma?

> Una vez tu OK, ejecuto subfases en orden M0 → M5, **un commit por subfase como mínimo**, build + smoke test entre cada una. Tras M5 entrego instrucciones operativas: cómo crear un mapa, cómo expandir un nodo, qué cuenta de prueba usar.
