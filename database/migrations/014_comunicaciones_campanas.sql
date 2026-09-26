-- 014_comunicaciones_campanas.sql — Comunicaciones (E5): campañas de WhatsApp con plantillas aprobadas y bajas de marketing.
-- Idempotente. Diseño: docs/modulos/comunicaciones.md → «Campañas».
--
-- Estados: borrador → programada → enviando → (esperando_saldo | esperando_cupo | pausada) → completada | cancelada.
-- Los contadores (enviados, entregados, leídos, fallidos, respuestas, clics) se calculan de los destinatarios: no se duplican en la campaña.

CREATE TABLE IF NOT EXISTS com_campanas (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede            INT UNSIGNED    NOT NULL,
  id_linea           INT UNSIGNED    NOT NULL,
  id_plantilla       BIGINT UNSIGNED NOT NULL,
  nombre             VARCHAR(150)    NOT NULL,
  estado             ENUM('borrador','programada','enviando','esperando_saldo','esperando_cupo','pausada','completada','cancelada') NOT NULL DEFAULT 'borrador',
  audiencia          LONGTEXT        NULL CHECK (audiencia IS NULL OR JSON_VALID(audiencia)),   -- {ids:[…]} | {filtros:{…}, excluidos:[…]} + organizaciones
  valores            LONGTEXT        NULL CHECK (valores IS NULL OR JSON_VALID(valores)),       -- {n: texto} para las variables «a mano» (iguales para todos)
  enlace_destino     VARCHAR(1000)   NULL,                  -- destino del botón de enlace de seguimiento
  media_id           VARCHAR(100)    NULL,                  -- encabezado multimedia subido a Meta (vale 30 días)
  media_key          VARCHAR(255)    NULL,                  -- copia en R2 privado
  media_nombre       VARCHAR(255)    NULL,
  media_mime         VARCHAR(100)    NULL,
  media_subida_at    DATETIME        NULL,
  programada_para    DATETIME        NULL,
  total              INT UNSIGNED    NOT NULL DEFAULT 0,    -- destinatarios al lanzar
  creditos_estimados INT UNSIGNED    NOT NULL DEFAULT 0,
  motivo_pausa       VARCHAR(255)    NULL,
  reintentar_desde   DATETIME        NULL,                  -- espera por límite de Meta o por cupo de 24 h
  iniciada_at        DATETIME        NULL,
  completada_at      DATETIME        NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by         INT UNSIGNED    NULL,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by         INT UNSIGNED    NULL,
  KEY idx_com_camp_sede (id_sede, estado, created_at),
  KEY idx_com_camp_cola (estado, programada_para),
  CONSTRAINT fk_com_camp_sede  FOREIGN KEY (id_sede)      REFERENCES le_sedes(id),
  CONSTRAINT fk_com_camp_linea FOREIGN KEY (id_linea)     REFERENCES com_lineas(id),
  CONSTRAINT fk_com_camp_tpl   FOREIGN KEY (id_plantilla) REFERENCES com_plantillas(id),
  CONSTRAINT fk_com_camp_cby   FOREIGN KEY (created_by)   REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_com_camp_uby   FOREIGN KEY (updated_by)   REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS com_campana_destinatarios (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_campana    BIGINT UNSIGNED NOT NULL,
  id_contacto   BIGINT UNSIGNED NULL,
  wa_id         VARCHAR(20)     NOT NULL,
  nombre        VARCHAR(190)    NULL,
  estado        ENUM('pendiente','enviado','entregado','leido','fallido','omitido') NOT NULL DEFAULT 'pendiente',
  id_mensaje    BIGINT UNSIGNED NULL,
  error         VARCHAR(255)    NULL,
  intentos      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  link_token    CHAR(24)        NULL,
  enviado_at    DATETIME        NULL,
  respondio_at  DATETIME        NULL,
  clic_at       DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_com_dest (id_campana, wa_id),              -- un número recibe la campaña una sola vez aunque esté en dos contactos
  UNIQUE KEY uq_com_dest_token (link_token),
  KEY idx_com_dest_estado (id_campana, estado),
  KEY idx_com_dest_msg (id_mensaje),
  CONSTRAINT fk_com_dest_camp     FOREIGN KEY (id_campana)  REFERENCES com_campanas(id) ON DELETE CASCADE,
  CONSTRAINT fk_com_dest_contacto FOREIGN KEY (id_contacto) REFERENCES crm_contactos(id) ON DELETE SET NULL,
  CONSTRAINT fk_com_dest_msg      FOREIGN KEY (id_mensaje)  REFERENCES com_mensajes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bajas de marketing por número (el cliente escribió «BAJA»/«STOP» o Meta respondió 131050): no reciben campañas ni plantillas de marketing.
CREATE TABLE IF NOT EXISTS com_bajas (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede     INT UNSIGNED    NOT NULL,
  wa_id       VARCHAR(20)     NOT NULL,
  motivo      VARCHAR(30)     NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_com_baja (id_sede, wa_id),
  CONSTRAINT fk_com_baja_sede FOREIGN KEY (id_sede) REFERENCES le_sedes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE com_mensajes ADD CONSTRAINT fk_com_msg_camp FOREIGN KEY IF NOT EXISTS (id_campana) REFERENCES com_campanas(id) ON DELETE SET NULL;
ALTER TABLE com_enlaces ADD CONSTRAINT fk_com_enl_camp FOREIGN KEY IF NOT EXISTS (id_campana) REFERENCES com_campanas(id) ON DELETE CASCADE;
