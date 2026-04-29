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

export function login(credentials) {
  return apiPost(ENDPOINTS.auth.login, credentials);
}

export function register(payload) {
  return apiPost(ENDPOINTS.auth.register, payload);
}

export function forgotPassword(email) {
  return apiPost(ENDPOINTS.auth.forgotPassword, { email });
}

export function resetPassword(payload) {
  return apiPost(ENDPOINTS.auth.resetPassword, payload);
}

export function confirmAccount(token) {
  return apiPost(ENDPOINTS.auth.confirmAccount, { token });
}

/**
 * Login con Google. Recibe el `id_token` (credential) que devuelve
 * Google Identity Services en el callback del botón oficial. El
 * backend verifica el token contra `oauth2.googleapis.com/tokeninfo`
 * y, si es válido, crea o recupera al usuario y emite un JWT propio.
 */
export function googleLogin(idToken) {
  return apiPost(ENDPOINTS.auth.google, { token: idToken });
}
