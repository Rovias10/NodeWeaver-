import { useEffect, useState } from 'react';
import { Input } from '@/ui/Input.jsx';
import { Button } from '@/ui/Button.jsx';
import { useAuth } from '@/auth/useAuth.js';
import { useNotification } from '@/ui/useNotification.js';
import { updateProfile } from './profileService.js';
import { SectionCard } from './SectionCard.jsx';

/**
 * Sección de datos generales del perfil.
 *
 * Backend: POST profile/update con { name, phone, company_name, locale, timezone }.
 *   - 'name' es obligatorio según el controlador.
 *   - 'email' NO se actualiza desde aquí: cambiar email requiere flujo
 *     de reconfirmación que aún no está implementado en backend (ADR
 *     en docs/decisiones.md → "Cambio de email: deuda pendiente").
 *   - 'company_name' en BD pero etiqueta UI "Institución educativa"
 *     porque StudyWeaver es contexto académico.
 *   - 'locale' y 'timezone' los enviamos con los valores actuales del
 *     perfil para no resetearlos a defaults.
 *
 * Tras guardar, sincronizamos AuthContext con updateUser() para que el
 * resto de la app (UserMenu, etc.) refleje el nuevo nombre al instante
 * sin esperar al próximo login.
 */
export function AccountInfoSection({ profile }) {
  const { updateUser } = useAuth();
  const { notify } = useNotification();

  const [form, setForm] = useState({
    name: '',
    company_name: '',
    phone: '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Cargamos los datos cada vez que cambia el profile recibido del backend.
  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name ?? '',
      company_name: profile.company_name ?? '',
      phone: profile.phone ?? '',
    });
  }, [profile]);

  function update(field) {
    return (event) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    if (!form.name.trim()) {
      setErrors({ name: 'El nombre es obligatorio.' });
      return;
    }

    setSubmitting(true);
    try {
      const data = await updateProfile({
        name: form.name.trim(),
        phone: form.phone.trim(),
        company_name: form.company_name.trim(),
        // Mantenemos los valores actuales para no resetearlos.
        locale: profile?.locale ?? 'es',
        timezone: profile?.timezone ?? 'UTC',
      });

      if (data.success) {
        notify(data.message ?? 'Perfil actualizado.', 'success');
        // Refresca AuthContext con los campos visibles en navbar/menu.
        updateUser({ name: form.name.trim() });
      } else {
        notify(data.message ?? 'No se pudo actualizar el perfil.', 'error');
      }
    } catch (err) {
      notify(`Error de conexión: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      icon="fa-id-card"
      title="Información de la cuenta"
      description="Estos datos aparecen en tu perfil y notificaciones."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Nombre completo"
          icon="fa-user"
          value={form.name}
          onChange={update('name')}
          required
          autoComplete="name"
          error={errors.name}
        />

        <Input
          label="Email"
          icon="fa-envelope"
          value={profile?.email ?? ''}
          readOnly
          disabled
          aria-describedby="email-hint"
        />
        <p id="email-hint" className="-mt-2 text-xs text-ink-faint">
          El email no se puede cambiar desde aquí todavía.
        </p>

        <Input
          label="Institución educativa (opcional)"
          icon="fa-building"
          value={form.company_name}
          onChange={update('company_name')}
          autoComplete="organization"
          placeholder="Universidad, instituto…"
        />

        <Input
          label="Teléfono (opcional)"
          icon="fa-phone"
          type="tel"
          value={form.phone}
          onChange={update('phone')}
          autoComplete="tel"
          placeholder="+34 600 000 000"
        />

        <div className="flex justify-end pt-2">
          <Button type="submit" isLoading={submitting}>
            {!submitting && <i className="fas fa-floppy-disk" aria-hidden="true" />}
            {submitting ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
