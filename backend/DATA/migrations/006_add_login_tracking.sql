-- =====================================================================
-- Migración 006 · Añade columnas de tracking de login a `users`.
--
-- Contexto: el modelo User (backend/MODEL/user.php) ya implementaba el
-- tracking de logins (último acceso, IP, intentos fallidos, bloqueo
-- temporal por brute-force) pero las columnas correspondientes nunca
-- se crearon en la base. Resultado: cualquier login exitoso lanzaba
--
--   PDOException: SQLSTATE[42S22]: Column not found: 1054
--   Unknown column 'last_login_at' in 'field list'
--
-- en `recordSuccessfulLogin`, lo que hacía caer el endpoint /auth/login
-- con un 500 genérico (defectuoso para cualquier usuario real, sólo el
-- super-admin virtual escapaba porque su atajo no toca BD).
--
-- Esta migración alinea el schema con el modelo. Las cuatro columnas
-- son NULLABLE (o con DEFAULT 0) para que las filas existentes no
-- requieran backfill: se rellenan en el primer login posterior.
--
-- Política de bloqueo (codificada en User::recordFailedLogin):
--   - 5 intentos fallidos consecutivos → cuenta bloqueada 15 minutos.
--   - Un login correcto resetea contador y desbloquea.
--   - El controller login comprueba `locked_until > NOW()` antes de
--     verificar la contraseña, y devuelve mensaje con minutos restantes.
--
-- Ejecución manual: el alumno corre este script en phpMyAdmin sobre la
-- base `autoflow`. Idempotente: usa `IF NOT EXISTS` (MariaDB 10.0+).
-- =====================================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP NULL DEFAULT NULL
        COMMENT 'Marca temporal del último login correcto.',
    ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45) NULL DEFAULT NULL
        COMMENT 'IP del último login. 45 caracteres por compatibilidad con IPv6.',
    ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0
        COMMENT 'Contador de intentos fallidos consecutivos. Se resetea al acertar.',
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP NULL DEFAULT NULL
        COMMENT 'Fecha hasta la cual la cuenta está bloqueada por brute-force. NULL = activa.';
