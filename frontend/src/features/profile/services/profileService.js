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

/**
 * Actualiza datos generales del perfil.
 * Backend: POST profile/update → { success, message }
 *
 * @param {{
 *   name: string,
 *   phone?: string,
 *   company_name?: string,
 *   locale?: string,
 *   timezone?: string,
 * }} payload
 */
export function updateProfile(payload) {
  return apiPost(ENDPOINTS.profile.update, payload);
}

/**
 * Cambia la contraseña desde el panel de usuario.
 * Backend: POST profile/password → { success, message }
 *
 * @param {{ current_password: string, new_password: string }} payload
 */
export function changePassword(payload) {
  return apiPost(ENDPOINTS.profile.password, payload);
}

/**
 * Sube un nuevo avatar (multipart/form-data).
 * Backend: POST profile/avatar → { success, message, avatar_url }
 *
 * @param {File} file
 */
export function uploadAvatar(file) {
  const formData = new FormData();
  formData.append('avatar', file);
  return apiUpload(ENDPOINTS.profile.avatar, formData);
}
