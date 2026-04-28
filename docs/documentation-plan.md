# Plan de documentación — StudyWeaver (handoff para IA)

> Este documento es un **brief autosuficiente** para que un chat dedicado de IA pueda producir la documentación final del proyecto (memoria académica, README, comentarios) sin tener que cargar el contexto completo del codebase. Léelo entero antes de escribir nada.

---

## 0. Cómo usar este documento

**Si eres la IA que llega a un chat nuevo a documentar el proyecto:**

1. Lee este `documentation-plan.md` entero.
2. Lee en este orden los archivos canónicos: [`CLAUDE.md`](../CLAUDE.md), [`Gemini.md`](../Gemini.md), [`docs/decisiones.md`](./decisiones.md), [`docs/database.md`](./database.md), [`docs/criterios-daw.md`](./criterios-daw.md), [`docs/notes-plan.md`](./notes-plan.md), [`docs/maps-plan.md`](./maps-plan.md), [`docs/redesign-plan.md`](./redesign-plan.md), [`docs/ROADMAP.md`](./ROADMAP.md).
3. Antes de inventar nada, verifica con `Read`/`Grep` sobre el código real. **No alucines código que no existe.**
4. Idioma: **castellano**. Tono: **estudiante DAW**, no consultor enterprise (instrucción explícita del autor — ver §9).
5. El agente `memoria-writer` está disponible y conoce el tono adecuado; úsalo como referencia si tienes acceso.

**Si eres el alumno** que abre el chat dedicado: dale a la IA este `documentation-plan.md` + el resto de docs canónicos. No le pidas que invente; pídele que **redacte a partir del código**.

---

## 1. Identidad del proyecto

| Campo | Valor |
| --- | --- |
| Nombre del producto | **StudyWeaver** |
| Repositorio | `NodeWeaver-` (nombre histórico, ver ADR-01) |
| Base de datos | `autoflow` (nombre histórico, mismo origen) |
| Tipo | Proyecto Final 2 — Ciclo Superior DAW |
| Modalidad | En solitario |
| Entrega | **3 de mayo de 2026** |
| Defensa | El alumno NO defiende como tal: **expone** el proyecto. Aun así, la memoria y el código deben ser defendibles ante preguntas técnicas. |
| Idioma del proyecto | Castellano (UI, comentarios, commits, memoria). |

**Pitch:**

> StudyWeaver convierte tus apuntes en herramientas de estudio activas. Subes un PDF (o pegas texto), la IA lo estructura como mapa conceptual editable y/o genera flashcards de repaso con repetición espaciada (algoritmo SM-2 simplificado). El mapa es el esqueleto visual del temario; las flashcards son el músculo del repaso a largo plazo. Todo nace de un único origen: el apunte que ya tenías.

**Bibliografía a citar en la memoria:**

- **Novak (1990)** — los mapas conceptuales como herramienta de aprendizaje activo (justifica que la utilidad académica está en *construir* el mapa, no en consultarlo).
- **Hay et al. (2008)** — refuerzo experimental de Novak.
- **Ebbinghaus (1885)** — la curva del olvido (justifica la repetición espaciada).
- **SuperMemo / Anki — Wozniak SM-2** — algoritmo concreto que implementan las flashcards.

---

## 2. Estado del proyecto (a 26 abril 2026)

### Cerrado y operativo

- Pivote NodeWeaver → StudyWeaver (Fases 0–4: landing, auth, perfil, dashboard, shell).
- Reorganización del repo a `backend/` (no existen `API/`, `MODEL/`, `SERVER/` en raíz).
- **Fase Maps M0–M5**: BD `maps` + endpoints CRUD + listado + editor Drawflow con auto-save + IA `ai/expand` con Ollama + atajos teclado.
- **Fase Flashcards F0–F6**: CRUD manual + sesión SM-2 + IA `flashcards/generate-from-map` con Ollama + atajos teclado.
- **Fase Comunidad C0–C6**: BD `likes` y `comments` + endpoints `community/*` + feed + perfiles públicos + favoritos + ShareToggle.
- **Fase Notes N0–N3 + N5**: tabla `notes` + endpoints `notes/*` (incluye servir PDF binario) + frontend completo + atajos + redirect post-login a `/apuntes`.

