import { Navigate, useLocation } from 'react-router';
import { useAuth } from './useAuth.js';

/**
 * Envoltorio de rutas privadas.
 *
 * - Mientras AuthProvider rehidrata desde localStorage, mostramos un
 *   placeholder vacío (no parpadeo). isReady garantiza que ya tomamos
 *   la decisión correcta.
 * - Si no hay sesión, redirige a /login conservando la ubicación
 *   original en location.state.from para volver tras el login.
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, isReady } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return <div aria-busy="true" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
