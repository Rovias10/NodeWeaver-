import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AuthCard } from '../components/AuthCard.jsx';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { useNotification } from '@/components/feedback/useNotification.js';
import { resetPassword as resetRequest } from '../services/authService.js';

/**
 * Restablecer contraseña con token recibido por email.
 * Equivalente React de SERVER/pages/auth/reset-password.html.
 *
 * Lee el token del query string (?token=...) — coincide con la URL
 * que SendGrid genera en sendPasswordReset(). No usamos path params
 * (/reset/:token) para no tener que tocar las plantillas de email.
 *
 * Flujo:
 *   1. Si no hay token → estado de error con CTA a /recuperar.
 *   2. Si hay token → form con dos contraseñas; valida match y longitud.
 *   3. Tras success → estado de éxito con CTA a /login.
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { notify } = useNotification();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthCard title="Enlace inválido" icon="fa-link-slash">
        <div className="text-center text-sm text-ink-muted">
          <p>Falta el token de seguridad. Usa el enlace completo del correo que te enviamos.</p>
          <Link
            to="/recuperar"
            className="mt-6 inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-medium"
          >
            <i className="fas fa-arrow-left" aria-hidden="true" /> Solicitar otro enlace
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="¡Contraseña actualizada!" icon="fa-circle-check">
        <div className="text-center text-sm text-ink-muted">
          <p>Tu contraseña se ha guardado correctamente. Ya puedes iniciar sesión.</p>
          <Link to="/login" className="block mt-6">
            <Button size="lg" className="w-full">
              <i className="fas fa-sign-in-alt" aria-hidden="true" /> Ir al login
            </Button>
          </Link>
        </div>
      </AuthCard>
    );
  }

  function validate() {
    const next = {};
    if (password.length < 6) next.password = 'Mínimo 6 caracteres.';
    if (password !== confirmPassword) next.confirmPassword = 'Las contraseñas no coinciden.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);

    try {
      const data = await resetRequest({ token, password });
      if (data.success) {
        setDone(true);
      } else {
        notify(data.message || 'No se pudo actualizar la contraseña.', 'error');
        setSubmitting(false);
      }
    } catch (err) {
      notify(`Error de conexión: ${err.message}`, 'error');
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Nueva contraseña" subtitle="Crea una nueva contraseña segura">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
        <PasswordInput
          label="Nueva contraseña"
          placeholder="Mínimo 6 caracteres"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (errors.password) setErrors((p) => ({ ...p, password: null }));
          }}
          required
          autoComplete="new-password"
          error={errors.password}
        />

        <PasswordInput
          label="Confirmar nueva contraseña"
          placeholder="Repite la contraseña"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (errors.confirmPassword) setErrors((p) => ({ ...p, confirmPassword: null }));
          }}
          required
          autoComplete="new-password"
          error={errors.confirmPassword}
        />

        <Button type="submit" size="lg" isLoading={submitting} className="w-full mt-2">
          {!submitting && <i className="fas fa-save" aria-hidden="true" />}
          {submitting ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
      </form>

      <div className="mt-8 text-center text-sm">
        <Link
          to="/login"
          className="inline-flex items-center justify-center gap-2 text-ink-muted hover:text-ink transition-colors group"
        >
          <i className="fas fa-arrow-left group-hover:-translate-x-1 transition-transform" aria-hidden="true" />
          Volver al inicio de sesión
        </Link>
      </div>
    </AuthCard>
  );
}