### Pendiente

- **Rama `ia-integration`** — cablear Gemini API para `ai/from-note` (ver [`docs/notes-plan.md`](./notes-plan.md) §10 para la lista canónica de TODOs).
- **Despliegue cloud** con HTTPS — RA1 0614 + RA3 1665190 sin evidencia.
- **Memoria académica** — el documento que esta IA va a redactar.
- ~~Figma 3 devices~~ — ya hecho por el alumno (verificar en chat con MCP figma si se quiere extraer screenshots para anexo).

---

## 3. Estructura del repositorio

```
NodeWeaver-/                         (no renombrar — historial git)
├── CLAUDE.md                         Manual operativo para Claude Code
├── Gemini.md                         Arquitectura canónica
├── docs/
│   ├── ROADMAP.md                    Plan diario
│   ├── arquitectura.md               Diagramas
│   ├── database.md                   Modelo de datos completo
│   ├── decisiones.md                 ADRs (ADR-01..ADR-07)
│   ├── criterios-daw.md              RAs DAW + mapping a archivos
│   ├── redesign-plan.md              Fases 0-4 (cerrado)
│   ├── maps-plan.md                  Fase Maps (cerrado)
│   ├── notes-plan.md                 Fase Notes + §10 pendientes IA
│   └── documentation-plan.md         (este archivo)
├── backend/                          PHP 8 MVC headless
│   ├── API/
│   │   ├── index.php                 Bootstrap (CORS + .env + DB + dispatch)
│   │   ├── router/api.php            Registro de todas las rutas
│   │   ├── router/Router.php         Dispatcher (ucfirst → controller)
│   │   ├── controllers/              authController, profileController, mapController, aiController, flashcardController, feedController, likeController, commentController, noteController
│   │   ├── middleware/verify-token.php  AuthMiddleware::verifyToken()
│   │   └── services/AIClient.php     Cliente HTTP Ollama (futuro Gemini)
│   ├── DATA/                         env.php, database.php, jwt.php, cors.php, sendgrid.php
│   │   └── migrations/               001..008 SQL aplicadas a mano
│   ├── MODEL/                        User, Map, Flashcard, Like, Comment, Note
│   ├── uploads/                      avatars/, notes/<user_id>/<uuid>.pdf
│   └── public/                       Document root para Apache
├── frontend/                         React 18 + Vite + Tailwind 4
│   └── src/
│       ├── api/                      client.js (fetch wrapper), endpoints.js
│       ├── auth/                     AuthContext, ProtectedRoute, useAuth
│       ├── ui/                       Button, Card, Input, Spinner, NotificationProvider
│       ├── features/                 notes/, maps/, flashcards/, community/, dashboard/, profile/, auth/, landing/, shell/
│       ├── utils/                    relativeTime, jwt, validators
│       ├── router.jsx                React Router 7 (Library mode)
│       └── main.jsx                  Entry point Vite
└── .claude/                          skills, agents, hooks (privado del alumno)
```

---

## 4. Stack y herramientas (catálogo cerrado)

Para la memoria, organiza este catálogo en una tabla "Tecnologías utilizadas" del Capítulo 3 (Diseño) o 4 (Implementación). Para cada entrada explica **qué hace en StudyWeaver**, **dónde se usa** y **por qué se eligió** (referenciar ADR si aplica).

