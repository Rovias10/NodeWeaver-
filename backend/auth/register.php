<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../../config/database.php';
require_once '../../config/jwt.php';

$database = new Database();
$db = $database->getConnection();

$data = json_decode(file_get_contents('php://input'), true);

// Validamos que todo esté correcto
if (empty($data['name']) || empty($data['email']) || empty($data['password'])) {
    echo json_encode(['success' => false, 'message' => 'Todos los campos son requeridos']);
    exit;
}

if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Email inválido']);
    exit;
}

if (strlen($data['password']) < 6) {
    echo json_encode(['success' => false, 'message' => 'La contraseña debe tener al menos 6 caracteres']);
    exit;
}

// Comprobamos si el email ya está pillado
$query = "SELECT id FROM users WHERE email = ?";
$stmt = $db->prepare($query);
$stmt->execute([$data['email']]);

if ($stmt->rowCount() > 0) {
    echo json_encode(['success' => false, 'message' => 'El email ya está registrado']);
    exit;
}

// Creamos el usuario
$hashed_password = password_hash($data['password'], PASSWORD_DEFAULT);
$verification_token = bin2hex(random_bytes(32));

$query = "INSERT INTO users (name, email, password, verification_token, created_at) 
          VALUES (?, ?, ?, ?, NOW())";
$stmt = $db->prepare($query);

if ($stmt->execute([$data['name'], $data['email'], $hashed_password, $verification_token])) {
    $user_id = $db->lastInsertId();
    
    // Generamos el token
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
?>