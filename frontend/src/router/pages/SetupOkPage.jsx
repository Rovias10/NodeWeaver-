import { Link } from 'react-router';
import { AmbientBackground } from '@/components/layout/AmbientBackground.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { useNotification } from '@/components/feedback/useNotification.js';

/**
 * Página raíz temporal usada como smoke test de Fase 0.
 *
 * Verifica visualmente que:
 *   - Los tokens del @theme se compilan (bg-brand-500, text-ink, etc.).
 *   - El AmbientBackground se pinta correctamente.
 *   - Card, Button y Link de react-router funcionan.
 *   - El NotificationProvider responde.
 *
 * Será reemplazada en Fase 2 por la landing real de StudyWeaver.
 */
export function SetupOkPage() {
  const { notify } = useNotification();

  return (
    <>
      <AmbientBackground />
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card elevated className="max-w-xl w-full text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold mb-4 border border-brand-200">
            StudyWeaver · Fase 0
          </span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-ink">
            Setup&nbsp;
            <span className="bg-gradient-to-r from-brand-600 to-coral-400 bg-clip-text text-transparent">
              correcto
            </span>
          </h1>
          <p className="text-ink-muted mt-3 text-base">
            Vite + React + Tailwind 4 + React Router operativos. Tokens veraniegos cargados.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-6">
            <span className="h-10 rounded-lg bg-brand-500" title="brand-500" />
            <span className="h-10 rounded-lg bg-sun-300" title="sun-300" />
            <span className="h-10 rounded-lg bg-coral-400" title="coral-400" />
            <span className="h-10 rounded-lg bg-mint-400" title="mint-400" />
          </div>

          <div className="flex flex-wrap gap-3 justify-center mt-8">
            <Link to="/login">
              <Button>Iniciar sesión</Button>
            </Link>
            <Link to="/registro">
              <Button variant="ghost">Crear cuenta</Button>
            </Link>
          </div>

          <details className="mt-8 text-left text-xs text-ink-faint">
            <summary className="cursor-pointer hover:text-ink-muted transition-colors">
              Smoke tests internos
            </summary>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="md" variant="ghost" onClick={() => notify('Notificación de prueba', 'success')}>
                Probar toast
              </Button>
              <Link to="/__ping">
                <Button size="md" variant="ghost">Ver /__ping</Button>
              </Link>
              <Link to="/dashboard">
                <Button size="md" variant="ghost">Probar ProtectedRoute</Button>
              </Link>
            </div>
          </details>

          <p className="text-ink-faint text-xs mt-6">
            Esta página se sustituye por la landing definitiva en la Fase&nbsp;2.
          </p>
        </Card>
      </main>
    </>
  );
}