| Capa | Tecnología | Versión | Uso en StudyWeaver | ADR | Alternativas descartadas |
| --- | --- | --- | --- | --- | --- |
| Frontend SPA | React | 18.x | UI declarativa con hooks. | ADR-02 | Vue 3, Vanilla JS estilo `sum-flow-spa-v3`. |
| Build tool | Vite | 8.x | Dev server + bundler producción. | — | Webpack manual. |
| Estilos | Tailwind CSS | 4.x | Utility-first, paleta "Cielo Claro". | — | CSS modules, styled-components. |
| Routing | React Router | 7.x | Modo Library/Data, rutas privadas + landing pública. | — | Reach Router, navegación nativa. |
| Editor visual | Drawflow | ^0.0.60 | Mapas conceptuales (paquete npm envuelto en componente React). | — | Vis.js, Cytoscape, mxGraph. |
| Backend | PHP nativo | 8.x | MVC headless, sólo JSON. | ADR-03 | Laravel, Symfony. |
| BD | MariaDB | 10.4+ | Persistencia (alias de "MySQL" del XAMPP). | — | PostgreSQL, SQLite. |
| ORM | PDO nativo | — | Prepared statements posicionales. | — | Eloquent, Doctrine. |
| Auth | JWT HS256 custom | — | Tokens stateless, payload `{id, name, email, exp}`. | — | Sesiones PHP, OAuth solamente. |
| Email | SendGrid | ^8.1 | Confirmación de cuenta y reset password. | — | PHPMailer + SMTP propio. |
| OAuth | Google ID Token | — | Login social. | — | OAuth 2.0 + Passport. |
| IA actual | Ollama (`gpt-oss:20b`) | — | `ai/expand`, `flashcards/generate-from-map`. | ADR-06 | OpenAI GPT-4, Anthropic Claude. |
| IA futura | Gemini API multimodal | (futuro) | `ai/from-note` en rama `ia-integration`. | ADR-07 | Mantener Ollama+Smalot, OpenAI, Claude. |
| Storage archivos | Filesystem + UUID hex | — | Avatares + PDFs de apuntes. | — | S3, MinIO. |
| Diseño | Figma | — | Mockups 3 devices (1440 / 768 / 375). | — | Sketch, Adobe XD. |
| Tooling local | XAMPP, phpMyAdmin, Composer, npm | — | Desarrollo local del alumno. | — | Docker. |

> **Importante:** la memoria NO debe pretender que el alumno usa todo lo cool del mercado. Cada elección debe ser defendible ("usé X porque...") y se queda corta intencionalmente: por ejemplo NO se usa Redux, NO se usa React Query, NO se usa TypeScript. Esa simplicidad es **parte de la defensa académica**, no un bug.

---

## 5. Arquitectura por capas

La arquitectura canónica está en [`Gemini.md`](../Gemini.md). Resumen para la memoria:

- **Headless MVC + Fetch & Render** (ADR-03). Diferencia con NodeWeaver original: el backend devuelve **siempre JSON**; el frontend React es la View completa.
- **Flujo canónico de cualquier feature:**
  1. Componente React monta y hace `fetch()` vía `frontend/src/api/client.js`.
  2. El wrapper adjunta `Authorization: Bearer <jwt>` desde `localStorage.sw_token`.
  3. La petición llega a `backend/API/index.php` con `?route=...`.
  4. `Router::dispatch` (`backend/API/router/Router.php`) carga el controller por convención `ucfirst($name)`.
  5. El controller verifica auth con `AuthMiddleware::verifyToken()`, valida input, delega al modelo.
  6. El modelo ejecuta `prepare()` + `execute([...])` contra MariaDB vía PDO.
  7. El controller emite `echo json_encode([...])`.
  8. React parsea, guarda en estado y renderiza JSX.
- **Anti-patrones explícitamente prohibidos** (ver `Gemini.md §6`): `dangerouslySetInnerHTML`, `require_once 'view.php'`, concatenar SQL, class components, lógica de negocio en `MODEL/`, llamar a Ollama/Gemini desde React.

---

## 6. Mapa de features por fase

Para cada fase, la memoria debe documentar (en el Capítulo 4 de Implementación):

1. Qué resuelve la fase.
2. Decisiones técnicas (referenciar ADR si lo hay).
3. Archivos backend clave (modelo, controller, rutas).
4. Archivos frontend clave (service, página, componentes principales).
5. Endpoints expuestos (tabla método + ruta + body + respuesta).
6. RAs DAW que cubre.
7. Capturas relevantes.

### Fase 0–4 (Rediseño y plomería compartida)

- Plan: [`docs/redesign-plan.md`](./redesign-plan.md).
- Aporta: landing pública, registro/login con confirmación email, perfil editable con avatar, dashboard placeholder, shell con sidebar/navbar/drawer responsive, theming "Cielo Claro".

### Fase Maps (M0–M5)

