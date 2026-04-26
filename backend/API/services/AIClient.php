<?php
/**
 * Fachada de alto nivel para la IA del producto StudyWeaver.
 *
 * Conoce los casos de uso (expand, generateFlashcards, y en I3 los
 * `parseNoteTo*`), construye los prompts en castellano y sanea la
 * respuesta del modelo. NO conoce el transporte HTTP: lo delega en
 * `GeminiClient` (cliente de bajo nivel para Google Gemini API).
 *
 * Cambio respecto a la versión Ollama (rama `IA_Integration`, ADR-07):
 *   - Antes: curl directo contra `OLLAMA_BASE_URL/api/chat` con
 *     `format:'json'`, modo stub determinístico cuando faltaba la
 *     configuración.
 *   - Ahora: delegación 100% en `GeminiClient::generateJson(...)`.
 *     Sin SDKs externos. Sin modo stub: si Gemini cae, el controller
 *     traduce la `RuntimeException` a 503 con el mensaje canónico.
 *     Coherente con la decisión cerrada en ADR-07 ("para `from-note`
 *     un stub no aporta valor; aplicamos la misma regla a expand y
 *     generateFlashcards para que el comportamiento de error sea
 *     uniforme en los 3 endpoints IA").
 *
 * La firma pública NO cambia: los controllers (`aiController::expand`
 * y `flashcardController::generateFromMap`) siguen invocando
 * `AIClient::expand($label, $context)` y
 * `AIClient::generateFlashcards($mapTitle, $nodes)` sin enterarse de
 * qué proveedor IA hay por debajo.
 *
 * Convenciones (CLAUDE.md §9):
 *   - Castellano en prompts y comentarios.
 *   - `RuntimeException` en cualquier fallo (incluido formato
 *     inesperado del modelo). El controller decide el HTTP.
 *   - Saneo defensivo de la salida (longitudes, tipos, descartes).
 */

require_once __DIR__ . '/GeminiClient.php';

class AIClient {

    /**
     * Instrucción de sistema común a todas las llamadas IA del producto.
     * Refuerza la persona y la regla "JSON válido y sólo JSON" pese a
     * que `GeminiClient` ya activa `responseMimeType: 'application/json'`
     * — sirve de cinturón adicional por si el modelo lo ignora en algún
     * caso límite.
     */
    const SYSTEM_INSTRUCTION_ES =
        'Eres un asistente de estudio en español. Devuelves siempre JSON válido y nada más.';

    /**
     * Expande un concepto en 3-5 sub-conceptos relacionados.
     *
     * @param string      $label    Nombre del concepto a expandir.
     * @param string|null $context  Contexto del padre/abuelo (opcional).
     * @return array Lista de hijos: [{ "label": string, "hint": string }, ...]
     * @throws RuntimeException si la IA falla (red, HTTP, formato).
     */
    public static function expand($label, $context = null) {
        $prompt = self::buildExpandPrompt($label, $context);

        // thinking_budget=0 → mínima latencia. Para expand el output es
        // muy estructurado (3-5 entradas con label/hint cortos) y no
        // necesita razonamiento elaborado.
        $parsed = GeminiClient::generateJson(
            $prompt,
            self::SYSTEM_INSTRUCTION_ES,
            null,
            [
                'temperature'     => 0.5,
                'thinking_budget' => 0,
            ]
        );

        if (!isset($parsed['children']) || !is_array($parsed['children'])) {
            error_log('[AIClient::expand] Contenido sin "children" array: '
                . substr(json_encode($parsed), 0, 300));
            throw new RuntimeException('IA no disponible (formato inesperado).');
        }

        // Saneo: descartamos hijos sin label, recortamos a longitudes
        // máximas, capamos a 5 entradas (regla del prompt).
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
     * de un mapa. Mismo contrato de salida que la versión Ollama
     * heredada — los controllers que la consumen no se enteran del
     * cambio de proveedor.
     *
     * @param string $mapTitle  Título del mapa (contexto para el prompt).
     * @param array  $nodes     Lista de [{ label, hint }, ...] ya extraída
     *                          del drawflow_json por el controller.
     * @return array Lista de tarjetas: [{ "front": string, "back": string }, ...].
     * @throws RuntimeException si la IA falla (red, HTTP, formato).
     */
    public static function generateFlashcards($mapTitle, $nodes) {
        $prompt = self::buildFlashcardsPrompt($mapTitle, $nodes);

        // thinking_budget=-1 (dynamic) → el modelo decide cuánto razonar.
        // Para 8-15 flashcards bien formuladas merece la pena permitir
        // un poco de razonamiento; el coste es menor que un mal output
        // que obligue a regenerar.
        $parsed = GeminiClient::generateJson(
            $prompt,
            self::SYSTEM_INSTRUCTION_ES,
            null,
            [
                'temperature'     => 0.5,
                'thinking_budget' => -1,
            ]
        );

        if (!isset($parsed['cards']) || !is_array($parsed['cards'])) {
            error_log('[AIClient::generateFlashcards] Contenido sin "cards" array: '
                . substr(json_encode($parsed), 0, 300));
            throw new RuntimeException('IA no disponible (formato inesperado).');
        }

        // Saneo: front/back no vacíos, recortados a 200 chars (regla
        // del prompt), máximo 15 (regla del prompt).
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

    // ──────────────────────────────────────────────────────────────────
    // Prompts privados
    // ──────────────────────────────────────────────────────────────────

    /**
     * Construye el prompt en castellano para la expansión de un nodo.
     * Schema explícito en el cuerpo del prompt como refuerzo del
     * `responseMimeType: 'application/json'` que ya aplica GeminiClient.
     */
    private static function buildExpandPrompt($label, $context) {
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
     * prompt como refuerzo del `responseMimeType` y de la regla de
     * 8-15 entradas.
     */
    private static function buildFlashcardsPrompt($mapTitle, $nodes) {
        // Serializamos los nodos en una lista plana legible por el modelo.
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
