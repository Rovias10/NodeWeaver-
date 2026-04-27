# Documentación del frontend — StudyWeaver

> Capítulo orientado a la memoria del Proyecto Final 2 DAW. Describe **qué hace cada archivo del frontend**, **por qué está donde está** y **cómo se llaman entre sí** durante una interacción del usuario. Pensado para que cualquier evaluador (o cualquier desarrollador que aterrice por primera vez) pueda recorrer la SPA de arriba a abajo sin tener que abrir el código.
>
> Stack: React 18 + Vite + Tailwind CSS 4 + React Router 7 (modo Library/Data). Sin frameworks meta tipo Next.js, sin Redux/Zustand, sin React Query. SPA pura que consume la API REST PHP del backend mediante un wrapper de `fetch` propio.

---

## 1. Visión de conjunto

El frontend de StudyWeaver implementa una **SPA "Fetch & Render"**: el navegador descarga un único bundle estático (HTML shell + JS + CSS) y a partir de ahí React monta el árbol de componentes, hace `fetch` con JWT contra la API PHP y pinta JSX en función del estado. El backend **nunca** envía HTML al cliente; sólo JSON. Este paradigma se adoptó tras pivotar desde NodeWeaver (que era *Fetch & Inject* con `innerHTML`) y está documentado en ADR-04.

```
Navegador
   │
   ▼
public/index.html              ← shell estático servido por Vite/CDN
   │ (Vite inyecta el bundle)
   ▼
src/main.jsx                   ← entry de React, monta <StrictMode><App />
   │
   ▼
src/App.jsx                    ← AuthProvider → NotificationProvider → RouterProvider
   │
   ▼
src/router.jsx                 ← createBrowserRouter (rutas públicas + privadas)
   │
   ├─→ Rutas públicas: LandingPage, LoginPage, RegisterPage, ...
   │
   └─→ Rutas privadas (envueltas en <AppLayout>):
        │
        ├─→ ProtectedRoute (revisa AuthContext.isAuthenticated)
        │
        ├─→ AppNavbar + AppSidebar/MobileDrawer
        │
        └─→ <Outlet /> → página feature (MapsListPage, NotePreviewPage, …)
                │
                ├─→ feature/services/<x>Service.js
                │      └─→ api/client.js (apiGet/apiPost/apiUpload/apiDownload)
                │              ├─→ adjunta Authorization: Bearer <jwt>
                │              └─→ fetch → backend PHP → JSON
                │
                └─→ setState → React re-renderiza el subárbol
```

Cada capa tiene una **única responsabilidad**:

| Capa | Carpeta | Qué hace | Qué NO hace |
| --- | --- | --- | --- |
| Entry point | `frontend/index.html`, `src/main.jsx` | Montar React en `#root` | Lógica de negocio |
| Raíz de la app | `src/App.jsx` | Componer providers globales | Definir rutas |
| Router | `src/router.jsx` | Mapear URL → página | Comprobar sesión |
| Auth | `src/auth/` | Estado global de sesión, `<ProtectedRoute>`, hook `useAuth` | Validar credenciales (eso es del backend) |
| API | `src/api/` | Wrapper único de `fetch` con JWT, catálogo de endpoints | Conocer la forma de los datos de cada feature |
| UI base | `src/ui/` | Botón, Card, Input, Spinner, toasts, fondo ambiental | Lógica de feature |
| Utils | `src/utils/` | Helpers puros (decodificar JWT, tiempo relativo, validar email) | Tocar el DOM, hacer `fetch` |
| Features | `src/features/<feature>/` | Una zona del producto (auth, maps, notes…) con sus componentes, hooks, services y pages | Romper aislamiento — cada feature se importa por su index público |
| Pages | `src/features/<feat>/pages/` o `src/pages/` | Componentes de ruta: orquestan estado + servicios + UI | Ser reutilizables |
| Services | `src/features/<feat>/services/` | Llamadas tipadas a la API (`listMaps`, `saveFlashcard`…) | Manipular el DOM o React state |
| Hooks | `src/features/<feat>/hooks/` | Lógica reutilizable (`useMapAutoSave`, `useReviewKeybindings`) | Renderizar JSX |
| Components | `src/features/<feat>/components/` | Piezas visuales de la feature (cards, dialogs, toolbars) | Conocer rutas o servicios externos a su feature |

**Anti-stack confirmado** (decisión del módulo 0612 RA7 + ADRs):

- Sin Vue, sin Angular, sin Svelte. Sólo React 18.
- Sin Next.js / Remix. SPA estática build-time, sin SSR.
- Sin Redux / Zustand / Recoil / RTK. Sólo `useState` + `useContext`.
- Sin React Query / SWR. Cada page hace su `useEffect` + `useState`.
- Sin axios. La API nativa `fetch` es suficiente.
- Sin librerías de fechas (`dayjs`, `date-fns`). Se usa `Intl.RelativeTimeFormat`.
- Sin librerías de iconos JS pesadas. Sólo Font Awesome por CDN (clases CSS).
- Una única dependencia visual de terceros: **Drawflow** (`drawflow ^0.0.60`), encapsulada en un wrapper de un solo archivo.

---

## 2. Punto de entrada y bootstrap

### 2.1. `frontend/index.html`

Shell estático servido por Vite en desarrollo y por el hosting estático en producción. Su responsabilidad es trivial:

- Declarar el `<div id="root"></div>` donde React montará el árbol.
- Cargar el bundle generado por Vite (`<script type="module" src="/src/main.jsx">`, que en build se convierte en un asset hasheado).
- Definir metadatos básicos (título, lang, viewport, favicon, fuentes Font Awesome por CDN).

Mantenerlo así de minimalista permite que **el backend nunca tenga que renderizar HTML**: el cliente recibe siempre el mismo shell y es React quien decide qué pintar a partir de la URL.

### 2.2. `frontend/src/main.jsx`

Entry de React. Tres líneas relevantes:

1. `import './styles/index.css'` — carga Tailwind 4 + tokens de la paleta "Cielo Claro" (paper, brand-200/sky-500, sun-300, coral-400, ink). Tailwind 4 funciona sin `tailwind.config.js`: los tokens viven en `@theme` dentro del propio CSS.
2. `createRoot(document.getElementById('root'))` — API moderna de React 18 (concurrente).
3. Render con `<StrictMode>` envolviendo a `<App />`. StrictMode duplica el `useEffect` en desarrollo, lo que ha forzado a que el wrapper de Drawflow tenga un guard explícito (ver §7.5).

### 2.3. `frontend/src/App.jsx`

Componente raíz. Su única responsabilidad es **componer providers globales** en el orden correcto:

```
<AuthProvider>            ← estado de sesión (usuario, token, isReady)
  <NotificationProvider>  ← sistema de toasts globales
    <RouterProvider />    ← árbol de rutas (React Router 7)
  </NotificationProvider>
</AuthProvider>
```

El orden importa: `AuthProvider` va fuera porque tanto las páginas como el sistema de notificaciones pueden necesitar saber si el usuario está autenticado, y porque el listener global `auth:logout` (disparado por `apiClient` al recibir un 401) tiene que estar montado antes de que cualquier página haga su primer `fetch`.

### 2.4. `frontend/src/router.jsx`

**Mapa explícito de rutas** del proyecto. Usa `createBrowserRouter` (modo "Library / Data" de React Router v7), que es la API recomendada y permite anidar layouts compartidos sin rebozar cada página en un wrapper a mano.

Las rutas se agrupan en dos bloques:

**Públicas (sin shell, sin sesión):**

| Ruta | Componente | Para qué |
| --- | --- | --- |
| `/` | `LandingPage` | Página comercial pública. |
| `/login`, `/registro` | `LoginPage`, `RegisterPage` | Entrada a la app. |
| `/recuperar` | `ForgotPasswordPage` | Solicita email de reset. |
| `/reset?token=...` | `ResetPasswordPage` | Restablece la contraseña con el token recibido por email. |
| `/confirmar?token=...` | `ConfirmAccountPage` | Confirma la cuenta tras el registro. |
| `/esperando-confirmacion` | `WaitConfirmationPage` | Pantalla informativa post-registro. |

**Privadas (anidadas bajo `<AppLayout>`, requieren sesión):**

