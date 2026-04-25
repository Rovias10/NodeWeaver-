import { Link } from 'react-router';
import { AmbientBackground } from '@/ui/AmbientBackground.jsx';
import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';

/**
 * 404 amigable. La SPA usa BrowserRouter, así que cualquier ruta no
 * declarada cae aquí.
 */
export function NotFoundPage() {
  return (
    <>
      <AmbientBackground />
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card elevated className="max-w-md w-full text-center">
          <p className="text-6xl font-bold bg-gradient-to-r from-brand-500 to-coral-400 bg-clip-text text-transparent">
            404
          </p>
          <h1 className="text-xl font-bold text-ink mt-2">Esta ruta no existe</h1>
          <p className="text-ink-muted text-sm mt-2">
            Quizá te equivocaste de URL o aún no hemos construido esa pantalla.
          </p>
          <Link to="/" className="inline-block mt-6">
            <Button>Volver al inicio</Button>
          </Link>
        </Card>
      </main>
    </>
  );
}
