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
 *
 * Cascada de modelos (ADR-08):
 *   - `GEMINI_MODEL`           → modelo principal (obligatorio).
 *   - `GEMINI_FALLBACK_MODELS` → lista CSV opcional de modelos de respaldo
 *     (p. ej. `gemini-2.5-flash-lite,gemini-2.0-flash`).
 *   Si el principal devuelve un error TRANSITORIO (HTTP 429/500/503/504
 *   o fallo de red), el cliente reintenta con el siguiente modelo de la
 *   lista. Cada modelo se prueba UNA sola vez (sin reintentos sobre el
 *   mismo modelo: ya hay un timeout de 30 s y un retry contra la misma
 *   cuota saturada sólo empeora las cosas). Errores TERMINALES (400,
 *   401/403, safety filter, JSON inválido) propagan inmediatamente —
 *   cambiar de modelo no arregla un prompt malo y sortear safety con
 *   otro modelo no sería defendible ante tribunal.
 */

/**
 * Excepción interna marker: el modelo respondió con un fallo transitorio
 * (rate limit, sobrecarga, timeout, error de red). El llamador
 * (`GeminiClient::generateJson`) decide si reintentar con otro modelo
 * de la cascada. NO escapa de este archivo: si todos los modelos
 * fallan, el catch traduce a una `RuntimeException` estándar que el
 * controller convierte en HTTP 503.
 */
class GeminiTransientException extends RuntimeException {}

class GeminiClient {

    /** Timeout total en segundos para la llamada a Gemini. */
    const REQUEST_TIMEOUT = 30;

    /** Timeout específico para establecer conexión TCP+TLS. */
    const CONNECT_TIMEOUT = 5;

    /** URL base por defecto si no se sobreescribe en `.env`. */
    const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

    /**
     * Códigos HTTP que se consideran TRANSITORIOS y disparan fallback al
     * siguiente modelo de la cascada:
     *   - 429 Too Many Requests     → cuota agotada en este modelo.
     *   - 500 Internal Server Error → error puntual de Google.
     *   - 503 Service Unavailable   → modelo sobrecargado globalmente.
     *   - 504 Gateway Timeout       → timeout en el front de Google.
     * Cualquier otro código (400, 401, 403, 404, ...) es TERMINAL y
     * propaga sin reintento — un modelo distinto no resuelve un prompt
     * mal formado, una key inválida o un endpoint inexistente.
     */
    const TRANSIENT_HTTP_CODES = [429, 500, 503, 504];

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
        $apiKey      = trim((string) EnvLoader::get('GEMINI_API_KEY', ''));
        $primary     = trim((string) EnvLoader::get('GEMINI_MODEL',   ''));
        $fallbackRaw = trim((string) EnvLoader::get('GEMINI_FALLBACK_MODELS', ''));
        $baseUrl     = trim((string) EnvLoader::get('GEMINI_BASE_URL', self::DEFAULT_BASE_URL));

        if ($apiKey === '' || $primary === '') {
            // No exponemos al cliente que falta config: el mensaje
            // canónico es el mismo que en cualquier otro fallo de IA.
            error_log('[GeminiClient] Falta GEMINI_API_KEY o GEMINI_MODEL en .env');
            throw new RuntimeException('IA no disponible (config).');
        }

        // Cascada de modelos: primario → fallbacks declarados en .env.
        // `buildModelChain` normaliza el prefijo `models/` y deduplica.
        $models = self::buildModelChain($primary, $fallbackRaw);

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
        // El body es independiente del modelo: se construye una sola vez
        // y se reutiliza en cada intento de la cascada.
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

        // ─── 4. Cascada: probar cada modelo hasta éxito ────────────────
        // Se cae al siguiente modelo SOLO en errores transitorios
        // (`GeminiTransientException`). Errores terminales propagan
        // inmediatamente desde `executeRequest`. Si todos los modelos
        // de la cascada fallan transitoriamente, devolvemos un único
        // mensaje canónico al controller (que lo traduce a 503).
        $totalModels   = count($models);
        $lastTransient = null;
        foreach ($models as $i => $model) {
            try {
                return self::executeRequest($model, $bodyJson, $apiKey, $baseUrl);
            } catch (GeminiTransientException $e) {
                $lastTransient = $e->getMessage();
                $hasMore = ($i + 1) < $totalModels;
                error_log(sprintf(
                    '[GeminiClient] Modelo "%s" transitorio: %s%s',
                    $model,
                    $lastTransient,
                    $hasMore ? ' → probando siguiente fallback' : ' → sin más fallbacks'
                ));
                // continúa al siguiente modelo
            }
        }

