-- =====================================================================
-- Migración 009 · Añade `note_id` a `flashcards` para vincular cada
-- tarjeta con el apunte del que se generó (rama IA_Integration).
--
-- Contexto: cuando se generen flashcards desde un apunte vía IA
-- (endpoint `ai/from-note { target: 'flashcards' }`, cableado en esta
-- rama con Gemini API multimodal), el backend persiste en esta columna
-- el id del apunte de origen para poder mostrar la procedencia en la
-- UI ("Estas flashcards salieron del Apunte X") y para auditoría.
--
-- Diseño:
--   - `note_id INT NULL` AFTER `map_id`: por defecto NULL para todas
--     las flashcards existentes (creadas a mano o desde mapa antes de
--     esta fase) y para las que se sigan creando sin apunte de origen.
--   - FK con `ON DELETE SET NULL`: si el alumno borra el apunte, la
--     flashcard SOBREVIVE — se preserva el progreso SM-2 (ease_factor,
--     interval_days, repetitions, next_review_at). Pierde sólo la
--     referencia al origen. Misma estrategia que `maps.source_note_id`
--     (migración 008) y que `flashcards.map_id` (migración 003).
--   - Índice `idx_flashcards_note (note_id)` para acelerar la query
--     "flashcards derivadas de este apunte" si en el futuro se expone
--     en UI.
--
-- Idempotencia parcial: MariaDB 10.0+ acepta `IF NOT EXISTS` en
-- `ADD COLUMN` y `ADD INDEX`, pero NO en `ADD CONSTRAINT ... FOREIGN KEY`
-- (rechazado por el parser con error 1064). Por eso la FK se añade sin
-- guarda — re-ejecutar la migración tras un primer éxito devolverá un
-- error "Duplicate foreign key constraint name 'fk_flashcards_note'",
-- que es el resultado esperado y se ignora con seguridad. Si hace falta
-- replay limpio: `ALTER TABLE flashcards DROP FOREIGN KEY fk_flashcards_note;`
-- antes de re-ejecutar.
--
-- Orden de ejecución: REQUIERE la migración 003 (flashcards) y la 007
-- (notes) ya aplicadas. Si se intenta ejecutar antes, MariaDB rechaza
-- con "errno 150 - Foreign key constraint is incorrectly formed".
-- =====================================================================

ALTER TABLE flashcards
    ADD COLUMN IF NOT EXISTS note_id INT NULL DEFAULT NULL
        COMMENT 'FK al apunte origen (rama IA_Integration). NULL si la flashcard se creó a mano o desde un mapa.'
        AFTER map_id,
    ADD CONSTRAINT fk_flashcards_note
        FOREIGN KEY (note_id) REFERENCES notes(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    ADD INDEX IF NOT EXISTS idx_flashcards_note (note_id);
