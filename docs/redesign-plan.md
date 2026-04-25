# Plan de rediseño y migración del frontend NodeWeaver → StudyWeaver

> **Contexto**: Repositorio histórico `NodeWeaver-` pivotado a **StudyWeaver** (plataforma de estudio con IA, mapas conceptuales, flashcards y capa social). Stack acordado en `CLAUDE.md` y `Gemini.md`. Entrega: **3 mayo 2026**. Modalidad: solo, defensa ante tribunal DAW.
>
> Este documento sólo cubre **frontend**. Backend reutilizable (auth, JWT, SendGrid, modelos User) sigue intacto en `API/` y `MODEL/` hasta que la fase backend lo migre a `backend/API/`.

---

## 0. Auditoría del estado actual de [SERVER/](../SERVER/)

### 0.1 Estructura detectada

```
SERVER/
├── index.html                          (landing — copy "automatización")
├── assets/  (Automat.svg, FlujoLogo.svg, nodeweaver-logo.svg, gemini-svg.svg, avatars/)
├── css/     (tailwind.css generado, input.css fuente, auth.css, landing.css, style.css, theme.css, animation.css, drawflow*)
├── js/      (editor.js, sounds.js, stats.js, theme.js)
├── libs/    (no inspeccionado en esta auditoría)
└── pages/
    ├── automations.html                (legacy — descartar)
    ├── dashboard.html                  (parcial — referencia visual)
    ├── profile.html                    (con CSS premium Apple-style — adaptar selectivamente)
    └── auth/
        ├── login.html
        ├── register.html
        ├── forgot-password.html
        ├── reset-password.html
        ├── confirm-account.html
        └── wait-confirmation.html
```

### 0.2 Sistema de diseño implícito (lo que hay hoy)

**Modo**: oscuro `data-theme="dark"`, fondo base `#0a0a0f`.

**Capa "ambient" reutilizada en cada página** (3 divs `fixed inset-0`):

```html
<div class="fixed inset-0 bg-[#0a0a0f] z-[-10]"></div>
<div class="fixed inset-0 bg-gradient-to-b from-purple-900/20 via-pink-900/10 to-[#0a0a0f] z-[-9]"></div>
<div class="fixed inset-0 grid-pattern opacity-25 z-[-8]"></div>
```

más glows ambient con `bg-amber-500/10`, `bg-pink-600/15`, `bg-cyan-500/10` en `blur-[140px]`.

**Tokens implícitos a extraer** (paleta antigua):

| Rol | Clase Tailwind v3 actual | Hex |
| --- | --- | --- |
| Acento primario | `purple-600` | `#9333ea` |
| Acento secundario | `cyan-500` | `#06b6d4` |
| Acento cálido | `pink-600` | `#db2777` |
| Cálido extra (login glow) | `amber-500` | `#f59e0b` |
| Surface glass | `bg-slate-800/40 backdrop-blur-2xl border border-white/10` | — |
| Input | `bg-slate-900/50 border border-white/10` | — |
| Texto principal | `text-white` | `#ffffff` |
| Texto muted | `text-slate-400` | `#94a3b8` |
| Texto faint | `text-slate-500` | `#64748b` |
| Border default | `border-white/10` | rgba(255,255,255,0.1) |
| Grid pattern líneas | `rgba(139,92,246,0.1)` | morado al 10% |
| Radius cards | `rounded-3xl` (24px) | — |
| Radius inputs/buttons | `rounded-xl` (12px) | — |
| Shadow cards | `shadow-2xl shadow-black/40` | — |
| Botón principal | `bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-600` | — |

**Tipografía**: sans system (Tailwind por defecto), tracking-tight, sizes `text-2xl` (auth h2), `text-5xl`/`text-6xl`/`text-7xl` (landing h1-h2), `font-bold`/`font-extrabold` para títulos, `font-medium`/`font-semibold` para labels.

**Animaciones detectadas** (definidas inline en cada `<style>`):

| Nombre | Uso |
| --- | --- |
| `fadeInUp` (30px, 0.8s ease-out) | Hero, cards al entrar viewport |
| `slideDown` (-100%, 0.6s) | Navbar al cargar |
| `float` (12px, 2s infinite) | Indicador scroll |
| `pulse-glow` (scale 1→1.2, 3s) | Glows decorativos |
| `slideIn`/`slideOut` (0.3s) | Notificaciones top-right |

**Iconografía**: Font Awesome 6 vía CDN. Mantener para no añadir dep.

**Notificaciones**: cada página redefine `showNotification(msg, type)`. **Code smell** — se centraliza en Fase 0.

### 0.3 Backend que se reutiliza tal cual

Endpoints en [API/router/api.php](../API/router/api.php) — **no tocar firma**:

| Método | Ruta (`?route=`) | Controller |
| --- | --- | --- |
| POST | `auth/login` | `authController::login` |
| POST | `auth/register` | `authController::register` |
| POST | `auth/forgot-password` | `authController::forgotPassword` |
| POST | `auth/reset-password` | `authController::resetPassword` |
| POST | `auth/confirm-account` | `authController::confirmAccount` |
| POST | `auth/google` | `authController::googleLogin` |
| GET | `profile/me` | `profileController::getProfile` |
| POST | `profile/update` | `profileController::updateProfile` |
| POST | `profile/password` | `profileController::changePassword` |
| POST | `profile/avatar` | `profileController::uploadAvatar` |

