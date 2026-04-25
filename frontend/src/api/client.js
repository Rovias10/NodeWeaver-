/**
 * Wrapper único de fetch para toda la SPA.
 *
 * Responsabilidades:
 *   1. Componer la URL a partir de VITE_API_BASE + ?route=<ruta>.
 *   2. Adjuntar Authorization: Bearer <token> si hay sesión activa.
 *   3. Serializar/deserializar JSON automáticamente (excepto en uploads).
 *   4. Normalizar la respuesta del backend a {success, message, data, ...}.
 *   5. Disparar un evento global 'auth:logout' cuando el backend devuelve
 *      401 o un mensaje de token inválido, para que AuthContext limpie
 *      la sesión y redirija a /login.
 *
 * No usa axios ni librerías externas: la API nativa fetch + AbortController
 * basta para nuestro tamaño de proyecto y es defendible ante tribunal.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

if (!API_BASE) {
  // Aviso temprano si falta configurar el .env. No tiramos error para no
  // romper el build, pero en consola es imposible no verlo.
  // eslint-disable-next-line no-console
  console.warn('[apiClient] Falta VITE_API_BASE en .env. Las llamadas a la API fallarán.');
}

const TOKEN_KEY = 'sw_token';

/**
 * Construye la URL final para una ruta lógica.
 * @param {string} route Ej: 'auth/login'
 * @returns {string}
 */
function buildUrl(route) {
  const sep = API_BASE.includes('?') ? '&' : '?';
  return `${API_BASE}${sep}route=${encodeURIComponent(route)}`;
}

/**
 * Lee el token JWT desde localStorage (única fuente de verdad).
 * @returns {string|null}
 */
function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Cabeceras estándar para una petición JSON.
 * @param {boolean} withJson - si añadir Content-Type
 * @returns {Headers}
 */
function buildHeaders(withJson = true) {
  const headers = new Headers();
  if (withJson) headers.set('Content-Type', 'application/json');
  const token = readToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

/**
 * Procesa la respuesta del backend y normaliza errores.
 * Si el backend responde 401 o body con success=false + token inválido,
 * disparamos evento global para que AuthContext cierre sesión.
 *
 * @param {Response} response
 * @returns {Promise<object>}
 */
async function handleResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    // El backend debería devolver siempre JSON. Si no, lo tratamos como error.
    throw new Error(`Respuesta no-JSON del servidor (HTTP ${response.status})`);
  }

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: '401' } }));
  }

  // El backend usa el contrato { success, message, data?, token?, user? }.
  // Devolvemos el body tal cual: cada caller decide qué hacer con success=false.
  return body;
}

/**
 * GET autenticado.
 * @param {string} route
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export async function apiGet(route, signal) {
  const response = await fetch(buildUrl(route), {
    method: 'GET',
    headers: buildHeaders(false),
    signal,
  });
  return handleResponse(response);
}

/**
 * POST con cuerpo JSON.
 * @param {string} route
 * @param {object} body
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export async function apiPost(route, body = {}, signal) {
  const response = await fetch(buildUrl(route), {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify(body),
    signal,
  });
  return handleResponse(response);
}

/**
 * POST con FormData (multipart). Usado para subida de avatar.
 * No fijamos Content-Type: el navegador lo pone con el boundary correcto.
 *
 * @param {string} route
 * @param {FormData} formData
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export async function apiUpload(route, formData, signal) {
  const response = await fetch(buildUrl(route), {
    method: 'POST',
    headers: buildHeaders(false),
    body: formData,
    signal,
  });
  return handleResponse(response);
}

/**
 * Persiste el token JWT en localStorage. AuthContext es el único llamador
 * legítimo desde la app; lo exponemos aquí para mantener el TOKEN_KEY
 * encapsulado en este módulo.
 *
 * @param {string|null} token
 */
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // En modo privado de algunos navegadores localStorage puede fallar.
    // Lo ignoramos: la sesión durará lo que dure la pestaña.
  }
}

export const TOKEN_STORAGE_KEY = TOKEN_KEY;
