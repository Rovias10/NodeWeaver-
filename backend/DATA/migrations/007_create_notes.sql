-- =====================================================================
-- Migración 007 · Crea la tabla `notes` para la Fase Notes / Apuntes.
--
-- Contexto: con el pivote de narrativa (ADR-06), "Mis apuntes" pasa a
-- ser la zona principal de StudyWeaver. El apunte (PDF subido o texto
-- pegado por el alumno) es la fuente de verdad de la que la IA derivará
-- mapas conceptuales y flashcards en la rama futura `ia-integration`.
--
-- Diseño:
--   - `source_type` ENUM con tres valores reservados ('pdf','text',
--     'markdown'). El MVP del frontend sólo expone "PDF" y "Texto"; el
--     valor 'markdown' queda en el DDL como reserva para una mejora
--     futura sin requerir alter posterior.
--   - `extracted_text` LONGTEXT NULL: para apuntes 'text' guarda el
--     body íntegro pegado por el alumno; para 'pdf' queda NULL en MVP
--     (la fase IA decidirá si se rellena al procesar con Gemini o si
--     se mantiene NULL porque Gemini ingiere el archivo directamente).
--   - `file_path` VARCHAR(500) NULL: ruta relativa al PDF físico,
--     `backend/uploads/notes/<user_id>/<uuid>.pdf`. NULL para 'text'.
--   - FK al usuario con ON DELETE CASCADE: borrar la cuenta limpia
--     todos sus apuntes (RGPD).
--   - Índice `idx_user_updated (user_id, updated_at)`: listado del
--     usuario ordenado por última edición, mismo patrón que `maps`.
--
-- La columna `source_note_id` en `maps` (y en `flashcards` si se
-- añade) usa ON DELETE SET NULL para que los mapas y flashcards
-- generados desde un apunte SOBREVIVAN al borrado de éste y no se
-- pierda el progreso de estudio (ver `008_alter_maps_source_note.sql`).
--
-- Ejecución manual: el alumno corre este script una vez en phpMyAdmin
-- sobre la base `autoflow` del XAMPP local. Ejecutar ANTES de la 008,
-- ya que ésta crea una FK hacia `notes(id)`.
-- =====================================================================

CREATE TABLE IF NOT EXISTS notes (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    user_id            INT NOT NULL,
    title              VARCHAR(200) NOT NULL DEFAULT 'Apunte sin título'
        COMMENT 'Título visible en el listado. Editable inline en el preview.',
    source_type        ENUM('pdf','text','markdown') NOT NULL DEFAULT 'text'
        COMMENT 'Origen del apunte. MVP frontend expone sólo pdf y text.',
    original_filename  VARCHAR(255) NULL
        COMMENT 'Nombre original del PDF subido (informativo). NULL si es text.',
    file_path          VARCHAR(500) NULL
        COMMENT 'Ruta relativa al PDF físico bajo backend/uploads/notes/. NULL si es text.',
    extracted_text     LONGTEXT NULL
        COMMENT 'Body íntegro del apunte de texto. NULL en pdf hasta que la fase IA decida cachearlo.',
    char_count         INT NOT NULL DEFAULT 0
        COMMENT 'Longitud informativa del extracted_text. 0 mientras esté NULL.',
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_notes_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    INDEX idx_user_updated (user_id, updated_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
