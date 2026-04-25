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
}
?>
