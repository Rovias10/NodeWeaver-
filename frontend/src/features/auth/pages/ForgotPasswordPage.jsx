import { useState } from 'react';
import { Link } from 'react-router';
import { AuthCard } from '../components/AuthCard.jsx';
import { Input } from '@/components/ui/Input.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { useNotification } from '@/components/feedback/useNotification.js';
import { forgotPassword as forgotRequest } from '../services/authService.js';
import { isEmail } from '@/utils/validators.js';

/**
 * Solicitud de email para recuperar contraseña.
 * Equivalente React de SERVER/pages/auth/forgot-password.html.
 *
 * Política de privacidad: el backend SIEMPRE devuelve success=true,
 * exista o no el email, para no filtrar qué cuentas están registradas.
 * Por eso la UI muestra el mismo "panel de éxito" en ambos casos
 * cuando el body llega bien — no expone si el email existía.
 */
export function ForgotPasswordPage() {
  const { notify } = useNotification();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    if (!isEmail(email)) {
      setEmailError('Introduce un email válido.');
      return;
    }
    setEmailError(null);
    setSubmitting(true);

    try {
      const data = await forgotRequest(email.trim());
      if (data.success) {
        setSent(true);
      } else {
        notify(data.message || 'No se pudo enviar el correo.', 'error');
        setSubmitting(false);
      }
    } catch (err) {
      notify(`Error de conexión: ${err.message}`, 'error');
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Recuperar acceso"
      subtitle="Te enviaremos un enlace para restablecer tu contraseña"
    >
      {sent ? (
        <div
          role="status"
          className="flex flex-col items-center justify-center gap-4 p-8 rounded-2xl bg-mint-400/15 border border-mint-400/40 text-center"
        >
          <i className="fas fa-paper-plane text-5xl text-emerald-700" aria-hidden="true" />
          <p className="text-lg font-bold text-emerald-700">¡Enviado con éxito!</p>
          <p className="text-sm text-ink-muted">
            Si el correo existe, recibirás las instrucciones en unos minutos.
          </p>
          <Link
            to="/login"
            className="mt-2 text-brand-600 hover:text-brand-700 font-bold text-sm flex items-center gap-2 transition-colors"
          >
            <i className="fas fa-arrow-left" aria-hidden="true" /> Volver al login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <Input
            label="Correo electrónico"
            type="email"
            icon="fa-envelope"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            required
            autoComplete="email"
            error={emailError ?? undefined}
          />

          <Button type="submit" size="lg" isLoading={submitting} className="w-full">
            {!submitting && <i className="fas fa-magic" aria-hidden="true" />}
            {submitting ? 'Enviando…' : 'Enviar instrucciones'}
          </Button>
        </form>
      )}

      {!sent && (
        <div className="mt-8 text-center text-sm">
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 text-ink-muted hover:text-ink transition-colors group"
          >
            <i className="fas fa-arrow-left group-hover:-translate-x-1 transition-transform" aria-hidden="true" />
            Volver al inicio de sesión
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
