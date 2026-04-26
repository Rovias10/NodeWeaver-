import { apiDownload, apiGet, apiPost, apiUpload } from '@/api/client';
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
 * GET notes/file?id=N — Descarga el binario PDF de un apunte.
 * Resuelve a `{ success: true, blob: Blob }` o `{ success: false,
 * message }`. El cliente envuelve el blob con `URL.createObjectURL`
 * para mostrarlo en un `<iframe>`; debe acordarse de revocar la
 * URL al desmontar (ver NotePreviewPage).
 */
export function getNoteFile(id) {
  return apiDownload(ENDPOINTS.notes.file, { id });
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

/**
 * POST ai/from-note con target='map' — genera un mapa conceptual a
 * partir del apunte indicado. La llamada puede tardar 10-30 s mientras
 * Gemini procesa el apunte (PDF multimodal o texto) y construye el
 * grafo. La página debe mostrar un spinner overlay durante la espera.
 *
 * @param {number} noteId
 * @returns {Promise<{ success: boolean, message?: string,
 *                     data?: { map_id: number, title: string, node_count: number } }>}
 */
export function fromNoteToMap(noteId) {
  return apiPost(ENDPOINTS.ai.fromNote, { note_id: noteId, target: 'map' });
}

/**
 * POST ai/from-note con target='flashcards' — genera entre 8 y 15
 * flashcards SM-2 a partir del apunte. Mismo timing que `fromNoteToMap`.
 *
 * @param {number} noteId
 * @returns {Promise<{ success: boolean, message?: string,
 *                     data?: { created: number } }>}
 */
export function fromNoteToFlashcards(noteId) {
  return apiPost(ENDPOINTS.ai.fromNote, { note_id: noteId, target: 'flashcards' });
}
