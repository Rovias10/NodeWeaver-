import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/auth/useAuth.js';
import { useNotification } from '@/ui/useNotification.js';
import { googleLogin } from './authService.js';

/**
 * Botón "Continuar con Google" / "Registrarse con Google".
 *
 * Implementación con Google Identity Services (GIS). Sustituye al
 * flujo OAuth Implicit Flow legacy (NodeWeaver) que redirigía a un
 * archivo PHP que ya no existe en el backend reorganizado.
 *
 * Flujo:
 *   1. Cargado <script src="https://accounts.google.com/gsi/client">
 *      en index.html.
 *   2. Al montarse el componente, esperamos a que `window.google`
 *      esté disponible y llamamos a `accounts.id.initialize` con el
 *      client_id del proyecto y un callback que recibe `{credential}`.
 *   3. `accounts.id.renderButton(divRef, {...})` pinta el botón
 *      oficial dentro del div. El estilo es de Google (no se puede
 *      personalizar al 100%), pero queda coherente con la zona de
 *      auth y respeta accesibilidad por defecto.
 *   4. Cuando el usuario hace login, el callback recibe un JWT
 *      firmado por Google (id_token). Lo enviamos al backend a través
 *      de `auth/google`, que lo verifica contra
 *      `oauth2.googleapis.com/tokeninfo` y emite nuestro JWT propio.
 *   5. Tras éxito, persistimos sesión en AuthContext y navegamos a
 *      la ruta original (`location.state.from`) o a `/apuntes`.
 *
 * Defendible ante tribunal:
 *   - Sin redirect_uri ni callback PHP. Todo ocurre en la SPA.
 *   - El client_id es público (lo expone el frontend al navegador
 *     en cualquier flujo OAuth de cliente público); no es un secreto.
 *     El secreto real (verificación de firma) vive en Google y la
 *     valida nuestro backend al hacer la llamada `tokeninfo`.
 *   - Compatible con Authorized JavaScript origins de Google Cloud
 *     Console; en dev: http://localhost:5173. No usa redirect URIs.
 */

const GOOGLE_CLIENT_ID =
  '558764914281-cklberlvgkjd04d9fhmo2umuq9eudp4j.apps.googleusercontent.com';


function waitForGoogleScript(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google);
      return;
    }
    const start = Date.now();
    const intervalId = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(intervalId);
        resolve(window.google);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(intervalId);
        reject(new Error('No se pudo cargar Google Identity Services.'));
      }
    }, 100);
  });
}

export function GoogleButton({ label = 'Continuar con Google' }) {
  const buttonContainerRef = useRef(null);
  const { login: loginToContext } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const [scriptStatus, setScriptStatus] = useState('loading');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const redirectTo = location.state?.from?.pathname || '/apuntes';

  useEffect(() => {
    let cancelled = false;

    waitForGoogleScript()
      .then((google) => {
        if (cancelled || !buttonContainerRef.current) return;

        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            if (!response?.credential) {
              notify('No se recibió un token válido de Google.', 'error');
              return;
            }
            setIsAuthenticating(true);
            try {
              const data = await googleLogin(response.credential);
              if (data.success && data.token) {
                loginToContext(data.token, data.user);
                notify('¡Login con Google correcto!', 'success');
                navigate(redirectTo, { replace: true });
              } else {
                notify(data.message || 'No se pudo iniciar sesión con Google.', 'error');
                setIsAuthenticating(false);
              }
            } catch (err) {
              notify(`Error de conexión: ${err.message}`, 'error');
              setIsAuthenticating(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        google.accounts.id.renderButton(buttonContainerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: label.toLowerCase().includes('regist') ? 'signup_with' : 'signin_with',
          shape: 'pill',
          logo_alignment: 'center',
          width: buttonContainerRef.current.clientWidth || 320,
        });

        setScriptStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setScriptStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [label, loginToContext, navigate, notify, redirectTo]);

  return (
    <div className="w-full">
      <div
        ref={buttonContainerRef}
        className="flex justify-center min-h-[44px]"
        aria-busy={isAuthenticating || undefined}
      />

      {scriptStatus === 'loading' && (
        <p className="text-xs text-ink-faint text-center mt-2">
          Cargando Google…
        </p>
      )}

      {scriptStatus === 'error' && (
        <p className="text-xs text-coral-500 text-center mt-2">
          No se pudo cargar el botón de Google. Comprueba tu conexión.
        </p>
      )}

      {isAuthenticating && (
        <p className="text-xs text-ink-muted text-center mt-2" role="status">
          Validando con StudyWeaver…
        </p>
      )}
    </div>
  );
}