- Plan: [`docs/maps-plan.md`](./maps-plan.md).
- Aporta: tabla `maps`, `MapController` (list/get/save/delete), editor Drawflow envuelto en React (`DrawflowEditor.jsx`), auto-save con debounce 1.5 s, expansión IA por nodo (`ai/expand`), atajos teclado (Ctrl+S, Delete).

### Fase Flashcards (F0–F6)

- Plan: `plans/crea-el-implementation-plan-golden-canyon.md` (en raíz `plans/`).
- Aporta: tabla `flashcards`, algoritmo SM-2 simplificado en `Flashcard::applyReview`, `FlashcardController` (list/due/save/review/delete/generate-from-map), sesión de repaso con teclas (1=fail, 2=good, 3=easy), generación IA desde mapa.

### Fase Comunidad (C0–C6)

- Plan: `docs/community-plan.md` si existe (verificar; no es canónico).
- Aporta: tablas `likes` y `comments`, `feedController` / `likeController` / `commentController`, feed `/comunidad`, perfiles públicos `/u/:userId`, favoritos `/comunidad/favoritos`, `ShareToggle` en `MapEditorPage`.

### Fase Notes (N0–N3 + N5)

- Plan: [`docs/notes-plan.md`](./notes-plan.md).
- Aporta: tabla `notes`, `NoteController` (list/get/upload/file/delete), `Note` model, `notesService.js`, `NotesListPage`, `NotePreviewPage`, `UploadNoteDialog` con tabs PDF/Texto, visor PDF embebido vía `apiDownload` + blob URL, atajos `n` y `Ctrl+Enter`. **Validación MIME real con `finfo`** sobre el archivo en disco.

### Fase IA (rama `ia-integration` — futura)

