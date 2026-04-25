-- =====================================================================
-- Migración 004 · Crea la tabla `likes` para la capa social StudyWeaver.
--
-- ⚠️ ARCHIVO PLANIFICADO (.planned). NO ejecutar todavía.
--    Se aplica cuando llegue la Fase Comunidad del roadmap.
--
-- Contexto: la landing menciona "comparte tus mapas con la comunidad".
-- Esta tabla registra qué usuario ha dado like a qué mapa. El diseño
-- usa una PK compuesta para que la propia BD impida que el mismo
-- usuario dé like dos veces al mismo mapa (anti-spam por integridad,
-- sin necesidad de chequeo en el controller).
-- =====================================================================

CREATE TABLE IF NOT EXISTS likes (
    user_id     INT NOT NULL,
    map_id      INT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, map_id),
        -- PK compuesta: una fila como mucho por (usuario, mapa).
        -- INSERT IGNORE en el controller convierte intentos
        -- duplicados en no-op silencioso.

    CONSTRAINT fk_likes_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_likes_map
        FOREIGN KEY (map_id) REFERENCES maps(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_map (map_id)
        -- contador de likes por mapa: SELECT COUNT(*) WHERE map_id=?.
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
