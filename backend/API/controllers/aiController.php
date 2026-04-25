<?php
/**
 * AIController — endpoints de IA de StudyWeaver.
 *
 * Por ahora un único endpoint:
 *   POST ai/expand → expande un concepto en 3-5 sub-conceptos.
 *
 * El cliente HTTP a Ollama vive en API/services/AIClient.php; este
 * controller sólo valida input, llama al servicio y formatea la
 * respuesta JSON.
 *
 * Convenciones (CLAUDE.md §9 + Gemini.md §4):
 *   - Auth con AuthMiddleware::verifyToken() (mismo patrón que
 *     mapController).
 *   - Respuesta uniforme { success, message?, data? }.
 *   - Códigos HTTP coherentes: 200, 400, 401, 503 (IA caída).
 *   - Sin secrets: la URL/modelo de Ollama viven en .env y los lee
 *     EnvLoader desde AIClient. El cliente no ve nunca esos datos.
 */

require_once __DIR__ . '/../middleware/verify-token.php';
require_once __DIR__ . '/../services/AIClient.php';

class AIController {
    private $db;

    public function __construct($db) {
        $this->db = $db;
    }

    /**
     * POST ai/expand
     * Body:
     *   {
     *     "node_label":     "Algoritmos de ordenación",
     *     "parent_context": "Estructuras de datos"   // opcional
     *   }
     * Respuesta éxito:
     *   200 { success: true, data: { children: [{label, hint}, ...] } }
     * Errores:
     *   400 validación
     *   401 sin auth (delegado al middleware)
     *   503 IA configurada pero no responde / responde mal
     */
    public function expand($data = []) {
        AuthMiddleware::verifyToken();

        $label   = isset($data['node_label']) ? trim((string) $data['node_label']) : '';
        $context = isset($data['parent_context']) ? trim((string) $data['parent_context']) : null;

        if ($label === '') {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'El concepto a expandir es obligatorio.',
            ]);
            return;
        }
        if (mb_strlen($label) > 200) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'El concepto no puede superar 200 caracteres.',
            ]);
            return;
        }
        if ($context !== null && mb_strlen($context) > 500) {
            // Recortamos en lugar de rechazar: el contexto es opcional y
            // mejor truncado que perder la petición.
            $context = mb_substr($context, 0, 500);
        }
        if ($context === '') $context = null;

        try {
            $children = AIClient::expand($label, $context);
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'data'    => ['children' => $children],
            ], JSON_UNESCAPED_UNICODE);
        } catch (RuntimeException $e) {
            // El detalle real ya quedó en error_log (AIClient).
            // Al cliente le devolvemos el mensaje canónico acordado.
            http_response_code(503);
            echo json_encode([
                'success' => false,
                'message' => 'La IA no está disponible ahora.',
            ]);
        } catch (Throwable $e) {
            error_log('[AIController] Excepción inesperada: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error interno al expandir el concepto.',
            ]);
        }
    }
}
?>
