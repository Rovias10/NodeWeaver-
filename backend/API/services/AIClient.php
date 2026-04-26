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
     * Tope de caracteres del texto extraído de un apunte que se manda
     * a Gemini en los métodos `parseNoteTo*`. Aunque gemini-2.5-flash
     * acepta una ventana de contexto muy grande (~1M tokens de input),
     * enviar el contenido íntegro de un apunte largo es coste y latencia
     * innecesarios para un TFG: 30 000 caracteres (≈ 8 000 tokens) cubren
     * sobradamente un capítulo universitario y se factura menos.
     *
     * Si el texto excede el cap, el cliente recorta con `mb_substr` y
     * deja un `error_log` informativo (no se devuelve error al usuario).
     * Para apuntes 'pdf' este cap NO aplica: Gemini lee el binario
     * directamente vía `inline_data` y procesa el archivo entero.
     */
    const MAX_NOTE_CHARS = 30000;

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

    /**
     * Genera un mapa conceptual a partir de un apunte. Acepta dos modos
     * de fuente, mutuamente excluyentes:
     *
     *   - **PDF multimodal**: pasa `$pdfPath` con la ruta absoluta al
     *     archivo en disco. Gemini lee el PDF directamente como
     *     `inline_data` (incluyendo imágenes y diagramas si los tiene)
     *     sin parser server-side. `$extractedText` se ignora.
     *   - **Texto extraído**: pasa `$pdfPath = null` y `$extractedText`
     *     con el body completo del apunte. Si excede `MAX_NOTE_CHARS`
     *     se recorta defensivamente (con `error_log` informativo).
     *
     * El controller (`aiController::fromNote` en I4) decide cuál usar
     * según `note.source_type`: 'pdf' → pdfPath; 'text' → extractedText.
     *
     * @param string      $title          Título sugerido para el mapa
     *                                    (típicamente el del apunte).
     *                                    Se incluye en el prompt como
     *                                    contexto y como fallback si el
     *                                    modelo no devuelve `title`.
     * @param string|null $extractedText  Body íntegro del apunte 'text'.
     *                                    NULL si la fuente es PDF.
     * @param string|null $pdfPath        Ruta absoluta al PDF a adjuntar
     *                                    como `inline_data`. NULL si la
     *                                    fuente es texto.
     *
     * @return array Estructura del mapa generado:
     *               [
     *                 'title' => string,
     *                 'nodes' => [{ id:int, label:string, hint:string }, ...],
     *                 'edges' => [{ source:int, target:int }, ...],
     *               ]
     *               Los ids son únicos, los edges referencian sólo ids
     *               válidos del listado de nodos. El controller (I4)
     *               posiciona los nodos en grid antes de serializar a
     *               drawflow_json.
     *
     * @throws RuntimeException si la IA falla (red, HTTP, formato).
     */
    public static function parseNoteToMap($title, $extractedText, $pdfPath = null) {
        $useMultimodal = ($pdfPath !== null && $pdfPath !== '');
        $textForPrompt = null;

        if (!$useMultimodal) {
            $text = (string) ($extractedText ?? '');
            if (trim($text) === '') {
                // Sin fuente válida no llamamos a la IA.
                throw new RuntimeException('IA no disponible (apunte vacío).');
            }
            if (mb_strlen($text) > self::MAX_NOTE_CHARS) {
                error_log(sprintf(
                    '[AIClient::parseNoteToMap] Texto recortado de %d a %d chars',
                    mb_strlen($text),
                    self::MAX_NOTE_CHARS
                ));
                $text = mb_substr($text, 0, self::MAX_NOTE_CHARS);
            }
            $textForPrompt = $text;
        }

        $prompt = self::buildNoteToMapPrompt($title, $textForPrompt, $useMultimodal);

        // thinking_budget=-1 (dynamic): apuntes largos requieren que el
        // modelo razone para destilar el tema central y conectar los
        // sub-conceptos sin inventar relaciones. El sobrecoste de
        // pensar es mucho menor que el de un mapa malo que el alumno
        // descarta y regenera.
        $parsed = GeminiClient::generateJson(
            $prompt,
            self::SYSTEM_INSTRUCTION_ES,
            $useMultimodal ? $pdfPath : null,
            [
                'temperature'     => 0.4,
                'thinking_budget' => -1,
            ]
        );

        return self::sanitizeMapResponse($parsed, $title);
    }

    /**
     * Genera entre 8 y 15 flashcards de repaso a partir de un apunte.
     * Mismo dual mode que `parseNoteToMap` (PDF multimodal o texto
     * extraído).
     *
     * @param string      $title          Título del apunte (contexto).
     * @param string|null $extractedText  Body íntegro del apunte 'text'.
     * @param string|null $pdfPath        Ruta absoluta al PDF (opcional).
     *
     * @return array Lista de tarjetas: [{ "front": string, "back": string }, ...].
     * @throws RuntimeException si la IA falla.
     */
    public static function parseNoteToFlashcards($title, $extractedText, $pdfPath = null) {
        $useMultimodal = ($pdfPath !== null && $pdfPath !== '');
        $textForPrompt = null;

        if (!$useMultimodal) {
            $text = (string) ($extractedText ?? '');
            if (trim($text) === '') {
                throw new RuntimeException('IA no disponible (apunte vacío).');
            }
            if (mb_strlen($text) > self::MAX_NOTE_CHARS) {
                error_log(sprintf(
                    '[AIClient::parseNoteToFlashcards] Texto recortado de %d a %d chars',
                    mb_strlen($text),
                    self::MAX_NOTE_CHARS
                ));
                $text = mb_substr($text, 0, self::MAX_NOTE_CHARS);
            }
            $textForPrompt = $text;
        }

        $prompt = self::buildNoteToFlashcardsPrompt($title, $textForPrompt, $useMultimodal);

        $parsed = GeminiClient::generateJson(
            $prompt,
            self::SYSTEM_INSTRUCTION_ES,
            $useMultimodal ? $pdfPath : null,
            [
                'temperature'     => 0.5,
                'thinking_budget' => -1,
            ]
        );

        if (!isset($parsed['cards']) || !is_array($parsed['cards'])) {
            error_log('[AIClient::parseNoteToFlashcards] Contenido sin "cards" array: '
                . substr(json_encode($parsed), 0, 300));
            throw new RuntimeException('IA no disponible (formato inesperado).');
        }

        // Saneo idéntico al de `generateFlashcards`: front/back no
        // vacíos, recortados a 200 chars (regla del prompt), máximo 15.
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

    /**
     * Construye el prompt para `parseNoteToMap`. La fuente del contenido
     * es o bien un texto inline (modo 'text') o bien el PDF adjunto
     * (modo 'pdf' multimodal). En el segundo caso el prompt sólo da
     * instrucciones — el contenido del PDF llega por `inline_data`.
     */
    private static function buildNoteToMapPrompt($title, $text, $useMultimodal) {
        $titleSafe = trim((string) $title);
        if ($titleSafe === '') $titleSafe = 'Apunte sin título';

        $sourceLine = $useMultimodal
            ? 'Lee el PDF adjunto como apunte de estudio'
            : 'Lee el siguiente texto como apunte de estudio';

        $textBlock = $useMultimodal
            ? ''
            : "\n\nTexto del apunte:\n\"\"\"\n{$text}\n\"\"\"";

        return <<<EOT
{$sourceLine} y devuelve un mapa conceptual en formato JSON con
esta forma exacta:

{
  "title": "...",
  "nodes": [
    { "id": 1, "label": "...", "hint": "..." }
  ],
  "edges": [
    { "source": 1, "target": 2 }
  ]
}

Reglas:
- Entre 6 y 15 nodos en total. Cubre los conceptos más importantes;
  no inventes contenido que no esté en el apunte.
- El nodo con id=1 es el tema central (raíz). El resto son
  sub-conceptos conectados al raíz o entre sí.
- Cada "edge" referencia ids existentes en "nodes". No incluyas
  edges con source == target.
- "label" en español, máximo 60 caracteres, mayúscula inicial.
- "hint" en español, una frase explicativa, máximo 120 caracteres.
- "title" en español, resume el tema principal del apunte.
- No añadas claves distintas a las indicadas.
- No incluyas texto fuera del JSON.

Título sugerido por el alumno: "{$titleSafe}"{$textBlock}
EOT;
    }

    /**
     * Construye el prompt para `parseNoteToFlashcards`. Mismo dual mode
     * que `buildNoteToMapPrompt`.
     */
    private static function buildNoteToFlashcardsPrompt($title, $text, $useMultimodal) {
        $titleSafe = trim((string) $title);
        if ($titleSafe === '') $titleSafe = 'Apunte sin título';

        $sourceLine = $useMultimodal
            ? 'A partir del PDF adjunto'
            : 'A partir del siguiente texto';

        $textBlock = $useMultimodal
            ? ''
            : "\n\nTexto del apunte:\n\"\"\"\n{$text}\n\"\"\"";

        return <<<EOT
{$sourceLine}, genera entre 8 y 15 flashcards de repaso. Devuelve
un objeto JSON con esta forma exacta:

{
  "cards": [
    { "front": "Pregunta…", "back": "Respuesta…" }
  ]
}

Reglas:
- Entre 8 y 15 elementos en "cards". Cubre los conceptos más
  importantes del apunte; no inventes contenido que no esté presente.
- "front": pregunta breve en español, máximo 200 caracteres.
- "back": respuesta corta en español, máximo 200 caracteres.
- No añadas claves distintas a "front" y "back".
- No incluyas texto fuera del JSON.

Apunte: "{$titleSafe}"{$textBlock}
EOT;
    }

    /**
     * Sanea la respuesta de `parseNoteToMap`: descarta nodos sin id o
     * sin label, deduplica ids, recorta longitudes, descarta edges con
     * source==target o que referencian ids inexistentes y deduplica
     * pares (source, target). Si tras el saneo no queda al menos un
     * nodo válido, lanza `RuntimeException` (mismo patrón que el resto
     * de métodos del cliente — el controller traduce a 503).
     *
     * @param array  $parsed         Respuesta cruda de Gemini.
     * @param string $fallbackTitle  Título del apunte original (se usa
     *                               si el modelo no devuelve `title`).
     * @return array { title, nodes, edges }
     * @throws RuntimeException si no quedan nodos válidos.
     */
    private static function sanitizeMapResponse($parsed, $fallbackTitle) {
        if (!is_array($parsed)) {
            error_log('[AIClient::sanitizeMapResponse] parsed no es array.');
            throw new RuntimeException('IA no disponible (formato inesperado).');
        }

        // ─── Title ─────────────────────────────────────────────────────
        $title = isset($parsed['title']) ? trim((string) $parsed['title']) : '';
        if ($title === '') {
            $title = trim((string) $fallbackTitle);
        }
        if ($title === '') {
            $title = 'Mapa sin título';
        }
        // El backend `Map::create` espera VARCHAR(200) — recortamos por
        // simetría con el resto de campos que lo hacen.
        if (mb_strlen($title) > 200) {
            $title = mb_substr($title, 0, 200);
        }

        // ─── Nodes ─────────────────────────────────────────────────────
        $rawNodes = $parsed['nodes'] ?? [];
        if (!is_array($rawNodes)) {
            error_log('[AIClient::sanitizeMapResponse] nodes no es array.');
            throw new RuntimeException('IA no disponible (formato inesperado).');
        }

        $cleanNodes = [];
        $validIds   = [];
        foreach ($rawNodes as $node) {
            if (!is_array($node)) continue;
            $id = isset($node['id']) ? (int) $node['id'] : 0;
            if ($id <= 0) continue;
            // Descartamos ids duplicados — quedaría incoherente con los edges.
            if (in_array($id, $validIds, true)) continue;

            $label = isset($node['label']) ? trim((string) $node['label']) : '';
            if ($label === '') continue;
            if (mb_strlen($label) > 60) $label = mb_substr($label, 0, 60);

            $hint = isset($node['hint']) ? trim((string) $node['hint']) : '';
            if (mb_strlen($hint) > 120) $hint = mb_substr($hint, 0, 120);

            $cleanNodes[] = [
                'id'    => $id,
                'label' => $label,
                'hint'  => $hint,
            ];
            $validIds[] = $id;
            if (count($cleanNodes) >= 15) break;
        }

        if (empty($cleanNodes)) {
            throw new RuntimeException('IA no disponible (sin nodos válidos).');
        }

        // ─── Edges ─────────────────────────────────────────────────────
        $rawEdges = $parsed['edges'] ?? [];
        $cleanEdges = [];
        $seen = []; // claves "source-target" para deduplicar.
        if (is_array($rawEdges)) {
            foreach ($rawEdges as $edge) {
                if (!is_array($edge)) continue;
                $src = isset($edge['source']) ? (int) $edge['source'] : 0;
                $tgt = isset($edge['target']) ? (int) $edge['target'] : 0;
                if ($src <= 0 || $tgt <= 0) continue;
                if ($src === $tgt) continue; // sin self-loops
                if (!in_array($src, $validIds, true)) continue;
                if (!in_array($tgt, $validIds, true)) continue;

                $key = $src . '-' . $tgt;
                if (isset($seen[$key])) continue;
                $seen[$key] = true;

                $cleanEdges[] = ['source' => $src, 'target' => $tgt];
            }
        }

        return [
            'title' => $title,
            'nodes' => $cleanNodes,
            'edges' => $cleanEdges,
        ];
    }
}
?>
