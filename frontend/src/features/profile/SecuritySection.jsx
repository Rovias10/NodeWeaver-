import { useState } from 'react';
import { PasswordInput } from '@/features/auth/PasswordInput.jsx';
import { Button } from '@/ui/Button.jsx';
import { useNotification } from '@/ui/useNotification.js';
import { changePassword } from './profileService.js';
import { SectionCard } from './SectionCard.jsx';

/**
 * Sección de cambio de contraseña.
 *
 * Backend: POST profile/password con { current_password, new_password }.
 *   - Pide la contraseña actual para evitar "session hijack" (alguien con
 *     acceso temporal al panel cambia password sin saber la antigua).
 *   - Validación cliente: nueva ≥ 6 chars, coincidencia con confirmación,
 *     y nueva ≠ actual (UX: el backend no comprueba esto).
 *
 * Si el usuario se registró con Google y nunca puso password, este
 * formulario falla en backend con 'contraseña actual incorrecta'.
 * Mostramos un aviso especial cuando profile.google_id está presente
 * y profile.password no (no podemos saberlo: backend no lo expone),
 * por seguridad asumimos cuenta Google = sin password local si
 * google_id existe.
 */
export function SecuritySection({ profile }) {
  const { notify } = useNotification();

  const [form, setForm] = useState({
    current: '',
    next: '',
    confirm: '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Heurística: cuentas creadas vía Google nunca pasaron por
  // password_hash. El backend bloqueará el cambio. Avisamos antes.
  const isGoogleOnly = Boolean(profile?.google_id);

  function update(field) {
    return (event) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
    };
  }

  function validate() {
    const next = {};
    if (!form.current) next.current = 'Introduce tu contraseña actual.';
    if (form.next.length < 6) next.next = 'Mínimo 6 caracteres.';
    if (form.next === form.current) next.next = 'La nueva contraseña debe ser distinta.';
    if (form.next !== form.confirm) next.confirm = 'Las contraseñas no coinciden.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || isGoogleOnly) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      const data = await changePassword({
        current_password: form.current,
        new_password: form.next,
      });

      if (data.success) {
        notify(data.message ?? 'Contraseña actualizada.', 'success');
        setForm({ current: '', next: '', confirm: '' });
      } else {
        notify(data.message ?? 'No se pudo cambiar la contraseña.', 'error');
      }
    } catch (err) {
      notify(`Error de conexión: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (isGoogleOnly) {
    return (
      <SectionCard
        icon="fa-shield-alt"
        title="Seguridad"
        description="Tu acceso está gestionado por Google."
      >
        <div className="rounded-xl bg-brand-50 border border-brand-200 px-4 py-3 text-sm text-brand-700 flex items-start gap-3">
          <i className="fab fa-google mt-0.5" aria-hidden="true" />
          <p>
            Esta cuenta inició sesión con Google y no tiene contraseña local.
            Para cambiar la contraseña, hazlo desde la configuración de tu cuenta de Google.
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon="fa-shield-alt"
      title="Seguridad"
      description="Cambia tu contraseña. Te pedimos la actual por seguridad."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <PasswordInput
          label="Contraseña actual"
          value={form.current}
          onChange={update('current')}
          required
          autoComplete="current-password"
          error={errors.current}
        />

        <PasswordInput
          label="Nueva contraseña"
          value={form.next}
          onChange={update('next')}
          required
          autoComplete="new-password"
          error={errors.next}
          placeholder="Mínimo 6 caracteres"
        />

        <PasswordInput
          label="Confirmar nueva contraseña"
          value={form.confirm}
          onChange={update('confirm')}
          required
          autoComplete="new-password"
          error={errors.confirm}
        />

        <div className="flex justify-end pt-2">
          <Button type="submit" isLoading={submitting}>
            {!submitting && <i className="fas fa-key" aria-hidden="true" />}
            {submitting ? 'Actualizando…' : 'Cambiar contraseña'}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
