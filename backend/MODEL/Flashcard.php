<?php
/**
 * Modelo Flashcard — acceso a la tabla `flashcards` de StudyWeaver.
 *
 * Convenciones (CLAUDE.md §9 + Gemini.md §4.C):
 *   - Recibe la conexión PDO por constructor.
 *   - Cada método ejecuta una operación SQL con prepared statement
 *     posicional (?). Sin lógica de presentación: validación y
 *     formateo viven en FlashcardController.
 *   - Filtros por user_id en la propia query (anti-IDOR a nivel de
 *     BD, no sólo en el controller).
 *
 * Algoritmo SM-2 simplificado (ver `database_context.md` §3.1 cuando
 * exista, y la cabecera de DATA/migrations/003_create_flashcards.sql):
 *
 *   grade=fail (0):
 *     repetitions   = 0
 *     interval_days = 1
 *     ease_factor   = max(1.30, ease_factor - 0.20)
 *   grade=good (1):
 *     repetitions  += 1
 *     interval_days = repetitions==1 ? 1
 *                   : repetitions==2 ? 6
 *                   : round(interval_days * ease_factor)
 *     ease_factor sin cambio
 *   grade=easy (2):
 *     igual que good +
 *     ease_factor   = min(2.50, ease_factor + 0.10)
 *
 *   next_review_at = hoy + interval_days días
 */
class Flashcard {
    private $conn;
    private $table = 'flashcards';

    /** Grados aceptados por el algoritmo (string ↔ peso). */
    const GRADES = ['fail' => 0, 'good' => 1, 'easy' => 2];

    /** Cap superior del ease_factor en SM-2 simplificado. */
    const EASE_MAX = 2.50;
    /** Cap inferior del ease_factor (evita intervalos disparados a la baja). */
    const EASE_MIN = 1.30;

    public function __construct($db) {
        $this->conn = $db;
    }

