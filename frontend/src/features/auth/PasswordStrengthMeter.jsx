/**
 * Medidor de fuerza de contraseña.
 *
 * Replica la lógica del registro antiguo (register.html):
 *   - 1 punto si length ≥ 6
 *   - 1 punto si length ≥ 10
 *   - 1 punto si tiene mayúscula
 *   - 1 punto si tiene número
 *   - 1 punto si tiene símbolo
 *
 * Resultado 0..5 se traduce a etiqueta y color del sistema "Cielo Claro".
 * (Nota: no usamos passwordStrength() de utils/validators porque allí
 *  el rango es 0..4 con criterios distintos. Aquí mantenemos el cálculo
 *  específico de la pantalla de registro tal como estaba.)
 */
function computeScore(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

const LEVELS = [
  { label: '',           color: 'bg-coral-400',  text: 'text-coral-500' },  
  { label: 'Muy débil',  color: 'bg-coral-500',  text: 'text-coral-500' },  
  { label: 'Débil',      color: 'bg-sun-400',    text: 'text-sun-400'   }, 
  { label: 'Media',      color: 'bg-sun-300',    text: 'text-sun-400'   },  
  { label: 'Fuerte',     color: 'bg-mint-400',   text: 'text-emerald-700' }, 
  { label: 'Muy fuerte', color: 'bg-mint-500',   text: 'text-emerald-700' }, 
];

export function PasswordStrengthMeter({ password }) {
  const score = computeScore(password);
  const level = LEVELS[score] ?? LEVELS[0];
  const widthPct = score === 0 ? 5 : score * 20;

  return (
    <>
      <div className="h-1 w-full bg-brand-100 rounded-full mt-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${level.color}`}
          style={{ width: `${widthPct}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={score}
          aria-label="Fuerza de la contraseña"
        />
      </div>
      <p className={`text-xs mt-1 font-medium ${level.text}`}>
        {level.label || 'Empieza a escribir tu contraseña'}
      </p>
    </>
  );
}
