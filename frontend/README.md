# StudyWeaver · frontend

SPA en React + Vite que consume el backend PHP que vive en `../API/`.

## Requisitos

- Node 20 o superior.
- XAMPP corriendo Apache + MySQL en local, sirviendo este repositorio en `http://localhost/NodeWeaver-/`.

## Arrancar en desarrollo

```bash
npm install
npm run dev
```

La app queda en `http://localhost:5173`. La URL del backend se configura en
[`.env.development`](.env.development) mediante `VITE_API_BASE`.

## Smoke tests de Fase 0

Tras `npm run dev`, abre las siguientes rutas para validar la base:

| Ruta            | Qué comprueba                                                              |
| --------------- | -------------------------------------------------------------------------- |
| `/`             | Tokens de Tailwind 4, Card, Button, NotificationProvider y AmbientBackground. |
| `/__ping`       | Wrapper `apiClient` y CORS contra el backend (`auth/login` con body vacío).  |
| `/dashboard`    | `<ProtectedRoute>` redirige a `/login` cuando no hay sesión.                 |

## Estructura

```
src/
├── api/         # client.js (fetch con JWT) + endpoints.js (constantes)
├── auth/        # AuthContext, useAuth, ProtectedRoute
├── components/
│   ├── feedback/ # NotificationProvider + useNotification
│   ├── layout/   # AmbientBackground (capa decorativa global)
│   └── ui/       # Button, Card, Input, Spinner
├── router/      # createBrowserRouter + páginas placeholder
├── styles/      # index.css con @theme (tokens veraniegos)
└── utils/       # validators.js, jwt.js (decode payload)
```

## Convenciones

- Comentarios y mensajes hacia el usuario en castellano.
- Componentes funcionales con hooks. Sin Redux, sin React Query.
- Sin TypeScript en este proyecto (decisión registrada en `docs/decisiones.md`).
- Tailwind 4 con `@theme` en lugar de `tailwind.config.js`. Tokens y mapping
  documentados en [`docs/redesign-plan.md`](../docs/redesign-plan.md).
