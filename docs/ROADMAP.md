# StudyWeaver — Hoja de ruta diaria (25 abr → 3 may 2026)

> Plan operativo. **Ajusta este documento si una tarea se desliza un día**, pero no si se desliza dos. Si dos días se descuadran, recortamos features (orden de recorte al final).

---

## Filosofía del plan

- Cada día tiene **un foco**. Si terminas el foco, das de mano. No te metas en el foco del día siguiente "para ir adelantado": romperás el calendario al primer bug.
- **Cada día deja algo entregable a Git** con commit claro.
- La **memoria se escribe en paralelo a la implementación**, no al final. Cada feature termina con un párrafo en la memoria.
- Si una tarea es una **decisión técnica no trivial**, deja un ADR en `docs/decisiones.md` el mismo día.

---

## Día 0 — Sábado 25 abril (TARDE)

**Foco:** decisiones, setup del repo y email al tutor.

- [ ] Mandar email al tutor confirmando React como sustituto de Vue 3 en RA7.
- [ ] Crear rama `studyweaver` desde `develop` (no desde `n8nConection`).
- [ ] Crear estructura de carpetas objetivo (`backend/`, `frontend/`, `docs/`).
- [ ] Mover `API/`, `MODEL/`, `DATA/` actuales bajo `backend/`. Mover `SERVER/` a `backend/public/` solo lo legado, el resto eliminar.
- [ ] Inicializar `frontend/` con `npm create vite@latest -- --template react`.
- [ ] Instalar Tailwind CSS en `frontend/`.
- [ ] Instalar React Router DOM y axios (o nada — usar fetch nativo).
- [ ] Diseñar esquema BD inicial (entrega: SQL en `docs/arquitectura.md`).
- [ ] Crear DB local `studyweaver` y ejecutar migración inicial.
- [ ] **Commit:** `chore: estructura monorepo backend+frontend para StudyWeaver`.

**Entregable:** repo con estructura limpia, frontend Vite arranca con `npm run dev`, backend PHP arranca con `php -S localhost:8000 -t backend/public`. BD creada con tablas `users`, `maps`, `nodes`, `edges`.

---

## Día 1 — Domingo 26 abril

**Foco:** backend MVC adaptado al dominio StudyWeaver.

### Mañana
- [ ] Migrar `authController` y `userModel` al nuevo `backend/`. Probar login/register/confirm con Postman contra localhost:8000.
- [ ] Configurar CORS en `backend/DATA/cors.php` para aceptar `http://localhost:5173`.
- [ ] Crear modelo `Map` (`backend/MODEL/Map.php`): `create`, `findById`, `findByUserId`, `update`, `delete`, `findPublic`.
- [ ] Crear modelo `Node` (`backend/MODEL/Node.php`): `create`, `update`, `delete`, `findByMapId`. Persistencia: tabla con `map_id`, `position_x`, `position_y`, `data` (JSON).
- [ ] Crear modelo `Edge` (`backend/MODEL/Edge.php`): `create`, `delete`, `findByMapId`.

### Tarde
- [ ] Crear `MapController` con endpoints CRUD: `index`, `store`, `show`, `update`, `destroy`.
- [ ] Endpoint especial `MapController::saveFlow($mapId, $drawflowJson)` que recibe el JSON exportado por Drawflow y lo persiste atómicamente (transaction: borrar nodos+edges anteriores, insertar nuevos).
- [ ] Endpoint `MapController::loadFlow($mapId)` que devuelve el JSON listo para `editor.import()`.
- [ ] Probar todos los endpoints con Postman.
- [ ] **Commit:** `feat(backend): modelos y endpoints CRUD para mapas conceptuales`.

**Entregable:** Backend con auth + 6 endpoints de mapas funcionando, validados con Postman. ADR sobre estrategia de persistencia Drawflow ↔ MySQL.

---

## Día 2 — Lunes 27 abril

**Foco:** backend de IA y endpoints sociales.

### Mañana — IA
- [ ] Crear servicio `backend/API/services/AIClient.php` (cliente HTTP a OpenAI o Gemini, configurable por `.env`).
- [ ] Endpoint `POST /api/ai/expand` — recibe `{ topic, context }`, devuelve `{ branches: [{title, description}] }` (3-5 ramas hijas).
- [ ] Endpoint `POST /api/ai/summarize` — recibe `{ mapJson }`, devuelve `{ summary: string }`.
- [ ] Endpoint `POST /api/ai/quiz` — recibe `{ mapJson, n }`, devuelve `{ questions: [{q, options[], correctIndex}] }`.
- [ ] Endpoint `POST /api/ai/parse-pdf` — recibe `multipart/form-data` con PDF, devuelve `{ map: { nodes, edges } }`. Usar Smalot/PDFParser para extraer texto y enviar a IA con prompt estructurado.

