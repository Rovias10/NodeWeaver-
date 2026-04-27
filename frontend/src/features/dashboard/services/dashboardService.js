import { apiGet } from '@/api/client.js';
import { ENDPOINTS } from '@/api/endpoints.js';

/**
 * Servicio del dashboard. Una función por endpoint, sin lógica de
 * negocio ni manipulación del DOM (sigue el patrón del resto de
 * services del proyecto).
 */

/**
 * Recupera las métricas agregadas del usuario autenticado para la
 * página de Inicio. Devuelve la respuesta cruda del backend
 * (`{ success, data?: {maps_total, flashcards_total,
 * flashcards_reviewed_total, streak_days}, message? }`) para que el
 * caller decida cómo pintar cada estado.
 *
 * @param {AbortSignal} [signal] Para cancelar desde un useEffect al desmontar.
 */
export function fetchStats(signal) {
  return apiGet(ENDPOINTS.dashboard.stats, undefined, signal);
}
