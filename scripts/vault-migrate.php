<?php
/**
 * vault-migrate.php — script CLI idempotente para mover secretos
 * del .env al SystemVault cifrado (DATA/.secrets.enc).
 *
 * Uso:
 *   php scripts/vault-migrate.php          # migrar secretos por defecto
 *   php scripts/vault-migrate.php --list   # listar claves cifradas
 *   php scripts/vault-migrate.php --genkey # generar una VAULT_MASTER_KEY nueva
 *
 * Flujo típico la primera vez:
 *   1) php scripts/vault-migrate.php --genkey
 *      → copia la VAULT_MASTER_KEY al .env
 *   2) php scripts/vault-migrate.php
 *      → cifra NODEWEAVER_N8N_API_KEY y N8N_CALLBACK_SECRET en DATA/.secrets.enc
 *   3) (opcional) borra esas dos líneas del .env — el código sigue
 *      funcionando porque SystemVault::get() lee del vault directamente.
 */

// Bootstrap
require_once __DIR__ . '/../DATA/env.php';
require_once __DIR__ . '/../DATA/vault.php';

// Solo CLI
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "Este script solo puede ejecutarse por CLI.\n";
    exit(1);
}

// Claves que movemos al vault por defecto.
$DEFAULT_KEYS = [
    'NODEWEAVER_N8N_API_KEY',
    'N8N_CALLBACK_SECRET',
];

$args = array_slice($argv, 1);

// --- Subcomandos ---
if (in_array('--genkey', $args, true)) {
    $key = SystemVault::generateMasterKey();
    echo "Nueva master key generada. Añade esto a tu .env:\n\n";
    echo "VAULT_MASTER_KEY=$key\n\n";
    echo "Importante: guárdala en un lugar seguro. Si la pierdes, los\n";
    echo "secretos en DATA/.secrets.enc serán irrecuperables.\n";
    exit(0);
}

if (in_array('--list', $args, true)) {
    try {
        $keys = SystemVault::keys();
    } catch (Throwable $e) {
        echo "Error: " . $e->getMessage() . "\n";
        exit(1);
    }
    if (!$keys) {
        echo "(vault vacío)\n";
    } else {
        echo "Claves en vault:\n";
        foreach ($keys as $k) echo "  - $k\n";
    }
    exit(0);
}

// --- Migración por defecto ---

// Filtramos las flags para quedarnos con posibles claves extra.
$customKeys = array_values(array_filter($args, fn($a) => strpos($a, '--') !== 0));
$keysToMove = $customKeys ?: $DEFAULT_KEYS;

echo "SystemVault migration\n";
echo "=====================\n\n";

try {
    // Validamos que la master key esté presente.
    $master = EnvLoader::get('VAULT_MASTER_KEY', '');
    if (!$master) {
        echo "[ERROR] VAULT_MASTER_KEY no está definido en .env.\n";
        echo "        Ejecuta primero: php scripts/vault-migrate.php --genkey\n";
        exit(2);
    }
    $decoded = base64_decode($master, true);
    if ($decoded === false || strlen($decoded) !== 32) {
        echo "[ERROR] VAULT_MASTER_KEY debe ser base64 de 32 bytes.\n";
        exit(2);
    }
    echo "[OK] Master key válida (32 bytes).\n\n";

    $migrated = [];
    $skipped  = [];

    foreach ($keysToMove as $key) {
        $envValue = EnvLoader::get($key, null);
        if ($envValue === null || $envValue === '') {
            $skipped[] = "$key (no presente en .env)";
            continue;
        }

        // Si ya está en el vault con el mismo valor → no-op.
        // OJO: NO usamos SystemVault::get() porque haría fallback al .env
        // y siempre coincidiría con $envValue (detecta vault real).
        $existing = SystemVault::getFromVault($key);
        if ($existing === $envValue) {
            $skipped[] = "$key (ya en vault, sin cambios)";
            continue;
        }

        SystemVault::put($key, $envValue);
        $migrated[] = $key;
        echo "  [+] $key cifrado en DATA/.secrets.enc\n";
    }

    echo "\nResumen:\n";
    echo "  Migrados : " . count($migrated) . "\n";
    echo "  Saltados : " . count($skipped)  . "\n";
    foreach ($skipped as $s) echo "    - $s\n";

    if ($migrated) {
        echo "\nAhora puedes opcionalmente borrar estas líneas del .env:\n";
        foreach ($migrated as $k) echo "  $k=...\n";
        echo "\n(El código seguirá funcionando: SystemVault::get() ya lee del vault.)\n";
    }

} catch (Throwable $e) {
    echo "[FATAL] " . $e->getMessage() . "\n";
    exit(1);
}

exit(0);