### Tarde — Social
- [ ] Crear modelos `Like`, `Comment`, `Follow` (este último opcional si va justo).
- [ ] Endpoints `POST /api/maps/:id/like`, `DELETE /api/maps/:id/like`.
- [ ] Endpoints `GET /api/maps/:id/comments`, `POST /api/maps/:id/comments`, `DELETE /api/comments/:id`.
- [ ] Endpoint `GET /api/feed/public` — lista paginada de mapas públicos con datos de autor + likes count.
- [ ] **Commit:** `feat(backend): endpoints IA y capa social (likes/comments/feed)`.

**Entregable:** 4 endpoints IA + 5 endpoints sociales validados con Postman. Plantilla de prompts en `docs/decisiones.md` (ADR).

---

## Día 3 — Martes 28 abril

**Foco:** frontend React — fundamentos.

### Mañana — Setup y auth
- [ ] Configurar Tailwind CSS con tema oscuro morado/cyan (extraer paleta del `index.html` actual de NodeWeaver).
- [ ] Crear `frontend/src/api/client.js`: wrapper de fetch con JWT, manejo de 401, base URL desde `import.meta.env.VITE_API_URL`.
- [ ] Crear `frontend/src/auth/AuthContext.jsx`: provee `user`, `login`, `logout`, `register`. Persiste en `localStorage`.
- [ ] Crear `frontend/src/auth/ProtectedRoute.jsx`.
- [ ] Configurar React Router con rutas: `/`, `/login`, `/register`, `/confirm/:token`, `/reset/:token`, `/dashboard`, `/map/:id`, `/profile/:id`, `/feed`.

### Tarde — Páginas auth
- [ ] Página `Landing` (versión React del `index.html` actual).
- [ ] Página `Login`, `Register`, `ConfirmAccount`, `ForgotPassword`, `ResetPassword`.
- [ ] Probar end-to-end: registro → email → confirmación → login → dashboard placeholder.
- [ ] **Commit:** `feat(frontend): setup React + Vite + auth completo conectado al backend`.

**Entregable:** flujo de auth completo funcionando en navegador, con el theming oscuro listo.

---

## Día 4 — Miércoles 29 abril

**Foco:** editor de mapas (el corazón visual del producto).

### Mañana
- [ ] Crear componente `<DrawflowEditor />` que envuelve la librería Drawflow en un `useRef` + `useEffect`.
- [ ] Soporte para drag & drop de nodos desde una sidebar.
- [ ] Soporte para edit/delete de nodos. Modal de edición de propiedades (título, descripción).
- [ ] Auto-save cada 30s contra `POST /api/maps/:id/save-flow` (con debounce).

### Tarde
- [ ] Botón "expandir con IA" en cada nodo: dispara `POST /api/ai/expand`, añade ramas hijas al editor.
- [ ] Botón "resumir mapa" en la toolbar: dispara `POST /api/ai/summarize`, abre modal con resumen.
- [ ] Página `MapView` que carga un mapa por ID y monta el editor.
- [ ] **Commit:** `feat(frontend): editor de mapas con Drawflow + integración IA expandir/resumir`.

**Entregable:** puedes crear un mapa, añadir nodos manualmente, pulsar "expandir IA" y ver ramas hijas autogeneradas, todo persistido.

---

## Día 5 — Jueves 30 abril

**Foco:** social, flashcards, quiz, perfil, estadísticas.

### Mañana
- [ ] Página `Feed` que lista mapas públicos con cards (autor, título, likes count, preview de nodos).
- [ ] Componente `<LikeButton />` y `<CommentSection />` reutilizables.
- [ ] Página `PublicProfile/:userId` que muestra mapas públicos del usuario + estadísticas.

### Tarde
- [ ] Feature `flashcards`: a partir de un mapa, generar flashcards (concepto → descripción) y mostrar en modo repaso.
- [ ] Feature `quiz`: dispara `POST /api/ai/quiz` y muestra el quiz pregunta a pregunta con feedback.
- [ ] Feature `import-pdf`: input para subir PDF, dispara `POST /api/ai/parse-pdf`, abre el mapa generado.
- [ ] Página `Statistics` en perfil propio: nº mapas creados, nº nodos totales, racha de días, badges desbloqueados.
- [ ] **Commit:** `feat(frontend): capa social + flashcards + quiz + import PDF + estadísticas`.

**Entregable:** demo end-to-end completa funcionando. Feature freeze.

---

## Día 6 — Viernes 1 mayo

**Foco:** Figma + despliegue cloud.

