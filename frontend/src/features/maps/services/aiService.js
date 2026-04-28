import { apiPost } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';

/**
 * Servicio de IA: por ahora sólo expansión de conceptos.
 *
 * Backend: POST ai/expand → { success, data: { children: [{label, hint}] } }
 * Si la IA no está configurada, el backend devuelve el mismo formato pero
 * con hijos demo (modo stub). Si está configurada y falla, devuelve
 * { success: false, message: "La IA no está disponible ahora." } con 503.
 *
 * @param {string} nodeLabel     Concepto a expandir.
 * @param {string} [parentContext] Contexto opcional (label del padre, etc.).
 */
export function expandNode(nodeLabel, parentContext = '') {
  return apiPost(ENDPOINTS.ai.expand, {
    node_label: nodeLabel,
    parent_context: parentContext,
  });
}
