-- =====================================================================
-- Migración 008 · Añade `source_note_id` a `maps` para vincular cada
-- mapa con el apunte del que se generó (Fase Notes).
--
-- Contexto: cuando un mapa se crea desde un apunte vía IA (rama futura
-- `ia-integration`, endpoint `ai/from-note`), el backend persiste en
-- esta columna el id del apunte de origen para poder mostrar la
-- procedencia en la UI ("Este mapa se generó a partir de Apunte X") y
-- para auditoría/trazabilidad.
--
-- Diseño:
--   - `source_note_id INT NULL` AFTER `user_id`: por defecto NULL para
--     todos los mapas existentes (creados a mano antes de la fase) y
--     para los mapas que el alumno cree manualmente sin apunte.
--   - FK con `ON DELETE SET NULL`: si el alumno borra el apunte, el
--     mapa SOBREVIVE — no se pierde el trabajo de estudio. Pierde
--     únicamente la referencia al origen.
--   - Índice `idx_source_note (source_note_id)` para acelerar la query
--     "mapas derivados de este apunte" si en el futuro se expone en UI.
--
-- Idempotencia: se usan las cláusulas `IF NOT EXISTS` de MariaDB 10.0+
-- para que re-ejecutar la migración no falle si la columna, la FK o el
-- índice ya existen. El alumno está en MariaDB 10.4+ (XAMPP).
--
-- Orden de ejecución: REQUIERE la migración 007 ya aplicada (esta FK
-- referencia `notes(id)`). Si se intenta ejecutar antes, MySQL/MariaDB
-- rechaza la operación con "errno 150 - Foreign key constraint is
-- incorrectly formed".
-- =====================================================================

ALTER TABLE maps
    ADD COLUMN IF NOT EXISTS source_note_id INT NULL DEFAULT NULL AFTER user_id
        COMMENT 'FK al apunte origen (Fase Notes). NULL = mapa sin apunte de origen.',
    ADD CONSTRAINT IF NOT EXISTS fk_maps_source_note
        FOREIGN KEY (source_note_id) REFERENCES notes(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    ADD INDEX IF NOT EXISTS idx_source_note (source_note_id);