| Ruta | Componente |
| --- | --- |
| `/dashboard` | `DashboardPage` |
| `/apuntes`, `/apuntes/:id` | `NotesListPage`, `NotePreviewPage` |
| `/mapas`, `/mapas/:id` | `MapsListPage`, `MapEditorPage` |
| `/flashcards`, `/flashcards/repaso` | `FlashcardsListPage`, `ReviewSessionPage` |
| `/comunidad`, `/comunidad/mapa/:id`, `/comunidad/favoritos`, `/u/:userId` | `CommunityFeedPage`, `PublicMapPage`, `MyFavoritesPage`, `PublicProfilePage` |
| `/perfil` | `ProfilePage` |
| `*` | `NotFoundPage` (404 amigable). |

El uso de query string para los tokens (`?token=...` en `/reset` y `/confirmar`) es deliberado: los emails que envía SendGrid ya están maquetados con esa forma de URL, y mantenerla evita romper enlaces antiguos.

### 2.5. `frontend/vite.config.js`

Configuración mínima de Vite:

- **Plugin oficial de React** (`@vitejs/plugin-react`) para Fast Refresh y JSX.
- **Plugin oficial de Tailwind 4** (`@tailwindcss/vite`) — no hay `tailwind.config.js`, los tokens del sistema "Cielo Claro" viven en `@theme` dentro de `src/styles/index.css`.
- **Alias `@` → `src/`** para imports cortos y refactor seguro (`import { Card } from '@/ui/Card.jsx'`). Este alias es la única convención adicional sobre Vite por defecto.
- **Servidor en el puerto 5173** con `strictPort: true`. El puerto está hardcodeado a propósito: es el origen permitido en `backend/DATA/cors.php` durante el desarrollo. Si Vite se levanta en otro puerto, las llamadas a la API son rechazadas por CORS — eso obliga a no abrir dos instancias por error y deja claro de dónde tiene que venir el frontend.

---

## 3. Capa API (`src/api/`)

Plomería compartida entre todas las features. Ningún componente toca `fetch` directamente: siempre pasa por este wrapper.

### 3.1. `src/api/client.js`

Wrapper único de `fetch`. Sus responsabilidades, en orden:

1. **Componer la URL** a partir de `VITE_API_BASE` (definido en `.env`) más el query string `?route=<ruta>`. Cualquier parámetro extra (id, filtros, paginación) se concatena con `&clave=valor` correctamente encodeado. El backend espera exactamente este formato (`api.php` lee `$_GET['route']`).
2. **Adjuntar `Authorization: Bearer <token>`** si hay JWT en `localStorage` bajo la clave `sw_token`. La lectura va en un `try/catch` porque el modo privado de Safari y Firefox bloquea `localStorage` y romperíamos la app entera por algo recuperable.
3. **Serializar el body como JSON** automáticamente (excepto en `apiUpload`, que envía `FormData` para archivos).
4. **Deserializar la respuesta como JSON** y propagarla al caller. Si el backend devuelve algo que no es JSON, lanzamos un error explícito ("Respuesta no-JSON del servidor"): ese caso indica un fallo grave (5xx con HTML, configuración incorrecta) y queremos que sea visible.
5. **Disparar el evento global `auth:logout`** cuando la respuesta sea `401`. `AuthContext` está suscrito a ese evento y limpia la sesión + redirige a `/login`. De esta forma, **cualquier** llamada que reciba 401 cierra la sesión sin que cada página tenga que duplicar la lógica.

Cuatro funciones públicas:

| Función | Verbo | Body | Para qué |
| --- | --- | --- | --- |
| `apiGet(route, params?, signal?)` | `GET` | — | Lecturas. `params` es un objeto `{clave: valor}` que se concatena al query string. |
| `apiPost(route, body?, signal?)` | `POST` | `application/json` | Mutaciones (login, save, delete, like…). |
| `apiUpload(route, formData, signal?)` | `POST` | `multipart/form-data` | Subidas de archivos (avatar, PDF). |
| `apiDownload(route, params?, signal?)` | `GET` | — | Descarga binaria. Devuelve `{ success, blob }` en lugar de JSON. Usado para el visor de PDFs. |

`signal` es un `AbortSignal` opcional para cancelar la petición desde un `useEffect` cuando el componente se desmonta antes de que llegue la respuesta. No todas las páginas lo aprovechan, pero las que lo hacen (p. ej. el feed) evitan el clásico warning "*can't perform a React state update on an unmounted component*".

`setToken(token)` y la constante `TOKEN_STORAGE_KEY` son la API que `AuthContext` usa para persistir/limpiar el JWT. Centralizar el nombre de la clave en un único módulo evita los typos de referenciar `'sw_token'` literal en dos sitios.

`apiDownload` merece nota aparte: no llama a `.json()` en el camino de éxito (sería un PDF, fallaría); pero **sí** intenta parsear JSON si `response.ok` es `false`, porque el backend emite los errores como JSON incluso para los endpoints binarios (ver `noteController::file`). De esta forma el caller puede hacer `if (!res.success) notify(res.message)` con el mismo código que con cualquier otro endpoint.

### 3.2. `src/api/endpoints.js`

**Catálogo central de rutas**. Constantes agrupadas por feature para que los services no tipeen strings sueltos por todo el código. Si mañana el backend cambia a URLs limpias (`/api/maps/list` en vez de `?route=maps/list`), basta con tocar este archivo.

```js
export const ENDPOINTS = {
  auth:        { login, register, forgotPassword, resetPassword, confirmAccount, google },
  profile:     { me, update, password, avatar, remove },
  maps:        { list, get, save, remove },
  ai:          { expand, fromNote },
  flashcards:  { list, due, save, review, remove, removeByNote, generateFromMap },
  notes:       { list, get, file, upload, remove },
  community:   { feed, map, profile, profileMaps, favorites, like, comments, comment, commentDelete },
};
```

Hay un mapeo 1:1 con el `backend/API/router/api.php` — la idea es que si abres ambos archivos en paralelo veas exactamente las mismas rutas.

---

## 4. Capa Auth (`src/auth/`)

### 4.1. `src/auth/AuthContext.jsx`

Estado global de autenticación. Es un Context clásico (sin Redux, sin Zustand) que expone:

```js
{
  user,                  // perfil del usuario, persistido en localStorage
  token,                 // JWT
  isAuthenticated,       // boolean (token presente y no caducado)
  isReady,               // false hasta que se haya rehidratado desde localStorage
  login(token, user),    // persiste y entra
  logout(),              // limpia y sale
  updateUser(partial),   // mutación parcial (p. ej. tras editar perfil)
}
```

Política implementada:

- **Rehidratación al montar**: lee `sw_token` de `localStorage`. Si el token ha caducado (lo comprueba `isJwtExpired`, ver §6.1) limpia la sesión silenciosamente. `isReady` pasa a `true` cuando la decisión está tomada — `<ProtectedRoute>` espera a esa señal antes de redirigir, evitando un flash a `/login` en el primer paint.
- **Listener global `auth:logout`**: el wrapper `apiClient` lanza este evento cuando recibe 401, y aquí lo escuchamos para cerrar sesión sin que cada page tenga que detectar 401 a mano. Hay una `useRef` que evita duplicar el listener bajo HMR de Vite.
- **Persistencia mínima**: token y user en `localStorage`. No se guarda nada más (no hay refresh tokens, no hay sesiones server-side: el JWT con `exp` es suficiente para 8 días de timebox). El payload del user permite que el shell pinte el nombre y el avatar sin esperar a `profile/me`.

### 4.2. `src/auth/useAuth.js`

Hook diminuto que devuelve `useContext(AuthContext)` con un `throw` defensivo si se llama fuera del Provider. Esto convierte un bug silencioso (componente montado sin auth) en un error claro durante desarrollo.

### 4.3. `src/auth/ProtectedRoute.jsx`

Wrapper de rutas privadas. Tres caminos:

1. Si `isReady` aún es `false` (rehidratación en curso) → renderiza un placeholder vacío con `aria-busy="true"` para no provocar un parpadeo visual.
2. Si `!isAuthenticated` → `<Navigate to="/login" replace>` conservando la ubicación original en `location.state.from`. Tras login, `LoginPage` lee ese state y vuelve al destino que el usuario intentaba abrir.
3. Si hay sesión → renderiza los `children`.

