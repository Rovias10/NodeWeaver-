/**
 * Botón "Continuar con Google" / "Registrarse con Google".
 *
 * Mantiene la integración existente: redirige al endpoint OAuth de
 * Google con el CLIENT_ID y la URI de redirect del backend antiguo
 * (auth/google-oauth.php). No es ideal en una SPA — tras el OAuth el
 * usuario aterriza en una página PHP — pero rediseñar el flujo
 * completo (callback en /oauth/callback que llame a auth/google con
 * el id_token) queda fuera del scope de Fase 1.
 *
 * Documentado como deuda en docs/decisiones.md → "OAuth Google
 * pendiente de migrar a flujo SPA".
 */

const GOOGLE_CLIENT_ID =
  '558764914281-cklberlvgkjd04d9fhmo2umuq9eudp4j.apps.googleusercontent.com';

// Redirect heredado del backend NodeWeaver. Sustituir cuando se migre
// el flujo a una página /oauth/callback en la SPA.
const LEGACY_REDIRECT_URI = 'http://localhost/backend/auth/google-oauth.php';

function buildGoogleAuthUrl() {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: LEGACY_REDIRECT_URI,
    response_type: 'token',
    scope: 'email profile openid',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function GoogleButton({ label = 'Continuar con Google' }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = buildGoogleAuthUrl();
      }}
      className={
        'w-full bg-white hover:bg-brand-50 border border-line text-ink font-medium py-3 ' +
        'rounded-xl flex items-center justify-center gap-2 transition-all ' +
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-paper'
      }
    >
      <i className="fab fa-google text-lg text-brand-600" aria-hidden="true" />
      {label}
    </button>
  );
}
