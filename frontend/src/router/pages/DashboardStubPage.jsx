import { Link } from 'react-router';
import { AmbientBackground } from '@/components/layout/AmbientBackground.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { useAuth } from '@/auth/useAuth.js';

/**
 * Stub del dashboard para Fase 0.
 *
 * Sólo se renderiza si hay sesión (lo garantiza ProtectedRoute).
 * Muestra el usuario almacenado y un botón para cerrar sesión, lo que
 * permite probar el ciclo completo de auth en local sin formulario real.
 *
 * Será reemplazado por DashboardPage en Fase 3.
 */
export function DashboardStubPage() {
  const { user, logout } = useAuth();

  return (
    <>
      <AmbientBackground />
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card elevated className="max-w-xl w-full">
          <h1 className="text-2xl font-bold text-ink mb-2">Dashboard (placeholder)</h1>
          <p className="text-ink-muted text-sm">Si ves esto, la sesión está activa.</p>

          <pre className="mt-4 text-xs font-mono bg-brand-50 border border-brand-200 rounded-lg p-3 text-ink whitespace-pre-wrap">
            {JSON.stringify(user, null, 2) || '(sin datos de usuario)'}
          </pre>

          <div className="flex gap-3 mt-6">
            <Button onClick={logout} variant="danger">
              Cerrar sesión
            </Button>
            <Link to="/">
              <Button variant="ghost">Inicio</Button>
            </Link>
          </div>
        </Card>
      </main>
    </>
  );
}