Todas devuelven `{ success: bool, message: string, data?: ..., token?: ..., user?: ... }`.

---

## 1. Sistema de diseño nuevo: paleta veraniega "Cielo Claro"

> **Cambio de filosofía**: pasamos de modo oscuro morado/cyan/pink a **modo claro cálido y veraniego**: cielo abierto, brisa, luz dorada de tarde. Sigue siendo diseño profesional (no infantil), pero cercano al estudio diurno (donde se usa la app).

### 1.1 Paleta `summer-sky`

| Token | Hex | Uso |
| --- | --- | --- |
| `--color-paper` | `#f6fbff` | Fondo base (sustituye `#0a0a0f`) |
| `--color-mist` | `#eaf4ff` | Fondo secundario (gradiente) |
| `--color-glass` | `rgba(255,255,255,0.62)` | Surface glass de cards |
| `--color-brand-50` | `#eff8ff` | Fondos hover muy suaves |
| `--color-brand-200` | `#b9dffe` | Borders decorativos, badges |
| `--color-brand-400` | `#3aa8fa` | Acento medio, focus rings |
| `--color-brand-500` | `#0ea5e9` | **Primario** (sky-500) — botones, links |
| `--color-brand-600` | `#0284c7` | Hover/active del primario |
| `--color-brand-700` | `#0369a1` | Texto sobre fondos brand claros |
| `--color-sun-300` | `#fcd34d` | Acento cálido — destacar logros, badges |
| `--color-sun-400` | `#fbbf24` | Hover del cálido |
| `--color-coral-400` | `#fb7185` | CTA secundario, errores suaves |
| `--color-mint-400` | `#34d399` | Confirmaciones, success toast |
| `--color-ink` | `#0f172a` | Texto principal (slate-900) |
| `--color-ink-muted` | `#475569` | Texto secundario (slate-600) |
| `--color-ink-faint` | `#94a3b8` | Texto faint, placeholders |
| `--color-line` | `rgba(14,165,233,0.18)` | Borders cards/inputs |

### 1.2 Mapping antiguo → nuevo (referencia rápida al migrar HTML)

| Antiguo | Nuevo |
| --- | --- |
| `bg-[#0a0a0f]` | `bg-paper` |
| `from-purple-900/20 via-pink-900/10 to-[#0a0a0f]` | `from-brand-200/40 via-sun-200/20 to-paper` |
| `bg-slate-800/40 backdrop-blur-2xl border border-white/10` | `bg-glass backdrop-blur-2xl border border-line` |
| `bg-slate-900/50 border border-white/10` (input) | `bg-white/70 border border-line` |
| `text-white` | `text-ink` |
| `text-slate-400` | `text-ink-muted` |
| `text-slate-500` | `text-ink-faint` |
| `from-purple-600 via-pink-600 to-cyan-600` (botón) | `from-brand-500 via-brand-400 to-sun-300` |
| `from-purple-400 to-cyan-400 bg-clip-text` (texto gradient) | `from-brand-600 to-coral-400 bg-clip-text` |
| `bg-amber-500/10 blur-[140px]` (glow) | `bg-sun-300/30 blur-[140px]` |
| `bg-pink-600/15 blur-[120px]` | `bg-coral-400/20 blur-[120px]` |
| `bg-cyan-500/10 blur-[130px]` | `bg-brand-400/25 blur-[130px]` |
| `grid-pattern` líneas `rgba(139,92,246,0.1)` | `rgba(14,165,233,0.08)` |
| `shadow-2xl shadow-black/40` | `shadow-2xl shadow-brand-500/15` |
| Notif success `bg-emerald-500/10 text-emerald-400` | `bg-mint-400/15 text-emerald-700` |
| Notif error `bg-red-500/10 text-red-400` | `bg-coral-400/15 text-rose-700` |
| Notif info `bg-cyan-500/10 text-cyan-400` | `bg-brand-400/15 text-brand-700` |

### 1.3 Configuración Tailwind 4

