import { apiPost } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';

/**
 * Servicio de autenticación. Centraliza las llamadas a los endpoints
 * de auth/* del backend para que los componentes no tengan que conocer
 * los nombres de ruta ni la forma del body.
 *
 * Cada función devuelve directamente la respuesta normalizada por
 * apiClient: { success: bool, message: string, token?, user? }.
 *
 * Las páginas son responsables de mostrar los mensajes al usuario
 * (toasts) y de actualizar AuthContext en caso de éxito.
 */

/**
 * @param {{ email: string, password: string }} credentials
 */
export function login(credentials) {
  return apiPost(ENDPOINTS.auth.login, credentials);
}

/**
 * @param {{
 *   name: string,
 *   email: string,
 *   password: string,
 *   company_name?: string,
 *   phone?: string,
 * }} payload
 */
export function register(payload) {
  return apiPost(ENDPOINTS.auth.register, payload);
}

/**
 * @param {string} email
 */
export function forgotPassword(email) {
  return apiPost(ENDPOINTS.auth.forgotPassword, { email });
}

/**
 * @param {{ token: string, password: string }} payload
 */
export function resetPassword(payload) {
  return apiPost(ENDPOINTS.auth.resetPassword, payload);
}

/**
 * @param {string} token
 */
export function confirmAccount(token) {
  return apiPost(ENDPOINTS.auth.confirmAccount, { token });
}
