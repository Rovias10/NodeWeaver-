<?php
/**
 * DashboardController — métricas agregadas para la página de Inicio
 * (`/dashboard` en el frontend).
 *
 * Convenciones (CLAUDE.md §9):
 *   - Headless: termina con echo json_encode([...]). Nunca HTML.
 *   - Respuesta uniforme: { success: bool, data?: ... }.
 *   - Auth: AuthMiddleware::verifyToken() como primera acción.
 *   - Anti-IDOR: cada modelo filtra por user_id en la query.
 *
 * Por qué un controller propio en lugar de añadir el endpoint a
 * mapController o flashcardController:
 *   El dashboard es un AGREGADOR transversal. Cruza datos de varias
 *   features (mapas + flashcards + en el futuro apuntes), así que no
 *   pertenece a ningún dominio concreto. Meterlo en mapController
 *   romperia la separacion 1 controller ↔ 1 feature que sigue el
 *   resto de backend. Un controller dedicado es la decisión más
 *   limpia y defendible ante tribunal.
 */

require_once __DIR__ . '/../middleware/verify-token.php';
require_once __DIR__ . '/../../MODEL/Map.php';
require_once __DIR__ . '/../../MODEL/Flashcard.php';

class DashboardController {
    private $db;
    private $mapModel;
    private $flashcardModel;

    public function __construct($db) {
        $this->db = $db;
        $this->mapModel       = new Map($db);
        $this->flashcardModel = new Flashcard($db);
    }

    /**
     * GET dashboard/stats
     *
     * Devuelve las métricas que pinta la página de inicio:
     *   - maps_total                : nº de mapas del usuario.
     *   - flashcards_total          : nº de flashcards del usuario.
     *   - flashcards_reviewed_total : flashcards repasadas alguna vez
     *                                  (`last_reviewed_at IS NOT NULL`).
     *                                  Justificación detallada en el
     *                                  docstring de Flashcard::countReviewedByUser.
     *   - streak_days               : días consecutivos con repaso.
     *                                  Política completa en
     *                                  Flashcard::computeStreakDays.
     *
     * Política para el Super User (id 999): devolvemos ceros con
     * 200 OK. No tiene fila real en `users` y no posee mapas ni
     * flashcards, pero un 403 le rompería el panel. Coherente con la
     * filosofía del proyecto: bloqueamos al Super User en operaciones
     * de escritura (mapController::save, flashcardController::save…)
     * pero no en lecturas inocuas.
     */
    public function stats() {
        $auth   = AuthMiddleware::verifyToken();
        $userId = (int) $auth['id'];

        if ($userId === 999) {
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'data'    => [
                    'maps_total'                => 0,
                    'flashcards_total'          => 0,
                    'flashcards_reviewed_total' => 0,
                    'streak_days'               => 0,
                ],
            ]);
            return;
        }

        try {
            $data = [
                'maps_total'                => $this->mapModel->countByUser($userId),
                'flashcards_total'          => $this->flashcardModel->countByUser($userId),
                'flashcards_reviewed_total' => $this->flashcardModel->countReviewedByUser($userId),
                'streak_days'               => $this->flashcardModel->computeStreakDays($userId),
            ];

            http_response_code(200);
            echo json_encode(['success' => true, 'data' => $data]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error al consultar el panel.',
            ]);
        }
    }
}
?>
