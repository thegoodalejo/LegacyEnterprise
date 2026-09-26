-- 011_comunicaciones_bandeja.sql — Comunicaciones (E2): respuestas rápidas de la bandeja y notas de contacto compartidas con el CRM.
-- Idempotente. Diseño: docs/modulos/comunicaciones.md → «Bandeja».

-- Respuestas rápidas: personales (id_usuario) o de equipo (id_usuario NULL, las administra L2+). En el chat se usan con «/atajo».
CREATE TABLE IF NOT EXISTS com_respuestas_rapidas (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede     INT UNSIGNED NOT NULL,
  id_usuario  INT UNSIGNED NULL,
  atajo       VARCHAR(30)  NOT NULL,
  titulo      VARCHAR(100) NOT NULL,
  texto       TEXT         NOT NULL,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT UNSIGNED NULL,
  KEY idx_com_rr_sede (id_sede, activo),
  CONSTRAINT fk_com_rr_sede FOREIGN KEY (id_sede)    REFERENCES le_sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_com_rr_usr  FOREIGN KEY (id_usuario) REFERENCES le_usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_com_rr_cby  FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_com_rr_uby  FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notas de un contacto (bitácora interna, no se envía al cliente). Compartidas: se escriben desde la bandeja o desde el perfil del contacto
-- (CRM o Comunicaciones) y se ven en ambos. Borrado lógico.
CREATE TABLE IF NOT EXISTS crm_contacto_notas (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede          INT UNSIGNED    NOT NULL,
  id_contacto      BIGINT UNSIGNED NOT NULL,
  nota             TEXT            NOT NULL,
  origen           ENUM('crm','comunicaciones') NOT NULL DEFAULT 'crm',
  id_conversacion  BIGINT UNSIGNED NULL,                 -- si se escribió desde una conversación
  activo           TINYINT(1)      NOT NULL DEFAULT 1,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by       INT UNSIGNED    NULL,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by       INT UNSIGNED    NULL,
  KEY idx_crm_cn_contacto (id_contacto, activo, created_at),
  CONSTRAINT fk_crm_cn_sede     FOREIGN KEY (id_sede)         REFERENCES le_sedes(id),
  CONSTRAINT fk_crm_cn_contacto FOREIGN KEY (id_contacto)     REFERENCES crm_contactos(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_cn_conv     FOREIGN KEY (id_conversacion) REFERENCES com_conversaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_cn_cby      FOREIGN KEY (created_by)      REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_cn_uby      FOREIGN KEY (updated_by)      REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
