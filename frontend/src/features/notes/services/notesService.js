import { apiGet, apiPost, apiUpload } from '@/api/client';
import { ENDPOINTS } from '@/api/endpoints';

/**
 * Servicio de apuntes (Fase Notes).
 *
 * Centraliza las llamadas a `notes/*` para que las páginas no toquen
 * `apiClient` directamente ni conozcan la ruta query-string del backend.
 *
 * Cada función devuelve la respuesta normalizada del wrapper de fetch:
 *   { success, message?, data? }
 */

/**
 * GET notes/list → { success, data: [{id, title, source_type,
 * char_count, original_filename, created_at, updated_at}] }.
 * Lista ligera (sin extracted_text ni file_path).
 */
export function listNotes() {
  return apiGet(ENDPOINTS.notes.list);
}

/**
 * GET notes/get?id=N → { success, data: { …, extracted_text } }.
 * Devuelve el apunte completo. `file_path` queda en el backend; el
 * frontend nunca lo conoce (es ruta interna del servidor).
 */
export function getNote(id) {
  return apiGet(ENDPOINTS.notes.get, { id });
}

/**
 * POST notes/upload — Sube un PDF.
 *
 * @param {File} file       Archivo PDF (≤ 5 MB).
 * @param {string} [title]  Título opcional. Si falta, el backend lo
 *                          deriva del nombre del archivo.
 */
export function uploadPdfNote(file, title) {
  const fd = new FormData();
  fd.append('pdf', file);
  if (title && title.trim()) fd.append('title', title.trim());
  return apiUpload(ENDPOINTS.notes.upload, fd);
}

/**
 * POST notes/upload — Persiste un apunte de texto pegado.
 * Va por JSON puro (no multipart) porque no hay archivo.
 *
 * @param {{ title?: string, body: string }} payload
 */
export function uploadTextNote({ title, body }) {
  return apiPost(ENDPOINTS.notes.upload, {
    title: (title ?? '').trim(),
    body:  body ?? '',
  });
}

/** POST notes/delete con { id } → { success, message }. */
export function deleteNote(id) {
  return apiPost(ENDPOINTS.notes.remove, { id });
}
