<?php
/**
 * Cliente HTTP de la IA — capa fina sobre Ollama (https://ollama.com).
 *
 * Configuración por variables de entorno (.env):
 *   OLLAMA_BASE_URL   p. ej. http://192.168.1.50:11434
 *   OLLAMA_MODEL      p. ej. gpt-oss:20b  (o qwen3:8b, llama3.2, etc.)
 *
 * Comportamiento:
 *   - Si AMBAS variables están definidas → llamada real a Ollama.
 *   - Si falta alguna             → modo STUB demo (3 hijos genéricos).
 *     Sirve para que el editor sea defendible aunque Ollama no esté
 *     levantado o no exista API key (caso típico de defensa offline o
 *     pre-instalación del modelo en el servidor remoto).
 *   - Si la llamada real falla por timeout, red, HTTP no-200 o JSON
 *     inválido → lanza RuntimeException. El controller traduce esa
 *     excepción a respuesta 503 con mensaje
 *     "La IA no está disponible ahora." (NO se cae en stub silencioso:
 *     defendible que el usuario vea el problema real).
 *
 * Sin SDKs Composer; sólo curl nativo de PHP (cumple regla CLAUDE.md
 * "sin SDKs pesados"). Documentado en plan §1.4 y ADR-06 (pendiente).
 */
class AIClient {

    /** Timeout en segundos para la llamada a Ollama. */
    const REQUEST_TIMEOUT = 30;

    /**
     * Expande un concepto en 3-5 sub-conceptos relacionados.
     *
     * @param string      $label    Nombre del concepto a expandir.
     * @param string|null $context  Contexto del padre/abuelo (opcional).
     * @return array Lista de hijos: [{ "label": string, "hint": string }, ...]
     * @throws RuntimeException si la IA está configurada pero falla la llamada.
     */
    public static function expand($label, $context = null) {
        $baseUrl = trim((string) EnvLoader::get('OLLAMA_BASE_URL', ''));
        $model   = trim((string) EnvLoader::get('OLLAMA_MODEL',    ''));

        // Modo demo: sin configuración → stub determinístico.
        if ($baseUrl === '' || $model === '') {
            return self::stubChildren($label);
        }

        $prompt = self::buildPrompt($label, $context);

        $body = json_encode([
            'model'    => $model,
            'messages' => [
                [
                    'role'    => 'system',
                    'content' => 'Eres un asistente de estudio en español. Devuelves siempre JSON válido y nada más.',
                ],
                [
                    'role'    => 'user',
                    'content' => $prompt,
                ],
            ],
            // format: "json" → Ollama fuerza al modelo a producir JSON parseable.
            'format'  => 'json',
            'stream'  => false,
            'options' => [
                'temperature' => 0.5,
                'num_predict' => 800,
            ],
        ], JSON_UNESCAPED_UNICODE);

        $url = rtrim($baseUrl, '/') . '/api/chat';

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_TIMEOUT        => self::REQUEST_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $raw   = curl_exec($ch);
        $errno = curl_errno($ch);
        $err   = curl_error($ch);
        $code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0 || $raw === false) {
            // Errores de red/timeout: el log queda en error_log para auditoría
            // del alumno; el cliente recibe sólo el mensaje genérico.
            error_log("[AIClient] Ollama curl error #$errno: $err");
            throw new RuntimeException('IA no disponible (red).');
        }
        if ($code !== 200) {
            error_log("[AIClient] Ollama HTTP $code: $raw");
            throw new RuntimeException("IA no disponible (HTTP $code).");
        }

        $payload = json_decode($raw, true);
        if (!is_array($payload) || !isset($payload['message']['content'])) {
            error_log('[AIClient] Respuesta Ollama sin message.content: ' . substr($raw, 0, 300));
            throw new RuntimeException('IA no disponible (respuesta vacía).');
        }

        $content = $payload['message']['content'];
        $parsed  = json_decode($content, true);
        if (!is_array($parsed) || !isset($parsed['children']) || !is_array($parsed['children'])) {
            error_log('[AIClient] Contenido sin "children" array: ' . substr($content, 0, 300));
            throw new RuntimeException('IA no disponible (formato inesperado).');
        }