Se usa una sola vez en `AppLayout` envolviendo el `<Outlet />`, así que **todas** las rutas anidadas bajo `AppLayout` están protegidas automáticamente.

---

## 5. Capa UI base (`src/ui/`)

Componentes visuales reutilizables de bajo nivel. Vienen del rediseño "Cielo Claro" (Fases 0–4 cerradas) y se importan desde cualquier feature.

### 5.1. `src/ui/Button.jsx`

Botón base con **5 variantes** y 2 tamaños. La variante decide la paleta:

- `primary` — gradient marca → sol, CTA principal.
- `ghost` — superficie cristal con borde sutil, acción secundaria.
- `google` — blanco con icono de Google, único en pantallas de auth.
- `danger` — coral, acciones destructivas.
- `success` — verde esmeralda, "Fácil" en la sesión de repaso de flashcards.

Se construye con `forwardRef` para que las páginas puedan poner foco programático (ej. al abrir un diálogo). La prop `isLoading` muestra un spinner inline y deshabilita el botón. Las clases de Tailwind están concatenadas a mano (sin `clsx` ni `cva`, defendible por timebox).

### 5.2. `src/ui/Card.jsx`

Tarjeta de superficie cristal — el patrón visual recurrente del sistema "Cielo Claro": fondo translúcido con `backdrop-blur-2xl`, borde sutil y sombra suave. Antes del rediseño, ese conjunto de clases se repetía en cada HTML legacy; centralizarlo en `<Card>` significa que ajustar la translucidez o el radio se hace en un único punto.

Props minimalistas: `as` (etiqueta HTML), `padded`, `elevated` (cambia la sombra a "glow brand"), `className` para overrides. Sin variantes preconfiguradas: si una pantalla necesita una card especial, compone clases en `className` en vez de inflar la API.

### 5.3. `src/ui/Input.jsx`

Input controlado con etiqueta, icono opcional (Font Awesome), mensaje de error y `rightAddon` (ReactNode al fondo del input, usado para el toggle de mostrar/ocultar contraseña).

Detalles relevantes para accesibilidad: usa `useId` para vincular `<label>` ↔ `<input>` con un id único, propaga `aria-invalid` cuando hay error y conecta el mensaje de error vía `aria-describedby`. Esto cubre los criterios de accesibilidad implícitos en la interfaz del módulo 0615.

### 5.4. `src/ui/Spinner.jsx`

Spinner circular minimalista basado en la animación `spin` nativa de Tailwind. Tamaño en píxeles, `aria-label` configurable. Sin SVG ni dependencias.

### 5.5. `src/ui/AmbientBackground.jsx`

Capa decorativa global. En NodeWeaver cada HTML repetía 6 `<div>` `fixed inset-0` con glows; aquí está encapsulado en un único componente que se monta una vez por raíz visible (`LandingPage` y `AppLayout`).

Cuatro capas apiladas con z-index negativo:

1. Fondo `bg-paper` sólido.
2. Gradiente vertical `brand-200/40 → sun-200/20 → paper` que da sensación de cielo.
3. Patrón de grid azul cielo muy suave.
4. Tres glows redondos (`sun-300/30`, `brand-400/25`, `coral-400/20`) en posiciones fijas y con `blur-[140px]`.

Al ir todas con `pointer-events-none`, no interfieren con clics ni scroll. `aria-hidden="true"` evita que los lectores de pantalla las anuncien.

### 5.6. `src/ui/NotificationProvider.jsx` + `src/ui/useNotification.js`

Sistema único de toasts. Sustituye al `showNotification()` duplicado en cada HTML legacy. Cualquier componente puede llamar a `useNotification().notify(mensaje, tipo)` y un toast aparece en la esquina superior derecha durante 3,5 s (configurable por prop).

Tres tipos: `success`, `error`, `info`. Cada uno tiene su paleta y su icono Font Awesome predefinido. La región `<div aria-live="polite" aria-atomic="true">` informa a los lectores de pantalla del nuevo mensaje sin secuestrar el foco.

Implementación: `useState` con la lista de toasts activos + un `Map` de timers en `useRef` para poder cancelar el auto-dismiss si el usuario cierra manualmente un toast antes de que expire.

---

## 6. Capa Utils (`src/utils/`)

Helpers puros. Sin React, sin DOM, sin `fetch`. Cualquier función de aquí es testeable directamente.

### 6.1. `src/utils/jwt.js`

Lectura del payload de un JWT en cliente. **No verifica firma** — eso corre en el backend con HS256 (`backend/DATA/jwt.php`). Aquí sólo decodificamos para mirar `exp` y detectar tokens caducados antes de hacer la llamada.

Dos funciones:

- `decodeJwtPayload(token)` — separa el JWT por puntos, normaliza base64url → base64, decodifica con `atob` y parsea como JSON. Devuelve `null` si el token no tiene la forma esperada.
- `isJwtExpired(token)` — compara `payload.exp * 1000` con `Date.now()`. Defensivo: si no hay payload o no hay `exp`, considera el token caducado para forzar el flujo seguro.

`AuthContext` usa `isJwtExpired` en la rehidratación para no aceptar tokens viejos almacenados en `localStorage` sin pedir nueva autenticación.

### 6.2. `src/utils/validators.js`

Dos validaciones cliente-side: `isEmail(value)` (regex pragmática RFC simplificada) y `passwordStrength(value)` (puntaje 0–4). El propio archivo deja una nota: **la validación final siempre va en backend (0613 RA6)**; en cliente sólo evitamos roundtrips inútiles y damos feedback inmediato.

### 6.3. `src/utils/relativeTime.js`

Devuelve una cadena tipo "hace 3 días" / "ahora mismo" / "hace 2 meses" en castellano usando `Intl.RelativeTimeFormat` (nativo del navegador desde 2019). Sin dependencias externas tipo `dayjs` o `date-fns` — defendible ante tribunal y consistente con la regla "no introduzcas librerías que el alumno no pueda explicar".

Detalle: las fechas que viajan desde el backend tienen formato MySQL `Y-m-d H:i:s` sin zona horaria, así que el helper hace `String(input).replace(' ', 'T')` antes del `new Date()` para evitar el comportamiento ambiguo de Safari, que rechaza el formato con espacio. Si en el futuro el backend devolviera ISO con `Z`, el parser sigue funcionando.

---

## 7. Capa Features (`src/features/`)

Cada feature es un directorio autocontenido con su `pages/` (componentes de ruta), `components/` (piezas visuales), `hooks/` (lógica reutilizable) y `services/` (llamadas a la API). Las features se importan unas a otras sólo por su superficie pública (componentes y servicios); nada de tocar internals ajenos.

### 7.1. `features/landing/` — Página pública

**Punto de entrada para visitantes sin sesión.** Sustituye al `SERVER/index.html` legacy. No carga `AppLayout` (no necesita shell autenticado).

- `LandingPage.jsx` — orquesta el `AmbientBackground`, la `LandingNav`, las cuatro secciones (`HeroSection`, `FeaturesSection`, `HowItWorksSection`, `CTASection`) y el `LandingFooter`. Es prácticamente un layout.
- `HeroSection.jsx` — bloque principal arriba con el copy comercial ("convierte tus apuntes en herramientas de estudio activas") y un CTA grande hacia `/registro`.
- `FeaturesSection.jsx` + `FeatureCard.jsx` — grid responsive de 3 cards explicando las tres zonas del producto (Apuntes, Mapas, Flashcards).
- `HowItWorksSection.jsx` — pasos numerados del flujo "subir apunte → generar mapa → repasar flashcards".
- `CTASection.jsx` — reclamo final con botones "Crear cuenta" y "Iniciar sesión".
- `HeroIllustration.jsx` — SVG/composición decorativa del hero (sin imágenes externas, todo vive en JSX para que cargue rápido).
- `LandingNav.jsx`, `LandingFooter.jsx` — nav superior pública (logo + login/register) y footer académico (enlaces, mención al TFG).

Toda la zona usa la paleta "Cielo Claro" mediante los tokens de `index.css`.

