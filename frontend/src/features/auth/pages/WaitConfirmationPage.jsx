import { Link } from 'react-router';
import { AuthCard } from '../components/AuthCard.jsx';
import { Button } from '@/components/ui/Button.jsx';

/**
 * Pantalla informativa post-registro.
 * Equivalente React de SERVER/pages/auth/wait-confirmation.html.
 *
 * No tiene lógica: el usuario llega aquí tras registrarse y debe
 * abrir su correo, hacer clic en el enlace y aterrizar en
 * /confirmar?token=... que ya confirma la cuenta automáticamente.
 */
export function WaitConfirmationPage() {
  return (
    <AuthCard title="¡Revisa tu bandeja de entrada!" icon="fa-envelope-open-text">
      <p className="text-center text-sm text-ink-muted">
        Te hemos enviado un correo seguro para confirmar tu identidad. Por favor, haz
        clic en el enlace dentro del correo para activar tu cuenta.
      </p>

      <Link to="/login" className="block mt-6">
        <Button size="lg" className="w-full">
          <i className="fas fa-sign-in-alt" aria-hidden="true" /> Ir al login
        </Button>
      </Link>

      <p className="mt-6 text-center text-xs text-ink-faint">
        ¿No te llega el correo? Revisa la carpeta de spam o vuelve a registrarte
        con la misma dirección.
      </p>
    </AuthCard>
  );
}
