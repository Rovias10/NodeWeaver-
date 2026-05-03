import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { AuthCard } from './AuthCard.jsx';
import { PasswordInput } from './PasswordInput.jsx';
import { PasswordStrengthMeter } from './PasswordStrengthMeter.jsx';
import { GoogleButton } from './GoogleButton.jsx';
import { AuthDivider } from './AuthDivider.jsx';
import { Input } from '@/ui/Input.jsx';
import { Button } from '@/ui/Button.jsx';
import { useAuth } from '@/auth/useAuth.js';
import { useNotification } from '@/ui/useNotification.js';
import { register as registerRequest } from './authService.js';
import { isEmail } from '@/utils/validators.js';

/**
 * Pantalla de registro. Equivalente React de SERVER/pages/auth/register.html.
 *
 * Campos del backend (auth/register):
 *   - name (obligatorio)
 *   - email (obligatorio, formato válido)
 *   - password (obligatorio, mínimo 6 chars; lo verifica también el backend)
 *   - phone (opcional)
 *   - company_name (opcional)
 *
 * Tras success el backend NO devuelve token: dispara el email de
 * confirmación y obliga al usuario a verificar antes de poder loguear.
 * Por eso aquí redirigimos a /esperando-confirmacion en lugar de
 * /dashboard.
 */
export function RegisterPage() {
  const { isAuthenticated } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    password: '',
    confirmPassword: '',
    terms: false,
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/apuntes" replace />;

  function update(field) {
    return (event) => {
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
    };
  }

  function validate() {
    const next = {};
    if (!form.name.trim()) next.name = 'El nombre es obligatorio.';
    if (!isEmail(form.email)) next.email = 'Introduce un email válido.';
    if (form.password.length < 6) next.password = 'Mínimo 6 caracteres.';
    if (form.password !== form.confirmPassword) next.confirmPassword = 'Las contraseñas no coinciden.';
    if (!form.terms) next.terms = 'Debes aceptar los términos.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) {
      notify('Por favor, corrige los errores del formulario.', 'error');
      return;
    }

    setSubmitting(true);
    notify('Creando tu cuenta…', 'info');

    try {
      const data = await registerRequest({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        company_name: form.company.trim() || null,
        phone: form.phone.trim() || null,
      });

      if (data.success) {
        notify(data.message || 'Cuenta creada. Revisa tu correo.', 'success');
        setTimeout(() => navigate('/esperando-confirmacion'), 1200);
      } else {
        notify(data.message || 'No se pudo crear la cuenta.', 'error');
        setSubmitting(false);
      }
    } catch (err) {
      notify(`Error de conexión: ${err.message}`, 'error');
      setSubmitting(false);
    }
  }

  const showMatchHint = form.confirmPassword.length > 0 && !errors.confirmPassword;
  const passwordsMatch = showMatchHint && form.password === form.confirmPassword;

  return (
    <AuthCard
      title="Crear tu cuenta"
      subtitle="Empieza a estudiar mejor en segundos"
      width="2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex flex-col gap-5">
            <Input
              label="Nombre completo"
              type="text"
              icon="fa-user"
              placeholder="Pedro Pedrete"
              value={form.name}
              onChange={update('name')}
              required
              autoComplete="name"
              error={errors.name}
            />

            <Input
              label="Email"
              type="email"
              icon="fa-envelope"
              placeholder="tu@email.com"
              value={form.email}
              onChange={update('email')}
              required
              autoComplete="email"
              error={errors.email}
            />

            <div>
              <PasswordInput
                label="Contraseña"
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={update('password')}
                required
                autoComplete="new-password"
                error={errors.password}
              />
              <PasswordStrengthMeter password={form.password} />
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <Input
              label="Institución educativa (opcional)"
              type="text"
              icon="fa-building"
              placeholder="Universidad / instituto"
              value={form.company}
              onChange={update('company')}
              autoComplete="organization"
            />

            <Input
              label="Teléfono (opcional)"
              type="tel"
              icon="fa-phone"
              placeholder="+34 600 000 000"
              value={form.phone}
              onChange={update('phone')}
              autoComplete="tel"
            />

            <div>
              <PasswordInput
                label="Confirmar contraseña"
                placeholder="Repite la contraseña"
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
                required
                autoComplete="new-password"
                error={errors.confirmPassword}
              />
              {showMatchHint && passwordsMatch && (
                <p className="text-emerald-700 text-xs mt-1 font-medium">
                  <i className="fas fa-check" aria-hidden="true" /> Coinciden
                </p>
              )}
            </div>
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={form.terms}
            onChange={update('terms')}
            className="mt-1 w-5 h-5 rounded border-line text-brand-500 focus:ring-brand-400 focus:ring-2 focus:ring-offset-0 bg-white"
          />
          <span className="text-sm text-ink-muted">
            Acepto los{' '}
            <a href="#" className="text-brand-600 hover:text-brand-700 hover:underline inline-block py-0.5">
              Términos y Condiciones
            </a>{' '}
            y la{' '}
            <a href="#" className="text-brand-600 hover:text-brand-700 hover:underline inline-block py-0.5">
              Política de Privacidad
            </a>
          </span>
        </label>
        {errors.terms && <p className="text-coral-500 text-xs ml-7 -mt-3">{errors.terms}</p>}

        <Button type="submit" size="lg" isLoading={submitting} className="w-full mt-2">
          {!submitting && <i className="fas fa-user-plus" aria-hidden="true" />}
          {submitting ? 'Creando cuenta…' : 'Crear cuenta gratis'}
        </Button>

        <AuthDivider />
        <GoogleButton label="Registrarse con Google" />
      </form>

      <p className="mt-8 text-center text-sm text-ink-muted">
        ¿Ya tienes una cuenta?{' '}
        <Link
          to="/login"
          className="bg-linear-to-r from-brand-600 to-coral-400 bg-clip-text text-transparent font-bold ml-1 hover:brightness-110 transition inline-block py-1"
        >
          Inicia sesión
        </Link>
      </p>
    </AuthCard>
  );
}
