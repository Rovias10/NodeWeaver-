<?php
require_once __DIR__ . '/../../DATA/jwt.php';
require_once __DIR__ . '/../../MODEL/automation.php';

class AutomationController {
    private $db;
    private $automationModel;

    public function __construct($db) {
        $this->db = $db;
        $this->automationModel = new Automation($db);
    }

    private function getAuthenticatedUser() {
        $headers = apache_request_headers();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        
        if (!$authHeader || !preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Token no proporcionado.']);
            exit;
        }
        
        $token = $matches[1];
        $data = JWT::validate($token);
        
        if (!$data || !isset($data['id'])) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Token inválido o expirado.']);
            exit;
        }
        
        return $data['id'];
    }

    public function list() {
        $user_id = $this->getAuthenticatedUser();
        $automations = $this->automationModel->getByUser($user_id);
        echo json_encode(['success' => true, 'automations' => $automations]);
    }

    public function get($data = []) {
        $user_id = $this->getAuthenticatedUser();
        $id = $data['id'] ?? $_GET['id'] ?? null;

        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'ID no proporcionado.']);
            return;
        }

        $automation = $this->automationModel->getById($id, $user_id);
        if ($automation) {
            echo json_encode(['success' => true, 'automation' => $automation]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Automatización no encontrada.']);
        }
    }

    public function save($data = []) {
        $user_id = $this->getAuthenticatedUser();
        
        $id        = $data['id'] ?? null;
        $name      = trim($data['name'] ?? 'Sin nombre');
        $flow_data = $data['flow_data'] ?? null;
        $is_active = $data['is_active'] ?? 1;

        if (!$flow_data) {
            echo json_encode(['success' => false, 'message' => 'Datos del flujo no proporcionados.']);
            return;
        }

        if ($id) {
            // Update
            if ($this->automationModel->update($id, $user_id, $name, $flow_data, $is_active)) {
                echo json_encode(['success' => true, 'message' => 'Automatización actualizada.', 'id' => $id]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Error al actualizar.']);
            }
        } else {
            // Create
            $newId = $this->automationModel->create($user_id, $name, $flow_data);
            if ($newId) {
                echo json_encode(['success' => true, 'message' => 'Automatización creada.', 'id' => $newId]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Error al crear.']);
            }
        }
    }

    public function delete($data = []) {
        $user_id = $this->getAuthenticatedUser();
        $id = $data['id'] ?? $_POST['id'] ?? null;

        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'ID no proporcionado.']);
            return;
        }

        if ($this->automationModel->delete($id, $user_id)) {
            echo json_encode(['success' => true, 'message' => 'Automatización eliminada.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error al eliminar.']);
        }
    }
}
?>