Tailwind 4 elimina `tailwind.config.js`: todo va en CSS con `@theme`. Estará en [`frontend/src/styles/index.css`](#):

```css
@import "tailwindcss";

@theme {
  /* === Marca === */
  --color-paper:        #f6fbff;
  --color-mist:         #eaf4ff;
  --color-glass:        rgba(255,255,255,0.62);

  --color-brand-50:     #eff8ff;
  --color-brand-100:    #dbeefe;
  --color-brand-200:    #b9dffe;
  --color-brand-300:    #7cc6fd;
  --color-brand-400:    #3aa8fa;
  --color-brand-500:    #0ea5e9;
  --color-brand-600:    #0284c7;
  --color-brand-700:    #0369a1;

  --color-sun-200:      #fde68a;
  --color-sun-300:      #fcd34d;
  --color-sun-400:      #fbbf24;

  --color-coral-300:    #fda4af;
  --color-coral-400:    #fb7185;
  --color-coral-500:    #f43f5e;

  --color-mint-400:     #34d399;
  --color-mint-500:     #10b981;

  --color-ink:          #0f172a;
  --color-ink-muted:    #475569;
  --color-ink-faint:    #94a3b8;
  --color-line:         rgba(14,165,233,0.18);

  /* === Sombras === */
  --shadow-glow-brand:  0 10px 40px -10px rgba(14,165,233,0.45);
  --shadow-glow-sun:    0 10px 40px -10px rgba(251,191,36,0.40);
  --shadow-card:        0 4px 24px -6px rgba(15,23,42,0.08);

  /* === Easings === */
  --ease-out-quint:     cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring:        cubic-bezier(0.34, 1.56, 0.64, 1);

  /* === Animaciones (registradas como utilidades) === */
  --animate-fade-up:    fade-up 0.7s var(--ease-out-quint) forwards;
  --animate-slide-down: slide-down 0.6s var(--ease-out-quint) forwards;
  --animate-float:      float 2.4s ease-in-out infinite;
  --animate-pulse-glow: pulse-glow 3s ease-in-out infinite;
}

@keyframes fade-up    { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
@keyframes slide-down { from { transform: translateY(-100%); }            to { transform: none; } }
@keyframes float      { 0%,100% { transform: translateY(0); } 50% { transform: translateY(10px); } }
@keyframes pulse-glow { 0%,100% { transform: scale(1); opacity: .6; } 50% { transform: scale(1.15); opacity: 1; } }

.grid-pattern {
  background-image:
    linear-gradient(rgba(14,165,233,0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(14,165,233,0.08) 1px, transparent 1px);
  background-size: 80px 80px;
}

body { @apply bg-paper text-ink antialiased; }
```

> Tras `npm run dev`, podrás usar `bg-brand-500`, `text-ink-muted`, `shadow-glow-brand`, `animate-fade-up`, etc. directamente como utilidades.

### 1.4 Versiones fijadas (confirmadas via context7)

| Paquete | Versión | Razón |
| --- | --- | --- |
| `vite` | `^7.0.0` | Última estable (rama 7) |
| `@vitejs/plugin-react` | `^4.3.4` | Plugin oficial |
| `react` | `^18.3.1` | **No subir a 19** hasta verificar Drawflow |
| `react-dom` | `^18.3.1` | Idem |
| `react-router` | `^7.6.0` | v7 unificada (antes `react-router-dom`); usaremos library mode con `createBrowserRouter` + `RouterProvider` |
| `tailwindcss` | `^4.2.2` | Ya presente en `package.json` raíz |
| `@tailwindcss/vite` | `^4.2.2` | Plugin oficial v4 (sin `tailwind.config.js`) |

Sin TypeScript: el alumno defiende mejor JS plano y no añade complejidad de tipos en 8 días. Decisión registrable en `decisiones.md`.

---

## 2. Fase 0 · Setup `frontend/`

**Objetivo**: dejar un proyecto Vite + React + Tailwind 4 + React Router 7 listo, con AuthContext y wrapper fetch JWT, capaz de hablar con el backend PHP existente.

### 2.1 Archivos a crear

```
frontend/
├── package.json
├── vite.config.js
├── index.html
├── .env.development                    (VITE_API_BASE=http://localhost/NodeWeaver-/API/index.php)
├── .gitignore                          (node_modules, dist, .env.local)
├── README.md                           (cómo arrancar, en castellano)
├── public/
│   └── studyweaver-logo.svg            (placeholder; ver Fase 2)
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── styles/
    │   └── index.css                   (Tailwind import + @theme — ver §1.3)
    ├── api/
    │   ├── client.js                   (apiGet, apiPost, apiUpload, manejo 401)
    │   └── endpoints.js                (constantes string para no tipar URLs)
    ├── auth/
    │   ├── AuthContext.jsx             (Provider con login/logout/user/token)
    │   ├── useAuth.js                  (hook de conveniencia)
    │   └── ProtectedRoute.jsx          (redirige a /login si no auth)
    ├── router/
    │   └── routes.jsx                  (createBrowserRouter con rutas public/private)
    ├── components/
    │   ├── ui/
    │   │   ├── Button.jsx              (variants: primary, ghost, google, danger)
    │   │   ├── Input.jsx               (label + icon + error)
    │   │   ├── Card.jsx                (glass surface estándar)
    │   │   └── Spinner.jsx
    │   ├── feedback/
    │   │   ├── NotificationProvider.jsx (context)
    │   │   ├── useNotification.js
    │   │   └── Notification.jsx        (toast individual)
    │   └── layout/
    │       └── AmbientBackground.jsx   (los 3 fixed divs + glows reutilizables)
    └── utils/
        ├── validators.js               (isEmail, passwordStrength)
        └── jwt.js                      (decode payload sin lib externa, leer exp)
```

### 2.2 Componentes nuevos clave

- **`<AuthProvider>`** — guarda `{ token, user }` en estado React + `localStorage`. Expone `login(token, user)`, `logout()`, `isAuthenticated`. En `useEffect` inicial restaura sesión desde `localStorage`. Si `jwt.js` detecta `exp` vencido → `logout()` automático.
- **`<ProtectedRoute>`** — si `!isAuthenticated` → `<Navigate to="/login" replace state={{ from: location }} />`.
- **`apiClient`** ([src/api/client.js](#)) — `apiGet(route)`, `apiPost(route, body)`, `apiUpload(route, formData)`. Adjunta `Authorization: Bearer <token>` desde `localStorage`. Normaliza respuesta a `{ success, message, data, token, user }`. En `response.status === 401` o `data.message === 'Token inválido'` → dispara `window.dispatchEvent(new Event('auth:logout'))` que `AuthProvider` escucha.
- **`<NotificationProvider>`** — context con `notify(msg, type)`. Renderiza pila top-right con animación `slideIn/slideOut`. Sustituye al `showNotification` duplicado en cada página antigua.
- **`<AmbientBackground>`** — encapsula los 3 `fixed inset-0` (paper + gradiente + grid-pattern) + 3 glows (`sun`, `coral`, `brand`). Reutilizable en landing, auth y shell.
- **`<Button>`** — variants: `primary` (gradient brand→sun), `ghost` (`bg-white/60 border border-line`), `google` (icono FA + bg blanco), `danger` (`bg-coral-500`).

### 2.3 Criterio de DONE

1. `npm install --prefix frontend && npm run dev --prefix frontend` arranca en `localhost:5173` sin errores ni warnings de Tailwind.
2. Página `/` muestra "StudyWeaver — Setup OK" con tipografía y `bg-brand-500` aplicado, demostrando que los tokens del `@theme` se compilan.
3. Ruta de prueba `/__ping` ejecuta `apiClient.get('auth/login')` (devolverá 405 esperable) y muestra el JSON: prueba que el wrapper, CORS y `VITE_API_BASE` están bien.
4. Acceder a `/dashboard` sin token redirige a `/login` (verifica `<ProtectedRoute>`).
5. `notify('Hola', 'success')` desde la consola muestra toast verde.
6. `npm run build --prefix frontend` produce `frontend/dist/` sin errores.
7. Commit limpio: `feat(frontend): bootstrap Vite + React + Tailwind 4 + Router + AuthContext + apiClient JWT`.

### 2.4 Horas estimadas: **3–4 h**

### 2.5 Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| **CORS** entre `localhost:5173` (Vite) y `localhost/NodeWeaver-/API/` (XAMPP) | Verificar `DATA/cors.php` permite `http://localhost:5173`. Si no, ampliar lista. **Hacer este check antes que cualquier otra cosa de Fase 0**: si CORS no funciona, todo lo demás se atasca. |
| **Tailwind 4** API distinta a v3 (no hay `tailwind.config.js`) | Documentado en §1.3. Verificar build genera utilidades `bg-brand-500` antes de avanzar; si no, problema en `@theme`. |
| **React 19 vs 18** + Drawflow | Forzar `react@^18.3.1` en `package.json`. Drawflow es DOM puro con manipulación directa, podría romperse en React 19 con auto-batching diferente. ADR en `docs/decisiones.md`. |
| **`VITE_API_BASE` undefined** (olvidé `.env.development`) | `apiClient` lanza warning explícito en consola si la base es vacía: `[apiClient] Falta VITE_API_BASE`. |
| **Proxy Vite alternativo** vs CORS | Opción B: configurar `server.proxy` en `vite.config.js` para `/api → http://localhost/NodeWeaver-/API`. Más simple en dev, pero menos representativo del comportamiento producción. **Decisión: usar CORS real, no proxy**, así prod y dev se comportan igual. ADR. |

---

## 3. Fase 1 · Migrar las 6 páginas de auth

**Objetivo**: portar [SERVER/pages/auth/](../SERVER/pages/auth/) a React, preservando el flujo backend exacto y sustituyendo paleta morado/cyan por paleta veraniega.

### 3.1 Archivos a crear

```
frontend/src/features/auth/
├── pages/
│   ├── LoginPage.jsx                   (← login.html)
│   ├── RegisterPage.jsx                (← register.html)
│   ├── ForgotPasswordPage.jsx          (← forgot-password.html)
│   ├── ResetPasswordPage.jsx           (← reset-password.html, lee :token)
│   ├── ConfirmAccountPage.jsx          (← confirm-account.html, lee :token)
│   └── WaitConfirmationPage.jsx        (← wait-confirmation.html)
├── components/
│   ├── AuthCard.jsx                    (panel glass común con logo + título + subtítulo + children)
│   ├── PasswordInput.jsx               (input + ojo toggle)
│   ├── PasswordStrengthMeter.jsx       (barra + texto, usa utils/validators)
│   └── GoogleButton.jsx
└── services/
    └── authService.js                  (login, register, forgot, reset, confirm wrappers de apiClient)
```

### 3.2 Rutas (en `router/routes.jsx`)

| Ruta | Página |
| --- | --- |
| `/login` | LoginPage |
| `/registro` | RegisterPage |
| `/recuperar` | ForgotPasswordPage |
| `/reset/:token` | ResetPasswordPage |
| `/confirmar/:token` | ConfirmAccountPage |
| `/esperando-confirmacion` | WaitConfirmationPage |

> URLs en castellano para coherencia con el resto de la UI (regla CLAUDE.md §9).

### 3.3 Componentes nuevos clave

- **`<AuthCard title subtitle>`** — sustituye al `<div class="w-full max-w-md p-8 md:p-10 mx-4 bg-slate-800/40 ...">` repetido. Recibe children y opcional `width="md"|"2xl"` (register usa más ancho).
- **`<PasswordInput name placeholder>`** — input + icono ojo con estado local `visible`. Internamente usa `<Input>` base.
- **`<PasswordStrengthMeter password>`** — calcula score con `passwordStrength()` (0-4) y muestra barra de color (`coral` → `sun` → `mint`).
- **`<GoogleButton>`** — botón estilo "Continuar con Google" con icono FA y redirige a Google OAuth. **Ver riesgo §3.5 sobre redirect_uri.**

### 3.4 Criterio de DONE

1. Las 6 rutas renderizan sin errores en JS console.
2. Login real contra `auth/login` funciona end-to-end: token guardado vía `useAuth().login(data.token, data.user)`, redirect a `/dashboard`.
3. Register: roundtrip al backend exitoso, muestra toast "Confirma tu correo" y redirige a `/esperando-confirmacion`.
4. Forgot password envía email vía SendGrid (verificar log), muestra toast verde.
5. Reset: `/reset/:token` lee token de URL, valida contraseñas, llama backend, muestra éxito → redirige a `/login`.
6. Confirm: `/confirmar/:token` llama backend al montar (`useEffect`), muestra "Cuenta confirmada" o error.
7. Wait-confirmation: pantalla informativa con botón "Reenviar email".
8. Errores backend (`{success: false, message}`) muestran toast rojo (vía `useNotification`), nunca `alert()`.
9. Diseño consistente entre las 6 páginas: mismo `<AuthCard>`, misma paleta veraniega, mismos focus rings (`focus:ring-brand-400`).
10. Responsive: probado en 360px y 1280px (Playwright snapshot OK).
11. Validación inline (email regex, password ≥ 6) sin librería externa.
12. Commit: `feat(auth): migrar 6 páginas de auth a React con paleta veraniega`.

### 3.5 Horas estimadas: **5–6 h**

### 3.6 Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Backend espera body JSON con claves específicas | Antes de codear cada página, probar el endpoint en Thunder Client (VS Code) y replicar 1:1 el body esperado. |
| **OAuth Google** redirect_uri actual (`http://localhost/backend/auth/google-oauth.php`) no apunta a la SPA | Botón "Continuar con Google" se deja **funcional pero con redirect a la URL antigua**, que sigue trabajando contra el mismo backend. Documentar como "rediseño del flujo OAuth → fuera de scope de Fase 1" en `decisiones.md`. Defendible ante tribunal: "el OAuth quedó funcional, pero la integración SPA-OAuth completa requiere reconfigurar el cliente en Google Console y se planifica para post-entrega". |
| Token de reset/confirm en URL: ¿query o path? | El backend actual recibe el token en el body POST. Las URLs del email pueden venir como `?token=...` o `/reset?token=...`. **Verificar antes de codear** leyendo `authController::forgotPassword` y la plantilla SendGrid. Adaptar `useSearchParams()` o `useParams()` según corresponda. |
| **Migración a tema claro** rompe legibilidad si se copia HTML antiguo | Cada componente requiere repensar contraste (texto oscuro sobre fondo claro). Estimación inflada un 20% por esto. |
| `showNotification` duplicado en cada HTML antiguo | Se sustituye por `useNotification()` del Provider de Fase 0. Verificar que cubre los 3 tipos (success/error/info) con la misma UX. |
| **Form sin librería** (no react-hook-form) | Validación manual con `useState` + `validators.js`. Defendible: el alumno conoce el flujo; añadir una lib en 8 días no aporta. ADR. |

---

## 4. Fase 2 · Reescribir landing con copy StudyWeaver

**Objetivo**: sustituir [SERVER/index.html](../SERVER/index.html) por una landing en React con copy de **estudio + IA + mapas**, sin referencias a "automatización", "n8n", "workflow".

### 4.1 Archivos a crear

```
frontend/src/features/landing/
├── pages/
│   └── LandingPage.jsx
├── sections/
│   ├── HeroSection.jsx
│   ├── FeaturesSection.jsx
│   ├── HowItWorksSection.jsx
│   └── CTASection.jsx
└── components/
    ├── LandingNav.jsx
    ├── LandingFooter.jsx
    └── FeatureCard.jsx

frontend/public/
├── studyweaver-logo.svg                (placeholder texto+icono Lucide hasta tener diseño)
└── illustrations/
    └── mind-map-hero.svg               (puede reutilizarse Automat.svg resignificado)
```

### 4.2 Copy nuevo (castellano, sin marketing falso)

| Bloque | Copy |
| --- | --- |
| Tagline pill | "Aprendizaje visual con IA" |
| H1 | "Estudia mejor con **mapas inteligentes**" |
| Subhead | "Convierte tus apuntes y PDFs en mapas conceptuales generados con IA. Repasa con flashcards de repetición espaciada y comparte tus mapas con la comunidad." |
| CTA primario | "Empezar gratis" → `/registro` |
| CTA secundario | "Iniciar sesión" → `/login` |
| H2 features | "Aprender, repasar y dominar" |
| Feature 1 | **Mapas mentales con IA** — "Sube un PDF y obtén un mapa conceptual editable en segundos." |
| Feature 2 | **Repetición espaciada** — "Flashcards generadas a partir de tus mapas, con algoritmo SM-2 simplificado." |
| Feature 3 | **Quizzes adaptativos** — "Tests automáticos sobre el material que más te cuesta." |
| H2 how-it-works | "Cómo funciona" |
| Pasos | "1. Sube apuntes" / "2. La IA expande" / "3. Repasa con flashcards" / "4. Comparte con la comunidad" |
| H2 CTA final | "Empieza a estudiar mejor hoy" |
| Subhead CTA | "Proyecto académico abierto, sin coste, sin publicidad." |
| Botón CTA | "Crear cuenta gratis" → `/registro` |
| Footer | "© 2026 StudyWeaver — Proyecto Final DAW" + Términos / Privacidad / Sobre el proyecto |

> **Honestidad académica**: el copy evita prometer features que no existen aún ("comunidad" se menciona porque está en roadmap, pero si en defensa no está implementada, el alumno lo dice claro).

### 4.3 Criterio de DONE

1. Landing renderiza en `/` con copy de StudyWeaver. Búsqueda `grep -i "automatiz\|workflow\|n8n\|nodeweaver"` en el HTML renderizado: **cero resultados**.
2. Hero, Features, How-it-works, CTA, Footer responsive en 360 / 768 / 1280px.
3. Animaciones `fade-up`, `slide-down`, `float` funcionan (definidas en §1.3).
4. CTAs llevan a `/registro` y `/login` con `<Link>` de React Router (no `<a href>` que recargaría página).
5. Si `useAuth().isAuthenticated` → CTAs cambian a "Ir al panel" → `/dashboard` (lógica del antiguo `if (token)` portada limpia al estado React).
6. Logo provisional `studyweaver-logo.svg` (icono Lucide `BookOpen` o similar + wordmark "StudyWeaver"). ADR documentando que es placeholder hasta tener identidad visual definitiva.
7. **Lighthouse desktop**: Performance ≥ 85, Accessibility ≥ 95 (contraste AA con paleta clara), Best Practices ≥ 90.
8. Commit: `feat(landing): nueva landing StudyWeaver con copy y paleta veraniega`.

### 4.4 Horas estimadas: **4–5 h**

### 4.5 Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| **Identidad visual sin diseñador** | Logo = wordmark + icono Lucide. Aceptable para entrega DAW (no es ciclo de diseño). ADR explícito. |
| **Copy mediocre o exagerado** | Timebox 30 min específico para escribir copy. Cada frase debe ser defendible: si dice "comunidad", la feature existe (aunque mínima). |
| **Reutilizar `Automat.svg`** como ilustración hero | Visualmente ya muestra nodos conectados, encaja como "mapa mental". Decisión defendible: ahorra tiempo y coherencia narrativa. Si chirría, sustituir por SVG simple de 5 nodos en triángulo. |
| **Tentación de pulir landing** | Timebox 5 h estricto. Es la primera impresión del tribunal pero **el código y la defensa importan más** que el píxel perfecto. |
| **Imágenes pesadas** afectan Lighthouse | Sólo SVG inline o desde `/public`. Sin PNGs ni imágenes raster en la landing inicial. |

---

## 5. Fase 3 · Shell autenticado + Dashboard placeholder

**Objetivo**: layout persistente `<navbar/sidebar/Outlet>` para todas las rutas autenticadas, con un Dashboard placeholder que demuestre el shell funciona.

### 5.1 Archivos a crear

```
frontend/src/features/app-shell/
├── components/
│   ├── AppLayout.jsx                   (envuelve Outlet con ProtectedRoute + Navbar + Sidebar)
│   ├── AppNavbar.jsx                   (logo + breadcrumb + UserMenu)
│   ├── AppSidebar.jsx                  (NavLinks: Dashboard / Mapas / Flashcards / Comunidad / Perfil)
│   ├── MobileDrawer.jsx                (sidebar como overlay en <lg)
│   └── UserMenu.jsx                    (dropdown con Mi perfil + Cerrar sesión)
└── hooks/
    └── useBreakpoint.js                (detecta lg con matchMedia)

frontend/src/features/dashboard/
├── pages/
│   └── DashboardPage.jsx
└── components/
    ├── StatsCard.jsx                   (icono + número + label)
    ├── EmptyState.jsx                  (placeholder amigable cuando no hay datos)
    └── RecentMapsList.jsx              (lista placeholder con EmptyState)
```

### 5.2 Rutas anidadas (en `router/routes.jsx`)

```jsx
{
  element: <AppLayout />,                // ProtectedRoute + shell
  children: [
    { path: "/dashboard",  element: <DashboardPage />  },
    { path: "/mapas",      element: <PlaceholderPage title="Mis mapas" /> },
    { path: "/flashcards", element: <PlaceholderPage title="Flashcards" /> },
    { path: "/comunidad",  element: <PlaceholderPage title="Comunidad" /> },
    { path: "/perfil",     element: <PlaceholderPage title="Mi perfil" /> },  // sustituido en Fase 4
  ],
}
```

### 5.3 Componentes nuevos clave

- **`<AppLayout>`** — `<ProtectedRoute>` envuelve `<AmbientBackground />` + `<AppNavbar>` arriba + `<AppSidebar>` izquierda (desktop) o `<MobileDrawer>` (mobile) + `<main><Outlet /></main>`.
- **`<AppNavbar>`** — `bg-glass backdrop-blur-2xl` sticky top-0 z-50. Contiene wordmark + breadcrumb dinámico (lee `useLocation`) + `<UserMenu>` derecha. En mobile, hamburguesa que abre `MobileDrawer`.
- **`<AppSidebar>`** — width 240px, lista de `<NavLink>` con `({ isActive }) => isActive ? "bg-brand-50 text-brand-700" : "text-ink-muted hover:bg-brand-50/50"`. Iconos Font Awesome ya cargado.
- **`<UserMenu>`** — botón con avatar (de `user.avatar_url` o iniciales) + nombre. Click → dropdown con "Mi perfil" (`/perfil`) y "Cerrar sesión" (llama `logout()` y `navigate('/')`).
- **`<DashboardPage>`** — 3 `<StatsCard>` mock ("0 mapas creados", "0 flashcards repasadas", "0 días seguidos") + `<RecentMapsList>` con `<EmptyState>` que diga "Aún no tienes mapas. Crear el primero →" linkeando a `/mapas`.

### 5.4 Criterio de DONE

1. `/dashboard`, `/mapas`, `/flashcards`, `/comunidad`, `/perfil` muestran el shell completo (navbar + sidebar + contenido).
2. NavLinks resaltan ruta activa correctamente.
3. Sidebar colapsa a drawer en mobile (<1024px). Hamburguesa abre/cierra. Backdrop click cierra. Sin scroll lock issues.
4. UserMenu lee `user.name` y `user.avatar_url` del `AuthContext`. "Cerrar sesión" limpia token + navega a `/`.
5. Dashboard placeholder muestra 3 stats mock + `EmptyState` claro.
6. Sin dependencias nuevas (Tailwind + React + Font Awesome ya cargado).
7. Playwright e2e: login → ver dashboard → click sidebar → cambia ruta → logout → vuelve a `/`.
8. Commit: `feat(shell): app shell autenticado con sidebar responsive y dashboard placeholder`.

### 5.5 Horas estimadas: **4–5 h**

### 5.6 Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| **Sidebar responsive** consume más tiempo del estimado | Implementación simple sin animaciones complejas. `translate-x-full` + `transition-transform`. Suficiente. |
| **NavLink active** API React Router 7 | Confirmado via context7: `<NavLink className={({isActive}) => ...}>` funciona igual que en v6. |
| **Sin datos reales** → tentación de meter endpoints `/maps/list` aquí | NO. Eso es Fase Maps (post-rediseño). Mantener mock. |
| **Avatar URL**: `MODEL/user.php` ¿devuelve `avatar_url`? | Verificar `profileController::getProfile`. Si no, fallback a iniciales (`<div>{user.name[0]}</div>` con `bg-brand-200`). |
| **Breadcrumb dinámico** se complica | V1 simple: mostrar sólo el nombre de la sección actual. V2 (post-entrega): jerárquico. |
| **Z-index war** entre AmbientBackground (`z-[-10..-7]`) y Sidebar/Navbar | Reservar `z-50` navbar, `z-40` sidebar drawer, `z-30` backdrop, `z-10` contenido. Documentado en comentario CSS. |

---

## 6. Fase 4 · Adaptar profile (sin workflows)

**Objetivo**: portar [SERVER/pages/profile.html](../SERVER/pages/profile.html) a React, eliminando todo lo relativo a workflows/automatizaciones/n8n y sustituyéndolo por estadísticas de estudio.

### 6.1 Archivos a crear

```
frontend/src/features/profile/
├── pages/
│   └── ProfilePage.jsx                 (sustituye PlaceholderPage de Fase 3)
├── sections/
│   ├── AccountInfoSection.jsx          (nombre, email, institución educativa)
│   ├── SecuritySection.jsx             (cambio de contraseña)
│   ├── AvatarSection.jsx               (upload + preview)
│   └── StudyStatsSection.jsx           (mapas creados, flashcards revisadas, racha)
├── components/
│   ├── ProfileTabs.jsx                 (tabs verticales en desktop, select en mobile)
│   └── AvatarUploader.jsx
└── services/
    └── profileService.js               (getProfile, updateProfile, changePassword, uploadAvatar)
```

### 6.2 Cambios respecto a `profile.html`

**Eliminar literal**:
- "Mis Workflows", "Workflow Builder", "Ejecuciones recientes"
- "Estadísticas de automatización"
- "Conexiones n8n", "Bridge Status"
- Cualquier tab/sección con esos nombres

**Sustituir por**:
- Sección "Mis estudios" → mapas creados (placeholder con `EmptyState` hasta Fase Maps)
- Sección "Progreso de aprendizaje" → flashcards revisadas (mock o real si existe), racha días (mock)
- Sección "Logros" (opcional) → badge si ≥10 mapas; **omitir si no da tiempo**

**Mantener**:
- Editar nombre, email
- "Empresa" → renombrar UI a **"Institución educativa"** (la columna BD `company` queda igual hasta refactor backend; ADR)
- Cambiar contraseña (actual + nueva + confirm)
- Avatar upload con preview
- Fecha de registro (read-only)

### 6.3 Endpoints reutilizados (no tocar firma backend)

| Endpoint | Método `apiClient` |
| --- | --- |
| `profile/me` | `apiGet` |
| `profile/update` | `apiPost` |
| `profile/password` | `apiPost` |
| `profile/avatar` | `apiUpload` (multipart, no JSON) |

### 6.4 Criterio de DONE

1. `/perfil` muestra el perfil del usuario logueado. `grep -i "workflow\|automatiz\|n8n\|ejecuc"` en el HTML renderizado: **cero resultados**.
2. Editar nombre + institución → `profile/update` → toast verde, datos persisten al recargar.
3. Cambiar contraseña valida actual ≠ vacío, nueva ≥ 6 chars, confirm = nueva. Llama `profile/password`.
4. Subir avatar (`<input type="file" accept="image/*">`) llama `profile/avatar` (FormData), muestra preview optimista, persiste tras recargar.
5. Sección "Progreso" con mock o datos reales si existen. `EmptyState` amigable si vacío.
6. Diseño coherente con shell (paleta veraniega, glass cards, sin scroll horizontal).
7. Tabs colapsan a `<select>` en mobile (<768px).
8. Commit: `feat(profile): adaptar perfil a StudyWeaver (estudio en lugar de workflows)`.

### 6.5 Horas estimadas: **3–4 h**

### 6.6 Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| `profileController::updateProfile` espera clave `company` | Mantener clave backend `company` y solo cambiar **etiqueta UI** a "Institución educativa". Renombrar BD se planifica para refactor backend (no entra en este plan). ADR. |
| Carga avatar (multipart) con `apiClient` que asume JSON | Añadir `apiUpload(route, formData)` específico que no setee `Content-Type` (fetch lo pone solo con boundary). Ya previsto en Fase 0. |
| **CSS premium Apple-style** del `profile.html` actual (~500 líneas de `:root` + `cubic-bezier`) | **NO portar 1:1**. Implementar tabs simples con Tailwind. Defendible como "decisión por timebox: el CSS premium del HTML antiguo era impresionante pero no aporta funcionalidad evaluable; preferimos tiempo en features evaluables". Documentar en `decisiones.md`. |
| **Datos de "Progreso"** dependen de tablas que no existen aún (mapas, flashcard_reviews) | Mock con `// TODO: conectar tras Fase Maps`. Documentar en memoria. Defendible: el alumno explica el contrato y por qué se dejó mock. |
| **Tab horizontal** con animación `tabEnter` del HTML actual | Implementar transición simple `opacity` + `translateY-2` con Tailwind `transition` + `data-state` o key cambiante. Suficiente. |
| **Email read-only o editable** | El backend lo permite editar pero re-envía confirmación. **Decisión: editable con warning** "Cambiar email requerirá reconfirmar tu cuenta". Documentar. |

---

## 7. Resumen ejecutivo

### 7.1 Tabla maestra

| Fase | Foco | Horas | Día sugerido (ROADMAP CLAUDE.md) |
| --- | --- | --- | --- |
| 0 | Setup frontend + tokens + AuthContext + apiClient | 3–4 h | Mar 28 mañana |
| 1 | 6 páginas auth | 5–6 h | Mar 28 tarde |
| 2 | Landing StudyWeaver | 4–5 h | Mié 29 mañana |
| 3 | App shell + Dashboard placeholder | 4–5 h | Mié 29 tarde |
| 4 | Profile sin workflows | 3–4 h | Jue 30 mañana |
| **Total** | | **19–24 h** | **~3 días hábiles** |

Cabe holgadamente en martes 28 + miércoles 29 + jueves 30 mañana, dejando jueves tarde para empezar el editor Drawflow + IA (Fase Maps, fuera de este plan).

### 7.2 Reglas transversales que aplican a todas las fases

1. **Comentarios y docstrings en castellano** en cada función pública.
2. **Validación con Playwright** tras cada fase visible (regla CLAUDE.md "test UI antes de marcar feature como done").
3. **Sin librerías nuevas** salvo las ya enumeradas en §1.4. Cualquier nueva → ADR en `docs/decisiones.md`.
4. **Commits pequeños** con mensaje en castellano: un commit por fase mínimo, idealmente uno por componente grande.
5. **Cada fase termina con un check de defendibilidad**: ¿el alumno puede explicar cada decisión ante el tribunal? Si no, simplificar.
6. **No tocar `API/`, `MODEL/`, `DATA/`** durante este plan. La migración del backend a `backend/` se planifica aparte.

### 7.3 Próximo paso

Empezamos por **Fase 0**. Acción inmediata sugerida:

1. Confirmar `DATA/cors.php` permite `http://localhost:5173` (revisión 2 min).
2. `npm create vite@latest frontend -- --template react`.
3. Instalar deps de §1.4.
4. Crear estructura de §2.1 con archivos vacíos (esqueleto).
5. Implementar `@theme` de §1.3 y verificar que `bg-brand-500` funciona.
6. Implementar AuthContext + apiClient + ProtectedRoute.
7. DONE checks de §2.3 → commit.