        // Toda la cascada saturada. El error_log ya tiene el detalle de
        // cada intento; al cliente sólo le llega el mensaje canónico.
        throw new RuntimeException('IA no disponible (todos los modelos saturados).');
    }

    /**
     * Construye la cascada ordenada de modelos a probar:
     *   [principal, fallback_1, fallback_2, ...]
     *
     * Aplica dos normalizaciones:
     *   - Quita el prefijo `models/` si el alumno lo escribió en `.env`
     *     (la API devuelve los nombres así en otros endpoints, pero
     *     `:generateContent` espera sólo el id corto).
     *   - Deduplica preservando el orden: si un fallback coincide con
     *     el principal o con otro fallback ya en la lista, se ignora
     *     para no probar el mismo modelo dos veces.
     */
    private static function buildModelChain($primary, $fallbackRaw) {
        $normalize = function ($name) {
            $name = trim((string) $name);
            if (strncmp($name, 'models/', 7) === 0) {
                $name = substr($name, 7);
            }
            return $name;
        };

        $chain = [$normalize($primary)];

        if ($fallbackRaw !== '') {
            foreach (explode(',', $fallbackRaw) as $candidate) {
                $clean = $normalize($candidate);
                if ($clean === '' || in_array($clean, $chain, true)) continue;
                $chain[] = $clean;
            }
        }

        return $chain;
    }

    /**
     * Ejecuta UNA llamada HTTP a un modelo concreto y devuelve el JSON
     * decodificado del candidate.
     *
     * Política de errores:
     *   - Red/curl-error          → `GeminiTransientException` (cascada).
     *   - HTTP 429/500/503/504    → `GeminiTransientException` (cascada).
     *   - Resto de HTTP no-200    → `RuntimeException` (terminal).
     *   - Sin candidates / safety → `RuntimeException` (terminal).
     *   - Candidate vacío         → `RuntimeException` (terminal).
     *   - JSON inválido           → `RuntimeException` (terminal).
     *
     * El criterio: sólo es transitorio aquello que un cambio de modelo
     * razonablemente puede arreglar. Un prompt mal formado, una key
     * inválida o un filtro de safety NO se arreglan cambiando de modelo,
     * así que esos casos abortan la cascada.
     */
    private static function executeRequest($model, $bodyJson, $apiKey, $baseUrl) {
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
            // Errores de red son transitorios: el siguiente modelo
            // implica una nueva conexión TCP/TLS que puede triunfar.
            throw new GeminiTransientException("curl #$errno: $err");
        }

        if (in_array($code, self::TRANSIENT_HTTP_CODES, true)) {
            // El cuerpo de error de Gemini suele incluir
            // {error: {message: "..."}}. Lo logueamos truncado para
            // diagnóstico pero NO lo exponemos al cliente.
            error_log("[GeminiClient] HTTP $code (transitorio) modelo=$model: "
                . substr((string) $raw, 0, 300));
            throw new GeminiTransientException("HTTP $code");
        }

        if ($code !== 200) {
            // 400 (prompt malo), 401/403 (auth), 404 (modelo inexistente):
            // cambiar de modelo no lo arregla. Abortamos la cascada.
            error_log("[GeminiClient] HTTP $code (terminal) modelo=$model: "
                . substr((string) $raw, 0, 500));
            throw new RuntimeException("IA no disponible (HTTP $code).");
        }

        // ─── Parseo del envelope Gemini ────────────────────────────────
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
            // Sin candidates: típicamente promptFeedback con bloqueo por
            // safety filters. Terminal — sortear safety con otro modelo
            // sería indefendible.
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
            // truncado por límite de tokens. Terminal — ver razonamiento
            // del bloque "sin candidates" justo arriba.
            $finish = $candidate['finishReason'] ?? '(sin motivo)';
            error_log('[GeminiClient] Candidate sin texto. finishReason=' . $finish);
            throw new RuntimeException('IA no disponible (respuesta vacía).');
        }

        // ─── Parseo del JSON del candidate ─────────────────────────────
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
