<?php
/**
 * Conexión PDO a MySQL.
 *
 * Es un componente de la capa de datos: NUNCA debe imprimir nada en
 * la respuesta HTTP. Si la conexión falla, registra el error en el
 * log de PHP (visible con `error_log` o en `php_error_log` del
 * servidor) y devuelve null. El bootstrap de la API es el único
 * responsable de traducir ese null en una respuesta JSON al cliente.
 *
 * Antes hacía `echo "Error de conexión: ..."` dentro del catch, lo
 * que rompía el contrato JSON del backend: el texto se concatenaba
 * con la respuesta de cualquier controller que después llamase a
 * `json_encode`, y el frontend recibía un body imposible de parsear.
 */
class Database {
    private $host = 'localhost';
    private $db_name = 'autoflow';
    private $username = 'root';
    private $password = '';
    private $conn;

    /**
     * Devuelve una instancia PDO conectada o null si la conexión falla.
     * El error real queda en el log del servidor para no exponer
     * detalles internos al cliente.
     */
    public function getConnection() {
        $this->conn = null;
        try {
            $this->conn = new PDO(
                "mysql:host=" . $this->host . ";dbname=" . $this->db_name,
                $this->username,
                $this->password
            );
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch (PDOException $e) {
            error_log('[Database] Error al conectar con MySQL: ' . $e->getMessage());
            return null;
        }
        return $this->conn;
    }
}
?>
