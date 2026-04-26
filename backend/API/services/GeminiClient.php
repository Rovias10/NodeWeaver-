<?php
/**
 * Cliente HTTP de bajo nivel para la API de Google Gemini.
 *
 * Esta clase es el ÚNICO punto del backend que habla con
 * `generativelanguage.googleapis.com`. Encapsula:
 *   - Lectura de configuración desde `.env` (GEMINI_API_KEY,
 *     GEMINI_MODEL, GEMINI_BASE_URL opcional).
 *   - Construcción del payload v1beta `:generateContent`.
 *   - Llamada curl con timeout y manejo uniforme de errores.
 *   - Extracción del texto del primer candidate y parseo a array.
 *   - Logging defensivo de uso de tokens (auditoría de coste).
 *
 * NO conoce ningún caso de uso concreto: los prompts, el saneo de la
 * respuesta y la lógica de negocio viven en `AIClient` (capa de alto
 * nivel) y, finalmente, en los controllers (`aiController`,
 * `flashcardController`).
 *
 * Justificación arquitectónica (defendible ante tribunal):
 *   - Separación cliente HTTP / fachada de producto = Single
 *     Responsibility. Un cambio de proveedor IA en el futuro toca
 *     este archivo y no `AIClient`.
 *   - Sin SDKs Composer (`google/generative-ai` o similares): cumple
 *     la regla CLAUDE.md "sin librerías que el alumno no pueda
 *     explicar". curl nativo es 50 líneas legibles.
 *
 * Comportamiento en errores:
 *   - Falta de config (KEY o MODEL vacíos)        → RuntimeException.
 *   - Red/timeout/curl-error                       → RuntimeException.
 *   - HTTP no-200 (400, 401, 403, 429, 500, 503)   → RuntimeException.
 *   - JSON envelope inválido o sin `candidates`    → RuntimeException.
 *   - Candidate sin texto (safety filter, etc.)    → RuntimeException.
 *   - Texto del candidate no parseable como JSON   → RuntimeException.
 *
 * El controller traduce TODA RuntimeException a HTTP 503 con el
 * mensaje canónico "La IA no está disponible ahora." (mismo patrón
 * que ya tenía AIClient con Ollama, ver `aiController::expand`).
 *
 * Sin modo stub: a diferencia del cliente Ollama heredado, aquí no
 * hay fallback determinístico. Decisión consciente — un mapa o unas
 * flashcards stub no aportan valor cuando el contenido depende del
 * apunte concreto que sube el alumno.
 */
class GeminiClient {

    /** Timeout total en segundos para la llamada a Gemini. */
    const REQUEST_TIMEOUT = 30;

    /** Timeout específico para establecer conexión TCP+TLS. */
    const CONNECT_TIMEOUT = 5;

    /** URL base por defecto si no se sobreescribe en `.env`. */
    const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

