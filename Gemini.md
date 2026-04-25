# StudyWeaver — Guía arquitectónica para agentes IA

> [!IMPORTANT]
> **TO ALL AI AGENTS (Claude / Gemini / Cursor / Antigravity / etc):**
> Este es el documento canónico de arquitectura. Léelo antes de cualquier cambio no trivial.
> El proyecto se llama **StudyWeaver** (el directorio del repo aún se llama `NodeWeaver-` por motivos históricos — no lo renombres).

---

## 1. Filosofía: Headless MVC + React SPA

StudyWeaver sigue un **MVC clásico** con la **V** trasladada al cliente. Es lo que la industria llama **headless backend**:

- **Backend (PHP)** = Model + Controller + API REST. **Devuelve siempre JSON.**
- **Frontend (React)** = View. Consume la API y renderiza con JSX.

Comparado con NodeWeaver (versión Vanilla, ahora archivada), el cambio es:

| | NodeWeaver (legado) | StudyWeaver (actual) |
| --- | --- | --- |
| Frontend | Vanilla JS, multi-página | React SPA con React Router |
| Backend devuelve | JSON **o** HTML chunks | **Solo JSON** |
| Inserción en DOM | `.innerHTML = htmlString` | Estado React → JSX |
| Paradigma | Fetch & Inject | **Fetch & Render** |

> **Regla dura:** si encuentras un `require_once 'view.php'` o un `dangerouslySetInnerHTML` con HTML del backend, es un anti-patrón. Reemplázalo.

---

## 2. Paradigma "Fetch & Render"

Flujo canónico de cualquier feature:

1. Un componente React monta y dispara `fetch()` a través del wrapper `frontend/src/api/client.js`.
2. El wrapper adjunta `Authorization: Bearer <jwt>` desde `localStorage`, gestiona 401, parsea JSON.
3. La petición llega a `backend/API/index.php` con `?route=...`.
4. El `Router` consume el JSON del body, identifica el controller y método, los carga vía `require_once`.
5. El `Controller` valida el input, delega al `Model`, recibe datos, y termina con `echo json_encode([...])`.
6. El `Model` ejecuta `prepare()` + `execute([...])` contra MySQL via PDO. **Sin lógica de negocio.**
7. React parsea el JSON, lo guarda en estado (`useState`) y renderiza JSX.

```
React Component
    │
    │  fetch(url, { headers: Authorization })
    ▼
api/client.js  ←→  localStorage.token
    │
    │  HTTP
    ▼
backend/API/index.php  →  CORS + .env + PDO
    │
    ▼
Router::dispatch
    │
    ▼
[Middleware] AuthMiddleware::verifyToken()
    │
    ▼
Controller (e.g. MapController::store)
    │
    ▼
Model (e.g. Map::create)
    │
    ▼
PDO ↔ MySQL
    │
    ▼ json_encode({ success, data })
React setState → JSX
```

---

## 3. Mapa carpeta → rol MVC

| Carpeta | Rol | Reglas |
| --- | --- | --- |
| `backend/DATA/` | Configuración (env, db, jwt, cors, sendgrid). | Sin lógica de negocio, sin acceso HTTP. |
| `backend/MODEL/` | Acceso a datos puro. Reciben `$db` (PDO) por constructor. | `prepare` + `execute([...])`. **Sin** lógica de negocio. **Sin** http_response_code. |
| `backend/API/router/` | Routing. `api.php` registra rutas, `Router.php` despacha. | No tocar firma del dispatcher: instancia `ucfirst(controller)` por convención. |
| `backend/API/controllers/` | Lógica de aplicación: validar input, llamar al model, formatear respuesta. | **Solo `echo json_encode(...)`.** Nada de `require 'view.php'`. |
| `backend/API/middleware/` | Capa transversal (auth, etc.). | Ej. `AuthMiddleware::verifyToken()`. |
| `backend/API/services/` | Clientes a servicios externos (`OpenAIClient`, `PDFParser`). | Aíslan dependencias HTTP/SDK del controller. |
| `backend/public/` | Entry point para Apache (DocumentRoot). | Solo `index.php` que reescribe a `API/index.php`. |
| `frontend/src/api/` | Wrapper HTTP, definiciones de endpoints, tipos. | Único lugar donde aparece `fetch`. |
| `frontend/src/auth/` | `AuthContext`, `ProtectedRoute`, hook `useAuth`. | Token va a `localStorage.token`. |
| `frontend/src/components/` | UI reutilizable (Button, Card, Modal, etc.). | Sin acceso a fetch ni state global. |
| `frontend/src/features/` | Una carpeta por feature: `maps`, `flashcards`, `quizzes`, `social`, `ai`. | Cada feature contiene sus componentes, hooks y página. |
| `frontend/src/pages/` | Rutas de React Router. Componen `features/` y `components/`. | Cada page corresponde a una URL. |

---

## 4. Reglas estrictas para agentes IA

### A. Routing y endpoints

