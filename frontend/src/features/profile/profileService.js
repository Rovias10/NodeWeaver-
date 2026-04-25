import { apiGet, apiPost, apiUpload } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';
/**
 * Servicio del perfil de usuario.
 *
 * Centraliza las llamadas a profile/* del backend para que los
 * componentes no tengan que conocer las rutas ni la forma del body.
 *
 * Cada función devuelve la respuesta normalizada de apiClient:
 *   { success, message, ... }
 */

/**
 * Devuelve el perfil completo del usuario autenticado.
 * Backend: GET profile/me → { success, user }
 */
export function fetchMe() {
  return apiGet(ENDPOINTS.profile.me);
}

export function updateProfile(payload) {
  return apiPost(ENDPOINTS.profile.update, payload);
}

export function changePassword(payload) {
  return apiPost(ENDPOINTS.profile.password, payload);
}

export function uploadAvatar(file) {
  const formData = new FormData();
  formData.append('avatar', file);
  return apiUpload(ENDPOINTS.profile.avatar, formData);
}
