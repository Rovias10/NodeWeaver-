import { createBrowserRouter } from 'react-router';
import { SetupOkPage } from './pages/SetupOkPage.jsx';
import { ApiPingPage } from './pages/ApiPingPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { LoginPage } from '@/features/auth/pages/LoginPage.jsx';
import { RegisterPage } from '@/features/auth/pages/RegisterPage.jsx';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage.jsx';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage.jsx';
import { ConfirmAccountPage } from '@/features/auth/pages/ConfirmAccountPage.jsx';
import { WaitConfirmationPage } from '@/features/auth/pages/WaitConfirmationPage.jsx';
import { AppLayout } from '@/features/app-shell/components/AppLayout.jsx';
import { PlaceholderPage } from '@/features/app-shell/pages/PlaceholderPage.jsx';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage.jsx';

/**
 * Definición central de rutas en modo "Library / Data Mode" (React Router v7).
 *
 *   Públicas (sin shell):
 *     /                          → smoke test del sistema de diseño (Fase 0).
 *     /__ping                    → smoke test de apiClient + CORS (Fase 0).
 *     /login, /registro          → entrada a la app.
 *     /recuperar                 → solicitar email de recuperación.
 *     /reset?token=...           → restablecer contraseña.
 *     /confirmar?token=...       → confirmar cuenta.
 *     /esperando-confirmacion    → pantalla informativa post-registro.
 *
 *   Privadas (envueltas en AppLayout, requieren sesión):
 *     /dashboard                 → resumen del usuario (Fase 3).
 *     /mapas, /flashcards,
 *     /comunidad, /perfil        → placeholders hasta su Fase respectiva.
 *
 *   *                            → 404 amigable.
 *
 * Las rutas con token usan query string (?token=...) para ser compatibles
 * con las plantillas SendGrid existentes.
 */
export const router = createBrowserRouter([
  { path: '/',                       element: <SetupOkPage /> },
  { path: '/__ping',                 element: <ApiPingPage /> },

  { path: '/login',                  element: <LoginPage /> },
  { path: '/registro',               element: <RegisterPage /> },
  { path: '/recuperar',              element: <ForgotPasswordPage /> },
  { path: '/reset',                  element: <ResetPasswordPage /> },
  { path: '/confirmar',              element: <ConfirmAccountPage /> },
  { path: '/esperando-confirmacion', element: <WaitConfirmationPage /> },

  {
    element: <AppLayout />,
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
      {
        path: '/mapas',
        element: (
          <PlaceholderPage
            title="Mis mapas"
            icon="fa-diagram-project"
            description="Aquí podrás crear, abrir y compartir mapas conceptuales generados con IA a partir de tus apuntes y PDFs."
            phase="Fase Maps"
          />
        ),
      },
      {
        path: '/flashcards',
        element: (
          <PlaceholderPage
            title="Flashcards"
            icon="fa-clone"
            description="Repasa con repetición espaciada las tarjetas generadas a partir de tus mapas. Algoritmo SM-2 simplificado."
            phase="Fase Flashcards"
          />
        ),
      },
      {
        path: '/comunidad',
        element: (
          <PlaceholderPage
            title="Comunidad"
            icon="fa-users"
            description="Descubre mapas públicos, da likes, comenta y guarda los que te ayuden a estudiar."
            phase="Fase Social"
          />
        ),
      },
      {
        path: '/perfil',
        element: (
          <PlaceholderPage
            title="Mi perfil"
            icon="fa-user-gear"
            description="Edita tu nombre, institución educativa y contraseña. Sube avatar y revisa tu actividad de estudio."
            phase="Fase 4"
          />
        ),
      },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
]);