### 7.2. `features/auth/` — Pantallas de autenticación

Pantallas públicas de entrada. Cada `*Page` corresponde 1:1 con una ruta y se compone con piezas comunes (`AuthCard`, `PasswordInput`, `GoogleButton`, `AuthDivider`).

- `LoginPage.jsx` — POST `auth/login` con `{email, password}`. Tras success, persiste token + user en `AuthContext` y navega a `location.state.from` (la ruta original que disparó la redirección desde `ProtectedRoute`) o a `/dashboard`. Validación inline de email antes de pegar al backend para no gastar un roundtrip si el formato es inválido.
- `RegisterPage.jsx` — POST `auth/register`. Incluye `PasswordStrengthMeter` (medidor 0–5 con etiqueta y color) para que el usuario vea la fuerza mientras escribe. Tras success, navega a `/esperando-confirmacion`.
- `ForgotPasswordPage.jsx` — POST `auth/forgot-password`. Mensaje uniforme tras enviar (el backend lo emite igual exista o no el email — antienumeración).
- `ResetPasswordPage.jsx` — lee `?token=...` de la query string, llama a `auth/reset-password`, confirma con un toast y redirige a `/login`.
- `ConfirmAccountPage.jsx` — equivalente para confirmar cuenta tras registro.
- `WaitConfirmationPage.jsx` — pantalla informativa post-registro: "te hemos enviado un email, revisa tu bandeja". Sin lógica.
- `authService.js` — fachada delgada sobre `apiPost` con cinco funciones (`login`, `register`, `forgotPassword`, `resetPassword`, `confirmAccount`). Cada componente importa la función concreta que usa.
- `AuthCard.jsx` — el contenedor con el formulario centrado, compartido por todas las pantallas auth. Incluye el logo SVG `/Logotipo.svg` arriba (sustituye al wordmark de texto que se repetía en el legacy) o un icono temático opcional.
- `PasswordInput.jsx` — `<Input type="password">` con un toggle de ojito (icono Font Awesome) que conmuta entre `password` y `text`.
- `PasswordStrengthMeter.jsx` — barra horizontal 5 niveles + etiqueta. Score 0..5 con criterios: ≥6 chars (1), ≥10 chars (1), mayúscula (1), número (1), símbolo (1). Mantenemos los criterios específicos de `register.html` legacy en lugar de reusar `passwordStrength` de `utils/validators` (que devuelve 0..4) para no romper la UX original.
- `GoogleButton.jsx` — botón blanco con el logo de Google. Dispara el flujo OAuth contra `auth/google` (`googleLogin` en backend).
- `AuthDivider.jsx` — la línea horizontal con "o" entre el botón Google y el formulario.

### 7.3. `features/shell/` — Layout autenticado

Estructura común a **todas** las páginas privadas. Centralizar el shell aquí significa que añadir una sección a la sidebar es tocar un único archivo.

- `AppLayout.jsx` — punto de entrada del shell. Envuelve todo en `<ProtectedRoute>`, monta `<AmbientBackground>`, pinta la `<AppNavbar>` arriba, la `<AppSidebar>` (desktop) o `<MobileDrawer>` (mobile) a la izquierda y un `<main>` con `<Outlet />` para el contenido de la página actual. Cierra el drawer automáticamente al cambiar de ruta.
- `AppNavbar.jsx` — barra superior fija. Layout en 3 columnas con `flex-1` a izquierda y derecha para que el centro quede ópticamente centrado pase lo que pase con el ancho del texto: hamburguesa (sólo `< lg`) + nombre de la sección actual a la izquierda, **logo SVG de StudyWeaver** (`/Logotipo.svg`, enlace a `/dashboard`) al centro, `UserMenu` a la derecha. La sección actual se calcula resolviendo el `pathname` contra `NAV_ITEMS`. La sección es visible en todos los viewports (antes sólo en desktop).
- `AppSidebar.jsx` — sidebar fija en desktop (`>= lg`). Lista de `<NavItem>` generada desde `NAV_ITEMS`. **Sin logo propio**: el único logo del shell autenticado vive ahora en `AppNavbar` para no duplicar.
- `MobileDrawer.jsx` — drawer deslizable en mobile. Mismo contenido que la sidebar, con el logo SVG en la cabecera. Animado con clases Tailwind. Se abre con la hamburguesa de la navbar.
- `NavItem.jsx` — un ítem de navegación, con icono Font Awesome a la izquierda y label. Aplica un estado "activo" al hacer match con la ruta actual (color marca + fondo translúcido).
- `navItems.js` — **fuente única de verdad** del menú: array con `{to, label, icon, end?}`. Las entradas se renderizan en este orden tanto en desktop como en mobile. Inicio → Mis apuntes → Mis mapas → Flashcards → Comunidad → Mi perfil.
- `UserMenu.jsx` — avatar del usuario (componente `Avatar`) + dropdown con "Mi perfil" y "Cerrar sesión".
- `Avatar.jsx` — pinta la imagen del usuario si tiene `avatar_url`, o sus iniciales en círculo con gradient si no la tiene.
- `useBreakpoint.js` — hook reactivo basado en `window.matchMedia('(min-width: 1024px)')`. Se usa para decidir desktop vs mobile sin listener manual de `resize`. Suscripción y desuscripción correctamente limpiadas para no fugar memoria.
- `PlaceholderPage.jsx` — pantalla genérica "Próximamente" para rutas que aún no tienen su componente real.

### 7.4. `features/dashboard/` — Inicio del usuario

Resumen al entrar a la app. Equivalente al `home.html` legacy.

- `DashboardPage.jsx` — saludo personalizado, grid de `StatsCard` (Mis mapas, Flashcards, Apuntes) y `RecentMapsList`. En la fase actual algunas métricas son mock (definidas en su día durante Fase 3 para validar el shell sin distraerse con endpoints; las que están conectadas leen del backend).
- `StatsCard.jsx` — tarjeta con icono, número grande y label.
- `RecentMapsList.jsx` — listado vertical de los últimos mapas creados/editados, con click → editor.
- `EmptyState.jsx` — componente genérico para "no tienes nada aún" reutilizado por varias listas (mapas, apuntes…). Ilustración + copy + CTA configurable.

### 7.5. `features/maps/` — Editor Drawflow

Zona consolidada (Fase Maps M0–M5 cerrada). Es la pieza con más componentes y la más compleja por el wrapper de Drawflow.

**Pages:**

- `MapsListPage.jsx` — listado del usuario. `loading | error | empty | ok`. CTA "+ Nuevo mapa" hace `POST maps/save` con título por defecto y redirige al editor. Cada `MapCard` tiene "Eliminar" que abre `DeleteMapDialog`. Cumple RA2 0615 con `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
- `MapEditorPage.jsx` — editor de un mapa concreto (`/mapas/:id`). Carga con `getMap(id)`, monta el `DrawflowEditor`, conecta el `useMapAutoSave`, pinta el `MapTitleEditor`, la `EditorToolbar` y el `SaveIndicator`. Orquesta también la generación de flashcards desde el mapa y el toggle público/privado (`ShareToggle` reutilizado de la feature comunidad).

**Components:**

- `DrawflowEditor.jsx` — **wrapper React de la librería `drawflow`**. Drawflow es DOM-imperativo (muta el `#drawflow` añadiendo y quitando nodos sin pasar por React), así que aislamos toda esa "región sucia" en un único componente y exponemos sólo callbacks declarativos: `onChange(json)`, `onExpandRequest(nodeId, data)`. Decisiones técnicas relevantes:

  - **Guard StrictMode**: en desarrollo el efecto se ejecuta dos veces. Sin guard, montaríamos dos editores y duplicaríamos los listeners. La comprobación `if (editorRef.current) return` corta el segundo paso.
  - **Custom node con HTML inline**: la API `addNode(name, ins, outs, x, y, class, data, html)` exige un STRING de HTML (no acepta JSX). Construimos el HTML como template string. React **no** controla ese DOM.
  - **Eventos por delegación**: los botones "+ IA" y "✕" del nodo se enganchan con un único listener en el contenedor que lee `data-action` y resuelve el nodo padre con `closest('.drawflow-node')`. Evita rebindeos al añadir nodos.
  - **Edición inline**: los `<div contenteditable>` para label/hint guardan al perder foco invocando `updateNodeDataFromId` y notifican vía `onChange`.
  - **Modo lectura (`readOnly`)**: para la Fase Comunidad. Pone `editor.editor_mode = 'fixed'`, post-procesa el DOM tras `import()` quitando los `.sw-node__actions` y deshabilitando los `[contenteditable]`. Drawflow no expone API para regenerar el HTML de un nodo importado, así que tocamos el DOM una sola vez.

