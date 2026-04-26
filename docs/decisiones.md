# Decisiones técnicas (ADRs)

> *Architecture Decision Records*. Cada decisión no trivial debe tener una entrada aquí, escrita el mismo día que se toma. Es la fuente de verdad para la memoria y la defensa.

---

## Plantilla

```markdown
## ADR-NN — Título corto

- **Fecha:** YYYY-MM-DD
- **Estado:** propuesto / aceptado / rechazado / superado por ADR-XX

### Contexto
Qué problema o necesidad provoca esta decisión.

### Decisión
Qué se decide hacer.

### Alternativas consideradas
1. Alternativa A — por qué se descartó.
2. Alternativa B — por qué se descartó.

### Consecuencias
- Positivas: …
- Negativas / trade-offs: …

### Referencias
Enlaces, libros, papers.
```

---

## ADR-01 — Pivotación de NodeWeaver a StudyWeaver

- **Fecha:** 2026-04-25
- **Estado:** aceptado

### Contexto

El proyecto inicial NodeWeaver (plataforma no-code de automatización con bridge a n8n) había alcanzado complejidad técnica alta (Drawflow→n8n parser, fail-soft con HMAC callbacks, vault cifrado, rate limiter, suite de tests E2E, ~6.100 líneas de cambios en `n8nConection`). La fecha de entrega del Proyecto Final 2 DAW es el 3 de mayo de 2026 y la defensa requiere dominar todo el código presentado.

Dado el riesgo de no poder defender la complejidad acumulada de la rama `n8nConection`, y tras revisar los criterios reales del PDF *"Criterios para evaluar Proyecto intermodular 2"*, se observa que **ninguno de los criterios DAW exige las features avanzadas de NodeWeaver** (n8n bridge, vault, rate limiter, tests E2E). Lo exigido es: SPA cliente, MVC servidor, acceso seguro a datos, despliegue cloud, diseño responsive con Grid + Figma 3 devices, capítulos de cloud y sostenibilidad.

### Decisión

Pivotar el proyecto a **StudyWeaver**: plataforma de estudio personal con mapas conceptuales visuales, IA y capa social. Mantener el repositorio original (`NodeWeaver-`) por motivos de historial git. Trabajar sobre nueva rama `studyweaver` partiendo de `develop` (no de `n8nConection`). Archivar `n8nConection` como rama de I+D (línea futura mencionada en la memoria).

### Alternativas consideradas

1. **Mergear `n8nConection` en `develop` y entregar tal cual** — descartada: complejidad indefendible en el plazo disponible.
2. **Empezar proyecto totalmente nuevo en otro repo** — descartada: pierde activos reutilizables (auth JWT + SendGrid, theming, Drawflow, MVC base).
3. **Quedarse en `develop` con tema "automatización"** — descartada: el dominio queda artificial sin el bridge n8n.

### Consecuencias

- **Positivas:** se reutiliza ~70% del código de `develop` (auth, perfil, theming, MVC, Drawflow). Reduce riesgo de defensa. Permite cumplir RAs DAW con margen.
- **Negativas:** algunas verrugas heredadas (rutas erróneas en `apiCall`, `MODEL/automation.php` vacío) requieren limpieza al migrar.
- **Línea futura:** la rama `n8nConection` queda como "evolución posible" mencionada en la memoria.

### Referencias

- PDF criterios DAW (`docs/criterios-daw.md`).
- Rama archivada: `n8nConection`.

---

## ADR-02 — React 18 como framework de frontend

- **Fecha:** 2026-04-25
- **Estado:** aceptado (sujeto a confirmación del tutor por email)

### Contexto

El PDF de criterios indica como opciones para el RA7 (módulo 0612): *Vanilla JS arquitectura SPA similar a `sum-flow-spa-v3`* o *Vue 3*. React no aparece en la lista. Sin embargo, el estudiante usa React profesionalmente y lo controla mejor que Vue.

### Decisión

Usar **React 18 + Vite + Tailwind CSS** como sustituto válido de Vue 3, previa confirmación por correo del tutor. React cumple el espíritu del RA7 (SPA + comunicación asíncrona) y es framework reconocido por el sector.

