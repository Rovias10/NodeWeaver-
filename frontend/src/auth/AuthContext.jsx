import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setToken, TOKEN_STORAGE_KEY } from '@/api/client';
import { isJwtExpired } from '@/utils/jwt';

/**
 * Estado global de autenticación.
 *
 * Forma del valor expuesto:
 *   {
 *     user: object|null,           // perfil del usuario, persistido en localStorage
 *     token: string|null,          // JWT
 *     isAuthenticated: boolean,
 *     isReady: boolean,            // false hasta que se haya rehidratado desde localStorage
 *     login(token, user),
 *     logout(),
 *     updateUser(partial),         // mutación parcial del usuario en memoria
 *   }
 */
export const AuthContext = createContext(null);

const USER_KEY = 'sw_user';
function readPersistedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePersistedUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
  }
}

/**
 * Provider de autenticación. Envuelve la app en main.jsx.
 *
 * Política:
 * - Al montar, intenta restaurar { token, user } de localStorage. Si el
 *   token está caducado, limpia silenciosamente la sesión.
 * - Escucha el evento global 'auth:logout' que dispara apiClient cuando
 *   recibe un 401, y cierra sesión.
 */
export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(null);
  const [user, setUser] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const listenerAttached = useRef(false);

  const logout = useCallback(() => {
    setToken(null);
    writePersistedUser(null);
    setTokenState(null);
    setUser(null);
  }, []);

  const login = useCallback((newToken, newUser) => {
    setToken(newToken);
    writePersistedUser(newUser);
    setTokenState(newToken);
    setUser(newUser);
  }, []);

  const updateUser = useCallback((partial) => {
    setUser((current) => {
      const next = { ...(current ?? {}), ...partial };
      writePersistedUser(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const storedUser = readPersistedUser();

    if (storedToken && !isJwtExpired(storedToken)) {
      setTokenState(storedToken);
      setUser(storedUser);
    } else if (storedToken) {
      setToken(null);
      writePersistedUser(null);
    }

    setIsReady(true);
  }, []);

  useEffect(() => {
    if (listenerAttached.current) return;
    listenerAttached.current = true;
    const handler = () => logout();
    window.addEventListener('auth:logout', handler);
    return () => {
      window.removeEventListener('auth:logout', handler);
      listenerAttached.current = false;
    };
  }, [logout]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      isReady,
      login,
      logout,
      updateUser,
    }),
    [user, token, isReady, login, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
