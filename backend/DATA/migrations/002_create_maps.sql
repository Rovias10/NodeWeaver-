-- =====================================================================
-- Migración 001 · Crea la tabla `maps` para mapas conceptuales StudyWeaver.
--
-- Contexto: tras la pivotación NodeWeaver → StudyWeaver (ver ADR-01 en
-- docs/decisiones.md), el dominio dejó de ser "workflows de automatización"
-- y pasó a ser "mapas conceptuales con IA". La tabla heredada `automations`
-- queda DEPRECATED (ver §2.2 de DATA/database_context.md) y no se reusa
-- porque sus 11 columnas n8n-específicas no aplican al nuevo dominio (ver
-- ADR-04).
--
-- Esta tabla es la fuente de verdad de cada mapa: el campo `drawflow_json`
-- guarda tal cual el resultado de `editor.export()` de Drawflow. No se
-- denormalizan nodos/edges en tablas separadas en esta fase del MVP; la
-- decisión está justificada en ADR-04 y queda como mejora futura cuando
-- aparezcan queries que filtren por concepto individual.
--
-- Ejecución manual: el alumno corre este script una vez en phpMyAdmin
-- sobre la base de datos `autoflow` del XAMPP local. No hay sistema
-- automático de migrations en esta fase del proyecto.
-- =====================================================================

CREATE TABLE IF NOT EXISTS maps (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    title           VARCHAR(200) NOT NULL DEFAULT 'Mapa sin título',
    description     TEXT NULL,
    is_public       TINYINT(1) NOT NULL DEFAULT 0,
    drawflow_json   LONGTEXT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_maps_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    INDEX idx_user_updated (user_id, updated_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