        // Saneamos cada hijo: nos quedamos con label/hint como strings,
        // descartamos los inválidos. Limitamos a 5 (por si el modelo se
        // pasa) y exigimos al menos 1.
        $clean = [];
        foreach ($parsed['children'] as $child) {
            if (!is_array($child)) continue;
            $childLabel = isset($child['label']) ? trim((string) $child['label']) : '';
            $childHint  = isset($child['hint'])  ? trim((string) $child['hint'])  : '';
            if ($childLabel === '') continue;
            if (mb_strlen($childLabel) > 100) $childLabel = mb_substr($childLabel, 0, 100);
            if (mb_strlen($childHint)  > 200) $childHint  = mb_substr($childHint,  0, 200);
            $clean[] = ['label' => $childLabel, 'hint' => $childHint];
            if (count($clean) >= 5) break;
        }

        if (empty($clean)) {
            throw new RuntimeException('IA no disponible (sin sub-conceptos válidos).');
        }
        return $clean;
    }

    /**
     * Genera entre 8 y 15 flashcards de repaso a partir de los nodos
     * de un mapa. Mismo patrón HTTP que `expand`: format:'json' para
     * forzar al modelo a devolver un objeto parseable, timeout 30s,
     * `RuntimeException` en cualquier fallo (controller traduce a 503).
     *
     * @param string $mapTitle  Título del mapa (contexto para el prompt).
     * @param array  $nodes     Lista de [{ label, hint }, ...] ya extraída
     *                          del drawflow_json por el controller.
     * @return array Lista de tarjetas: [{ "front": string, "back": string }, ...].
     * @throws RuntimeException si la IA está configurada pero falla.
     */
    public static function generateFlashcards($mapTitle, $nodes) {
        $baseUrl = trim((string) EnvLoader::get('OLLAMA_BASE_URL', ''));
        $model   = trim((string) EnvLoader::get('OLLAMA_MODEL',    ''));

        // Modo demo: sin configuración → tarjetas stub a partir de los nodos.
        if ($baseUrl === '' || $model === '') {
            return self::stubFlashcards($nodes);
        }

        $prompt = self::buildFlashcardsPrompt($mapTitle, $nodes);

        $body = json_encode([
            'model'    => $model,
            'messages' => [
                [
                    'role'    => 'system',
                    'content' => 'Eres un asistente de estudio en español. Devuelves siempre JSON válido y nada más.',
                ],
                [
                    'role'    => 'user',
                    'content' => $prompt,
                ],
            ],
            'format'  => 'json',
            'stream'  => false,
            'options' => [
                'temperature' => 0.5,
                // Margen para 15 tarjetas (≈100 tokens cada una con
                // pregunta+respuesta cortas + estructura JSON).
                'num_predict' => 1500,
            ],
        ], JSON_UNESCAPED_UNICODE);

        $url = rtrim($baseUrl, '/') . '/api/chat';

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_TIMEOUT        => self::REQUEST_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $raw   = curl_exec($ch);
        $errno = curl_errno($ch);
        $err   = curl_error($ch);
        $code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0 || $raw === false) {
            error_log("[AIClient::generateFlashcards] Ollama curl error #$errno: $err");
            throw new RuntimeException('IA no disponible (red).');
        }
        if ($code !== 200) {
            error_log("[AIClient::generateFlashcards] Ollama HTTP $code: $raw");
            throw new RuntimeException("IA no disponible (HTTP $code).");
        }

        $payload = json_decode($raw, true);
        if (!is_array($payload) || !isset($payload['message']['content'])) {
            error_log('[AIClient::generateFlashcards] Respuesta sin message.content: ' . substr($raw, 0, 300));
            throw new RuntimeException('IA no disponible (respuesta vacía).');
        }

        $content = $payload['message']['content'];
        $parsed  = json_decode($content, true);
        if (!is_array($parsed) || !isset($parsed['cards']) || !is_array($parsed['cards'])) {
            error_log('[AIClient::generateFlashcards] Contenido sin "cards" array: ' . substr($content, 0, 300));
            throw new RuntimeException('IA no disponible (formato inesperado).');
        }

        // Saneamos cada tarjeta: front/back no vacíos, recortados a
        // 200 chars (regla del prompt), máximo 15 (regla del prompt).
        $clean = [];
        foreach ($parsed['cards'] as $card) {
            if (!is_array($card)) continue;
            $front = isset($card['front']) ? trim((string) $card['front']) : '';
            $back  = isset($card['back'])  ? trim((string) $card['back'])  : '';
            if ($front === '' || $back === '') continue;
            if (mb_strlen($front) > 200) $front = mb_substr($front, 0, 200);
            if (mb_strlen($back)  > 200) $back  = mb_substr($back,  0, 200);
            $clean[] = ['front' => $front, 'back' => $back];
            if (count($clean) >= 15) break;
        }

        if (empty($clean)) {
            throw new RuntimeException('IA no disponible (sin tarjetas válidas).');
        }
        return $clean;
    }

    /**
     * Stub determinístico para modo demo (sin OLLAMA_*).
     * Devuelve 3 sub-conceptos genéricos basados en el label de entrada,
     * de forma que la UI sea funcional sin depender de la IA real.
     */
    private static function stubChildren($label) {
        $base = trim((string) $label);
        if ($base === '') $base = 'Concepto';
        return [
            ['label' => "Subtema A de $base", 'hint' => 'Ejemplo demo (sin IA conectada).'],
            ['label' => "Subtema B de $base", 'hint' => 'Ejemplo demo (sin IA conectada).'],
            ['label' => "Subtema C de $base", 'hint' => 'Ejemplo demo (sin IA conectada).'],
        ];
    }

    /**
     * Stub determinístico de flashcards para modo demo. Genera una
     * tarjeta por nodo (máx. 15) con la fórmula "¿Qué es X? → hint",
     * para que la UI sea funcional aunque Ollama no esté conectado.
     */
    private static function stubFlashcards($nodes) {
        $cards = [];
        foreach ($nodes as $node) {
            if (!is_array($node)) continue;
            $label = trim((string) ($node['label'] ?? ''));
            if ($label === '') continue;
            $hint = trim((string) ($node['hint'] ?? ''));
            $cards[] = [
                'front' => "¿Qué es {$label}?",
                'back'  => $hint !== '' ? $hint : 'Ejemplo demo (sin IA conectada).',
            ];
            if (count($cards) >= 15) break;
        }
        return $cards;
    }

    /**
     * Construye el prompt en castellano para el modelo. Estricto sobre
     * el formato JSON esperado para minimizar respuestas malformadas
     * (incluso con format:"json" activo, conviene reforzar el schema).
     */
    private static function buildPrompt($label, $context) {
        $contextLine = $context
            ? "Contexto del concepto padre: \"{$context}\"."
            : 'Sin contexto adicional.';

        return <<<EOT
Concepto a expandir: "{$label}"
{$contextLine}

Devuelve un objeto JSON con esta forma exacta:

{
  "children": [
    { "label": "...", "hint": "..." }
  ]
}

Reglas:
- Entre 3 y 5 elementos en "children".
- "label" en español, máximo 60 caracteres, mayúscula inicial.
- "hint" en español, una frase explicativa, máximo 120 caracteres.
- No incluyas texto fuera del JSON.
- No añadas claves distintas a "label" y "hint".
EOT;
    }

    /**
     * Construye el prompt para generar flashcards a partir del título
     * del mapa y su lista de nodos. Schema explícito en el cuerpo del
     * prompt como refuerzo de format:'json'.
     */
    private static function buildFlashcardsPrompt($mapTitle, $nodes) {
        // Serializamos los nodos en una lista plana legible por el modelo.
        // Limitamos cada line para no inflar innecesariamente el prompt.
        $lines = [];
        foreach ($nodes as $node) {
            if (!is_array($node)) continue;
            $label = trim((string) ($node['label'] ?? ''));
            if ($label === '') continue;
            $hint = trim((string) ($node['hint'] ?? ''));
            $lines[] = $hint !== ''
                ? "- {$label}: {$hint}"
                : "- {$label}";
        }
        $nodesBlock = implode("\n", $lines);

        $titleSafe = trim((string) $mapTitle);
        if ($titleSafe === '') $titleSafe = 'Mapa sin título';

        return <<<EOT
A partir de este mapa conceptual, genera entre 8 y 15 flashcards de
repaso. Devuelve un objeto JSON con esta forma exacta:

{
  "cards": [
    { "front": "Pregunta…", "back": "Respuesta…" }
  ]
}

Reglas:
- Entre 8 y 15 elementos en "cards". Si los nodos son menos de 8,
  genera tantas tarjetas como puedas sin inventar conceptos ajenos.
- "front": pregunta breve en español, máximo 200 caracteres.
- "back": respuesta corta en español, máximo 200 caracteres.
- No incluyas texto fuera del JSON.
- No añadas claves distintas a "front" y "back".

Mapa: "{$titleSafe}"
Nodos:
{$nodesBlock}
EOT;
    }
}
?>
