import { createBrowserRouter } from 'react-router';
import { ProtectedRoute } from '@/auth/ProtectedRoute.jsx';
import { SetupOkPage } from './pages/SetupOkPage.jsx';
import { ApiPingPage } from './pages/ApiPingPage.jsx';
import { DashboardStubPage } from './pages/DashboardStubPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { LoginPage } from '@/features/auth/pages/LoginPage.jsx';
import { RegisterPage } from '@/features/auth/pages/RegisterPage.jsx';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage.jsx';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage.jsx';
import { ConfirmAccountPage } from '@/features/auth/pages/ConfirmAccountPage.jsx';
import { WaitConfirmationPage } from '@/features/auth/pages/WaitConfirmationPage.jsx';

/**
 * Definición central de rutas en modo "Library / Data Mode" (React Router v7).
 *
 *   Públicas:
 *     /                          → smoke test del sistema de diseño (Fase 0).
 *     /__ping                    → smoke test de apiClient + CORS (Fase 0).
 *     /login                     → inicio de sesión.
 *     /registro                  → alta de cuenta.
 *     /recuperar                 → solicitar email de recuperación.
 *     /reset?token=...           → restablecer contraseña (link del email).
 *     /confirmar?token=...       → confirmar cuenta (link del email).
 *     /esperando-confirmacion    → pantalla informativa post-registro.
 *
 *   Privadas:
 *     /dashboard                 → ruta protegida; sin sesión redirige a /login.
 *
 *   *                            → 404 amigable.
 *
 * Las rutas con token usan query string (?token=...) en vez de path
 * params para ser compatibles con las plantillas SendGrid existentes.
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
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <DashboardStubPage />
      </ProtectedRoute>
    ),
  },

  { path: '*', element: <NotFoundPage /> },
]);
