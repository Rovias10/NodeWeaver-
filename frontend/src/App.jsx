import { RouterProvider } from 'react-router';
import { router } from '@/router/routes.jsx';
import { AuthProvider } from '@/auth/AuthContext.jsx';
import { NotificationProvider } from '@/components/feedback/NotificationProvider.jsx';

/**
 * Raíz de la aplicación.
 *
 * Orden de providers (de fuera hacia dentro):
 *   AuthProvider          → estado de sesión (usuario, token).
 *   NotificationProvider  → toasts globales accesibles desde cualquier hook.
 *   RouterProvider        → árbol de rutas (React Router 7, Library mode).
 */
export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <RouterProvider router={router} />
      </NotificationProvider>
    </AuthProvider>
  );
}
