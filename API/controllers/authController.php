<?php
require_once __DIR__ . '/../../MODEL/User.php';
require_once __DIR__ . '/../../DATA/jwt.php';

class AuthController {
    private $userModel;

    public function __construct($db) {
        $this->userModel = new User($db);
    }
    public function login($data) {
        if (empty($data['email']) || empty($data['password'])) {
            echo json_encode(['success' => false, 'message' => 'Email y contraseña requeridos']);
            return;
        }

        $user = $this->userModel->findByEmail($data['email']);

        if ($user && password_verify($data['password'], $user['password'])) {
            $token = JWT::generate([
                'id' => $user['id'],
                'name' => $user['name'],
                'email' => $user['email']
            ]);
            
            echo json_encode([
                'success' => true,
                'message' => 'Login correcto',
                'token' => $token,
                'user' => ['id' => $user['id'], 'name' => $user['name'], 'email' => $user['email']]
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Credenciales inválidas']);
        }
    }
    public function register($data) {
        if (empty($data['name']) || empty($data['email']) || empty($data['password'])) {
            echo json_encode(['success' => false, 'message' => 'Los campos obligatorios son requeridos']);
            return;
        }

        if ($this->userModel->findByEmail($data['email'])) {
            echo json_encode(['success' => false, 'message' => 'El email ya está registrado']);
            return;
        }

        $phone = $data['phone'] ?? null;
        $company_name = $data['company_name'] ?? null;

        $hashed_password = password_hash($data['password'], PASSWORD_DEFAULT);
        $verification_token = bin2hex(random_bytes(32));

        $user_id = $this->userModel->create(
            $data['name'], 
            $data['email'], 
            $hashed_password, 
            $phone, 
            $company_name, 
            $verification_token
        );

        if ($user_id) {
            $token = JWT::generate([
                'id' => $user_id, 
                'name' => $data['name'], 
                'email' => $data['email']
            ]);
            
            echo json_encode([
                'success' => true, 
                'message' => 'Usuario registrado correctamente', 
                'token' => $token, 
                'user' => [
                    'id' => $user_id, 
                    'name' => $data['name'], 
                    'email' => $data['email']
                ]
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error al registrar usuario']);
        }
    }
    public function forgotPassword($data) {
        if (empty($data['email'])) {
            echo json_encode(['success' => false, 'message' => 'Email requerido']);
            return;
        }

        $user = $this->userModel->findByEmail($data['email']);

        if ($user) {
            $reset_token = bin2hex(random_bytes(32));
            $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));
            
            $this->userModel->saveResetToken($user['id'], $reset_token, $expires);
            
            require_once __DIR__ . '/../../DATA/sendgrid.php';
            $emailService = new EmailService();
            $emailService->sendPasswordReset($user['email'], $user['name'], $reset_token);
        }

        echo json_encode([
            'success' => true,
            'message' => 'Si el email existe, recibirás instrucciones para recuperar tu contraseña'
        ]);
    }

    public function resetPassword($data) {
        if (empty($data['token']) || empty($data['password'])) {
            echo json_encode(['success' => false, 'message' => 'Token y contraseña requeridos']);
            return;
        }

        if (strlen($data['password']) < 6) {
            echo json_encode(['success' => false, 'message' => 'La contraseña debe tener al menos 6 caracteres']);
            return;
        }

        $user = $this->userModel->findByResetToken($data['token']);

        if (!$user) {
            echo json_encode(['success' => false, 'message' => 'Token inválido o expirado']);
            return;
        }

        $hashed_password = password_hash($data['password'], PASSWORD_DEFAULT);
        
        if ($this->userModel->updatePassword($user['id'], $hashed_password)) {
            echo json_encode(['success' => true, 'message' => 'Contraseña actualizada correctamente']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error al actualizar contraseña']);
        }
    }

    public function googleLogin($data) {
        if (empty($data['token'])) {
            echo json_encode(['success' => false, 'message' => 'Token de Google requerido']);
            return;
        }

        $ch = curl_init('https://oauth2.googleapis.com/tokeninfo?id_token=' . $data['token']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        $response = curl_exec($ch);
        curl_close($ch);
        
        $google_data = json_decode($response, true);
        
        if (isset($google_data['error'])) {
            echo json_encode(['success' => false, 'message' => 'Token de Google inválido']);
            return;
        }

        $email = $google_data['email'];
        $name = $google_data['name'];
        $google_id = $google_data['sub'];

        $user = $this->userModel->findByEmail($email);

        if (!$user) {
            $user_id = $this->userModel->createFromGoogle($name, $email, $google_id);
            $user = ['id' => $user_id, 'name' => $name, 'email' => $email];
        }

        $token = JWT::generate($user);

        echo json_encode([
            'success' => true,
            'message' => 'Login con Google correcto',
            'token' => $token,
            'user' => ['id' => $user['id'], 'name' => $user['name'], 'email' => $user['email']]
        ]);
    }
}
?>