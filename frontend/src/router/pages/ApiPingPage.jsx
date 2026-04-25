import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { apiPost } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
import { AmbientBackground } from '@/components/layout/AmbientBackground.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

/**
 * Smoke test del wrapper apiClient + CORS.
 *
 * Llama a auth/login con credenciales vacías esperando una respuesta
 * controlada del backend (success: false). Si la petición se completa
 * con cualquier JSON, el canal cliente↔backend está sano.
 *
 * Si en su lugar obtenemos un fallo de red o de CORS, lo mostramos
 * con detalle para depurar.
 *
 * Se elimina al finalizar Fase 0.
 */
export function ApiPingPage() {
  const [state, setState] = useState({ status: 'loading', payload: null, error: null });
  const [base] = useState(() => import.meta.env.VITE_API_BASE ?? '(sin definir)');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Mandamos un body vacío adrede; el backend debería devolver
        // { success: false, message: 'Faltan credenciales' } o similar.
        const data = await apiPost(ENDPOINTS.auth.login, {});
        if (!cancelled) setState({ status: 'ok', payload: data, error: null });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', payload: null, error: err });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <AmbientBackground />
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card elevated className="max-w-2xl w-full">
          <h1 className="text-2xl font-bold text-ink mb-2">Smoke test · API</h1>
          <p className="text-ink-muted text-sm mb-4">
            Endpoint: <code className="font-mono text-brand-700">{base}?route={ENDPOINTS.auth.login}</code>
          </p>

          {state.status === 'loading' && (
            <div className="flex items-center gap-3 text-ink-muted">
              <Spinner /> Llamando al backend…
            </div>
          )}

          {state.status === 'ok' && (
            <div className="rounded-xl border border-mint-400/40 bg-mint-400/10 p-4">
              <p className="font-semibold text-emerald-700 mb-2">✅ Conexión y CORS funcionando</p>
              <pre className="text-xs text-ink-muted whitespace-pre-wrap break-words font-mono">
                {JSON.stringify(state.payload, null, 2)}
              </pre>
            </div>
          )}

          {state.status === 'error' && (
            <div className="rounded-xl border border-coral-400/50 bg-coral-400/10 p-4">
              <p className="font-semibold text-rose-700 mb-2">❌ Falló la llamada</p>
              <pre className="text-xs text-ink-muted whitespace-pre-wrap break-words font-mono">
                {String(state.error?.message ?? state.error)}
              </pre>
              <p className="text-xs text-ink-muted mt-3">
                Revisa que XAMPP esté arrancado y que <code>VITE_API_BASE</code> apunte al
                <code> index.php</code> del backend.
              </p>
            </div>
          )}

          <Link to="/" className="inline-block mt-6">
            <Button variant="ghost">Volver</Button>
          </Link>
        </Card>
      </main>
    </>
  );
}