### Alternativas consideradas

1. **Vanilla JS estilo SPA** — descartada: el estudiante quiere demostrar dominio de React, que es lo que usa profesionalmente.
2. **Vue 3** — descartada: el estudiante no domina Vue, defenderlo sería forzado.
3. **Next.js** — descartada: SSR añade complejidad innecesaria, el proyecto no requiere SEO ni hydratation server-side.

### Consecuencias

- Positivas: stack alineado con experiencia profesional del estudiante, defensa más sólida.
- Negativas: requiere build separado (Vite), arquitectura monorepo backend+frontend, configuración CORS adicional.
- **Riesgo:** si el tutor no acepta, plan B es Vanilla JS estilo `sum-flow-spa-v3` con la misma arquitectura headless de backend.

---

## ADR-03 — Arquitectura "Headless MVC + Fetch & Render"

- **Fecha:** 2026-04-25
- **Estado:** aceptado

### Contexto

NodeWeaver original mezclaba dos paradigmas: el backend devolvía JSON para auth y HTML chunks para tablas dinámicas, inyectados con `.innerHTML`. Con React, esa mezcla genera anti-patrones (`dangerouslySetInnerHTML`).

### Decisión

Aplicar **Headless MVC**: el backend PHP queda como API REST que devuelve **siempre JSON**. El frontend React es la View completa. Patrón rebautizado a **"Fetch & Render"** (vs el "Fetch & Inject" original).

### Consecuencias

- Positivas: separación clara de responsabilidades, frontend desacoplado, defensa más sencilla.
- Negativas: requiere CORS, no hay SSR, hay que manejar estado de autenticación en cliente.

---

## ADR-04 — Esquema de mapas: tabla `maps` nueva, `automations` queda DEPRECATED

- **Fecha:** 2026-04-25
- **Estado:** **superado por ADR-05** (al revisar el dump real `autoflow.sql` se vio que el esquema legacy era minimalista y borrable; la decisión "dejar como zombie" se reemplazó por "DROP físico en migración 001"). El ADR queda como traza histórica del razonamiento previo a ver el dump.

### Contexto

La feature core de StudyWeaver (Fase Maps, ver [`docs/maps-plan.md`](./maps-plan.md)) requiere persistir mapas conceptuales: cada mapa es un grafo de nodos y aristas serializado por Drawflow vía `editor.export()`.

El backend heredado de NodeWeaver ya tiene una tabla `automations` con un campo `flow_data JSON` que también almacena el output de `editor.export()`. La pregunta es si reciclarla o crear una tabla nueva. Los caminos posibles eran:

1. **Reciclar** `automations` renombrando o sólo dejando de poblar las columnas n8n.
2. **Crear** tabla `maps` nueva con esquema mínimo de StudyWeaver.
3. **Vista** sobre `automations` que exponga sólo las columnas relevantes.

La tabla `automations` arrastra 11 columnas n8n-específicas que no aplican a un mapa conceptual: `trigger_type`, `schedule_expression`, `tags`, `version`, `is_active`, `last_run_at`, `last_run_status`, `total_runs`, `total_errors`, además de la relación con `webhooks`, `execution_logs`, `execution_node_logs`, `automation_stats`. Documentado en [`DATA/database_context.md` §2.2](../DATA/database_context.md).

### Decisión

Crear **tabla nueva `maps`** con esquema mínimo viable centrado en el dominio de mapas conceptuales (ver migración [`DATA/migrations/001_create_maps.sql`](../DATA/migrations/001_create_maps.sql) y [`DATA/database_context.md` §2.9](../DATA/database_context.md)):

```sql
maps(id, user_id, title, description, is_public, drawflow_json, created_at, updated_at)
+ FK fk_maps_user(user_id) → users(id) ON DELETE CASCADE
+ INDEX idx_user_updated(user_id, updated_at)
```

`drawflow_json` (LONGTEXT) es la fuente de verdad. **No se denormalizan** nodos/edges en tablas separadas en el MVP.

