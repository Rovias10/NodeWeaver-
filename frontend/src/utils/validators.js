/**
 * Utilidades de validación cliente-side.
 * Validación final SIEMPRE en backend (regla DAW 0613 RA6).
 * Aquí sólo evitamos roundtrips inútiles y damos feedback inmediato al usuario.
 */

export function isEmail(value) {
  if (typeof value !== 'string') return false;
  // Regex pragmática (RFC simplificada): user@dom.tld
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

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

export function passwordStrengthLabel(score) {
  return ['', 'Muy débil', 'Débil', 'Media', 'Fuerte'][score] ?? '';
}
