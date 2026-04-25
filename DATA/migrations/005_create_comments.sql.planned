-- =====================================================================
-- Migración 005 · Crea la tabla `comments` para la capa social.
--
-- ⚠️ ARCHIVO PLANIFICADO (.planned). NO ejecutar todavía.
--    Se aplica junto con `004_create_likes.sql` cuando llegue la
--    Fase Comunidad.
--
-- Contexto: comentarios planos sobre un mapa público. Sin replies ni
-- threading en MVP — defendible: "el árbol de comentarios añade
-- complejidad UI/UX que no aporta valor académico evaluable; se deja
-- como mejora futura en la memoria".
-- =====================================================================

CREATE TABLE IF NOT EXISTS comments (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    map_id      INT NOT NULL,
    user_id     INT NOT NULL,
    body        TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_comments_map
        FOREIGN KEY (map_id) REFERENCES maps(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_map_created (map_id, created_at)
        -- listado paginado por mapa, ordenado cronológicamente.
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