- `EditorToolbar.jsx` — botones flotantes del editor: añadir nodo, zoom in/out, reset view, generar flashcards, toggle público/privado. Recibe el `editorApiRef` del padre para invocar acciones sobre el editor.
- `MapTitleEditor.jsx` — input inline para editar el título del mapa. Auto-save al perder foco (debounce vía `useMapAutoSave`).
- `MapMetadataDialog.jsx` — diálogo nativo `<dialog>` para editar título y descripción a la vez.
- `MapCard.jsx` — tarjeta del listado, con título, descripción, fecha relativa (`relativeTime`), badge público/privado y botón de eliminar.
- `DeleteMapDialog.jsx` — confirmación destructiva en `<dialog>` con botón danger.
- `SaveIndicator.jsx` — indicador discreto del estado de auto-save (`idle | saving | saved | error`). Lee del `useMapAutoSave`.

**Hooks:**

- `useMapAutoSave.js` — orquesta el auto-save con debounce de 1500 ms. Mantiene un fingerprint (`JSON.stringify(payload)`) del último save para no disparar saves redundantes si el `onChange` se emite sin cambios reales (ruido normal del editor). Expone `requestSave`, `flushSave`, `cancelSave` y los estados `status | lastSavedAt | lastError`. Cancela cualquier save en vuelo al desmontar.
- `useDebouncedCallback.js` — implementación genérica de debounce con `cancel()` y `flush()`. Usa `useRef` para mantener la referencia más reciente de la función sin recrear el wrapper en cada render. Limpieza automática del timer al desmontar.
- `useEditorKeybindings.js` — atajos del editor: **Delete/Backspace** borra el nodo seleccionado (sólo si el foco no está en un campo editable, para no borrar nodos al editar texto), **Ctrl/⌘+S** fuerza el save inmediato. La condición `isEditableTarget` es la pieza clave: sin ella, pulsar Delete escribiendo en un input borraría el nodo entero.

**Services:**

- `mapsService.js` — `listMaps`, `getMap(id)`, `saveMap(payload)`, `deleteMap(id)`. Una función por endpoint.
- `aiService.js` — `expandNode(label, parentContext)` que envía `POST ai/expand` y devuelve `{children: [{label, hint}]}`. Si la IA está caída el backend responde 503 con mensaje canónico.

**Styles:**

- `drawflow-summer.css` — override del CSS por defecto de Drawflow para encajar con la paleta "Cielo Claro" (nodos translúcidos, conexiones brand, hover sun, modo `readOnly` con borde discreto).

### 7.6. `features/notes/` — Apuntes (zona principal)

Zona principal del producto tras el pivote ADR-06: el alumno sube un PDF (o pega texto) y de ahí derivan los demás artefactos (mapa, flashcards) vía IA.

**Pages:**

- `NotesListPage.jsx` — listado de apuntes del usuario. `loading | error | empty | ok`. CTA "Subir apunte" abre `UploadNoteDialog` (tabs PDF / Texto). Click en una `NoteCard` "Abrir" navega a `/apuntes/:id`. Eliminar abre `DeleteNoteDialog` con borrado optimista local. Grid responsive 1/2/3 columnas (RA2 0615).
- `NotePreviewPage.jsx` — vista preview de un apunte. Comportamiento dual:
  - Apunte tipo `text` → muestra `extracted_text` íntegro en `<pre>` con `whitespace-pre-wrap`.
  - Apunte tipo `pdf` → llama a `getNoteFile(id)` (que es `apiDownload`), envuelve el blob con `URL.createObjectURL` y lo monta en un `<iframe>`. **No** se pone `<iframe src="?route=notes/file...">` directo: el navegador haría un GET sin Authorization y el backend devolvería 401. La URL del object-blob se revoca al desmontar para no fugar memoria.
  - Botones IA "Generar mapa" / "Generar flashcards" cableados contra `POST ai/from-note` (rama IA_Integration con Gemini API). Mientras la IA trabaja se monta un overlay full-screen bloqueante porque la generación tarda 10–30 s y queremos evitar dobles clicks o navegaciones accidentales. Tras éxito navega a `/mapas/:id` (target=map) o muestra toast con la cantidad creada (target=flashcards).

**Components:**

- `NoteCard.jsx` — tarjeta del listado. Icono según `source_type` (PDF o texto), título, fecha relativa, contador de caracteres si es texto, "Abrir" + papelera.
- `UploadNoteDialog.jsx` — diálogo nativo `<dialog>` con tabs "PDF" / "Texto". Modo PDF: drag&drop o input file con validación cliente (≤ 5 MB, mismo límite que el backend). Modo texto: textarea con contador (≤ 200 000 chars). Título opcional en ambos. Bloquea el cierre por backdrop mientras está subiendo.
- `DeleteNoteDialog.jsx` — confirmación destructiva.
- `EmptyNotesState.jsx` — pantalla cuando aún no hay apuntes con CTA "Sube tus primeros apuntes".

**Services:**

- `notesService.js` — `listNotes`, `getNote(id)`, `getNoteFile(id)` (binario → blob), `uploadPdfNote(file, title)` (FormData), `uploadTextNote({title, body})` (JSON puro porque no hay archivo), `deleteNote(id)`, `fromNoteToMap(noteId)`, `fromNoteToFlashcards(noteId)`. Las dos últimas son la cara al frontend del endpoint `ai/from-note` con los dos `target` posibles.

### 7.7. `features/flashcards/` — Repaso espaciado SM-2

Sistema de tarjetas con repetición espaciada. El algoritmo SM-2 simplificado vive en backend (`Flashcard::computeReview`); el frontend sólo orquesta la sesión y pinta.

**Pages:**

- `FlashcardsListPage.jsx` — listado con dos tabs internos (sin sub-rutas para no inflar el router):
  - `review` — vista CTA "Empezar repaso" o "nada que repasar" (lleva a `/flashcards/repaso`).
  - `all` — **vista en carpetas plegables agrupadas por apunte de origen** (no un grid plano). El helper `groupCardsByNote(cards, todayIso)` agrupa por `note_id`: una carpeta por cada apunte (con su título humano vía LEFT JOIN en backend) y una carpeta "Sin apunte" al final para tarjetas con `note_id IS NULL` (manuales o generadas desde un mapa). Cada carpeta calcula también `dueCount` cliente-side con `isDueToday` para el badge azul de pendientes y para deshabilitar "Jugar" cuando no hay nada que repasar.

  Carga ambas listas (`flashcards/list` y `flashcards/due`) en paralelo al montar para que el contador del tab "Repasar" sea inmediato. Acciones de carpeta:
  - **Jugar carpeta** → `navigate('/flashcards/repaso?note=<id|none>', { state: { folderTitle } })`. La sesión sólo verá las tarjetas pendientes de esa carpeta (filtro en SQL, no en cliente).
  - **Borrar carpeta** → abre `DeleteFolderDialog`; al confirmar llama a `deleteFlashcardsByNote(noteId)` y filtra `all` y `due` en memoria con optimismo local (sin refetch).
- `ReviewSessionPage.jsx` — sesión de repaso (`/flashcards/repaso`). Lee `?note=` con `useSearchParams` (`'none'`, número o ausente) y lo pasa a `listDue(noteFilter)` para que el backend filtre en SQL. Si llega por `navigate` desde la lista, también recoge `location.state.folderTitle` (evita un fetch extra sólo para la cabecera). En modo carpeta muestra un breadcrumb `Carpeta: <título>` debajo del H1. Estados:
  - `loading` → spinner.
  - `empty` → `ReviewSummary kind="empty"` con CTA "Volver" si la cola estaba vacía (el filtro de carpeta puede dejarla vacía aunque haya tarjetas globales).
  - `reviewing` → `FlippableCard` con la tarjeta actual + `GradeButtons` (deshabilitados hasta revelar).
  - `done` → `ReviewSummary kind="done"` con stats locales (total, fail, good, easy).

  **Optimismo controlado**: al pulsar grade, sacamos la tarjeta de la cola y avanzamos antes de que llegue la respuesta de `reviewFlashcard`. Si la API falla, devolvemos la tarjeta al frente de la cola, deshacemos la stat y avisamos con toast. Mantiene la UI fluida sin riesgo de inconsistencia.

