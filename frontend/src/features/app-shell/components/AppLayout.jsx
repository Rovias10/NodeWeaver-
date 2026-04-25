import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ProtectedRoute } from '@/auth/ProtectedRoute.jsx';
import { AmbientBackground } from '@/components/layout/AmbientBackground.jsx';
import { AppNavbar } from './AppNavbar.jsx';
import { AppSidebar } from './AppSidebar.jsx';
import { MobileDrawer } from './MobileDrawer.jsx';

/**
 * Shell común a todas las pantallas autenticadas.
 *
 * Estructura visual:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  AppNavbar (sticky)                                  │
 *   ├────────────┬─────────────────────────────────────────┤
 *   │  Sidebar   │                                         │
 *   │  (desktop) │   <Outlet />  ← contenido de la página  │
 *   │            │                                         │
 *   └────────────┴─────────────────────────────────────────┘
 *
 * En mobile la sidebar se reemplaza por un drawer desplegable que
 * abre el botón hamburguesa de la navbar.
 *
 * El componente está envuelto en <ProtectedRoute>: si el visitante
 * no tiene sesión, AuthContext + ProtectedRoute lo desvían a /login.
 */
export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Cierra el drawer al cambiar de ruta. Importante en mobile cuando
  // el usuario navega desde el drawer (también lo hace el callback
  // del NavItem, pero aquí dejamos una salvaguarda por si se navega
  // desde dentro de la página, p. ej. EmptyState).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <ProtectedRoute>
      <AmbientBackground />
      <div className="min-h-dvh flex flex-col">
        <AppNavbar onOpenDrawer={() => setDrawerOpen(true)} />

        <div className="flex flex-1 min-h-0">
          <AppSidebar />
          <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

          <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
