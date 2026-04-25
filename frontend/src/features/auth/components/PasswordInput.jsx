import { useState } from 'react';
import { Input } from '@/components/ui/Input.jsx';

/**
 * Input de contraseña con toggle de visibilidad mediante icono ojo.
 * Equivalente al togglePassword() que se duplicaba en login.html,
 * register.html y reset-password.html.
 *
 * Acepta cualquier prop de <Input> excepto 'type' (lo controlamos aquí)
 * y 'rightAddon' (lo aporta el toggle).
 */
export function PasswordInput({ icon = 'fa-lock', ...rest }) {
  const [visible, setVisible] = useState(false);

  const toggle = (
    <button
      type="button"
      onClick={() => setVisible((v) => !v)}
      className="text-ink-faint hover:text-ink transition-colors p-1"
      aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      tabIndex={-1}
    >
      <i className={`fas ${visible ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
    </button>
  );

  return <Input type={visible ? 'text' : 'password'} icon={icon} rightAddon={toggle} {...rest} />;
}
