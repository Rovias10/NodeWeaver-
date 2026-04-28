import { apiGet, apiPost } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';

/**
 * Servicio de la capa social de StudyWeaver (Fase Comunidad).
 *
 * Centraliza las llamadas a community/* para que las páginas y
 * componentes no toquen apiClient directamente ni conozcan rutas
 * concretas del backend.
 *
 * Cada función devuelve la respuesta normalizada del backend:
 *   { success: bool, message?: string, data?: ..., pagination?: {...} }.
 */

/**
 * GET community/feed — listado paginado del feed público.
 * @param {{ sort?: 'recent'|'popular', q?: string, page?: number, page_size?: number }} options
 */
export function fetchFeed({ sort = 'recent', q = '', page = 1, page_size = 12 } = {}) {
  return apiGet(ENDPOINTS.community.feed, { sort, q, page, page_size });
}

/** GET community/map?id=N — mapa público completo (incluye drawflow_json + counts + liked_by_me). */
export function fetchPublicMap(id) {
  return apiGet(ENDPOINTS.community.map, { id });
}

/** GET community/profile?user_id=N — perfil público (sin email/teléfono). */
export function fetchProfile(userId) {
  return apiGet(ENDPOINTS.community.profile, { user_id: userId });
}

/** GET community/profile-maps?user_id=N&page=N — mapas públicos de un autor. */
export function fetchProfileMaps(userId, { page = 1, page_size = 12 } = {}) {
  return apiGet(ENDPOINTS.community.profileMaps, { user_id: userId, page, page_size });
}

/** GET community/favorites?page=N — los mapas que el usuario actual ha likeado. */
export function fetchFavorites({ page = 1, page_size = 12 } = {}) {
  return apiGet(ENDPOINTS.community.favorites, { page, page_size });
}

/** POST community/like body { map_id } — devuelve { liked: bool, count: int }. */
export function toggleLike(mapId) {
  return apiPost(ENDPOINTS.community.like, { map_id: mapId });
}

/** GET community/comments?map_id=N&page=N — hilo paginado de un mapa. */
export function fetchComments(mapId, { page = 1, page_size = 20 } = {}) {
  return apiGet(ENDPOINTS.community.comments, { map_id: mapId, page, page_size });
}

/** POST community/comment body { map_id, body } — devuelve el comment recién creado. */
export function createComment(mapId, body) {
  return apiPost(ENDPOINTS.community.comment, { map_id: mapId, body });
}

/** POST community/comment-delete body { id } — autoriza autor del comment o del mapa. */
export function deleteComment(id) {
  return apiPost(ENDPOINTS.community.commentDelete, { id });
}