**Components:**

- `FlashcardCard.jsx` — tarjeta del CRUD: front, back, badge "vence en X" (`DueBadge`), editar, borrar.
- `FlippableCard.jsx` — la tarjeta de la sesión de repaso. Pregunta arriba; según `revealed`, o un botón "Mostrar respuesta" o la respuesta. **Sin animación 3D de flip** — un revelado simple es más defendible (sin librerías) y evita problemas de accesibilidad.
- `GradeButtons.jsx` — los tres botones de grado: `fail` (coral), `good` (brand), `easy` (success).
- `ReviewSummary.jsx` — pantalla de cierre de sesión con totales por tipo y CTA "Volver".
- `DueBadge.jsx` — badge con el estado de vencimiento (`vence hoy`, `hace 2 días`, `en 5 días`).
- `FlashcardEditDialog.jsx` — diálogo nativo `<dialog>` para crear/editar (`save` POST con `id?`).
- `DeleteFlashcardDialog.jsx` — confirmación destructiva (tarjeta individual).
- `FlashcardFolder.jsx` — carpeta plegable usada en la tab "Mis tarjetas". Implementada con `<details>`/`<summary>` nativos: el navegador gestiona open/closed, focus y Enter/Space sin estado React ni librerías. El triángulo nativo se oculta con `list-none [&::-webkit-details-marker]:hidden` y se sustituye por un chevron Font Awesome que rota con la variante Tailwind `group-open:rotate-90` (apunta al propio `<details>` con `group`). En la cabecera muestra dos badges (total y pendientes hoy) y los botones "Jugar" (deshabilitado si `dueCount === 0`) y "Borrar" (`variant="danger"`). Los handlers usan un `stopAndRun` que llama a `preventDefault` + `stopPropagation` para que el click no toggle el `<details>` además de disparar la acción.
- `DeleteFolderDialog.jsx` — confirmación destructiva masiva. Mismo patrón que `DeleteFlashcardDialog`/`DeleteNoteDialog` (`<dialog>` nativo) pero con copy específico ("vas a eliminar N flashcards") y aviso de que el apunte de origen no se borra.
- `EmptyFlashcardsState.jsx` — empty state con CTA al editor de mapas (recordando que pueden generarse desde un mapa).

**Hooks:**

- `useReviewKeybindings.js` — atajos de la sesión: **Espacio** revela la respuesta, **1/2/3** califican (sólo tras revelar). Mismo guard de `isEditableTarget` que en el editor de mapas. La condición "1/2/3 sólo aplican tras revelar" evita frustración: pulsar antes no haría nada útil.

**Services:**

- `flashcardsService.js` — `listFlashcards`, `listDue(noteFilter?)`, `saveFlashcard(payload)`, `reviewFlashcard(id, grade)`, `deleteFlashcard(id)`, `deleteFlashcardsByNote(noteId)`, `generateFromMap(mapId)`. `listDue` admite filtro opcional por carpeta: `'none'` (sólo huérfanas, `note_id IS NULL`), número (sólo de ese apunte) u omitido (todas las pendientes). Va por query string `?note_id=...`. `deleteFlashcardsByNote` borra masivamente todas las tarjetas de una carpeta (apunte concreto o `null` para huérfanas). `generateFromMap` genera un lote vía IA partiendo de los nodos de un mapa.

### 7.8. `features/community/` — Capa social

Feed de mapas públicos, likes, comentarios, perfiles públicos y favoritos.

**Pages:**

- `CommunityFeedPage.jsx` — feed (`/comunidad`). Toolbar con `sort` (`recent | popular`) y `q` (texto), grid responsive 1/2/3 columnas, paginación **load-more** acumulativa (mejor UX que paginación tradicional para feeds: cada "Cargar más" añade ítems al final manteniendo los ya pintados). Página = 12 mapas. Cumple RA2 0615.
- `PublicMapPage.jsx` — vista pública de un mapa concreto (`/comunidad/mapa/:id`). Cabecera con autor + counts + `LikeButton`, **`DrawflowEditor` montado en `readOnly`** (reutilización limpia de la feature maps), `CommentsSection` debajo. Si el visitante es el dueño del mapa, aparece un botón "Editar" que lleva al editor real. `404` y "es privado" comparten mensaje (antienumeración).
- `PublicProfilePage.jsx` — perfil público de un autor (`/u/:userId`). Sin email ni teléfono (RGPD): sólo nombre, avatar y mapas públicos del autor.
- `MyFavoritesPage.jsx` — los mapas que el usuario actual ha likeado (`/comunidad/favoritos`).

**Components:**

- `PublicMapCard.jsx` — tarjeta del feed con autor, counts, badge "público" y `LikeButton`.
- `LikeButton.jsx` — corazón con número. Optimismo local: al hacer click cambia de estado inmediatamente y dispara `community/like`. Si falla, deshace.
- `ShareToggle.jsx` — toggle "público / privado" reutilizado por el editor de mapas (cambia `is_public` vía `maps/save`).
- `CommentsSection.jsx` + `CommentItem.jsx` — hilo paginado con autor (`Avatar`), tiempo relativo, body y botón eliminar (sólo si `can_delete`, calculado por el backend).
- `FeedToolbar.jsx` — buscador (debounced) + tabs `recent | popular`.
- `EmptyFeedState.jsx` — empty state.
- `Avatar.jsx` — versión local del avatar (la feature shell también tiene uno; aquí se duplica intencionadamente para no acoplar la community al shell).

**Services:**

- `communityService.js` — `fetchFeed({sort, q, page, page_size})`, `fetchPublicMap(id)`, `fetchProfile(userId)`, `fetchProfileMaps(userId, ...)`, `fetchFavorites(...)`, `toggleLike(mapId)`, `fetchComments(mapId, ...)`, `createComment(mapId, body)`, `deleteComment(id)`. Cada función es una línea sobre `apiGet`/`apiPost`.

### 7.9. `features/profile/` — Mi perfil

Pantalla de gestión del usuario autenticado.

- `ProfilePage.jsx` — orquesta la carga de `profile/me` y compone las secciones. Manejo de estados `loading | ok | error` con CTA de reintento.
- `SectionCard.jsx` — wrapper visual común a todas las secciones (título, descripción y contenido).
- `AccountInfoSection.jsx` — formulario con nombre, teléfono, empresa, idioma, zona horaria. POST `profile/update` al guardar.
- `SecuritySection.jsx` — cambio de contraseña: pide actual + nueva, llama a `profile/password`. Sin opción "olvidé mi contraseña actual" porque ese flujo va por `/recuperar`.
- `AvatarSection.jsx` — subida de avatar con `apiUpload` (multipart). Vista previa local con `URL.createObjectURL` antes de confirmar.
- `DangerZoneSection.jsx` — sección final de la pantalla con dos acciones reales: **Cerrar sesión** (limpia el JWT del `AuthContext` y vuelve a `/`, mismo efecto que el item del `UserMenu` pero más visible para el usuario que está editando su cuenta) y **Eliminar cuenta** (abre `DeleteAccountDialog` y, al confirmar, llama a `deleteAccount(email)` → al éxito hace `logout()` + `navigate('/')`). Sustituye al `StudyStatsSection` original que mostraba siempre ceros mock; las stats reales se reactivan en una rama futura para la página Inicio.
- `DeleteAccountDialog.jsx` — `<dialog>` nativo con campo "tipea tu email" que habilita el botón danger sólo cuando el email tipeado coincide con el de la cuenta (case-insensitive). Patrón anti-misclick estilo Vercel/Cloudflare; la prueba de identidad real sigue siendo el JWT en la cabecera `Authorization`. El backend revalida el email también por defensa en profundidad.
- `StudyStatsSection.jsx` — (sin import vivo en `ProfilePage`) métricas del usuario que se reaprovecharán en la página Inicio cuando se cableen los endpoints reales. Se mantiene el archivo como punto de partida para esa rama futura.
- `profileService.js` — `fetchMe`, `updateProfile`, `changePassword`, `uploadAvatar`, `deleteAccount(emailConfirmation)`. La última envía `POST profile/delete` con `{ email_confirmation }`.

