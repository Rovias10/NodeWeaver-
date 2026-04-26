import { apiGet, apiPost } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';

/**
 * Servicio de flashcards.
 *
 * Centraliza las llamadas a flashcards/* para que las páginas no
 * toquen apiClient directamente. Mismo patrón que mapsService.js:
 * cada función devuelve la respuesta normalizada de apiClient
 * { success, message?, data? }.
 */

/** GET flashcards/list → todas las flashcards del usuario. */
export function listFlashcards() {
  return apiGet(ENDPOINTS.flashcards.list);
}

/** GET flashcards/due → flashcards con next_review_at <= hoy. */
export function listDue() {
  return apiGet(ENDPOINTS.flashcards.due);
}

/**
 * POST flashcards/save — crea (sin id) o actualiza (con id).
 * payload = { id?, map_id?, front, back }.
 */
export function saveFlashcard(payload) {
  return apiPost(ENDPOINTS.flashcards.save, payload);
}

/**
 * POST flashcards/review — aplica un repaso SM-2.
 * grade ∈ { 'fail', 'good', 'easy' }.
 */
export function reviewFlashcard(id, grade) {
  return apiPost(ENDPOINTS.flashcards.review, { id, grade });
}

/** POST flashcards/delete con { id }. */
export function deleteFlashcard(id) {
  return apiPost(ENDPOINTS.flashcards.remove, { id });
}

/**
 * POST flashcards/generate-from-map — genera un lote vía IA a partir
 * de un mapa del usuario. Devuelve { success, data: { created: N } }.
 */
export function generateFromMap(mapId) {
  return apiPost(ENDPOINTS.flashcards.generateFromMap, { map_id: mapId });
}
