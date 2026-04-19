<?php
class User {
    private $conn;
    private $table_name = "users";

    public function __construct($db) {
        $this->conn = $db;
    }

    public function findByEmail($email) {
        $query = "SELECT * FROM " . $this->table_name . " WHERE email = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([$email]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function create($name, $email, $password, $phone, $company_name, $verification_token) {
        $query = "INSERT INTO " . $this->table_name . " 
                  (name, email, password, phone, company_name, verification_token, created_at) 
                  VALUES (?, ?, ?, ?, ?, ?, NOW())";
        
        $stmt = $this->conn->prepare($query);
        
        if($stmt->execute([$name, $email, $password, $phone, $company_name, $verification_token])) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    public function findByVerificationToken($token) {
        $query = "SELECT id, email FROM " . $this->table_name . " WHERE verification_token = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([$token]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function verifyAccount($id) {
        $query = "UPDATE " . $this->table_name . " SET verification_token = NULL, verified_at = NOW(), status = 'active' WHERE id = ?";
        $stmt = $this->conn->prepare($query);
        return $stmt->execute([$id]);
    }
    public function findByResetToken($token) {
        $query = "SELECT id, email FROM " . $this->table_name . " WHERE reset_token = ? AND reset_expires > NOW()";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([$token]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    
    public function saveResetToken($id, $token, $expires) {
        $query = "UPDATE " . $this->table_name . " SET reset_token = ?, reset_expires = ? WHERE id = ?";
        $stmt = $this->conn->prepare($query);
        return $stmt->execute([$token, $expires, $id]);
    }


    public function updatePassword($id, $new_password, $clearResetToken = true) {
        if ($clearResetToken) {
            $query = "UPDATE " . $this->table_name . " SET password = ?, reset_token = NULL, reset_expires = NULL, updated_at = NOW() WHERE id = ?";
        } else {
            $query = "UPDATE " . $this->table_name . " SET password = ?, updated_at = NOW() WHERE id = ?";
        }
        $stmt = $this->conn->prepare($query);
        return $stmt->execute([$new_password, $id]);
    }

    public function createFromGoogle($name, $email, $google_id) {
        $query = "INSERT INTO " . $this->table_name . " (name, email, google_id, created_at) VALUES (?, ?, ?, NOW())";
        $stmt = $this->conn->prepare($query);
        if($stmt->execute([$name, $email, $google_id])) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    public function searchById($id) {
        $query = "SELECT * FROM " . $this->table_name . " WHERE id = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([$id]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function updateProfile($id, $name, $phone, $company_name, $locale, $timezone) {
        $query = "UPDATE " . $this->table_name . " SET name = ?, phone = ?, company_name = ?, locale = ?, timezone = ? WHERE id = ?";
        $stmt = $this->conn->prepare($query);
        return $stmt->execute([$name, $phone, $company_name, $locale, $timezone, $id]);
    }

    public function updateAvatarUrl($id, $url) {
        $query = "UPDATE " . $this->table_name . " SET avatar_url = ? WHERE id = ?";
        $stmt = $this->conn->prepare($query);
        return $stmt->execute([$url, $id]);
    }
}
?>