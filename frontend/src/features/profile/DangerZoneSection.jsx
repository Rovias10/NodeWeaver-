import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/ui/Button.jsx';
import { useAuth } from '@/auth/useAuth.js';
import { useNotification } from '@/ui/useNotification.js';
import { SectionCard } from './SectionCard.jsx';
import { DeleteAccountDialog } from './DeleteAccountDialog.jsx';
import { deleteAccount } from './profileService.js';

/**
 * Sección final de "Mi perfil": acciones de cuenta.
 *
 *   - Cerrar sesión: limpia el JWT del AuthContext y vuelve a la
 *     landing pública. Mismo efecto que el item del UserMenu, pero
 *     más visible para el usuario que está editando su cuenta.
 *   - Eliminar cuenta: abre un diálogo de confirmación con fricción
 *     "tipear el email", llama a POST profile/delete, y al éxito
 *     desloguea + redirige a "/".
 *
 * Sustituye al panel de estadísticas que ocupaba esta zona y que
 * mostraba siempre ceros (datos provisionales sin endpoint detrás):
 * un par de acciones reales pesa más en la defensa que un mock.
 */
export function DangerZoneSection({ profile }) {
  const { logout } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  async function handleConfirmDelete(emailConfirmation) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = await deleteAccount(emailConfirmation);
      if (data.success) {
        notify(data.message ?? 'Cuenta eliminada.', 'success');
        // El backend ya borró el usuario; el JWT que tenemos en
        // memoria ya no apunta a nadie. Limpiamos sesión y mandamos
        // al landing público.
        logout();
        navigate('/', { replace: true });
      } else {
        notify(data.message ?? 'No se pudo eliminar la cuenta.', 'error');
        setSubmitting(false);
      }
    } catch (err) {
      notify(`Error de conexión: ${err.message}`, 'error');
      setSubmitting(false);
    }
  }

  return (
    <>
      <SectionCard
        icon="fa-door-open"
        title="Cuenta"
        description="Cierra sesión o elimina tu cuenta de StudyWeaver."
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-line bg-white/40 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Cerrar sesión</p>
            <p className="text-xs text-ink-muted mt-0.5">
              Saldrás de la sesión actual en este dispositivo.
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={handleLogout}>
            <i className="fas fa-arrow-right-from-bracket" aria-hidden="true" />
            Cerrar sesión
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-coral-400/40 bg-coral-400/5 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-coral-500">Eliminar cuenta</p>
            <p className="text-xs text-ink-muted mt-0.5">
              Borra de forma permanente tu usuario, apuntes, mapas,
              flashcards y comentarios. No se puede deshacer.
            </p>
          </div>
          <Button
            type="button"
            variant="danger"
            onClick={() => setDialogOpen(true)}
            disabled={!profile?.email}
          >
            <i className="fas fa-trash" aria-hidden="true" />
            Eliminar cuenta
          </Button>
        </div>
      </SectionCard>

      <DeleteAccountDialog
        open={dialogOpen}
        email={profile?.email ?? ''}
        isDeleting={submitting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!submitting) setDialogOpen(false);
        }}
      />
    </>
  );
}
