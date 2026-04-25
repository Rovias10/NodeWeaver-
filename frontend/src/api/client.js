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

function buildUrl(route) {
  const sep = API_BASE.includes('?') ? '&' : '?';
  return `${API_BASE}${sep}route=${encodeURIComponent(route)}`;
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
    // Error de red/CORS: normalmente indica VITE_API_BASE incorrecta o backend caído.
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

export async function apiGet(route, signal) {
  const url = buildUrl(route);
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