    /**
     * Lista todas las flashcards del usuario, ordenadas por urgencia
     * (las que vencen antes primero) y, a igualdad, las más recientes
     * arriba. Devuelve la fila completa: la tabla es pequeña (sin
     * LONGTEXT), no hace falta ahorrar columnas en el listado.
     *
     * @param int $userId
     * @return array
     */
    public function findByUser($userId) {
        // LEFT JOIN con notes para que el listado pueda agrupar las
        // flashcards por apunte de origen sin un segundo viaje a la BD.
        // El JOIN añade `n.user_id = f.user_id` además del `n.id = f.note_id`
        // como cinturón anti-IDOR: si por algún bug el note_id apuntara a
        // un apunte de otro usuario, el LEFT JOIN devolvería NULL para
        // note_title en lugar de filtrar el título ajeno.
        $query = "SELECT f.id, f.user_id, f.map_id, f.note_id, f.front, f.back,
                         f.ease_factor, f.interval_days, f.repetitions,
                         f.next_review_at, f.last_reviewed_at,
                         f.created_at, f.updated_at,
                         n.title AS note_title
                  FROM {$this->table} f
                  LEFT JOIN notes n
                    ON n.id = f.note_id AND n.user_id = f.user_id
                  WHERE f.user_id = ?
                  ORDER BY f.next_review_at ASC, f.id DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([$userId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Lista las flashcards del usuario que vencen hoy o antes (cola de
     * repaso). Usa el índice idx_user_due(user_id, next_review_at).
     *
     * @param int    $userId
     * @param string $today   Cadena 'Y-m-d' (la pasa el controller).
     * @return array
     */
    public function findDue($userId, $today, $noteFilter = null) {
        // Filtro opcional por carpeta de apunte. Tres modos:
        //   - null            → todas las pendientes (comportamiento global).
        //   - 'none'          → sólo las huérfanas (note_id IS NULL),
        //                        usado por la carpeta "Sin apunte".
        //   - int positivo    → sólo las de ese apunte concreto.
        // Construimos el WHERE en variables para que el prepared
        // statement siga siendo seguro (la rama 'none' no añade
        // parámetros, la rama int sí).
        $where  = 'WHERE user_id = ? AND next_review_at <= ?';
        $params = [$userId, $today];

        if ($noteFilter === 'none') {
            $where .= ' AND note_id IS NULL';
        } elseif (is_int($noteFilter) && $noteFilter > 0) {
            $where .= ' AND note_id = ?';
            $params[] = $noteFilter;
        }

        $query = "SELECT id, user_id, map_id, note_id, front, back,
                         ease_factor, interval_days, repetitions,
                         next_review_at, last_reviewed_at,
                         created_at, updated_at
                  FROM {$this->table}
                  {$where}
                  ORDER BY next_review_at ASC, id DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Borra todas las flashcards del usuario que pertenezcan a un
     * apunte concreto (o todas las huérfanas si $noteId es null).
     *
     * Se llama desde flashcards/delete-by-note al pulsar "Borrar
     * carpeta" en la lista. Devuelve el número de filas eliminadas
     * para que el frontend pueda mostrarlo en el toast de éxito y
     * para que el controller responda 404 si no había nada que borrar.
     *
     * @param int      $userId
     * @param int|null $noteId  null → carpeta "Sin apunte" (huérfanas).
     * @return int               Filas borradas.
     */
    public function deleteByNote($userId, $noteId) {
        if ($noteId === null) {
            $query = "DELETE FROM {$this->table}
                      WHERE user_id = ? AND note_id IS NULL";
            $params = [$userId];
        } else {
            $query = "DELETE FROM {$this->table}
                      WHERE user_id = ? AND note_id = ?";
            $params = [$userId, $noteId];
        }
        $stmt = $this->conn->prepare($query);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    /**
     * Busca una flashcard concreta del usuario. La condición compuesta
     * (id + user_id) cierra la puerta a IDOR a nivel de query.
     *
     * @param int $id
     * @param int $userId
     * @return array|false
     */
    public function findByIdForUser($id, $userId) {
        $query = "SELECT id, user_id, map_id, note_id, front, back,
                         ease_factor, interval_days, repetitions,
                         next_review_at, last_reviewed_at,
                         created_at, updated_at
                  FROM {$this->table}
                  WHERE id = ? AND user_id = ?
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([$id, $userId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * Inserta una flashcard nueva. Los campos del algoritmo SM-2
     * toman sus valores por defecto del DDL (ease=2.50, interval=0,
     * repetitions=0) — la tarjeta nace lista para ser repasada hoy.
     *
     * @param int         $userId
     * @param int|null    $mapId         null → tarjeta suelta sin mapa de origen.
     * @param string      $front
     * @param string      $back
     * @param string      $nextReviewAt  Cadena 'Y-m-d'. Para tarjetas
     *                                   nuevas el controller pasa CURDATE().
     * @return string|false  Id insertado o false.
     */
    public function create($userId, $mapId, $front, $back, $nextReviewAt) {
        $query = "INSERT INTO {$this->table}
                  (user_id, map_id, front, back, next_review_at)
                  VALUES (?, ?, ?, ?, ?)";
        $stmt = $this->conn->prepare($query);
        if ($stmt->execute([$userId, $mapId, $front, $back, $nextReviewAt])) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    /**
     * Inserta varias flashcards en una sola sentencia SQL (un INSERT
     * con N grupos de VALUES). Pensado para `generateFromMap` y
     * `aiController::fromNote { target: 'flashcards' }`: si la IA
     * devuelve 12 tarjetas, persistimos las 12 atómicamente.
     *
     * Las tarjetas se filtran: las que tengan front o back vacío se
     * descartan. Las que excedan 500 chars se truncan (mismo límite
     * que la validación manual del controller, defendible por
     * coherencia: en lote no rechazamos toda la operación si la IA se
     * pasa de largo en una sola).
     *
     * @param int      $userId
     * @param int|null $mapId   Mapa de origen. NULL = tarjetas sueltas
     *                          o generadas desde un apunte.
     * @param array    $cards   Lista de ['front' => ..., 'back' => ...].
     * @param int|null $noteId  Apunte de origen (rama IA_Integration).
     *                          NULL en el flujo `generateFromMap`.
     *                          Persistido en `flashcards.note_id` con
     *                          FK ON DELETE SET NULL — si el alumno
     *                          borra el apunte, las tarjetas sobreviven.
     * @return int  Número de filas realmente insertadas.
     */
    public function createBatch($userId, $mapId, $cards, $noteId = null) {
        // Saneamos primero para saber cuántas tarjetas válidas hay.
        $valid = [];
        foreach ($cards as $card) {
            if (!is_array($card)) continue;
            $front = trim((string) ($card['front'] ?? ''));
            $back  = trim((string) ($card['back']  ?? ''));
            if ($front === '' || $back === '') continue;
            if (mb_strlen($front) > 500) $front = mb_substr($front, 0, 500);
            if (mb_strlen($back)  > 500) $back  = mb_substr($back,  0, 500);
            $valid[] = ['front' => $front, 'back' => $back];
        }
        if (empty($valid)) return 0;

        $today = (new DateTimeImmutable('today'))->format('Y-m-d');

        // Construimos placeholders y params en paralelo.
        // Cada tarjeta aporta un grupo "(?, ?, ?, ?, ?, ?)" y 6 valores
        // (con la columna note_id añadida por la migración 009).
        $groups = [];
        $params = [];
        foreach ($valid as $card) {
            $groups[] = '(?, ?, ?, ?, ?, ?)';
            $params[] = $userId;
            $params[] = $mapId;
            $params[] = $noteId;
            $params[] = $card['front'];
            $params[] = $card['back'];
            $params[] = $today;
        }
        $sql = "INSERT INTO {$this->table}
                (user_id, map_id, note_id, front, back, next_review_at)
                VALUES " . implode(', ', $groups);

        // Transacción defensiva: si el INSERT compuesto fallara (p.ej.
        // por una FK rota porque alguien borró el mapa entre la
        // verificación y este INSERT), hacemos rollback explícito y
        // re-lanzamos para que el controller responda 500.
        $this->conn->beginTransaction();
        try {
            $stmt = $this->conn->prepare($sql);
            $stmt->execute($params);
            $this->conn->commit();
            return count($valid);
        } catch (PDOException $e) {
            $this->conn->rollBack();
            throw $e;
        }
    }

    /**
     * Actualiza únicamente front y back de una flashcard del usuario.
     * Los campos SM-2 (ease_factor, interval_days, repetitions,
     * next_review_at) se recalculan vía applyReview, no se editan a
     * mano: separar la edición de contenido del avance del algoritmo
     * mantiene la tabla coherente.
     *
     * @return bool  Resultado de execute() (no rowCount, mismo motivo
     *               que en Map::update).
     */
    public function update($id, $userId, $front, $back) {
        $query = "UPDATE {$this->table}
                  SET front = ?, back = ?
                  WHERE id = ? AND user_id = ?";
        $stmt = $this->conn->prepare($query);
        return $stmt->execute([$front, $back, $id, $userId]);
    }

    /**
     * Aplica un repaso: recalcula los campos SM-2 a partir del estado
     * actual y persiste en una sola UPDATE. Devuelve el nuevo estado
     * para que el controller pueda devolverlo al cliente sin tener que
     * hacer un SELECT extra.
     *
     * El controller debe haber verificado ownership previamente con
     * findByIdForUser y debe pasar la fila actual ($current) como
     * argumento — así evitamos un SELECT redundante en este modelo.
     *
     * @param int    $id
     * @param int    $userId
     * @param array  $current  Fila previa (con ease_factor, interval_days, repetitions).
     * @param string $grade    'fail' | 'good' | 'easy'.
     * @return array Nuevos valores: ease_factor, interval_days, repetitions, next_review_at.
     */
    public function applyReview($id, $userId, $current, $grade) {
        $next = self::computeReview($current, $grade);

        $query = "UPDATE {$this->table}
                  SET ease_factor = ?, interval_days = ?, repetitions = ?,
                      next_review_at = ?, last_reviewed_at = NOW()
                  WHERE id = ? AND user_id = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            $next['ease_factor'],
            $next['interval_days'],
            $next['repetitions'],
            $next['next_review_at'],
            $id,
            $userId,
        ]);
        return $next;
    }

    /**
     * Helper estático puro: dado el estado actual y un grado, calcula
     * los nuevos valores SM-2. Aislada del acceso a BD para que sea
     * fácil de testear y de defender ante tribunal (la fórmula vive
     * en un único sitio).
     *
     * @param array  $current  Debe contener ease_factor, interval_days, repetitions.
     * @param string $grade    'fail' | 'good' | 'easy'. Cualquier otro
     *                         valor se trata como 'good' (defensivo).
     * @return array
     */
    public static function computeReview($current, $grade) {
        $ease     = (float) ($current['ease_factor']   ?? self::EASE_MAX);
        $interval = (int)   ($current['interval_days'] ?? 0);
        $reps     = (int)   ($current['repetitions']   ?? 0);

        if ($grade === 'fail') {
            $reps     = 0;
            $interval = 1;
            $ease     = max(self::EASE_MIN, $ease - 0.20);
        } else {
            // 'good' y 'easy' comparten la lógica de avance.
            $reps += 1;
            if ($reps === 1) {
                $interval = 1;
            } elseif ($reps === 2) {
                $interval = 6;
            } else {
                $interval = (int) round($interval * $ease);
            }
            if ($grade === 'easy') {
                $ease = min(self::EASE_MAX, $ease + 0.10);
            }
            // 'good' no cambia ease_factor.
        }

        $nextDate = (new DateTimeImmutable('today'))
            ->modify("+{$interval} days")
            ->format('Y-m-d');

        return [
            // round a 2 decimales para encajar con DECIMAL(3,2) sin
            // depender de cómo MySQL trunca/redondea internamente.
            'ease_factor'    => round($ease, 2),
            'interval_days'  => $interval,
            'repetitions'    => $reps,
            'next_review_at' => $nextDate,
        ];
    }

    /**
     * Borra una flashcard del usuario. Devuelve true si se eliminó
     * una fila, false si no existía o no pertenecía al usuario (en
     * ambos casos rowCount == 0). El controller traduce a 404.
     */
    public function delete($id, $userId) {
        $query = "DELETE FROM {$this->table} WHERE id = ? AND user_id = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([$id, $userId]);
        return $stmt->rowCount() > 0;
    }

    // ──────────────────────────────────────────────────────────────────
    // Métricas para el panel de inicio (`GET dashboard/stats`).
    //
    // Tres helpers de sólo lectura que no dependen del algoritmo SM-2
    // ni del flujo de repaso. Todos filtran por user_id en la query.
    // ──────────────────────────────────────────────────────────────────

    /**
     * Cuenta cuántas flashcards posee el usuario en total.
     *
     * @param int $userId
     * @return int
     */
    public function countByUser($userId) {
        $stmt = $this->conn->prepare(
            "SELECT COUNT(*) FROM {$this->table} WHERE user_id = ?"
        );
        $stmt->execute([$userId]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Cuenta cuántas flashcards del usuario han sido repasadas alguna
     * vez (`last_reviewed_at IS NOT NULL`).
     *
     * Decisión defendible ante tribunal: el modelo de datos actual NO
     * guarda historial de repasos individuales (eso requeriría una
     * tabla `flashcard_reviews` aparte y queda fuera del alcance del
     * TFG). Por eso "flashcards repasadas" significa **tarjetas
     * únicas que han recibido al menos un repaso**, no "número total
     * de repasos hechos". Es la métrica más precisa que la BD permite
     * sin inflar el esquema, y se mantiene coherente con la columna
     * `last_reviewed_at` introducida en la migración 003.
     *
     * @param int $userId
     * @return int
     */
    public function countReviewedByUser($userId) {
        $stmt = $this->conn->prepare(
            "SELECT COUNT(*) FROM {$this->table}
             WHERE user_id = ? AND last_reviewed_at IS NOT NULL"
        );
        $stmt->execute([$userId]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Calcula la racha actual de días consecutivos del usuario con
     * al menos un repaso.
     *
     * Política de cálculo (defendible ante tribunal):
     *   - Se obtienen los días distintos con repaso
     *     (`SELECT DISTINCT DATE(last_reviewed_at)`) ordenados de más
     *     reciente a más antiguo.
     *   - Si el último día con repaso es **hoy**, la racha empieza a
     *     contar desde hoy.
     *   - Si el último día con repaso es **ayer**, la racha empieza
     *     desde ayer (no se "rompe" por no haber repasado todavía
     *     hoy: el día aún no ha terminado).
     *   - Si el último día es anterior a ayer, la racha es 0.
     *   - A partir del día semilla, se descuentan días uno a uno
     *     mientras los días con repaso sean consecutivos.
     *
     * Esta política se alinea con el comportamiento estándar de apps
     * de repetición espaciada (Anki, Duolingo) y es coherente con la
     * idea de motivación: el usuario no pierde la racha a las 00:01
     * por no haber empezado aún el día.
     *
     * Se hace en PHP en lugar de en SQL puro porque MySQL no expone
     * de forma portable un cálculo de "días consecutivos hacia atrás
     * con tolerancia al día actual" en una sola query, y resolverlo
     * con variables de sesión sería críptico de defender. El recorrido
     * en PHP se hace sobre un array ya filtrado a días distintos
     * (típicamente unas pocas decenas de filas como mucho).
     *
     * @param int $userId
     * @return int  Días consecutivos (0 si no aplica).
     */
    public function computeStreakDays($userId) {
        $stmt = $this->conn->prepare(
            "SELECT DISTINCT DATE(last_reviewed_at) AS d
             FROM {$this->table}
             WHERE user_id = ? AND last_reviewed_at IS NOT NULL
             ORDER BY d DESC"
        );
        $stmt->execute([$userId]);
        $days = $stmt->fetchAll(PDO::FETCH_COLUMN);
        if (empty($days)) {
            return 0;
        }

        $today     = (new DateTimeImmutable('today'))->format('Y-m-d');
        $yesterday = (new DateTimeImmutable('yesterday'))->format('Y-m-d');

        // Día semilla de la racha.
        if ($days[0] === $today) {
            $expected = new DateTimeImmutable($today);
        } elseif ($days[0] === $yesterday) {
            $expected = new DateTimeImmutable($yesterday);
        } else {
            return 0;
        }

        $streak = 0;
        foreach ($days as $d) {
            if ($d === $expected->format('Y-m-d')) {
                $streak += 1;
                $expected = $expected->modify('-1 day');
            } else {
                break;
            }
        }
        return $streak;
    }
}
?>