- **NUNCA** añadas `switch()` de routing en `backend/API/index.php`. Es solo bootstrap.
- Toda ruta nueva se registra en `backend/API/router/api.php` con `$router->get()` / `$router->post()` / `$router->put()` / `$router->delete()`.
- El nombre del archivo controller dicta el dispatch: `mapController.php` → clase `MapController`. **No renombres a kebab-case.**

### B. Controllers

- **Una sola responsabilidad por método.** Si tienes que escribir más de 80 líneas en un método, extrae a un service.
- Devuelve **siempre** JSON con `echo json_encode(['success' => bool, 'message' => string, 'data' => ...])`.
- Códigos HTTP coherentes: `200` éxito, `201` creado, `400` validación, `401` sin auth, `403` sin permiso, `404` no existe, `500` error servidor.
- Errores con `try/catch` y `http_response_code(...)` antes del `echo`.

### C. Modelos

- Reciben `$db` (PDO) por constructor.
- Métodos públicos: una operación SQL por método. Sin lógica de presentación.
- Siempre `prepare()` + `execute([...])`. **Nunca** concatenar SQL.

### D. Frontend

- Componentes funcionales + hooks. Sin class components.
- `useState`, `useEffect`, `useContext`. Sin Redux, Zustand, RTK Query, SWR, Recoil.
- Auth: token en `localStorage.token`, leído por `AuthContext` y wrapper de fetch.
- Errores: cada llamada a la API maneja `try/catch` + estado `error` + UI feedback.
- **Sin `dangerouslySetInnerHTML`.** El DOM lo controla React.

### E. IA

- API keys solo en backend (`backend/DATA/env.php`).
- Frontend nunca llama directo a OpenAI/Gemini. Llama a `/api/ai/{action}` en tu backend.
- Cada acción IA es un endpoint distinto: `/api/ai/expand`, `/api/ai/summarize`, `/api/ai/quiz`, `/api/ai/parse-pdf`.
- El cliente HTTP a OpenAI/Gemini vive en `backend/API/services/OpenAIClient.php` (o equivalente Gemini).

### F. Idioma y comentarios

- Todo en castellano: comentarios, mensajes de error, commits, JSDoc/PHPDoc, etiquetas UI.
- **Docstring obligatorio** en funciones públicas. Una línea de propósito mínimo.

### G. Seguridad

- **PROHIBIDO** leer o modificar `.env*`. Si necesitas variable nueva, pídeme el nombre.
- Hashing passwords con `password_hash()` + `password_verify()`. Nunca custom.
- Validar inputs en controller antes de llamar al model.
- CORS configurado en `backend/DATA/cors.php` — añadir el origen de Vite (`http://localhost:5173`).

### H. Optimización tokens (RTK)

- Prefija todo comando ruidoso (`git`, `npm`, `composer`, `php`, `grep`, `find`, `ls`, `cat`) con `rtk`.
- Usa herramientas del IDE (`Read`, `Grep`, `Glob`) en lugar de `cat`/`grep` manual.
- No reescribas archivos enteros para fixes pequeños — usa `StrReplace`.

---

## 5. Verrugas heredadas que arreglar antes de extender

- `MODEL/automation.php` (legado n8n) → eliminar al migrar.
- `backend/api/{ejecutar,estadisticas,guardar,listar,logs}.php` (legado pre-MVC) → eliminar.
- `SERVER/js/app.js::apiCall()` apunta a URL incorrecta (`/backend/public/index.php`). En el frontend nuevo, el wrapper React apunta a la URL real definida en `.env` (`VITE_API_URL`).
- `ProfileController` reimplementa extracción de header inline → al refactorizar usar `AuthMiddleware::verifyToken()`.

---

## 6. Anti-patrones prohibidos

| ❌ No hagas | ✅ Haz |
| --- | --- |
| `require_once 'view.php'` en controller | `echo json_encode([...])` |
| `dangerouslySetInnerHTML={{ __html: backendHTML }}` | Estado + JSX |
| Concatenar SQL: `"SELECT * WHERE id=$id"` | `prepare("... ?")` + `execute([$id])` |
| Class components React | Funcionales con hooks |
| Lógica de negocio en `MODEL/` | Lógica en controller; model es CRUD puro |
| Llamar a OpenAI desde React | Llamar a `/api/ai/*` propio |
| API key de OpenAI en `.env` del frontend | Solo en backend `.env` |
| Crear endpoint en `backend/api/legacy.php` | Crear en `backend/API/controllers/...` |
| `git push --force` | `git push` normal |
| Editar `.env` directamente | Pedirle al usuario que añada la variable |

---

## 7. Resumen de una línea por archivo crítico

- `CLAUDE.md` — guía maestra para Claude Code, mando sobre suposiciones.
- `Gemini.md` — este documento, arquitectura canónica.
- `docs/ROADMAP.md` — plan diario de los 8 días.
- `docs/criterios-daw.md` — RAs del PDF + mapping a archivos.
- `docs/arquitectura.md` — diagramas + esquema BD detallado.
- `docs/decisiones.md` — ADRs, decisiones no triviales.