### 7.10. `pages/NotFoundPage.jsx`

404 amigable. Vive directamente en `src/pages/` (fuera de `features/`) porque no pertenece a ninguna zona del producto: es transversal.

---

## 8. Cómo se llaman entre sí: ejemplos completos

### 8.1. Recorrido de "el usuario abre la app por primera vez tras un login expirado"

1. **Navegador** → carga `index.html`. Vite sirve el bundle. React monta `<App />`.
2. **`App.jsx`** → instancia `AuthProvider` → `NotificationProvider` → `RouterProvider`.
3. **`AuthProvider`** efecto inicial → lee `sw_token` de `localStorage` → `isJwtExpired(token)` devuelve `true` → limpia `localStorage`, deja `token=null`, `isReady=true`.
4. **`RouterProvider`** intenta renderizar la ruta actual (`/dashboard`).
5. **`AppLayout`** se monta y envuelve el outlet en `<ProtectedRoute>`.
6. **`ProtectedRoute`** lee `useAuth()` → `isReady=true`, `isAuthenticated=false` → `<Navigate to="/login" replace state={{from: location}}>`.
7. **`LoginPage`** se monta. El usuario rellena email/password y submitea.
8. **`authService.login`** → `apiPost('auth/login', {email, password})`.
9. **`apiClient`** compone `?route=auth/login`, no adjunta token, hace `fetch` POST con JSON body. Recibe `{success: true, token, user}`.
10. **`LoginPage`** llama a `useAuth().login(token, user)` → `AuthContext.login` persiste en `localStorage` y actualiza estado → `isAuthenticated=true`.
11. **`navigate(location.state.from ?? '/dashboard', { replace: true })`** → React Router cambia la URL sin reload.
12. **`AppLayout` + `ProtectedRoute`** se montan con sesión → `<Outlet />` renderiza `DashboardPage`.

### 8.2. Recorrido de "el usuario crea un nuevo mapa y empieza a editarlo"

1. **`MapsListPage`** → click en "+ Nuevo mapa".
2. `mapsService.saveMap({title: 'Nuevo mapa', drawflow_json: null})` → `apiPost('maps/save', payload)`.
3. **`apiClient`** adjunta `Authorization: Bearer <jwt>`. Backend responde `201 {success: true, data: {id: 42, updated_at}}`.
4. **`MapsListPage`** → `navigate('/mapas/42')`.
5. **`MapEditorPage`** se monta con `useParams().id = '42'`.
6. `useEffect` inicial → `getMap(42)` → `apiGet('maps/get', {id: 42})` → recibe `{success: true, data: {title, drawflow_json: null, ...}}`.
7. Estado pasa a `ok`. Se renderizan `MapTitleEditor`, `EditorToolbar`, `DrawflowEditor` (con `initialJson=null`), `SaveIndicator`, `ShareToggle`.
8. **`DrawflowEditor`** efecto inicial → guard StrictMode → `new Drawflow(container)` → `editor.start()`. Sin JSON inicial, canvas vacío.
9. El usuario añade nodos desde el toolbar. Cada `addNode` dispara el evento `nodeCreated` de Drawflow → callback `onChange` interno → `editor.export()` → notifica al padre.
10. **`MapEditorPage`** recibe el JSON exportado → `useMapAutoSave.requestSave({title, description, is_public, drawflow_json})`.
11. **`useMapAutoSave`** compara fingerprint con el último guardado (no coincide) → debounce 1500 ms → llama a `saveMap`.
12. **`apiClient`** → `apiPost('maps/save', {id: 42, ...})`. Backend devuelve `{success: true, data: {id, updated_at}}`.
13. **`useMapAutoSave`** actualiza `status='saved'`, `lastSavedAt=updated_at`. **`SaveIndicator`** lo refleja con un check verde.

### 8.3. Recorrido de "el usuario sube un PDF y genera un mapa con IA"

1. **`NotesListPage`** → CTA "Subir apunte" → abre `UploadNoteDialog` en tab "PDF".
2. Selecciona un PDF (drag&drop o input file). Validación cliente: ≤ 5 MB.
3. Confirma → `notesService.uploadPdfNote(file, title)` → `apiUpload('notes/upload', formData)`.
4. **`apiClient`** envía `multipart/form-data` con el JWT en cabecera. Backend revalida MIME real con `finfo` y persiste.
5. Backend responde `{success: true, data: {id: 7, ...}}`. `NotesListPage` cierra el diálogo, refresca la lista, muestra toast.
6. Click en la `NoteCard` "Abrir" → `navigate('/apuntes/7')`.
7. **`NotePreviewPage`** se monta. `useEffect` → `getNote(7)` → `apiGet('notes/get', {id: 7})` → recibe `{source_type: 'pdf', extracted_text: null, ...}`.
8. Como es PDF, segundo efecto → `getNoteFile(7)` → `apiDownload('notes/file', {id: 7})` → backend revalida ownership por JWT y devuelve el binario.
9. **`apiClient.apiDownload`** → `response.blob()` → devuelve `{success: true, blob}`.
10. **`NotePreviewPage`** → `URL.createObjectURL(blob)` → `setPdfUrl(...)`. El `<iframe src={pdfUrl}>` muestra el PDF.
11. Usuario pulsa "Generar mapa" → `setAiBusy('map')` → overlay full-screen con spinner.
12. `fromNoteToMap(7)` → `apiPost('ai/from-note', {note_id: 7, target: 'map'})`. La llamada tarda 10–30 s (Gemini procesa el PDF multimodal).
13. Backend responde `{success: true, data: {map_id: 99, title, node_count}}`. `setAiBusy('idle')`, navega a `/mapas/99`.
14. **`MapEditorPage`** se monta con el mapa recién generado y el `DrawflowEditor` lo importa.

### 8.4. Recorrido de "el usuario hace login y la sesión expira mientras navega"

1. Usuario navega libremente por `/mapas`, `/flashcards`, `/comunidad`.
2. En algún punto, su JWT expira (la cláusula `exp` ya ha pasado).
3. Próxima llamada: `apiClient` envía la petición con el token caducado. Backend devuelve `401`.
4. **`apiClient.handleResponse`** detecta `status===401` → `window.dispatchEvent(new CustomEvent('auth:logout'))`.
5. **`AuthContext`** tiene un listener suscrito → `logout()` → limpia `localStorage` + estado.
6. **`ProtectedRoute`** detecta que `isAuthenticated=false` → `<Navigate to="/login" state={{from: location}}>`.
7. Tras volver a loguearse, `LoginPage` lee `location.state.from` y devuelve al usuario a la página exacta donde estaba.

---

## 9. Decisiones transversales y por qué se defienden

