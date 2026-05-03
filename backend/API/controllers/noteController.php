<?php
/**
 * NoteController — endpoints CRUD de apuntes (Fase Notes / Apuntes).
 *
 * Convenciones (CLAUDE.md §9 + Gemini.md §4):
 *   - Headless: cada método termina con echo json_encode([...]).
 *   - Respuesta uniforme: { success: bool, message?: string, data?: ... }.
 *   - Auth con AuthMiddleware::verifyToken() al inicio de cada método
 *     (mismo patrón que mapController y flashcardController; el legacy
 *     getAuthenticatedUser() inline de profileController NO se replica).
 *   - Códigos HTTP: 200 OK, 201 Created, 400 validación, 401 sin auth,
 *     403 prohibido, 404 no encontrado, 413 archivo demasiado grande,
 *     415 tipo no soportado, 500 error servidor.
 *   - try/catch alrededor de PDO: 500 genérico al cliente, detalle real
 *     en error_log.
 *   - Ownership en cada endpoint: el modelo filtra por user_id en la
 *     query (anti-IDOR a nivel de BD).
 *
 * Almacenamiento físico:
 *   backend/uploads/notes/<user_id>/<uuid>.pdf   (NO público)
 *   ── el preview y la futura integración Gemini servirán el binario
 *      vía endpoint autenticado, no por URL estática (decisión §2.3
 *      del notes-plan: "URL pública sólo si llega Fase Comunidad").
 *
 * MVP NO parsea el contenido del PDF: con Gemini multimodal en la
 * rama futura `ia-integration`, el archivo se ingesta tal cual. Para
 * apuntes de tipo 'text' sí se persiste el body en `extracted_text`.
 */

require_once __DIR__ . '/../middleware/verify-token.php';
require_once __DIR__ . '/../../MODEL/Note.php';

class NoteController {
    private $db;
    private $noteModel;

    /** Tamaño máximo de PDF aceptado (5 MB). */
    const MAX_PDF_SIZE = 5 * 1024 * 1024;
    /** Longitud máxima del título. */
    const TITLE_MAX_LEN = 200;
    /** Longitud máxima del body de texto pegado (defensivo, evita LONGTEXT abusivo). */
    const TEXT_MAX_LEN = 200000;

    public function __construct($db) {
        $this->db = $db;
        $this->noteModel = new Note($db);
    }

    /**
     * GET notes/list
     * Lista los apuntes del usuario, sin extracted_text ni file_path.
     */
    public function list() {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        try {
            $rows = $this->noteModel->findByUser($userId);

            // Normalizamos tipos para que el frontend reciba ints/strings
            // en lugar de strings numéricos crudos de PDO.
            $rows = array_map(function ($n) {
                $n['id']         = (int) $n['id'];
                $n['char_count'] = (int) $n['char_count'];
                return $n;
            }, $rows);

            http_response_code(200);
            echo json_encode([
                'success' => true,
                'data'    => $rows,
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[NoteController::list] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al consultar los apuntes.',
            ]);
        }
    }