La tabla `automations` (y todo su árbol heredado: `sessions`, `credentials_vault`, `webhooks`, `execution_logs`, `execution_node_logs`, `automation_stats`) queda **DEPRECATED**: ningún controller del backend StudyWeaver la consulta. Físicamente se mantiene en MySQL local para preservar el historial de la fase pre-pivote, pero se omitiría al provisionar el esquema en producción cloud.

### Alternativas consideradas

1. **Reciclar `automations` renombrando** — descartada: dejaría 11 columnas n8n inertes que el tribunal preguntaría inevitablemente («¿qué hace `trigger_type='webhook'` en un mapa conceptual?»). Indefendible. El coste de "ahorrar" un `CREATE TABLE` no compensa la deuda de explicación.
2. **Vista** sobre `automations` que exponga sólo las columnas relevantes — descartada: no resuelve nada, la tabla física sigue ahí con su deuda y añade indirección que complica los `INSERT`/`UPDATE` (vistas en MySQL no son siempre actualizables).
3. **Denormalizar nodos/edges** ya en M0 (tablas `nodes` y `edges` aparte como plantea [`docs/arquitectura.md` §2](./arquitectura.md)) — descartada para el MVP: introduce el clásico bug de "guardas en JSON, olvidas guardar en `nodes`, lectura desincronizada". Se mantiene una sola fuente de verdad y se planifica como mejora futura cuando aparezcan queries que filtren por concepto individual (búsqueda full-text, stats por nodo, feed social).
4. **Eliminar físicamente** `automations` y dependientes con `DROP TABLE` en M0 — descartada: rompe backups y no aporta valor en local; la limpieza definitiva se hace en el script de provisión cloud (Fase Despliegue), donde el esquema se genera desde cero a partir de las migraciones activas.

### Consecuencias

- **Positivas:** vocabulario limpio (`title`, `description`, `is_public`, `drawflow_json`); ninguna columna inerte que defender; coste de migración ≈ 5 min (un `CREATE TABLE`); ownership por `user_id` claramente reflejada en el índice y la FK; `ON DELETE CASCADE` cubre RGPD sin código extra.
- **Negativas / trade-offs:** convivencia temporal en local de las dos capas (StudyWeaver activa vs NodeWeaver heredada); requiere disciplina para no reusar tablas DEPRECATED desde código nuevo (mitigado con la marca explícita en el `database_context.md`).
- **Línea futura:** denormalización opcional `nodes` + `edges` cuando lleguen queries por concepto. Limpieza física del árbol NodeWeaver en el script de despliegue cloud.

### Referencias

- [`docs/maps-plan.md` §1.1](./maps-plan.md) — análisis comparado de las 3 opciones.
- [`DATA/migrations/001_create_maps.sql`](../DATA/migrations/001_create_maps.sql) — DDL aplicado.
- [`DATA/database_context.md` §2.9](../DATA/database_context.md) — esquema y reglas de negocio.

---

## ADR-05 — Rediseño completo del esquema StudyWeaver: drop legacy, MVP mínimo, planificadas con DDL

- **Fecha:** 2026-04-25
- **Estado:** aceptado (supera al ADR-04)

### Contexto

Tras aceptar el ADR-04, el alumno proporcionó el dump real de `autoflow` (`autoflow.sql`, generado desde phpMyAdmin). Comparando con [`DATA/database_context.md`](../DATA/database_context.md) que había sido escrito inicialmente, se constataron varias divergencias importantes:

1. El doc anterior describía 8 tablas (incluyendo `webhooks`, `execution_node_logs`, `automation_stats`, `credentials_vault`); el dump muestra **5 tablas reales**: `users`, `automations`, `credentials`, `execution_logs`, `sessions`.
2. El esquema real de `automations` es minimalista (10 columnas con `n8n_workflow_id`, sin `tags`/`version`/`last_run_*`/contadores), no las 17 inventadas por el doc.
3. El esquema real de `credentials` no tiene cifrado AES-256-GCM ni `fingerprint`; sólo `service`, `encrypted_data`, `is_valid`.
4. `sessions` guarda `token` en claro (500 chars), no `token_hash` SHA-256, y nunca se consultaba ni siquiera en NodeWeaver (JWT es stateless).
5. La columna del flow es `automations.flow_config` (con `CHECK (json_valid(...))`), no `automations.flow_data` como decían el doc y el `MODEL/automation.php` ya borrado.

