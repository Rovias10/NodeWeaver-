# Criterios DAW — Proyecto Final 2

> Extracto del PDF oficial *"Criterios para evaluar Proyecto intermodular 2"* + mapping concreto a archivos de StudyWeaver.

---

## Tabla resumen

| Módulo | RA | Criterio (carril Vanilla/React, no Vue) | Cómo lo cumple StudyWeaver |
| --- | --- | --- | --- |
| **0612 Desarrollo web cliente** | RA7 | Aplicaciones Web dinámicas con comunicación asíncrona cliente-servidor | React 18 + `fetch` con JWT contra API REST. SPA con React Router. |
| **0613 Desarrollo web servidor** | RA6 | Acceso a almacenes de datos con seguridad e integridad | PHP PDO + prepared statements + `password_hash` + JWT + try/catch |
| **0613 Desarrollo web servidor** | RA8 | Web dinámica con frameworks/lenguajes de servidor | PHP MVC casero + integración con servicios externos (OpenAI/Gemini) |
| **0613** | (transversal) | Generar con MVC | Backend Headless MVC: M, C, Routing |
| **0614 Despliegue** | RA1, RA2 | Implantación + configuración segura | Despliegue cloud con HTTPS y variables de entorno |
| **0615 Diseño interfaces** | RA1, RA2 | Wireframe Figma + responsive + Grid Layout | Mockups Figma 3 devices + Tailwind con `grid` |
| **CVOPS190** (optativo) | RA3 | Cloud + redes virtuales (NO evaluable) | Bonus si despliegue es AWS |
| **1665190 Digitalización** | RA3 | Identificar niveles cloud + despliegue cloud | Capítulo en memoria + URL pública |
| **1708190 Sostenibilidad** | RA4 | Ecodiseño + ciclo de vida | Capítulo en memoria |

---

## Mapping detallado RA → archivo

### 0612 RA7 — Web cliente asíncrono (React SPA)

| Criterio | Archivo / componente | Justificación |
| --- | --- | --- |
| SPA Vanilla/React | `frontend/src/App.jsx`, `main.jsx` | React Router con rutas anidadas y lazy loading |
| Comunicación asíncrona | `frontend/src/api/client.js` | Wrapper `fetch` con `async/await`, JWT y manejo 401 |
| UI dinámica | `frontend/src/features/maps/MapView.jsx` | Editor reactivo Drawflow con auto-save y feedback |
| Hooks defendibles | `useState`, `useEffect`, `useContext` | Sin Redux/Zustand: hooks nativos explicables |

### 0613 RA6 — Acceso seguro a datos

| Criterio | Archivo | Justificación |
| --- | --- | --- |
| Prepared statements | `backend/MODEL/*.php` | `prepare()` + `execute([...])` sin concatenar SQL |
| Hashing passwords | `backend/MODEL/User.php`, `authController.php` | `password_hash(...,PASSWORD_BCRYPT)` + `password_verify(...)` |
| Tokens stateless | `backend/DATA/jwt.php` | JWT HS256 firmado, expiración configurable |
| Control de errores | `backend/API/controllers/*.php` | `try/catch` + `http_response_code` + JSON con `success` |
| Validación inputs | controllers (cabecera de cada método) | `isset`, `filter_var`, longitudes mínimas/máximas |

### 0613 RA8 — Web dinámica + frameworks/lenguajes servidor

| Criterio | Archivo | Justificación |
| --- | --- | --- |
| Lenguaje de servidor | PHP 8 nativo, no framework pesado | MVC casero defendible línea a línea |
| Servicio propio | `backend/API/controllers/MapController.php` | CRUD completo de mapas |
| Servicio externo | `backend/API/services/AIClient.php` | Cliente HTTP a OpenAI o Gemini |
| Servicio externo bonus | `backend/DATA/sendgrid.php` | Envío transaccional de emails |

### 0613 — MVC

