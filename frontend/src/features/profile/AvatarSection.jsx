import { useRef, useState } from 'react';
import { Avatar } from '@/features/shell/Avatar.jsx';
import { Button } from '@/ui/Button.jsx';
import { useAuth } from '@/auth/useAuth.js';
import { useNotification } from '@/ui/useNotification.js';
import { uploadAvatar } from './profileService.js';
import { SectionCard } from './SectionCard.jsx';

/**
 * Sección de cambio de foto de perfil.
 *
 * Backend: POST profile/avatar (multipart, campo 'avatar').
 *   - Tipos permitidos: JPG, PNG, WEBP.
 *   - Tamaño máximo: 2 MB.
 *   - Devuelve avatar_url (URL absoluta) que persistimos en
 *     AuthContext + estado local del perfil.
 *
 * UX:
 *   - Preview optimista con URL.createObjectURL antes de subir.
 *   - Si la subida falla, revertimos al avatar previo.
 *   - El input file está oculto por accesibilidad: el usuario hace
 *     click en un botón etiquetado y este dispara el input.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function AvatarSection({ profile, onAvatarChanged }) {
  const { user, updateUser } = useAuth();
  const { notify } = useNotification();
  const inputRef = useRef(null);

  const [preview, setPreview] = useState(null); // ObjectURL local
  const [submitting, setSubmitting] = useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    // Reset del input para que el usuario pueda elegir el mismo archivo
    // de nuevo si quiere reintentar.
    event.target.value = '';

    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      notify('Sólo se permiten imágenes JPG, PNG o WEBP.', 'error');
      return;
    }
    if (file.size > MAX_BYTES) {
      notify('La imagen no debe superar los 2 MB.', 'error');
      return;
    }

    // Preview optimista local.
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setSubmitting(true);

    try {
      const data = await uploadAvatar(file);
      if (data.success && data.avatar_url) {
        notify(data.message ?? 'Avatar actualizado.', 'success');
        // Persistimos en AuthContext (UserMenu y navbar reaccionan).
        updateUser({ avatar_url: data.avatar_url });
        // Notificamos al padre para refrescar el profile completo.
        onAvatarChanged?.(data.avatar_url);
      } else {
        notify(data.message ?? 'No se pudo subir el avatar.', 'error');
        setPreview(null);
      }
    } catch (err) {
      notify(`Error de conexión: ${err.message}`, 'error');
      setPreview(null);
    } finally {
      setSubmitting(false);
      URL.revokeObjectURL(localUrl);
    }
  }

  // Para el preview construimos un "user" temporal con la URL local.
  const displayUser = preview ? { name: user?.name, avatar_url: preview } : profile;

  return (
    <SectionCard
      icon="fa-image"
      title="Foto de perfil"
      description="Aparecerá en tu menú y en los mapas que compartas."
    >
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <Avatar user={displayUser} size="xl" />

        <div className="flex-1 min-w-0 text-center sm:text-left">
          <p className="text-sm text-ink-muted">
            Formatos admitidos: <strong className="text-ink">JPG</strong>,{' '}
            <strong className="text-ink">PNG</strong> o{' '}
            <strong className="text-ink">WEBP</strong>. Tamaño máximo:{' '}
            <strong className="text-ink">2&nbsp;MB</strong>.
          </p>

          <div className="mt-4 flex flex-wrap justify-center sm:justify-start gap-3">
            <Button onClick={openPicker} isLoading={submitting} type="button">
              {!submitting && <i className="fas fa-upload" aria-hidden="true" />}
              {submitting ? 'Subiendo…' : 'Subir nueva foto'}
            </Button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      </div>
    </SectionCard>
  );
}