Con esta información real, mantener las 4 tablas legacy "como zombies" (decisión del ADR-04) es injustificable: ningún código activo las usa, son minimalistas y su presencia confunde al tribunal y a futuros agentes IA.

Además, el alumno decidió **diseñar la BD desde la perspectiva StudyWeaver**, no parchear sobre la de NodeWeaver. Esto incluye documentar y dejar el DDL listo de las tablas que aún no se implementan pero están en el roadmap (Fase Flashcards y Fase Comunidad), de manera que el RA "diseño completo de BD" del módulo 0613 se cubra sin obligar a implementar todo en MVP.

### Decisión

1. **Drop físico** del legacy NodeWeaver en una migración inicial: ejecutar `DROP TABLE IF EXISTS execution_logs, automations, credentials, sessions;` (con `FOREIGN_KEY_CHECKS = 0` para libertad de orden). Migración: [`DATA/migrations/001_init_studyweaver.sql`](../DATA/migrations/001_init_studyweaver.sql).
2. **Mantener `users`** tal cual, con sus columnas 2FA inertes (`two_factor_enabled`, `two_factor_secret`) documentadas como tales. Razón: tres usuarios reales con password hashes y tokens activos; reescribirla pierde la cuenta de prueba (id=2 `active`).
3. **Mantener el nombre de la base `autoflow`** para no tocar `.env` ni `DATA/database.php`. Defendible: nombre histórico ligado al repositorio `NodeWeaver-`. Renombrar a `studyweaver` se puede plantear en el script de provisión cloud.
4. **Renombrar la migración de `maps`** de `001_create_maps.sql` a `002_create_maps.sql` para que el orden lógico quede `001 init → 002 maps → 003+ futuras`.
5. **Diseñar y dejar listo el DDL** de las 3 tablas planificadas, en archivos `.sql.planned` que NO se ejecutan hasta que llegue su Fase:
    - `flashcards` (Fase Flashcards) con algoritmo SM-2 simplificado: `ease_factor`, `interval_days`, `repetitions`, `next_review_at`. FK al mapa con `ON DELETE SET NULL` para que la tarjeta sobreviva al borrado del mapa origen.
    - `likes` (Fase Comunidad) con PK compuesta `(user_id, map_id)` para impedir duplicados a nivel de BD.
    - `comments` (Fase Comunidad) planos, sin replies/threading, índice compuesto `(map_id, created_at)` para listado paginado.
6. **No diseñar todavía** `quizzes` y `quiz_attempts`: la Fase Quizzes (si llega) generará el quiz vía IA bajo demanda y no necesita cachear. Si en el momento se decide cachear, se redacta el DDL entonces.

Justificación de no denormalizar `nodes`/`edges` en MVP heredada del ADR-04: `maps.drawflow_json` como única fuente de verdad evita el bug clásico de "guardar en JSON, olvidar guardar en `nodes`, lectura desincronizada". La denormalización se añade cuando aparezcan queries que la justifiquen (búsqueda full-text, stats por concepto).

### Alternativas consideradas

1. **Mantener legacy como zombie** (decisión inicial ADR-04) — descartada al ver el dump: las tablas legacy son minimalistas y borrarlas no tiene riesgo. Mantenerlas confunde al tribunal y a futuros agentes.
2. **Reescribir `users` desde cero** quitando las columnas 2FA — descartada: tres usuarios reales (incluyendo la cuenta de prueba `id=2 active`) se perderían. La columna inerte sólo cuesta 9 bytes y queda documentada.
3. **Renombrar la base a `studyweaver`** — descartada en este sprint: obliga a tocar `.env` (regla CLAUDE.md prohíbe) y reconfigurar todas las herramientas locales (phpMyAdmin, Workbench). Defendible mantener `autoflow` como nombre histórico, replanificable en provisión cloud.
4. **No documentar las tablas planificadas** hasta que se implementen — descartada: el RA "diseño completo de BD" valora ver el roadmap reflejado en archivos concretos. Coste de documentación ≈ 30 min, beneficio defensivo claro.
5. **Implementar ya `flashcards`/`likes`/`comments`** en MVP — descartada por timebox (8 días hasta entrega): sin `maps` funcionando primero, las dependencias rompen el orden lógico.

