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
  console.warn('[apiClient] Falta VITE_API_BASE en .env. Las llamadas a la API fallarán.');
}

const TOKEN_KEY = 'sw_token';

function buildUrl(route, params) {
  const sep = API_BASE.includes('?') ? '&' : '?';
  let url = `${API_BASE}${sep}route=${encodeURIComponent(route)}`;
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      url += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }
  }
  return url;
}

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function buildHeaders(withJson = true) {
  const headers = new Headers();
  if (withJson) headers.set('Content-Type', 'application/json');
  const token = readToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error(
      `No se pudo conectar con la API en "${url}". Revisa VITE_API_BASE y que el backend esté levantado.`
    );
  }
}

async function handleResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Respuesta no-JSON del servidor (HTTP ${response.status})`);
  }

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: '401' } }));
  }
  return body;
}

/**
 * GET a la API. `params` es un objeto opcional cuyas entradas se
 * adjuntan a la URL como `&clave=valor` (ya encodeadas). Se usa para
 * pasar filtros o ids: `apiGet(ENDPOINTS.maps.get, { id: 42 })`.
 * `signal` es un AbortSignal opcional para cancelar la petición.
 */
export async function apiGet(route, params, signal) {
  const url = buildUrl(route, params);
  const response = await safeFetch(url, {
    method: 'GET',
    headers: buildHeaders(false),
    signal,
  });
  return handleResponse(response);
}

export async function apiPost(route, body = {}, signal) {
  const url = buildUrl(route);
  const response = await safeFetch(url, {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify(body),
    signal,
  });
  return handleResponse(response);
}

export async function apiUpload(route, formData, signal) {
  const url = buildUrl(route);
  const response = await safeFetch(url, {
    method: 'POST',
    headers: buildHeaders(false),
    body: formData,
    signal,
  });
  return handleResponse(response);
}

/**
 * GET a la API esperando una respuesta . Adjunta
 * JWT igual que `apiGet`. Usado para descargar archivos como Blob —
 * por ejemplo, para envolver un PDF en `URL.createObjectURL` y
 * mostrarlo en un `<iframe>`.
 *
 * Devuelve uno de:
 *   { success: true,  blob: Blob }
 *   { success: false, message: string }
 *
 * En 401 dispara el evento global `auth:logout` igual que
 * `handleResponse`, para que AuthContext cierre la sesión.
 *
 * Diferente del wrapper estándar: no intenta `.json()` la respuesta
 * exitosa (sería un PDF, parsearía mal). En cambio, si el HTTP es
 * de error sí intenta parsear JSON para extraer `message`, porque
 * el backend lo emite así también para los endpoints binarios.
 */
export async function apiDownload(route, params, signal) {
  const url = buildUrl(route, params);
  const response = await safeFetch(url, {
    method: 'GET',
    headers: buildHeaders(false),
    signal,
  });

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: '401' } }));
    return { success: false, message: 'No autorizado.' };
  }

  if (!response.ok) {
    let message = `Error al descargar (HTTP ${response.status}).`;
    try {
      const body = await response.json();
      if (body && body.message) message = body.message;
    } catch {
    }
    return { success: false, message };
  }

  const blob = await response.blob();
  return { success: true, blob };
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
  }
}

export const TOKEN_STORAGE_KEY = TOKEN_KEY;
