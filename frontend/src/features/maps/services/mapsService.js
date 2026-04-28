import { apiGet, apiPost } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';

/**
 * Servicio de mapas conceptuales.
 *
 * Centraliza las llamadas a maps/* para que las páginas no toquen
 * apiClient directamente ni conozcan la ruta query-string del backend.
 *
 * Cada función devuelve la respuesta normalizada de apiClient:
 *   { success, message?, data? }
 */

/**
 * GET maps/list → { success, data: [{id, title, description, is_public, created_at, updated_at}] }
 * @param {AbortSignal} [signal] Para cancelar desde un useEffect al desmontar.
 */
export function listMaps(signal) {
  return apiGet(ENDPOINTS.maps.list, undefined, signal);
}

/** GET maps/get?id=N → { success, data: {...incluye drawflow_json} } */
export function getMap(id) {
  return apiGet(ENDPOINTS.maps.get, { id });
}

/**
 * POST maps/save — Crea (sin id) o actualiza (con id) un mapa.
 * El backend devuelve 201 al crear, 200 al actualizar; en ambos casos
 * la respuesta es { success, message, data: { id, updated_at } }.
 */
export function saveMap(payload) {
  return apiPost(ENDPOINTS.maps.save, payload);
}

/** POST maps/delete con { id } → { success, message } */
export function deleteMap(id) {
  return apiPost(ENDPOINTS.maps.remove, { id });
}