- Plan: [`docs/notes-plan.md §10`](./notes-plan.md#10-pendientes-para-la-rama-ia-integration). **No documentar como hecho hasta que esté.**

---

## 7. Capítulos sugeridos para la memoria académica

Ajusta a la plantilla oficial del centro si la hay; si no, ésta es una estructura defendible:

| Capítulo | Contenido | Fuentes en el repo |
| --- | --- | --- |
| **1. Introducción** | Pitch del producto, motivación, contexto académico, objetivos del TFG, estructura del documento. | §1 de este plan, ADR-01, ADR-06. |
| **2. Análisis de requisitos** | RAs DAW evaluables y mapping inicial. Casos de uso (UC-01 registro, UC-02 subir apunte, UC-03 generar mapa con IA, UC-04 repasar flashcards, UC-05 publicar mapa). User stories. Mockups Figma 3 devices como anexo. | [`docs/criterios-daw.md`](./criterios-daw.md), Figma. |
| **3. Diseño** | Arquitectura headless MVC + Fetch & Render. Diagrama de capas. Modelo de datos (ERD a partir de `docs/database.md`). Diseño de UI con paleta "Cielo Claro". Decisiones documentadas (ADRs). | [`Gemini.md`](../Gemini.md), [`docs/database.md`](./database.md), [`docs/decisiones.md`](./decisiones.md), Figma. |
| **4. Implementación** | Una sección por fase (ver §6 de este plan). Para cada fase: problema, decisiones, archivos, endpoints, RAs cubiertos. | Planes individuales en `docs/`. |
| **5. Despliegue** | Entorno local (XAMPP), entorno producción (proveedor cloud + HTTPS), variables de entorno (sin secretos), configuración Apache/nginx, build de Vite. | Archivos `.env.example` (si existen) + scripts de deploy. |
| **6. Cloud (RA3 1665190)** | Capítulo específico para el RA. Niveles IaaS/PaaS/SaaS y dónde encaja el despliegue elegido. Cuotas, escalado, backups. | Decisión de proveedor (ADR-08 cuando se redacte). |
| **7. Sostenibilidad (RA4 1708190)** | Capítulo específico. Eficiencia energética del modelo IA elegido (Ollama vs Gemini), ciclo de vida del producto, accesibilidad como dimensión social. | ADR-06, ADR-07. |
| **8. Conclusiones y línea futura** | Qué se logró, qué quedó fuera, qué se haría con más tiempo. Mencionar `ia-integration` como rama abierta y la rama archivada `n8nConection`. | ADR-01, [`docs/notes-plan.md §10`](./notes-plan.md). |
| **Anexos** | A: bibliografía. B: capturas de cada feature. C: diagrama ERD completo. D: archivo Figma. E: estructura del repositorio. F: glosario. | Repositorio entero. |

---

## 8. RAs DAW y su mapping

Tabla resumen extraída de [`docs/criterios-daw.md`](./criterios-daw.md). La memoria debe **citar archivos concretos** para cada RA en el Capítulo 4.

| Módulo | RA | Estado | Evidencia | Capítulo memoria |
| --- | --- | --- | --- | --- |
| 0612 | RA7 (web cliente asíncrona) | ✅ Cubierto | React + fetch + JWT + `apiDownload`. | Cap 4 (todas las fases). |
| 0613 | RA6 (acceso seguro a datos) | ✅ Cubierto | PDO + prepared statements + try/catch + ownership en query + finfo sobre PDFs. | Cap 4 (modelos). |
| 0613 | RA8 (web dinámica con servicios) | ✅ Cubierto | API REST propia + Ollama (servicio externo). | Cap 3-4. |
| 0613 | MVC | ✅ Cubierto | Backend MVC clásico. | Cap 3. |
| 0614 | RA1+RA2 (despliegue) | ⏳ Pendiente | URL pública + HTTPS por hacer. | Cap 5. |
| 0615 | RA1 (diseño interfaces) | ✅ Cubierto | Figma 3 devices terminado. | Cap 2 + Anexo D. |
| 0615 | RA2 (responsive + Grid) | ✅ Cubierto | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` en 7+ páginas. | Cap 3. |
| 1665190 | RA3 (cloud) | ⏳ Pendiente | Capítulo dedicado en memoria. | Cap 6. |
| 1708190 | RA4 (sostenibilidad) | ⏳ Pendiente | Capítulo dedicado en memoria. | Cap 7. |

---

## 9. Estilo y tono de la documentación

Reglas innegociables (instrucciones del alumno):

- **Castellano** en todo (UI, código, memoria, comentarios).
- **Voz de estudiante de Ciclo Superior DAW**, no investigador, no consultor enterprise. Ejemplo correcto: *"He elegido React porque es el framework que uso a diario y puedo defender línea a línea."* Ejemplo incorrecto: *"Se ha optado por React tras realizar un análisis comparativo exhaustivo de los frameworks SPA del mercado moderno."*
- **No inventar.** Si una sección requiere información que no hay en el repo, dejar `[PENDIENTE]` y avisar al alumno. Especialmente: capturas, decisiones de proveedor cloud, métricas de rendimiento.
- **Citas a archivos** siempre que sea útil: `backend/API/controllers/noteController.php:442` es mejor que "el controller del módulo de apuntes".
- **No copiar bloques de código enormes** a la memoria. Pega los fragmentos críticos (5-15 líneas) con el camino al archivo. Si hay que mostrar más, pasa al anexo.
- **Sin emojis** en la memoria final salvo los del RA mapping si la plantilla del centro lo acepta.
- **Sin LaTeX** ni dependencias raras: la memoria entrega típica de DAW es Word/Drive/PDF generado de Markdown.

Anti-patrones a evitar:

- *"Es la mejor opción del mercado"* sin justificar.
- Comparativas exhaustivas que el alumno no defenderá línea a línea.
- Capítulos genéricos copiados de plantilla sin sustancia (Capítulo "Estado del arte" relleno con texto de tutorial).
- Lenguaje pasivo + impersonal todo el rato. Permitido (y deseable) usar "he elegido", "decido", "implementé".

---

## 10. Cómo otra IA puede explorar el código sin cargarlo todo

Estrategia recomendada cuando hagan falta detalles concretos durante la redacción:

1. **Empieza por el plan canónico de la fase** (`docs/maps-plan.md`, `docs/notes-plan.md`...) — eso te da el "qué" y el "por qué".
2. **Lee el modelo y el controller de la fase** — eso te da el "cómo" del backend.
3. **Lee la página principal de la feature** (`*ListPage.jsx`) — eso te da el "cómo" del frontend.
4. **Cita ADRs** del `decisiones.md` para justificar las decisiones controvertidas.

Si te llaman por una feature concreta, abre como mucho **5-7 archivos**. Si necesitas más, devuelve un resumen y pide al alumno que confirme antes de seguir.

---

## 11. Listas concretas a producir

### Imprescindibles para la entrega

- [ ] **Memoria académica** completa (capítulos 1-8 + anexos).
- [ ] **README.md en raíz** del repo con: pitch, requisitos, instrucciones setup local (XAMPP + .env + migraciones), enlaces a memoria y Figma.
- [ ] **Diagrama ERD** de la BD (a partir de `docs/database.md`; herramientas: dbdiagram.io, drawSQL, Mermaid).
- [ ] **Capturas de pantalla** por feature (4-6 por fase). Para Notes: lista vacía, dialog upload PDF, dialog upload texto, lista con cards, preview PDF embebido, preview texto.
- [ ] **Bibliografía formateada** según norma del centro (típicamente APA o ISO 690).

### Deseables si hay tiempo

- [ ] README dentro de `backend/` y `frontend/` con setup específico.
- [ ] Diagrama de arquitectura (capas) con Mermaid.
- [ ] Diagrama de despliegue.
- [ ] Manual de usuario corto (anexo de la memoria o README del repo).
- [ ] CHANGELOG con resumen de fases y commits clave.

### Lo que NO hay que hacer

- ❌ Reescribir comentarios del código existente. Si encuentras un docstring poco claro, repórtalo al alumno; **no lo edites tú** sin permiso explícito.
- ❌ Crear archivos `*.md` "porque sí". Cada documento nuevo necesita aprobación del alumno.
- ❌ Citar funcionalidades que no existen (la rama `ia-integration` no está cableada todavía — documéntala como **planificada**, no como hecha).

---

## 12. Archivos canónicos para esta IA, en orden de lectura

Si abres un chat dedicado y sólo puedes leer una decena de archivos antes de empezar, este es el orden:

1. [`CLAUDE.md`](../CLAUDE.md) — manual operativo y reglas duras.
2. [`Gemini.md`](../Gemini.md) — arquitectura canónica.
3. [`docs/criterios-daw.md`](./criterios-daw.md) — los RAs que hay que cubrir.
4. [`docs/decisiones.md`](./decisiones.md) — ADR-01..ADR-07.
5. [`docs/database.md`](./database.md) — modelo de datos completo.
6. [`docs/notes-plan.md`](./notes-plan.md) — fase principal + §10 pendientes IA.
7. [`docs/maps-plan.md`](./maps-plan.md) — fase Maps cerrada.
8. [`docs/redesign-plan.md`](./redesign-plan.md) — Fases 0-4.
9. [`docs/ROADMAP.md`](./ROADMAP.md) — plan diario y prioridades.
10. **Este archivo** (`documentation-plan.md`).

A partir de aquí, lee código sólo bajo demanda específica.

---

## 13. Coordenadas del autor

- **Email del alumno:** info@kimeratechnologies.com.
- **Repo:** privado / personal del alumno.
- **Día de entrega:** 3 de mayo de 2026.
- **Nota sobre commits:** el alumno revisa y commitea manualmente; la IA **no debe commitear nada**.

---

## 14. Anti-bloat: lo que NO hay que documentar

- Detalles obvios del framework (qué es `useState`, qué es PDO).
- Cosas que cambian rápido (versión exacta de cada minor de npm — basta con la mayor).
- Decisiones rechazadas que no aportan ("consideré usar Angular pero descartado": sólo si el ADR existe).
- Métricas inventadas ("el sistema soporta 10.000 usuarios concurrentes" sin medirlo).
- Roadmap futuro especulativo más allá de lo que el alumno tiene previsto entregar como "línea futura".

---

> **Si llegas a este documento y todo el contexto coincide con tu chat actual, puedes empezar.**
> **Si algo de lo que aquí se afirma ya no es cierto, antes de redactar avisa al alumno y verifica con `Read`/`Grep`.**