| Decisión | Por qué se eligió |
| --- | --- |
| **SPA "Fetch & Render" (frontend ↔ backend por JSON)** | Separa frontend y backend por contrato HTTP. Permite que cada capa evolucione (o se sustituya por una app móvil) sin tocar la otra. Cumple el espíritu de 0612 RA7 + 0613 RA8. |
| **Sin SSR / sin Next.js** | Build estático con Vite. Despliegue cloud trivial (cualquier hosting estático). Sin servidor Node que mantener. Defendible con timebox de 8 días. |
| **Sin Redux / Zustand / RTK** | Tres `Context` (Auth, Notification) + `useState` cubren todas las necesidades. Defendible en pizarra: el alumno explica cada provider en 5 líneas. |
| **Sin React Query / SWR** | Cada page hace su `useEffect` + `useState`. La cantidad de fetches no justifica la complejidad de una capa de cache; la frescura la controla cada page (re-fetch al volver de un dialog, etc.). |
| **Wrapper único de `fetch` (`apiClient`)** | Un único punto que adjunta JWT, normaliza respuestas y gestiona el 401 global. Si mañana cambiamos a cookies httpOnly, se toca un único archivo. |
| **Catálogo de endpoints (`endpoints.js`)** | Evita strings sueltos. Permite refactor seguro y sirve como índice de la API junto al backend. |
| **JWT decodificado en cliente sólo para leer `exp`** | Evita roundtrips a "verifica este token, ¿es válido?". La verificación de firma queda en backend (HS256). En cliente, decodificar el payload es legal y útil. |
| **Evento global `auth:logout`** | Desacopla `apiClient` de `AuthContext`. Cualquier respuesta 401 cierra la sesión sin que cada page tenga que duplicar la lógica. Patrón observable simple. |
| **Tokens del sistema "Cielo Claro" en `@theme`** | Una única fuente de verdad para colores, sombras, animaciones. Cumple el espíritu del módulo 0615 (interfaces consistentes). |
| **`NotificationProvider` con `aria-live`** | Toasts accesibles para lectores de pantalla. Evita el `alert()` legacy. |
| **`<dialog>` nativo HTML5 para diálogos** | Sin librerías de modales. El navegador gestiona focus trap y backdrop. Defendible y moderno. |
| **`Intl.RelativeTimeFormat` en lugar de `dayjs`/`date-fns`** | API nativa, sin bytes adicionales en el bundle. Cumple "no introduzcas librerías que el alumno no pueda explicar". |
| **`useBreakpoint` con `matchMedia`** | Sin listener de `resize`, sin timers, respeta zoom. Defendible. |
| **Mismo patrón de `loading | error | empty | ok` en cada page** | Una vez que el evaluador entiende `MapsListPage`, entiende también `NotesListPage`, `FlashcardsListPage` y `CommunityFeedPage`. Reduce la carga cognitiva durante la defensa. |
| **`DrawflowEditor` reutilizado en read-only para la comunidad** | Una sola implementación del visor; la propia feature comunidad no duplica código del editor. |
| **`<ProtectedRoute>` envuelve el `<Outlet />` del shell, no cada page** | Una sola comprobación cubre **todas** las rutas privadas. Imposible olvidarse de proteger una nueva página: si la añades bajo `AppLayout`, está protegida por construcción. |
| **Optimismo controlado en repaso de flashcards y likes** | UI fluida sin parpadeos. La rollback automática ante error preserva la consistencia. |

---

## 10. Mapa rápido de archivos frontend

```
frontend/
├── index.html                              Shell estático (mountpoint #root)
├── vite.config.js                          Plugin React + Tailwind 4 + alias '@'
├── package.json                            Deps mínimas (react, drawflow, react-router)
└── src/
    ├── main.jsx                            Entry React (StrictMode + createRoot)
    ├── App.jsx                             Composición de providers globales
    ├── router.jsx                          Mapa de rutas (público + privado bajo AppLayout)
    ├── styles/
    │   └── index.css                       Tailwind 4 + tokens 'Cielo Claro' en @theme
    │
    ├── api/
    │   ├── client.js                       Wrapper único de fetch (apiGet/Post/Upload/Download)
    │   └── endpoints.js                    Catálogo central de rutas del backend
    │
    ├── auth/
    │   ├── AuthContext.jsx                 Estado global de sesión + listener auth:logout
    │   ├── ProtectedRoute.jsx              Guard de rutas privadas
    │   └── useAuth.js                      Hook con guard de Provider
    │
    ├── ui/                                 Componentes base reutilizables
    │   ├── Button.jsx                      5 variantes + isLoading
    │   ├── Card.jsx                        Superficie cristal con backdrop-blur
    │   ├── Input.jsx                       Input con label, icon, error, rightAddon
    │   ├── Spinner.jsx                     Spinner circular sin deps
    │   ├── AmbientBackground.jsx           Capa decorativa con glows + grid
    │   ├── NotificationProvider.jsx        Sistema de toasts con aria-live
    │   └── useNotification.js              Hook con guard de Provider
    │
    ├── utils/
    │   ├── jwt.js                          Decode payload + isJwtExpired
    │   ├── validators.js                   isEmail + passwordStrength
    │   └── relativeTime.js                 Intl.RelativeTimeFormat en castellano
    │
    ├── pages/
    │   └── NotFoundPage.jsx                404 amigable transversal
    │
    └── features/
        ├── landing/                        Página pública (/)
        │   ├── LandingPage.jsx, LandingNav.jsx, LandingFooter.jsx
        │   ├── HeroSection.jsx, HeroIllustration.jsx
        │   ├── FeaturesSection.jsx, FeatureCard.jsx
        │   ├── HowItWorksSection.jsx
        │   └── CTASection.jsx
        │
        ├── auth/                           Pantallas de auth (públicas)
        │   ├── pages: LoginPage, RegisterPage, ForgotPasswordPage,
        │   │   ResetPasswordPage, ConfirmAccountPage, WaitConfirmationPage
        │   ├── piezas: AuthCard, PasswordInput, GoogleButton, AuthDivider,
        │   │   PasswordStrengthMeter
        │   └── authService.js              Fachada sobre apiPost
        │
        ├── shell/                          Layout autenticado
        │   ├── AppLayout.jsx               Compone Navbar + Sidebar + Outlet
        │   ├── AppNavbar.jsx               Barra superior fija
        │   ├── AppSidebar.jsx              Sidebar fija (desktop)
        │   ├── MobileDrawer.jsx            Drawer (mobile)
        │   ├── NavItem.jsx                 Ítem de navegación con estado activo
        │   ├── navItems.js                 Fuente única de las secciones
        │   ├── UserMenu.jsx                Avatar + dropdown
        │   ├── Avatar.jsx                  Iniciales o imagen
        │   ├── PlaceholderPage.jsx         "Próximamente"
        │   └── useBreakpoint.js            matchMedia reactivo
        │
        ├── dashboard/                      Inicio del usuario (/dashboard)
        │   ├── DashboardPage.jsx
        │   ├── StatsCard.jsx, RecentMapsList.jsx, EmptyState.jsx
        │
        ├── profile/                        Mi perfil (/perfil)
        │   ├── ProfilePage.jsx
        │   ├── SectionCard.jsx, AccountInfoSection.jsx, SecuritySection.jsx,
        │   │   AvatarSection.jsx, DangerZoneSection.jsx, DeleteAccountDialog.jsx
        │   ├── StudyStatsSection.jsx       (huérfano · reservado para Inicio)
        │   └── profileService.js
        │
        ├── notes/                          Apuntes (zona principal — /apuntes)
        │   ├── pages: NotesListPage, NotePreviewPage
        │   ├── components: NoteCard, UploadNoteDialog, DeleteNoteDialog,
        │   │   EmptyNotesState
        │   └── services/notesService.js    + endpoints ai/from-note
        │
        ├── maps/                           Editor Drawflow (/mapas)
        │   ├── pages: MapsListPage, MapEditorPage
        │   ├── components: DrawflowEditor (wrapper imperativo), EditorToolbar,
        │   │   MapTitleEditor, MapMetadataDialog, MapCard, DeleteMapDialog,
        │   │   SaveIndicator
        │   ├── hooks: useMapAutoSave, useDebouncedCallback, useEditorKeybindings
        │   ├── services: mapsService, aiService
        │   └── styles/drawflow-summer.css  Override de Drawflow con la paleta
        │
        ├── flashcards/                     Repaso SM-2 (/flashcards)
        │   ├── pages: FlashcardsListPage, ReviewSessionPage
        │   ├── components: FlashcardCard, FlippableCard, GradeButtons,
        │   │   ReviewSummary, DueBadge, FlashcardEditDialog,
        │   │   DeleteFlashcardDialog, EmptyFlashcardsState,
        │   │   FlashcardFolder, DeleteFolderDialog
        │   ├── hooks/useReviewKeybindings.js
        │   └── services/flashcardsService.js
        │
        └── community/                      Capa social (/comunidad)
            ├── pages: CommunityFeedPage, PublicMapPage, PublicProfilePage,
            │   MyFavoritesPage
            ├── components: PublicMapCard, LikeButton, ShareToggle,
            │   CommentsSection, CommentItem, FeedToolbar, EmptyFeedState,
            │   Avatar
            └── services/communityService.js
```
