-- =====================================================================
-- Migración 001 · Inicializa la base StudyWeaver eliminando el legacy
-- de NodeWeaver.
--
-- Contexto: la base `autoflow` heredada del proyecto NodeWeaver contenía
-- 5 tablas (users, automations, credentials, execution_logs, sessions),
-- de las cuales 4 son específicas del dominio "automatización con n8n"
-- y no aportan nada a StudyWeaver:
--
--   - automations    → flujos n8n (con `n8n_workflow_id`, `trigger_type`).
--   - credentials    → API keys de servicios externos para los flujos.
--   - execution_logs → trazas de ejecución de cada workflow.
--   - sessions       → sesiones JWT con token en claro; redundante porque
--                      JWT es stateless (validación por firma + exp).
--
-- StudyWeaver sólo necesita `users` (que se mantiene tal cual con sus
-- columnas 2FA inertes — no se implementa 2FA en MVP) y las tablas
-- nuevas que se crean en migraciones posteriores (002 maps, etc.).
--
-- Decisión registrada en ADR-05 (supera al ADR-04 inicial). Justificación
-- ampliada en `DATA/database_context.md` §4.
--
-- Ejecución manual: el alumno corre este script en phpMyAdmin sobre la
-- base `autoflow`. Tras esto, sólo deben quedar `users` + las migraciones
-- 002+ aplicadas.
-- =====================================================================

-- Desactivamos check de FKs para permitir el orden libre de DROPs.
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS execution_logs;  -- hija de automations + users
DROP TABLE IF EXISTS automations;     -- referenciada por execution_logs
DROP TABLE IF EXISTS credentials;     -- hija de users (sin dependientes)
DROP TABLE IF EXISTS sessions;        -- hija de users (sin dependientes)

SET FOREIGN_KEY_CHECKS = 1;

-- Nota: `users` NO se toca. Sus columnas `two_factor_enabled` y
-- `two_factor_secret` quedan inertes hasta que se implemente 2FA (fuera
-- de scope del MVP, mencionado como mejora futura en la memoria).