### Consecuencias

- **Positivas:** base limpia con sólo lo que StudyWeaver necesita (`users` + `maps`); roadmap completo documentado y con DDL listo en `.planned`; convenciones uniformes (`utf8mb4_unicode_ci`, `INT AUTO_INCREMENT`, FKs CASCADE); tribunal puede revisar el diseño completo en `database_context.md` sin abrir MySQL; el alumno defiende cada columna activa sin columnas inertes que justificar (salvo las 2FA en `users`, ya documentadas).
- **Negativas / trade-offs:** el alumno debe ejecutar `001_init_studyweaver.sql` en phpMyAdmin antes de seguir; convivencia temporal con la columna `verified_at` que el backend no rellena (deuda técnica documentada); `users.password` permite NULL por compatibilidad con login Google, lo cual obliga a comprobar en código que el usuario tenga `password` antes de validar (`AuthController::login` ya lo hace).
- **Línea futura:** simplificación de `users` (drop `two_factor_*`, drop `verified_at`) cuando se implemente o se descarte definitivamente 2FA. Renombrado de la base a `studyweaver` en script de provisión cloud.

### Referencias

- Dump real: `autoflow.sql` aportado por el alumno (no commiteado por contener datos personales).
- [`DATA/migrations/`](../DATA/migrations/) — `001_init_studyweaver.sql`, `002_create_maps.sql`, `003_create_flashcards.sql.planned`, `004_create_likes.sql.planned`, `005_create_comments.sql.planned`.
- [`DATA/database_context.md`](../DATA/database_context.md) reescrito para reflejar la realidad y las planificadas.

---

## ADR-06 — Apuntes como zona principal: pivote de narrativa

- **Fecha:** 2026-04-26
- **Estado:** aceptado

### Contexto

Tras cerrar Fase Maps M0–M5 (editor Drawflow funcional con auto-save, IA de expansión por nodo, atajos de teclado), surgió la pregunta de si el mapa conceptual **solo** es lo bastante diferencial para defenderlo en el tribunal. La conclusión honesta es que no del todo:

- **Lo que aporta el mapa solo:** organización visual + jerarquía de un tema en una pantalla. La IA reduce el cuello de botella histórico de los mapas (construirlos era lento).
- **Lo que NO aporta:** una vez construido, **estudiar consultándolo es peor** que un resumen lineal o flashcards. La utilidad académica medida (Novak 1990; Hay et al. 2008) está en *construir* el mapa, no en revisarlo. Y si el alumno tiene ChatGPT a mano, ya consigue esquemas con un prompt rápido.

A la vez, las features que faltaban en el roadmap (Flashcards, Comunidad) tampoco resuelven solas el "¿por qué usaría yo esto?". Hace falta una narrativa que las una.

### Decisión

**Pivotar la narrativa** del producto sin tirar nada de lo construido. La nueva zona principal de StudyWeaver es **Mis apuntes** (`/apuntes`):

```
Usuario ─▶ Apunte (PDF / texto pegado / markdown)
              ├─▶ Mapa conceptual    (IA estructura el contenido)
              ├─▶ Flashcards SM-2     (IA genera tarjetas de repaso)
              └─▶ Resumen / Quiz      (futuro, opcional)
```

- El **apunte** es la fuente de verdad. El alumno sube un PDF (o pega texto) y de ahí parten los demás artefactos.
- El **mapa** sigue siendo editor Drawflow tal cual; ahora puede generarse desde un apunte vía IA y queda vinculado con `maps.source_note_id`.
- Las **flashcards** se generan desde un mapa (Fase Flashcards F5) o directamente desde un apunte (Fase Notes N4 con `target='flashcards'`).
- El dashboard `/dashboard` deja de ser la página de aterrizaje post-login; pasa a ser una vista futura de estadísticas. El redirect post-login pasa a `/apuntes`.

Documentación detallada en [`docs/notes-plan.md`](./notes-plan.md). Cambios de BD planificados (no aplicados aún): tabla `notes` (migración 007) + columna `source_note_id` en `maps` (migración 008) + columna `note_id` en `flashcards` (migración 009 o incluida directamente en la 003).

