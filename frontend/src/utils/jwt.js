/**
 * Lectura del payload de un JWT en cliente.
 *
 * Sólo decodifica (no verifica firma): la verificación corre en backend
 * con HS256 y la clave privada (DATA/jwt.php). Aquí únicamente leemos
 * 'exp' para detectar tokens caducados antes de hacer la llamada y
 * limpiar la sesión local.
 */

export function decodeJwtPayload(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;

  try {
    const [, payloadB64] = token.split('.');
    // base64url → base64 estándar (+ y / con = de relleno)
    const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

export function isJwtExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return payload.exp * 1000 <= Date.now();
}