| Capa | Carpeta | Notas |
| --- | --- | --- |
| Model | `backend/MODEL/` | Acceso a datos puro, PDO, sin lógica de negocio |
| Controller | `backend/API/controllers/` | Validación + delegación a model + JSON response |
| Routing | `backend/API/router/api.php` + `Router.php` | Mapeo URL → controller method |
| (View) | `frontend/src/` | La V está en el cliente (Headless MVC) |

### 0614 RA1+RA2 — Despliegue cloud

| Criterio | Implementación | Evidencia |
| --- | --- | --- |
| Implantación | Cloud (proveedor concreto definido en `docs/decisiones.md`) | URL pública |
| Configuración segura | HTTPS, variables `.env` no expuestas, CORS restrictivo | Capítulo despliegue de memoria |
| Acceso a datos seguro | MySQL con usuario no-root, conexión por socket o TLS | Capítulo despliegue |

### 0615 RA1+RA2 — Diseño interfaces

| Criterio | Implementación | Evidencia |
| --- | --- | --- |
| Wireframe Figma | Archivo Figma con frames | Anexo memoria |
| 3 devices | Frames 1440 (desktop) / 768 (tablet) / 375 (mobile) | Anexo memoria |
| Componentes Figma | Button, Input, Card, Modal, NavBar | Archivo Figma |
| Responsive | Tailwind breakpoints `sm:`, `md:`, `lg:` | `frontend/src/**/*.jsx` |
| Grid Layout | Clases `grid grid-cols-X` y `grid-template-...` | `frontend/src/pages/*.jsx` |

### 1665190 RA3 — Cloud / niveles

| Criterio | Cubierto por |
| --- | --- |
| Identificar niveles cloud | Capítulo en memoria: explicar IaaS / PaaS / SaaS y cuál usa StudyWeaver |
| Funciones cloud | Procesamiento (backend PHP), almacenamiento (MySQL gestionada), ejecución de aplicaciones (frontend estático en CDN) |

### 1708190 RA4 — Sostenibilidad

Capítulo dedicado en la memoria. Ángulos a cubrir:

- **Ecodiseño**: reutilización de código (componentes), eficiencia de queries (sin N+1), bundle frontend optimizado.
- **Ciclo de vida**: dev → staging → producción → mantenimiento → deprecación. Documentar en memoria.
- **Energía renovable**: si el proveedor cloud usa energía renovable (la mayoría de los grandes ya lo declaran), citarlo.
- **Reducción de huella**: caching, lazy loading, comprimir respuestas JSON con gzip, evitar polling innecesario.

---

## Checklist final pre-entrega

Marca cada uno antes del 3 de mayo:

- [ ] Frontend React 18 con SPA + React Router (RA7)
- [ ] Backend PHP MVC con M, C, Routing claros (RA8 + transversal)
- [ ] PDO + prepared statements en TODOS los modelos (RA6)
- [ ] JWT funcionando con expiración (RA6)
- [ ] Try/catch en todos los controllers (RA6)
- [ ] Servicio externo integrado (OpenAI/Gemini) (RA8)
- [ ] Despliegue cloud con HTTPS (RA1, RA2 de 0614)
- [ ] Variables de entorno NO commiteadas (RA2 de 0614)
- [ ] Figma con frames a 1440/768/375 (RA1, RA2 de 0615)
- [ ] Componentes Figma creados (RA1 de 0615)
- [ ] Responsive en todas las páginas (RA2 de 0615)
- [ ] Uso de Grid Layout demostrable (RA2 de 0615)
- [ ] Capítulo de cloud en memoria con niveles IaaS/PaaS/SaaS (1665190 RA3)
- [ ] Capítulo de sostenibilidad en memoria (1708190 RA4)
- [ ] Memoria con todos los capítulos (introducción, análisis, diseño, implementación, despliegue, sostenibilidad, pruebas, conclusiones)
- [ ] README en repo con instrucciones de instalación y URL de producción
