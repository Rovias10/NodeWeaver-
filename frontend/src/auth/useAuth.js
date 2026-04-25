import { useContext } from 'react';
import { AuthContext } from './AuthContext.jsx';

/**
 * Hook de conveniencia para acceder al contexto de autenticación.
 * Lanza si se usa fuera del AuthProvider, lo que facilita detectar
 * errores de árbol de componentes durante el desarrollo.
 *
 * @returns {{
 *   user: object|null,
 *   token: string|null,
 *   isAuthenticated: boolean,
 *   isReady: boolean,
 *   login: (token: string, user: object) => void,
 *   logout: () => void,
 *   updateUser: (partial: object) => void,
 * }}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  }
  return ctx;
}