    /**
     * GET notes/get?id=N
     * Devuelve un apunte concreto del usuario (incluye extracted_text
     * para que el preview pueda renderizarlo). El campo `file_path` se
     * EXCLUYE de la respuesta porque es ruta interna del servidor; el
     * frontend no debe conocerla.
     */
    public function get($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        $id = isset($data['id']) ? (int) $data['id'] : 0;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'ID de apunte no válido.',
            ]);
            return;
        }

        try {
            $note = $this->noteModel->findByIdForUser($id, $userId);
            if (!$note) {
                // Mismo mensaje en "no existe" y "pertenece a otro usuario"
                // para no filtrar la existencia de apuntes ajenos.
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Apunte no encontrado.',
                ]);
                return;
            }

            http_response_code(200);
            echo json_encode([
                'success' => true,
                'data'    => $this->normalizePublic($note),
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[NoteController::get] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al obtener el apunte.',
            ]);
        }
    }

    /**
     * POST notes/upload
     *
     * Acepta dos modos:
     *
     *   (a) PDF: multipart/form-data con campo `pdf` (file) y, opcional,
     *       `title`. El backend genera UUID, mueve a
     *       backend/uploads/notes/<user_id>/<uuid>.pdf y persiste con
     *       source_type='pdf', extracted_text=NULL.
     *
     *   (b) Texto pegado: JSON puro o multipart con `title` y `body`.
     *       Persiste con source_type='text', extracted_text=$body,
     *       char_count=mb_strlen($body), file_path=NULL.
     *
     * Detección de modo: si llega $_FILES['pdf'] con upload válido, es
     * modo (a). En cualquier otro caso, modo (b).
     *
     * Validaciones:
     *   - title: opcional. Si falta → derivado del filename (a) o
     *     'Apunte sin título' (b). Si llega: 1..200 chars.
     *   - PDF: mime application/pdf, ≤ 5 MB. La extensión se sanea a
     *     '.pdf' (la confianza primaria es el mime).
     *   - body: 1..200 000 chars (límite defensivo MVP).
     */
    public function upload($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        // Super User virtual (id=999): no tiene fila real en `users`, así
        // que un INSERT con user_id=999 violaría la FK. Cortocircuitamos
        // con 403 antes de tocar disco o BD.
        if ($userId == 999) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'El usuario administrador no puede subir apuntes.',
            ]);
            return;
        }

        // En multipart, $data llega vacío (php://input está vacío) y los
        // campos vienen en $_POST. En JSON puro, $data llega decodificado
        // y $_POST está vacío. Unificamos para que el resto del método
        // sea agnóstico al transporte.
        $fields = !empty($_POST) ? $_POST : (is_array($data) ? $data : []);

        $hasPdf = isset($_FILES['pdf'])
                  && is_array($_FILES['pdf'])
                  && $_FILES['pdf']['error'] !== UPLOAD_ERR_NO_FILE;

        if ($hasPdf) {
            $this->uploadPdf($userId, $_FILES['pdf'], $fields);
        } else {
            $this->uploadText($userId, $fields);
        }
    }

    /**
     * GET notes/file?id=N
     * Sirve el PDF físico de un apunte tras verificar ownership por
     * JWT. NO devuelve JSON: streaming binario con `Content-Type:
     * application/pdf` para que el frontend pueda envolverlo en un
     * Blob (ver `apiDownload` en client.js) y mostrarlo en un
     * `<iframe>` con `URL.createObjectURL`.
     *
     * Errores: 400 id no válido, 404 apunte no encontrado, 409 si el
     * apunte es de tipo 'text' (no hay PDF que servir), 410 si la fila
     * sigue en BD pero el archivo físico ha desaparecido (incoherencia
     * que el alumno debe diagnosticar). En caso de error sí devolvemos
     * JSON estándar { success:false, message } para que el cliente
     * pueda mostrar el motivo.
     */
    public function file($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        $id = isset($data['id']) ? (int) $data['id'] : 0;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'ID de apunte no válido.',
            ]);
            return;
        }

        try {
            $note = $this->noteModel->findByIdForUser($id, $userId);
            if (!$note) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Apunte no encontrado.',
                ]);
                return;
            }

            if ($note['source_type'] !== 'pdf' || empty($note['file_path'])) {
                http_response_code(409);
                echo json_encode([
                    'success' => false,
                    'message' => 'Este apunte no tiene archivo PDF asociado.',
                ]);
                return;
            }

            $absolute = $this->absolutePathForRelative($note['file_path'], $userId);
            if ($absolute === null || !is_file($absolute)) {
                error_log('[NoteController::file] Archivo huérfano para note_id=' . $id);
                http_response_code(410);
                echo json_encode([
                    'success' => false,
                    'message' => 'El archivo del apunte ya no está disponible.',
                ]);
                return;
            }

            // Sustituimos el Content-Type por defecto (`application/json`
            // de cors.php) por el binario. `header()` reemplaza la
            // cabecera previa cuando el nombre coincide. Disposition
            // `inline` permite al navegador embeberlo en el iframe sin
            // forzar descarga.
            $safeName = $this->sanitizeFilenameForHeader(
                $note['original_filename'] ?: 'apunte.pdf'
            );
            header('Content-Type: application/pdf');
            header('Content-Length: ' . filesize($absolute));
            header('Content-Disposition: inline; filename="' . $safeName . '"');
            header('Cache-Control: private, max-age=0, no-store');
            header('X-Content-Type-Options: nosniff');

            // readfile vacía cualquier buffer pendiente y emite el
            // binario directamente. Para PDFs de hasta 5 MB es
            // suficiente — un streaming chunked sólo aportaría con
            // archivos muy grandes que en MVP no soportamos.
            readfile($absolute);
        } catch (PDOException $e) {
            error_log('[NoteController::file] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al servir el archivo.',
            ]);
        }
    }

    /**
     * POST notes/delete
     * Body: { id: número }. Borra fila + archivo físico (si lo había).
     * 404 si el apunte no existe o pertenece a otro usuario.
     */
    public function delete($data = []) {
        $auth   = AuthMiddleware::verifyToken();
        $userId = $auth['id'];

        $id = isset($data['id']) ? (int) $data['id'] : 0;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'ID de apunte no válido.',
            ]);
            return;
        }

        try {
            // Leemos primero para conocer file_path (si lo había). Si no
            // existe o no pertenece al usuario, 404 sin tocar nada.
            $existing = $this->noteModel->findByIdForUser($id, $userId);
            if (!$existing) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Apunte no encontrado.',
                ]);
                return;
            }

            $ok = $this->noteModel->delete($id, $userId);
            if (!$ok) {
                // Carrera improbable (la fila desapareció entre las dos
                // queries). Tratamos como 404 sin filtrar detalle.
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'Apunte no encontrado.',
                ]);
                return;
            }

            // Limpieza del archivo físico tras DELETE exitoso. Si la
            // limpieza falla por permisos o porque el archivo ya no
            // estaba, lo logueamos pero no degradamos la respuesta — el
            // contrato del cliente es "el apunte ya no existe", y la BD
            // así lo refleja.
            if (!empty($existing['file_path'])) {
                $absolute = $this->absolutePathForRelative($existing['file_path'], $userId);
                if ($absolute !== null && is_file($absolute)) {
                    if (!@unlink($absolute)) {
                        error_log('[NoteController::delete] No se pudo borrar el archivo: ' . $absolute);
                    }
                }
            }

            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'Apunte eliminado.',
            ]);
        } catch (PDOException $e) {
            error_log('[NoteController::delete] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al eliminar el apunte.',
            ]);
        }
    }

    private function uploadPdf($userId, array $file, array $fields) {
        // Errores de subida distintos de "no se envió archivo".
        if ($file['error'] !== UPLOAD_ERR_OK) {
            http_response_code($file['error'] === UPLOAD_ERR_INI_SIZE
                || $file['error'] === UPLOAD_ERR_FORM_SIZE ? 413 : 400);
            echo json_encode([
                'success' => false,
                'message' => 'No se pudo subir el archivo. Comprueba el tamaño y vuelve a intentarlo.',
            ]);
            return;
        }

        if ($file['size'] > self::MAX_PDF_SIZE) {
            http_response_code(413);
            echo json_encode([
                'success' => false,
                'message' => 'El PDF supera el tamaño máximo permitido (5 MB).',
            ]);
            return;
        }

        // Validamos el mime declarado por el cliente. Para defensa
        // adicional comprobamos también la extensión del nombre original.
        $mime      = isset($file['type']) ? strtolower((string) $file['type']) : '';
        $extension = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
        if ($mime !== 'application/pdf' || $extension !== 'pdf') {
            http_response_code(415);
            echo json_encode([
                'success' => false,
                'message' => 'Sólo se aceptan archivos PDF.',
            ]);
            return;
        }

        // Título: opcional. Si llega, validar 1..200 chars; si no,
        // derivar del nombre original sin extensión.
        $titleInput = isset($fields['title']) ? trim((string) $fields['title']) : '';
        if ($titleInput !== '' && mb_strlen($titleInput) > self::TITLE_MAX_LEN) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'El título no puede superar 200 caracteres.',
            ]);
            return;
        }
        $originalFilename = (string) ($file['name'] ?? 'apunte.pdf');
        if ($titleInput === '') {
            $derived = pathinfo($originalFilename, PATHINFO_FILENAME);
            $titleInput = $derived !== '' ? mb_substr($derived, 0, self::TITLE_MAX_LEN) : 'Apunte sin título';
        }
        // La columna `original_filename` es VARCHAR(255). Truncamos para
        // evitar fallos de INSERT si MariaDB está en STRICT_TRANS_TABLES.
        if (mb_strlen($originalFilename) > 255) {
            $originalFilename = mb_substr($originalFilename, 0, 255);
        }

        // Generamos UUID hex (128 bits de entropía criptográfica) para
        // evitar colisiones y enumeración del filesystem.
        try {
            $uuid = bin2hex(random_bytes(16));
        } catch (Exception $e) {
            error_log('[NoteController::uploadPdf] random_bytes falló: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error interno al preparar el almacenamiento.',
            ]);
            return;
        }

        $relativePath = "notes/{$userId}/{$uuid}.pdf";
        $absoluteDir  = $this->uploadsRoot() . DIRECTORY_SEPARATOR . 'notes' . DIRECTORY_SEPARATOR . $userId;
        $absoluteFile = $absoluteDir . DIRECTORY_SEPARATOR . "{$uuid}.pdf";

        if (!is_dir($absoluteDir) && !@mkdir($absoluteDir, 0775, true) && !is_dir($absoluteDir)) {
            error_log('[NoteController::uploadPdf] No se pudo crear el directorio: ' . $absoluteDir);
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al preparar el almacenamiento.',
            ]);
            return;
        }

        if (!move_uploaded_file($file['tmp_name'], $absoluteFile)) {
            error_log('[NoteController::uploadPdf] move_uploaded_file falló a: ' . $absoluteFile);
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al guardar el archivo.',
            ]);
            return;
        }

        // Validación de MIME REAL leyendo los magic bytes del archivo en
        // disco. La comprobación previa (`$file['type']` + extensión)
        // depende de lo que declare el cliente y es manipulable: un
        // atacante podría enviar un .exe etiquetado como
        // "application/pdf". `finfo` mira los primeros bytes ("%PDF-")
        // para confirmar que es realmente un PDF. Si falla, borramos el
        // huérfano del filesystem y devolvemos 415.
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $realMime = $finfo ? finfo_file($finfo, $absoluteFile) : false;
        if ($finfo) {
            finfo_close($finfo);
        }
        if ($realMime !== 'application/pdf') {
            @unlink($absoluteFile);
            error_log('[NoteController::uploadPdf] MIME real distinto de application/pdf: ' . var_export($realMime, true));
            http_response_code(415);
            echo json_encode([
                'success' => false,
                'message' => 'El archivo no es un PDF válido.',
            ]);
            return;
        }

        try {
            $newId = $this->noteModel->create(
                $userId,
                $titleInput,
                'pdf',
                $originalFilename,
                $relativePath,
                null,   // extracted_text NULL en PDF (la fase IA decidirá si cachea texto)
                0       // char_count 0 hasta que la fase IA lo rellene (si lo hace)
            );
            if (!$newId) {
                // Inserción falló silenciosamente: limpiamos el archivo
                // físico para no dejar huérfanos en disco.
                @unlink($absoluteFile);
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'message' => 'Error al registrar el apunte.',
                ]);
                return;
            }

            http_response_code(201);
            echo json_encode([
                'success' => true,
                'message' => 'Apunte subido.',
                'data'    => [
                    'id'         => (int) $newId,
                    'title'      => $titleInput,
                    'char_count' => 0,
                ],
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            // Misma estrategia: si la BD falla, no dejamos archivo huérfano.
            @unlink($absoluteFile);
            error_log('[NoteController::uploadPdf] PDO: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al guardar el apunte.',
            ]);
        }
    }

    private function uploadText($userId, array $fields) {
        $title = isset($fields['title']) ? trim((string) $fields['title']) : '';
        $body  = isset($fields['body'])  ? (string) $fields['body']        : '';

        if ($title === '') {
            $title = 'Apunte sin título';
        }
        if (mb_strlen($title) > self::TITLE_MAX_LEN) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'El título no puede superar 200 caracteres.',
            ]);
            return;
        }

        // Para textos pegados sí exigimos contenido (un apunte vacío no
        // tiene sentido y rompería la generación IA en la rama futura).
        $bodyTrimmed = trim($body);
        if ($bodyTrimmed === '') {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'El contenido del apunte no puede estar vacío.',
            ]);
            return;
        }
        if (mb_strlen($bodyTrimmed) > self::TEXT_MAX_LEN) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'El contenido supera el límite permitido (200 000 caracteres).',
            ]);
            return;
        }

        try {
            $charCount = mb_strlen($bodyTrimmed);
            $newId = $this->noteModel->create(
                $userId,
                $title,
                'text',
                null,           // original_filename NULL en text
                null,           // file_path NULL en text
                $bodyTrimmed,
                $charCount
            );
            if (!$newId) {
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'message' => 'Error al registrar el apunte.',
                ]);
                return;
            }

            http_response_code(201);
            echo json_encode([
                'success' => true,
                'message' => 'Apunte guardado.',
                'data'    => [
                    'id'         => (int) $newId,
                    'title'      => $title,
                    'char_count' => $charCount,
                ],
            ], JSON_UNESCAPED_UNICODE);
        } catch (PDOException $e) {
            error_log('[NoteController::uploadText] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al guardar el apunte.',
            ]);
        }
    }

    private function normalizePublic($row) {
        return [
            'id'                => isset($row['id']) ? (int) $row['id'] : null,
            'user_id'           => isset($row['user_id']) ? (int) $row['user_id'] : null,
            'title'             => (string) ($row['title'] ?? ''),
            'source_type'       => (string) ($row['source_type'] ?? 'text'),
            'original_filename' => $row['original_filename'] ?? null,
            'extracted_text'    => $row['extracted_text']   ?? null,
            'char_count'        => isset($row['char_count']) ? (int) $row['char_count'] : 0,
            'created_at'        => $row['created_at']       ?? null,
            'updated_at'        => $row['updated_at']       ?? null,
        ];
    }

    private function uploadsRoot() {
        return __DIR__ . '/../../uploads';
    }

    private function sanitizeFilenameForHeader($name) {
        $clean = preg_replace('/[\r\n"]/', '_', (string) $name);
        $ascii = preg_replace('/[^\x20-\x7E]/', '_', $clean);
        if ($ascii === '' || $ascii === null) {
            return 'apunte.pdf';
        }
        return $ascii;
    }

    private function absolutePathForRelative($relative, $userId) {
        if (!is_string($relative) || $relative === '') return null;

        // Normalizamos separadores y eliminamos cualquier '..' antes de
        // resolver. realpath() devolverá false si el archivo ya no existe;
        // en ese caso comprobamos el path "lógico" sin resolver.
        $clean = str_replace('\\', '/', $relative);
        if (strpos($clean, '..') !== false) return null;

        $expectedPrefix = "notes/{$userId}/";
        if (strpos($clean, $expectedPrefix) !== 0) return null;

        return $this->uploadsRoot() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $clean);
    }
}
?>
