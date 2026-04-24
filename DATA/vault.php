<?php
/**
 * SystemVault — cifrado AES-256-GCM para secretos de sistema.
 *
 * Modelo de amenaza que cubre:
 *   ✓ Dump accidental del `.env` (logs, git, pastes) — la master key
 *     sigue ahí, pero los secretos sensibles (N8N_API_KEY, callback
 *     secret) viajan cifrados en `DATA/.secrets.enc`.
 *   ✓ Dump del archivo cifrado — sin master key no se descifra.
 *   ✓ Integridad — GCM incluye autenticación, cualquier byte manipulado
 *     rompe el descifrado (InvalidCiphertext).
 *
 * Modelo de amenaza que NO cubre:
 *   ✗ Compromiso total del servidor (si el atacante lee .env Y .secrets.enc,
 *     puede descifrar). Para ese escenario haría falta KMS externo (AWS/GCP).
 *
 * Layout del archivo `DATA/.secrets.enc`:
 *   ```json
 *   {
 *     "version": 1,
 *     "items": {
 *       "NODEWEAVER_N8N_API_KEY": {
 *         "iv":  "<base64 12 bytes>",
 *         "tag": "<base64 16 bytes>",
 *         "ct":  "<base64 N bytes>"
 *       },
 *       ...
 *     }
 *   }
 *   ```
 *
 * Master key:
 *   `VAULT_MASTER_KEY` en `.env`, 32 bytes en base64.
 *   Si no existe, se puede generar con `SystemVault::generateMasterKey()`.
 *
 * Uso:
 *   $val = SystemVault::get('NODEWEAVER_N8N_API_KEY'); // transparente
 *   SystemVault::put('NODEWEAVER_N8N_API_KEY', 'eyJhbGci...'); // migración
 */
class SystemVault {
    private const VAULT_FILE = __DIR__ . '/.secrets.enc';
    private const CIPHER = 'aes-256-gcm';
    private const IV_LEN = 12;   // NIST SP 800-38D recommends 96-bit IV for GCM.
    private const TAG_LEN = 16;

    private static $cache = null; // array|null

    // =================================================================
    //  API pública
    // =================================================================

    /**
     * Lee un secreto. Orden de búsqueda:
     *   1. Vault cifrado (DATA/.secrets.enc)  ← preferido
     *   2. .env (fallback) — para el período de transición o en dev
     *   3. $default
     */
    public static function get(string $key, $default = null) {
        $items = self::loadVault();
        if ($items !== null && isset($items[$key])) {
            $decoded = self::decryptItem($items[$key]);
            if ($decoded !== null) return $decoded;
        }

        // Fallback a .env (mantiene compatibilidad mientras migras).
        require_once __DIR__ . '/env.php';
        $envVal = EnvLoader::get($key, null);
        return $envVal !== null ? $envVal : $default;
    }

    /** Guarda (o actualiza) un secreto en el vault cifrado. */
    public static function put(string $key, string $value): void {
        $vault = self::loadVault() ?: [];
        $vault[$key] = self::encryptValue($value);
        self::saveVault($vault);
        self::$cache = $vault; // invalidar cache
    }

    /** Borra un secreto. Devuelve `true` si existía. */
    public static function forget(string $key): bool {
        $vault = self::loadVault() ?: [];
        if (!isset($vault[$key])) return false;
        unset($vault[$key]);
        self::saveVault($vault);
        self::$cache = $vault;
        return true;
    }

    /** Lista las claves cifradas actualmente (sin revelar valores). */
    public static function keys(): array {
        $vault = self::loadVault() ?: [];
        return array_keys($vault);
    }

    /**
     * Devuelve `true` si la clave existe **en el vault cifrado** (sin
     * fallback al .env). Usado por el script de migración para saber
     * si hay que cifrar o no.
     */
    public static function hasInVault(string $key): bool {
        $vault = self::loadVault() ?: [];
        return isset($vault[$key]);
    }

    /**
     * Lee la clave **solo** del vault (sin fallback al .env).
     * Devuelve `null` si no está en el vault o si el descifrado falla.
     */
    public static function getFromVault(string $key): ?string {
        $vault = self::loadVault() ?: [];
        return isset($vault[$key]) ? self::decryptItem($vault[$key]) : null;
    }

    /**
     * Genera una master key cryptographically-secure de 32 bytes, en base64.
     * Úsala para inicializar `VAULT_MASTER_KEY` en el .env.
     */
    public static function generateMasterKey(): string {
        return base64_encode(random_bytes(32));
    }

    // =================================================================
    //  Internals
    // =================================================================

    private static function loadVault(): ?array {
        if (self::$cache !== null) return self::$cache;
        if (!file_exists(self::VAULT_FILE)) return null;
        $raw = file_get_contents(self::VAULT_FILE);
        if ($raw === false || $raw === '') return null;
        $json = json_decode($raw, true);
        if (!is_array($json) || !isset($json['items']) || !is_array($json['items'])) {
            return null;
        }
        self::$cache = $json['items'];
        return self::$cache;
    }

    private static function saveVault(array $items): void {
        $payload = json_encode(
            ['version' => 1, 'items' => $items],
            JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
        );
        // Escritura atómica: escribimos a un tmp y renombramos.
        $tmp = self::VAULT_FILE . '.tmp';
        file_put_contents($tmp, $payload, LOCK_EX);
        @chmod($tmp, 0600);
        rename($tmp, self::VAULT_FILE);
    }

    private static function masterKey(): string {
        require_once __DIR__ . '/env.php';
        $b64 = EnvLoader::get('VAULT_MASTER_KEY', '');
        if (!$b64) {
            throw new RuntimeException(
                'VAULT_MASTER_KEY no definido en .env. ' .
                'Genera una con SystemVault::generateMasterKey() y añádela.'
            );
        }
        $key = base64_decode($b64, true);
        if ($key === false || strlen($key) !== 32) {
            throw new RuntimeException('VAULT_MASTER_KEY debe ser base64 de 32 bytes.');
        }
        return $key;
    }

    private static function encryptValue(string $plaintext): array {
        $iv  = random_bytes(self::IV_LEN);
        $tag = '';
        $ct  = openssl_encrypt(
            $plaintext,
            self::CIPHER,
            self::masterKey(),
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            self::TAG_LEN
        );
        if ($ct === false) {
            throw new RuntimeException('openssl_encrypt falló: ' . openssl_error_string());
        }
        return [
            'iv'  => base64_encode($iv),
            'tag' => base64_encode($tag),
            'ct'  => base64_encode($ct),
        ];
    }

    private static function decryptItem(array $item): ?string {
        if (!isset($item['iv'], $item['tag'], $item['ct'])) return null;
        $iv  = base64_decode($item['iv'],  true);
        $tag = base64_decode($item['tag'], true);
        $ct  = base64_decode($item['ct'],  true);
        if ($iv === false || $tag === false || $ct === false) return null;

        $plain = openssl_decrypt(
            $ct,
            self::CIPHER,
            self::masterKey(),
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );
        return $plain === false ? null : $plain;
    }
}
?>
