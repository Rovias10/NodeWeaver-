import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AuthCard } from './AuthCard.jsx';
import { Button } from '@/ui/Button.jsx';
import { Spinner } from '@/ui/Spinner.jsx';
import { confirmAccount } from './authService.js';

/**
 * Confirmación de cuenta vía token recibido por email.
 * Equivalente React de SERVER/pages/auth/confirm-account.html.
 *
 * Cuatro estados visuales: loading | success | already_verified | error.
 * La llamada al backend se ejecuta una vez en el primer render.
 *
 * Cuidado con StrictMode: dispara el efecto dos veces en dev.
 * Usamos un ref para garantizar que el endpoint sólo se llame una vez,
 * y así evitar marcar la cuenta como "ya verificada" en el segundo
 * intento (el backend devolvería error en ese caso).
 *
 * Nota sobre `already_verified`: el backend devuelve el mismo mensaje
 * tanto si el token es basura como si la cuenta ya se confirmó. Como
 * por experiencia el caso real más frecuente es "el usuario ha
 * recargado la pestaña tras confirmar", lo presentamos con copy amable
 * y un CTA principal hacia el login en vez de pintar "Enlace inválido".
 * Si fuera basura genuina, el usuario igualmente quiere ir al login,
 * así que es seguro tratar ambos casos con el mismo flujo.
 */
export function ConfirmAccountPage() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [state, setState] = useState({ status: 'loading', message: '' });
  const calledRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setState({
        status: 'error',
        message: 'No se proporcionó ningún token en el enlace.',
      });
      return;
    }
    if (calledRef.current) return;
    calledRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const data = await confirmAccount(token);
        if (cancelled) return;
        if (data.success) {
          setState({
            status: 'success',
            message: data.message || 'Cuenta confirmada correctamente.',
          });
        } else {
          // Caso típico: la cuenta ya se confirmó antes (link reusado o
          // refresco). Lo tratamos como "lista para iniciar sesión".
          setState({
            status: 'already_verified',
            message:
              data.message ||
              'Este enlace ya se utilizó o ha caducado.',
          });
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          status: 'error',
          message: `No pudimos conectar con el servidor: ${err.message}`,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.status === 'loading') {
    return (
      <AuthCard title="Confirmando tu cuenta" subtitle="Estamos validando tu token de seguridad…">
        <div className="flex justify-center py-6">
          <Spinner size={48} label="Validando token" />
        </div>
      </AuthCard>
    );
  }

  if (state.status === 'success') {
    return (
      <AuthCard title="¡Cuenta verificada!" icon="fa-circle-check">
        <p className="text-center text-sm text-ink-muted">
          Tu email ha sido confirmado correctamente. Ya puedes acceder a todas las funciones.
        </p>
        <Link to="/login" className="block mt-6">
          <Button size="lg" className="w-full">
            <i className="fas fa-sign-in-alt" aria-hidden="true" /> Iniciar sesión
          </Button>
        </Link>
      </AuthCard>
    );
  }

  if (state.status === 'already_verified') {
    return (
      <AuthCard title="Listo para iniciar sesión" icon="fa-circle-check">
        <p className="text-center text-sm text-ink-muted">
          Si tu cuenta ya está activa, puedes acceder directamente. Si nunca llegaste
          a confirmarla, vuelve a registrarte para recibir un nuevo enlace.
        </p>
        <Link to="/login" className="block mt-6">
          <Button size="lg" className="w-full">
            <i className="fas fa-sign-in-alt" aria-hidden="true" /> Iniciar sesión
          </Button>
        </Link>
        <Link to="/registro" className="block mt-3">
          <Button variant="ghost" size="lg" className="w-full">
            <i className="fas fa-user-plus" aria-hidden="true" /> Volver a registrarse
          </Button>
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Enlace inválido" icon="fa-circle-xmark">
      <p className="text-center text-sm text-ink-muted">{state.message}</p>
      <Link to="/login" className="block mt-6">
        <Button variant="ghost" size="lg" className="w-full">
          <i className="fas fa-arrow-left" aria-hidden="true" /> Volver al login
        </Button>
      </Link>
    </AuthCard>
  );
}
