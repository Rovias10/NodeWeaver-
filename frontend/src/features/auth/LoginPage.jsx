import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { AuthCard } from './AuthCard.jsx';
import { PasswordInput } from './PasswordInput.jsx';
import { GoogleButton } from './GoogleButton.jsx';
import { AuthDivider } from './AuthDivider.jsx';
import { Input } from '@/ui/Input.jsx';
import { Button } from '@/ui/Button.jsx';
import { useAuth } from '@/auth/useAuth.js';
import { useNotification } from '@/ui/useNotification.js';
import { login as loginRequest } from './authService.js';

/**
 * Pantalla de inicio de sesión. Equivalente React de SERVER/pages/auth/login.html.
 *
 * Conserva la lógica original:
 *   - POST a auth/login con { email, password }.
 *   - Tras success: persiste token + user en AuthContext y redirige.
 *   - Errores se muestran como toast (no alert) y dejan el form usable.
 *
 * Mejoras respecto al original:
 *   - Si ya hay sesión, redirige automáticamente (no se queda en /login).
 *   - Tras ProtectedRoute, vuelve a la ruta original (location.state.from).
 *   - Validación inline de email antes de pegar al backend.
 */
export function LoginPage() {
  const { isAuthenticated, login: loginToContext } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || '/apuntes';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to={redirectTo} replace />;

  function validate() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Introduce un email válido.');
      return false;
    }
    setEmailError(null);
    return true;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    notify('Iniciando sesión…', 'info');

    try {
      const data = await loginRequest({ email, password });
      if (data.success && data.token) {
        loginToContext(data.token, data.user);
        notify('¡Login correcto! Redirigiendo…', 'success');
        navigate(redirectTo, { replace: true });
      } else {
        notify(data.message || 'Credenciales inválidas', 'error');
        setSubmitting(false);
      }
    } catch (err) {
      notify(`Error de conexión: ${err.message}`, 'error');
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Bienvenido de nuevo" subtitle="Inicia sesión en tu cuenta de StudyWeaver">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <Input
          label="Email"
          type="email"
          icon="fa-envelope"
          placeholder="tu@email.com"
          value={email}
          autoComplete="email"
          required
          error={emailError ?? undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError(null);
          }}
        />

        <div>
          <PasswordInput
            label="Contraseña"
            placeholder="••••••••"
            value={password}
            autoComplete="current-password"
            required
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="text-right mt-2">
            <Link
              to="/recuperar"
              className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors inline-block py-1"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </div>

        <Button type="submit" size="lg" isLoading={submitting} className="w-full mt-2">
          {!submitting && <i className="fas fa-sign-in-alt" aria-hidden="true" />}
          {submitting ? 'Entrando…' : 'Iniciar sesión'}
        </Button>

        <AuthDivider />
        <GoogleButton />
      </form>

      <p className="mt-8 text-center text-sm text-ink-muted">
        ¿No tienes una cuenta?{' '}
        <Link
          to="/registro"
          className="bg-gradient-to-r from-brand-600 to-coral-400 bg-clip-text text-transparent font-bold ml-1 hover:brightness-110 transition inline-block py-1"
        >
          Regístrate gratis
        </Link>
      </p>
    </AuthCard>
  );
}
