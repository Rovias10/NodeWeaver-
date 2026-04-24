<?php
require_once __DIR__ . '/../DATA/database.php';

class Automation {
    private $conn;
    private $table_name = "automations";

    public $id;
    public $user_id;
    public $name;
    public $flow_data;
    public $is_active;
    public $created_at;
    public $updated_at;

    public function __construct($db) {
        $this->conn = $db;
    }

    public function getByUser($userId) {
        $query = "SELECT * FROM " . $this->table_name . " WHERE user_id = :user_id ORDER BY updated_at DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':user_id', $userId);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getById($id, $userId) {
        $query = "SELECT * FROM " . $this->table_name . " WHERE id = :id AND user_id = :user_id LIMIT 0,1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':id', $id);
        $stmt->bindParam(':user_id', $userId);
        $stmt->execute();
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function create($userId, $name, $flowData) {
        $query = "INSERT INTO " . $this->table_name . " SET user_id=:user_id, name=:name, flow_data=:flow_data, is_active=1";
        $stmt = $this->conn->prepare($query);

        $stmt->bindParam(':user_id', $userId);
        $stmt->bindParam(':name', $name);
        $stmt->bindParam(':flow_data', $flowData);

        if($stmt->execute()) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    public function update($id, $userId, $name, $flowData, $isActive) {
        $query = "UPDATE " . $this->table_name . " 
                 SET name=:name, flow_data=:flow_data, is_active=:is_active 
                 WHERE id=:id AND user_id=:user_id";
        $stmt = $this->conn->prepare($query);

        $stmt->bindParam(':id', $id);
        $stmt->bindParam(':user_id', $userId);
        $stmt->bindParam(':name', $name);
        $stmt->bindParam(':flow_data', $flowData);
        $stmt->bindParam(':is_active', $isActive);

        return $stmt->execute();
    }

    public function delete($id, $userId) {
        $query = "DELETE FROM " . $this->table_name . " WHERE id=:id AND user_id=:user_id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':id', $id);
        $stmt->bindParam(':user_id', $userId);
        return $stmt->execute();
    }
}
?>