### Alternativas consideradas

1. **Mantener el mapa como producto principal** y vender la app como "mapas conceptuales colaborativos con IA" — descartada: narrativa floja vs ChatGPT, depende solo del "wow" visual.
2. **Cambiar de dominio entero** (p. ej. asistente conversacional o generador de resúmenes) — descartada: a menos de 8 días de la entrega, tirar 25 archivos commiteados es suicidio académico.
3. **Reordenar prioridades hacia Comunidad** (mapas públicos + likes) en lugar de hacia Apuntes — descartada: la Comunidad sí es vistosa en demo pero no resuelve la pregunta de "¿por qué construir el mapa?". Apuntes sí.
4. **Sólo añadir resumen/quiz como vistas adicionales del mapa** sin tabla `notes` — descartada: el apunte original (PDF, texto largo) tiene valor por sí mismo; convertirlo en metadato de un mapa pierde la fuente.

### Consecuencias

- **Positivas:**
  - Narrativa con valor real medible: combina **comprensión** (mapa) y **retención** (flashcards SM-2). Bibliografía sólida (Novak, Ebbinghaus, SuperMemo/Anki).
  - El mapa queda justificado como paso intermedio editable, no como producto final indefendible.
  - La capa social (Fase Comunidad) tiene más sentido: compartes el mapa **derivado de tus apuntes**, no un mapa hecho a mano sin contexto.
  - IA local (Ollama gpt-oss:20b) refuerza el ángulo de privacidad (apuntes nunca salen del PC del estudiante) y sostenibilidad (RA4 1708190): cero coste por consulta, modelo open-weights.
- **Negativas / trade-offs:**
  - Añade ~12-17h de trabajo (Fase Notes N0-N5). En el tiempo restante hay que descartar features menos defendibles (Quizzes, undo, comunidad full).
  - Requiere instalar `Smalot/PDFParser` vía Composer (primera dep PHP del proyecto). ADR-07 documentará la elección cuando se ejecute la fase.
  - El dashboard pierde su rol como home y queda como placeholder hasta que se implementen estadísticas.
- **Línea futura:** quizá merezca la pena permitir adjuntar apuntes a mapas existentes (no solo generar mapa desde apunte), para que el flujo sea bidireccional.

### Referencias

- [`docs/notes-plan.md`](./notes-plan.md) — plan completo con BD, backend, frontend, IA, defensa.
- [`docs/database.md`](./database.md) §3.4 — esquema `notes`.
- [`CLAUDE.md`](../CLAUDE.md) §1 — narrativa actualizada.
- [`Gemini.md`](../Gemini.md) §3 — `notes` añadida a la lista de features.

---

## ADR-07 — Cambio de proveedor IA: Gemini API en lugar de Ollama+PDFParser

- **Fecha:** 2026-04-26
- **Estado:** aceptado (integración diferida a la rama `ia-integration`)

### Contexto

La Fase Notes (ADR-06) se planificó originalmente con **Ollama local** (`gpt-oss:20b`) como proveedor IA y **Smalot/PDFParser** vía Composer para extraer el texto de los PDFs antes de mandárselo al modelo. Ese diseño hereda la decisión de la Fase Maps M4, donde `ai/expand` ya funciona contra Ollama.

A los pocos días de empezar la Fase Notes, el alumno reevalúa la elección por dos razones prácticas:

1. **Latencia y calidad sobre apuntes largos.** `gpt-oss:20b` con un prompt largo (apuntes truncados a ~6 000 chars) genera respuestas en 10-30 s en la GPU local del alumno. Los modelos cloud ofrecen latencias menores y mejor seguimiento del schema JSON (`format:'json'` no garantiza schema, sólo "es JSON").
2. **PDFs multimodales nativos.** Gemini API acepta PDFs como input directo (multimodal), eliminando la necesidad de un parser server-side. Ahorra una dependencia Composer, una capa de manipulación de texto y un modo de fallo (PDFs escaneados con OCR no resoluble por Smalot).