    /**
     * Llama al endpoint `:generateContent` con structured JSON output
     * y devuelve la respuesta del modelo ya decodificada como array.
     *
     * @param string      $userPrompt         Mensaje del usuario (texto del prompt).
     * @param string|null $systemInstruction  Instrucción de sistema opcional.
     *                                         Equivale al `messages[role=system]`
     *                                         de OpenAI/Ollama, pero Gemini lo
     *                                         coloca en su propio campo top-level.
     * @param string|null $pdfPath            Ruta absoluta a un PDF a adjuntar
     *                                         como `inline_data` (multimodal).
     *                                         NULL = sólo texto. Tope blando 5 MB
     *                                         (validado por NoteController al
     *                                         subir, así que aquí sólo verificamos
     *                                         que el archivo es legible).
     * @param array       $options            Opciones extra. Claves soportadas:
     *                                         - 'temperature'     float 0..1 (default 0.5)
     *                                         - 'thinking_budget' int (default 0 = desactivado;
     *                                                                  -1 = dynamic; >0 = cap de tokens)
     *
     * @return array El JSON de la respuesta del modelo (ya decodificado).
     * @throws RuntimeException En cualquier fallo (config, red, HTTP, formato).
     */
    public static function generateJson(
        $userPrompt,
        $systemInstruction = null,
        $pdfPath = null,
        array $options = []
    ) {
        // ─── 1. Configuración ──────────────────────────────────────────
        $apiKey  = trim((string) EnvLoader::get('GEMINI_API_KEY', ''));
        $model   = trim((string) EnvLoader::get('GEMINI_MODEL',   ''));
        $baseUrl = trim((string) EnvLoader::get('GEMINI_BASE_URL', self::DEFAULT_BASE_URL));

        if ($apiKey === '' || $model === '') {
            // No exponemos al cliente que falta config: el mensaje
            // canónico es el mismo que en cualquier otro fallo de IA.
            error_log('[GeminiClient] Falta GEMINI_API_KEY o GEMINI_MODEL en .env');
            throw new RuntimeException('IA no disponible (config).');
        }

        // Tolerancia: si el alumno pone "models/gemini-2.5-flash" en
        // GEMINI_MODEL (formato full path que devuelve la API en otros
        // endpoints), lo normalizamos. La URL final espera sólo el id.
        if (strncmp($model, 'models/', 7) === 0) {
            $model = substr($model, 7);
        }

        // ─── 2. Construcción de las parts del mensaje ──────────────────
        // El campo `contents[0].parts` puede llevar texto y, opcionalmente,
        // un PDF inline en base64. Gemini procesa ambos en la misma
        // llamada gracias a su capacidad multimodal nativa.
        $parts = [['text' => (string) $userPrompt]];

        if ($pdfPath !== null && $pdfPath !== '') {
            if (!is_file($pdfPath) || !is_readable($pdfPath)) {
                error_log('[GeminiClient] PDF no encontrado o ilegible: ' . $pdfPath);
                throw new RuntimeException('IA no disponible (archivo).');
            }
            $bytes = file_get_contents($pdfPath);
            if ($bytes === false) {
                error_log('[GeminiClient] file_get_contents falló para: ' . $pdfPath);
                throw new RuntimeException('IA no disponible (archivo).');
            }
            $parts[] = [
                'inline_data' => [
                    'mime_type' => 'application/pdf',
                    'data'      => base64_encode($bytes),
                ],
            ];
        }

        // ─── 3. Cuerpo completo de la petición ─────────────────────────
        $temperature   = isset($options['temperature']) ? (float) $options['temperature'] : 0.5;
        $thinkingBudget = array_key_exists('thinking_budget', $options)
            ? (int) $options['thinking_budget']
            : 0; // por defecto, sin "thinking" → minimiza latencia y coste.

        $body = [
            'contents' => [
                ['role' => 'user', 'parts' => $parts],
            ],
            'generationConfig' => [
                'temperature'      => $temperature,
                // responseMimeType = 'application/json' obliga al modelo
                // a devolver JSON parseable (equivalente al format:'json'
                // que usábamos con Ollama). Sin esto, Gemini puede
                // envolver el JSON en un code fence ```json ... ```.
                'responseMimeType' => 'application/json',
                'thinkingConfig'   => [
                    // 0 desactiva el razonamiento interno del modelo;
                    // -1 lo deja en modo dinámico (decide el modelo);
                    // >0 lo limita a N tokens de pensamiento.
                    'thinkingBudget' => $thinkingBudget,
                ],
            ],
        ];

        if ($systemInstruction !== null && trim((string) $systemInstruction) !== '') {
            $body['systemInstruction'] = [
                'parts' => [['text' => (string) $systemInstruction]],
            ];
        }

        $bodyJson = json_encode($body, JSON_UNESCAPED_UNICODE);
        if ($bodyJson === false) {
            error_log('[GeminiClient] json_encode falló: ' . json_last_error_msg());
            throw new RuntimeException('IA no disponible (payload).');
        }

        // ─── 4. Llamada HTTP ───────────────────────────────────────────
        $url = rtrim($baseUrl, '/')
             . '/v1beta/models/' . rawurlencode($model) . ':generateContent';

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                // Header `x-goog-api-key` en lugar de `?key=` en query
                // string: la key no aparece en logs de proxy/CDN ni en
                // historial de URL. Mismo nivel de auth, mejor higiene.
                'x-goog-api-key: ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS     => $bodyJson,
            CURLOPT_TIMEOUT        => self::REQUEST_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => self::CONNECT_TIMEOUT,
        ]);
        $raw   = curl_exec($ch);
        $errno = curl_errno($ch);
        $err   = curl_error($ch);
        $code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0 || $raw === false) {
            error_log("[GeminiClient] curl error #$errno: $err");
            throw new RuntimeException('IA no disponible (red).');
        }
        if ($code !== 200) {
            // El cuerpo de error de Gemini suele incluir
            // {error: {message: "..."}}. Lo logueamos truncado para
            // diagnóstico pero NO lo exponemos al cliente.
            error_log("[GeminiClient] HTTP $code: " . substr((string) $raw, 0, 500));
            throw new RuntimeException("IA no disponible (HTTP $code).");
        }

        // ─── 5. Parseo del envelope Gemini ─────────────────────────────
        $payload = json_decode($raw, true);
        if (!is_array($payload)) {
            error_log('[GeminiClient] Respuesta no es JSON: ' . substr((string) $raw, 0, 300));
            throw new RuntimeException('IA no disponible (respuesta inválida).');
        }

        // Auditoría de tokens (defendible: medimos el consumo por
        // llamada). Sólo es informativo, no afecta a la respuesta.
        $usage = $payload['usageMetadata'] ?? null;
        if (is_array($usage)) {
            error_log(sprintf(
                '[GeminiClient] tokens prompt=%d output=%d total=%d (model=%s)',
                (int) ($usage['promptTokenCount']     ?? 0),
                (int) ($usage['candidatesTokenCount'] ?? 0),
                (int) ($usage['totalTokenCount']      ?? 0),
                $model
            ));
        }

        // Concatenamos todas las parts de tipo text del primer candidate.
        // Con responseMimeType=json sólo hay 1 part, pero defensivamente
        // soportamos varias por si alguna versión de la API las parte.
        $candidate = $payload['candidates'][0] ?? null;
        if (!is_array($candidate)) {
            // Sin candidates: típicamente promptFeedback con bloqueo
            // por safety filters. Logueamos el motivo si lo hay.
            $feedback = $payload['promptFeedback']['blockReason'] ?? '(sin motivo)';
            error_log('[GeminiClient] Sin candidates. promptFeedback=' . $feedback);
            throw new RuntimeException('IA no disponible (sin respuesta).');
        }

        $candidateParts = $candidate['content']['parts'] ?? [];
        $text = '';
        if (is_array($candidateParts)) {
            foreach ($candidateParts as $p) {
                if (isset($p['text'])) {
                    $text .= (string) $p['text'];
                }
            }
        }

        if ($text === '') {
            // Caso típico: candidate con `finishReason='SAFETY'` o
            // truncado por límite de tokens.
            $finish = $candidate['finishReason'] ?? '(sin motivo)';
            error_log('[GeminiClient] Candidate sin texto. finishReason=' . $finish);
            throw new RuntimeException('IA no disponible (respuesta vacía).');
        }

        // ─── 6. Parseo del JSON del candidate ──────────────────────────
        // Aunque pedimos responseMimeType=json, algunos modelos a veces
        // encapsulan el JSON en un fence ```json ... ```. Lo desnudamos
        // defensivamente antes de json_decode.
        $clean = trim($text);
        if (preg_match('/^```(?:json)?\s*(.*?)\s*```$/s', $clean, $matches)) {
            $clean = trim($matches[1]);
        }

        $parsed = json_decode($clean, true);
        if (!is_array($parsed)) {
            error_log('[GeminiClient] JSON inválido en candidate: ' . substr($text, 0, 300));
            throw new RuntimeException('IA no disponible (formato inesperado).');
        }

        return $parsed;
    }
}
?>
