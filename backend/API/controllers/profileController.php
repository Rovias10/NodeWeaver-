<?php
require_once __DIR__ . '/../../DATA/jwt.php';
require_once __DIR__ . '/../../MODEL/User.php';

class ProfileController {
    private $db;
    private $userModel;

    public function __construct($db) {
        $this->db = $db;
        $this->userModel = new User($db);
    }

    /**
     * Extracts and validates the JWT from the Authorization header.
     * Returns the authenticated user ID or exits with 401.
     */
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

    /**
     * GET profile/me — Returns the authenticated user's full profile (sans sensitive fields).
     */
    public function getProfile() {
        $user_id = $this->getAuthenticatedUser();

        // ── Virtual Super User Response ──
        if ($user_id == 999) {
            echo json_encode([
                'success' => true, 
                'user' => [
                    'id' => 999,
                    'name' => 'Global Admin',
                    'email' => EnvLoader::get('SUPER_USER_EMAIL', 'admin@nodeweaver.ai'),
                    'role' => 'admin',
                    'created_at' => date('Y-m-d H:i:s'),
                    'company_name' => 'NodeWeaver System',
                    'phone' => 'N/A'
                ]
            ]);
            return;
        }

        $user = $this->userModel->searchById($user_id);

        if ($user) {
            // Strip sensitive fields before sending to front-end
            unset($user['password']);
            unset($user['verification_token']);
            unset($user['reset_token']);
            unset($user['reset_expires']);
            unset($user['two_factor_secret']);
            echo json_encode(['success' => true, 'user' => $user]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Usuario no encontrado.']);
        }
    }

    /**
     * POST profile/update — Updates general profile info (name, phone, company, locale, timezone).
     */
    public function updateProfile($data = []) {
        $user_id = $this->getAuthenticatedUser();
        
        $name         = trim($data['name'] ?? '');
        $phone        = trim($data['phone'] ?? '');
        $company_name = trim($data['company_name'] ?? '');
        $locale       = trim($data['locale'] ?? 'es');
        $timezone     = trim($data['timezone'] ?? 'UTC');

        if (empty($name)) {
            echo json_encode(['success' => false, 'message' => 'El nombre es obligatorio.']);
            return;
        }

        if ($this->userModel->updateProfile($user_id, $name, $phone, $company_name, $locale, $timezone)) {
            echo json_encode(['success' => true, 'message' => 'Perfil actualizado correctamente.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'No se pudo actualizar el perfil.']);
        }
    }

    /**
     * POST profile/password — Changes password from within the dashboard.
     * Requires the current password for verification before updating.
     */
    public function changePassword($data = []) {
        $user_id = $this->getAuthenticatedUser();

        $current_password = $data['current_password'] ?? '';
        $new_password     = $data['new_password'] ?? '';

        if (empty($current_password) || empty($new_password)) {
            echo json_encode(['success' => false, 'message' => 'Completa todos los campos.']);
            return;
        }

        if (strlen($new_password) < 6) {
            echo json_encode(['success' => false, 'message' => 'La nueva contraseña debe tener al menos 6 caracteres.']);
            return;
        }

        // Verify current password against DB
        $user = $this->userModel->searchById($user_id);
        if (!$user || !password_verify($current_password, $user['password'])) {
            echo json_encode(['success' => false, 'message' => 'La contraseña actual es incorrecta.']);
            return;
        }

        $hashed = password_hash($new_password, PASSWORD_BCRYPT);
        // false = do NOT clear reset tokens (this is a dashboard change, not a reset-flow)
        if ($this->userModel->updatePassword($user_id, $hashed, false)) {
            echo json_encode(['success' => true, 'message' => 'Contraseña actualizada correctamente.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error al cambiar la contraseña.']);
        }
    }

    /**
     * POST profile/avatar — Handles avatar image upload (JPG/PNG/WEBP, max 2MB).
     */
    public function uploadAvatar() {
        $user_id = $this->getAuthenticatedUser();

        if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
            echo json_encode(['success' => false, 'message' => 'No se recibió ninguna imagen válida.']);
            return;
        }

        $file = $_FILES['avatar'];
        $allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        $maxSize = 2 * 1024 * 1024; // 2MB

        if (!in_array($file['type'], $allowedTypes)) {
            echo json_encode(['success' => false, 'message' => 'Solo se permiten imágenes JPG, PNG o WEBP.']);
            return;
        }

        if ($file['size'] > $maxSize) {
            echo json_encode(['success' => false, 'message' => 'La imagen no debe superar los 2MB.']);
            return;
        }

        // Saneamos la extensión: nos fiamos de pathinfo pero sólo aceptamos el subset
        // que coincide con los allowedTypes anteriores.
        $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($extension, ['jpg', 'jpeg', 'png', 'webp'])) {
            $extension = 'jpg';
        }

        $fileName  = 'avatar_' . $user_id . '_' . time() . '.' . $extension;
        // Guardamos en backend/public/uploads/avatars/. Tiene que estar
        // dentro de `public/` porque ese es el document root tanto del
        // servidor embebido (`php -S localhost:8000 -t backend/public`)
        // como de Apache cuando se despliegue: solo así los archivos son
        // accesibles por HTTP de forma estática.
        $uploadDir = __DIR__ . '/../../public/uploads/avatars/';

        if (!file_exists($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        $destination = $uploadDir . $fileName;
        if (!move_uploaded_file($file['tmp_name'], $destination)) {
            echo json_encode(['success' => false, 'message' => 'Error al guardar el archivo.']);
            return;
        }

        // Construimos la URL pública absoluta. Permite que el frontend la
        // cargue tal cual sin saber dónde está el backend. El default
        // apunta al servidor embebido de PHP en local; en cloud basta con
        // definir BACKEND_PUBLIC_URL en .env (p. ej. https://api.midominio).
        $publicBase = rtrim(EnvLoader::get('BACKEND_PUBLIC_URL', 'http://localhost:8000'), '/');
        $avatar_url = $publicBase . '/uploads/avatars/' . $fileName;

        if ($this->userModel->updateAvatarUrl($user_id, $avatar_url)) {
            echo json_encode([
                'success' => true,
                'message' => 'Avatar actualizado correctamente.',
                'avatar_url' => $avatar_url
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error al guardar en base de datos.']);
        }
    }
}
?>