A la vez, Ollama tenía dos puntos defensivos fuertes que Gemini pierde:
- **Privacidad** — los apuntes nunca salen de la máquina del alumno.
- **Coste cero por consulta** — sin facturación por token.

### Decisión

**Migrar la generación IA basada en apuntes (`POST ai/from-note`) a Gemini API**, dejando Ollama operativo para los endpoints existentes (`ai/expand` en Maps M4 y `flashcards/generate-from-map` en Flashcards F5) hasta que se decida si conviene unificar todo en un solo proveedor.

**La integración no se ejecuta en la rama `NotesNewZone`** que cierra el MVP de la fase Notes. Se delega a una rama futura `ia-integration` para que el cierre de Notes (CRUD + UI + visor PDF) no dependa de tener una API key Gemini válida ni de gestionar errores de cuota durante el desarrollo.

Detalle de los pendientes técnicos en [`docs/notes-plan.md`](./notes-plan.md) §10 (lista canónica para la rama futura).

### Alternativas consideradas

1. **Mantener Ollama + Smalot/PDFParser** (plan original) — descartada: pérdida de calidad sobre apuntes largos, dependencia de un parser PHP que falla en PDFs escaneados, y dependencia operativa de tener Ollama corriendo en la máquina local del alumno también en defensa.
2. **OpenAI GPT-4o** — descartada: coste por token sensiblemente mayor que Gemini Flash a calidad equivalente para la tarea (extracción estructurada de texto académico), y disponibilidad de cuota gratuita más generosa en Gemini para un proyecto académico.
3. **Anthropic Claude vía API** — descartada: el alumno no dispone de cuenta de pago al cierre de la fase; defendible pero no operativa en el plazo.
4. **Coexistencia total** (Ollama para todo lo no-multimodal, Gemini sólo para `ai/from-note`) — abierta: es la opción aceptada en MVP. La rama `ia-integration` decidirá si refactoriza Maps/Flashcards también a Gemini o conserva Ollama por argumento de privacidad/sostenibilidad.

### Consecuencias

- **Positivas:**
  - Multimodal nativo: el backend deja de extraer texto del PDF y se ahorra `Smalot/PDFParser`. La fase Notes cierra sin nuevas dependencias Composer.
  - Mejor calidad esperada de la respuesta sobre apuntes largos.
  - Defensa cloud más coherente: el RA1 0614 (despliegue cloud) encaja con un proveedor IA cloud sin exigir Ollama-as-a-service.
- **Negativas / trade-offs:**
  - Pérdida del argumento de **privacidad** ("los apuntes no salen de tu PC"). El alumno deberá explicarlo en la memoria como una concesión consciente y, si es relevante, mencionar que la arquitectura permite volver a Ollama en producción cambiando una variable de entorno.
  - Coste **per-consulta** distinto de cero. Para volumen TFG es despreciable, pero el argumento de "sostenibilidad cero coste" del plan original (RA4 1708190) se debilita; la memoria reorientará la sostenibilidad hacia "modelo elegido por eficiencia energética per-token".
  - Dependencia de que `GEMINI_API_KEY` esté presente en el `.env` de producción y no expire/se rote sin avisar.
- **Línea futura:**
  - Posible refactor uniforme a un único `AIClient` agnóstico de proveedor (con un adaptador Ollama y otro Gemini) si la app crece más allá del TFG.

### Referencias

- [`docs/notes-plan.md`](./notes-plan.md) §2.3 (decisión documentada al cambiar el alcance de N1) y §10 (pendientes para la rama).
- ADR-06 (origen de la fase Notes; este ADR-07 sustituye su mención de Smalot/PDFParser).
- Ollama (`gpt-oss:20b`) — sigue cableado en `backend/API/services/AIClient.php` para `ai/expand` y `flashcards/generate-from-map`.

---

## ADR-08 — *(siguiente decisión)*

*Cuando tomes la siguiente decisión técnica no trivial, añade aquí. Ejemplos pendientes: proveedor cloud (AWS vs VPS+Vercel) y forma del despliegue, estrategia de paginación del feed Comunidad si crece, decisión sobre si la rama `ia-integration` unifica todo en Gemini o mantiene Ollama coexistiendo.*
