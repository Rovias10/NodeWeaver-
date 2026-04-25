/**
 * Utilidades de validación cliente-side.
 * Validación final SIEMPRE en backend (regla DAW 0613 RA6).
 * Aquí sólo evitamos roundtrips inútiles y damos feedback inmediato al usuario.
 */

/**
 * Comprueba si una cadena tiene forma de email válida.
 * No reemplaza la validación del servidor: sólo evita el envío del formulario
 * con un valor obviamente mal formado.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isEmail(value) {
  if (typeof value !== 'string') return false;
  // Regex pragmática (RFC simplificada): user@dom.tld
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Devuelve un score de fuerza de contraseña entre 0 y 4.
 * Usado por el medidor visual del registro.
 *
 *   0 → vacía
 *   1 → muy débil (< 6 chars)
 *   2 → débil    (≥ 6 chars)
 *   3 → media    (≥ 8 chars + mayúsculas/números)
 *   4 → fuerte   (≥ 12 chars + mayúsculas + números + símbolos)
 *
 * @param {string} value
 * @returns {0|1|2|3|4}
 */
export function passwordStrength(value) {
  if (!value) return 0;
  const len = value.length;
  if (len < 6) return 1;

  let score = 2;
  const hasUpper = /[A-Z]/.test(value);
  const hasNumber = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);

  if (len >= 8 && (hasUpper || hasNumber)) score = 3;
  if (len >= 12 && hasUpper && hasNumber && hasSymbol) score = 4;

  return score;
}

/**
 * Etiqueta humana asociada al score, en castellano.
 * @param {number} score
 * @returns {string}
 */
export function passwordStrengthLabel(score) {
  return ['', 'Muy débil', 'Débil', 'Media', 'Fuerte'][score] ?? '';
}