### Mañana — Figma
- [ ] Crear archivo Figma `StudyWeaver — Mockups`.
- [ ] Frames a 1440 (desktop), 768 (tablet), 375 (mobile) para: Landing, Login, Dashboard, MapView, Feed, Profile.
- [ ] Crear componentes Figma de: Button (3 variantes), Input, Card, Modal, NavBar.
- [ ] Mantener jerarquías y aplicar Grid Layout en wireframes.
- [ ] Exportar a PDF para incluir en memoria.

### Tarde — Despliegue cloud
- [ ] Decidir proveedor (recomendado: backend en VPS/Hostinger con Apache+MySQL, frontend en Vercel; o todo en AWS si CVOPS190 lo enseñó).
- [ ] Crear DB MySQL en cloud, ejecutar migración, importar datos seed.
- [ ] Configurar variables de entorno (`OPENAI_API_KEY`, `JWT_SECRET`, `SENDGRID_API_KEY`, etc.).
- [ ] Build del frontend (`npm run build`) y deploy.
- [ ] Configurar dominio o usar URL del proveedor.
- [ ] Configurar HTTPS (Let's Encrypt o automático del proveedor).
- [ ] Probar flujo end-to-end en producción.
- [ ] **Commit + tag:** `release: v1.0.0 desplegado en producción`.

**Entregable:** URL pública funcionando con flujo completo. Mockups Figma listos.

---

## Día 7 — Sábado 2 mayo

**Foco:** memoria + ensayo defensa.

### Mañana — Memoria (estructura completa, redacción densa)
- [ ] Capítulo 1: Introducción y motivación (1 página).
- [ ] Capítulo 2: Análisis de requisitos (RA mapping, casos de uso, mockups Figma).
- [ ] Capítulo 3: Diseño (arquitectura Headless MVC + Fetch & Render, esquema BD, diagramas).
- [ ] Capítulo 4: Implementación (decisiones técnicas, librerías, ADRs resumidos).
- [ ] Capítulo 5: Despliegue cloud (proveedor, niveles cloud IaaS/PaaS/SaaS, configuración).
- [ ] Capítulo 6: Sostenibilidad (ecodiseño, ciclo de vida, eficiencia energética del backend, hosting con energías renovables si aplica).
- [ ] Capítulo 7: Pruebas y validación.
- [ ] Capítulo 8: Conclusiones y líneas futuras (n8n integration como línea futura — el bridge de la rama archivada).
- [ ] Anexos: capturas, código relevante, referencias.

### Tarde — Defensa
- [ ] Preparar guion archivo por archivo de los 10-12 archivos clave que defenderás.
- [ ] Ensayo en voz alta de la demo de 5-7 minutos.
- [ ] Ensayar respuesta a 10 preguntas tipo (usar agente `tribunal`).
- [ ] **Commit:** `docs: memoria final + guion defensa`.

**Entregable:** memoria PDF completa. Demo guion ensayado.

---

## Día 8 — Domingo 3 mayo (BUFFER + ENTREGA)

**Foco:** ajustes finales.

- [ ] Repaso completo del checklist de criterios DAW (`docs/criterios-daw.md`).
- [ ] Revisar README del repo (instalación, despliegue, capturas).
- [ ] Última pasada de la memoria por estilo y typos.
- [ ] Subir entrega al sistema del centro.
- [ ] Respirar.

---

## Plan de recorte si se desvía un día

Si vas un día tarde, recorta features en **este orden** (de menos doloroso a más):

1. **Follows / red social profunda** → solo feed público + likes + comentarios.
2. **Badges y logros** → solo estadísticas básicas.
3. **Modo presentación** del mapa → solo modo edición.
4. **Plantillas pre-hechas** → solo "mapa en blanco".
5. **Spaced repetition de flashcards** → solo flashcards visualizables.
6. **Import PDF** → quitar el feature, mantener solo expand+summarize+quiz.
7. **Quizzes** → quitar, mantener solo expand+summarize.
8. **Comments** → quitar, dejar solo likes.

**No recortes nunca:** auth, editor de mapas, expand IA, persistencia, Figma, despliegue cloud, memoria. Eso es el core no negociable.

---

## Indicadores de alarma (red flags)

- **Día 1 sin acabar el backend de mapas** → pasa al día 2 ya con IA.
- **Día 3 sin auth funcionando en frontend** → simplifica auth, usa solo login/register, salta confirmación email.
- **Día 5 sin demo end-to-end** → activa el plan de recorte. Quita features hasta que demo funcione.
- **Día 6 sin desplegar** → considera plan B: hosting compartido low-cost o Vercel + Railway. NO inventes infra nueva.
- **Día 7 sin empezar memoria** → escribe en modo "bullet expandido" en lugar de prosa académica. Mejor entregar bullets que entregar nada.
