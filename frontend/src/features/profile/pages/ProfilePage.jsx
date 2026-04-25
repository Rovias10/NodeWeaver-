import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { useAuth } from '@/auth/useAuth.js';
import { useNotification } from '@/components/feedback/useNotification.js';
import { fetchMe } from '../services/profileService.js';
import { AccountInfoSection } from '../sections/AccountInfoSection.jsx';
import { SecuritySection } from '../sections/SecuritySection.jsx';
import { AvatarSection } from '../sections/AvatarSection.jsx';
import { StudyStatsSection } from '../sections/StudyStatsSection.jsx';

/**
 * Pantalla de "Mi perfil". Equivalente React (rediseñado) de
 * SERVER/pages/profile.html.
 *
 * Cambios respecto al original:
 *   - Eliminadas las secciones de workflows, ejecuciones y conexiones n8n.
 *   - Sustituidas por StudyStatsSection (mapas, flashcards, racha).
 *   - Sin tabs animadas: secciones apiladas. Defendible por timebox.
 *
 * Ciclo de vida:
 *   - Al montar, llama a profile/me y renderiza loader.
 *   - Si falla, muestra error con CTA de reintento.
 *   - Si ok, renderiza las secciones, cada una recibe el profile y
 *     pinta su propio formulario.
 */
export function ProfilePage() {
  const { token, logout } = useAuth();
  const { notify } = useNotification();

  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | error
  const [error, setError] = useState(null);

  const loadProfile = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await fetchMe();
      if (data.success && data.user) {
        setProfile(data.user);
        setStatus('ok');
      } else {
        // El backend devuelve 401 si el token caduca. apiClient ya
        // dispara 'auth:logout' en ese caso, así que aquí basta con
        // mostrar el error textual.
        setError(data.message || 'No se pudo cargar el perfil.');
        setStatus('error');
      }
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    loadProfile();
  }, [token, loadProfile]);

  if (status === 'loading') {
    return (
      <div className="max-w-3xl mx-auto">
        <Card padded className="flex items-center gap-4">
          <Spinner /> <span className="text-ink-muted">Cargando tu perfil…</span>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="max-w-3xl mx-auto">
        <Card padded className="text-center">
          <p className="text-ink font-semibold">No pudimos cargar tu perfil</p>
          <p className="text-ink-muted text-sm mt-2">{error}</p>
          <div className="flex justify-center gap-3 mt-6">
            <Button onClick={loadProfile}>Reintentar</Button>
            <Button variant="ghost" onClick={() => { logout(); }}>
              Cerrar sesión
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl md:text-3xl font-bold text-ink">Mi perfil</h1>
        <p className="text-ink-muted text-sm md:text-base">
          Edita tus datos, cambia tu contraseña y revisa tu progreso.
        </p>
      </header>

      <AvatarSection profile={profile} onAvatarChanged={loadProfile} />
      <AccountInfoSection profile={profile} />
      <SecuritySection profile={profile} />
      <StudyStatsSection />

      {profile?.created_at && (
        <p className="text-center text-xs text-ink-faint pb-4">
          Cuenta creada el {new Date(profile.created_at).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      )}
    </div>
  );
}
