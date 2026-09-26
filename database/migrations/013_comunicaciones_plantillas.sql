-- 013_comunicaciones_plantillas.sql — Comunicaciones (E4): plantillas de mensaje de Meta y enlaces de seguimiento.
-- Idempotente. Diseño: docs/modulos/comunicaciones.md → «Plantillas».
--
-- Una plantilla vive en una WABA (cuenta de WhatsApp Business) y se crea por una línea de la sede. Meta la aprueba o rechaza, y puede cambiarle
-- la categoría (utilidad → marketing): `categoria_solicitada` es la que se pidió y `categoria` la que Meta tiene hoy; `reclasificada_at` marca
-- el cambio. Nombre + idioma son únicos por WABA (Meta tampoco deja reutilizar el nombre de una borrada durante 30 días).

CREATE TABLE IF NOT EXISTS com_plantillas (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede               INT UNSIGNED    NOT NULL,
  id_linea              INT UNSIGNED    NOT NULL,           -- línea por la que se administra en Meta
  waba_id               VARCHAR(40)     NOT NULL,
  nombre                VARCHAR(100)    NOT NULL,           -- nombre en Meta: minúsculas, números y _
  idioma                VARCHAR(10)     NOT NULL,           -- es, es_CO, en_US…
  categoria_solicitada  ENUM('MARKETING','UTILITY','AUTHENTICATION') NOT NULL,
  categoria             VARCHAR(20)     NULL,               -- la que Meta tiene hoy (MARKETING, UTILITY, AUTHENTICATION)
  categoria_anterior    VARCHAR(20)     NULL,
  reclasificada_at      DATETIME        NULL,
  estado                VARCHAR(20)     NOT NULL DEFAULT 'borrador',   -- borrador | pendiente | aprobada | rechazada | pausada | deshabilitada | eliminada
  meta_id               VARCHAR(40)     NULL,
  motivo_rechazo        VARCHAR(500)    NULL,
  calidad               VARCHAR(20)     NULL,               -- GREEN | YELLOW | RED | UNKNOWN
  encabezado            LONGTEXT        NULL CHECK (encabezado IS NULL OR JSON_VALID(encabezado)),   -- {tipo: texto|imagen|video|documento, texto, ejemplo}
  cuerpo                TEXT            NOT NULL,           -- con {{1}}, {{2}}…
  pie                   VARCHAR(60)     NULL,
  botones               LONGTEXT        NULL CHECK (botones IS NULL OR JSON_VALID(botones)),         -- [{tipo: respuesta|enlace, texto}]
  variables             LONGTEXT        NULL CHECK (variables IS NULL OR JSON_VALID(variables)),     -- [{n, ejemplo, origen, valor}]
  revision              LONGTEXT        NULL CHECK (revision IS NULL OR JSON_VALID(revision)),       -- revisión de categoría al enviarla: {riesgo, motivos}
  origen                ENUM('sistema','meta') NOT NULL DEFAULT 'sistema',   -- meta = creada fuera y traída al sincronizar
  enviada_at            DATETIME        NULL,
  aprobada_at           DATETIME        NULL,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by            INT UNSIGNED    NULL,
  updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by            INT UNSIGNED    NULL,
  UNIQUE KEY uq_com_tpl (waba_id, nombre, idioma),
  UNIQUE KEY uq_com_tpl_meta (meta_id),
  KEY idx_com_tpl_sede (id_sede, estado),
  CONSTRAINT fk_com_tpl_sede  FOREIGN KEY (id_sede)    REFERENCES le_sedes(id),
  CONSTRAINT fk_com_tpl_linea FOREIGN KEY (id_linea)   REFERENCES com_lineas(id),
  CONSTRAINT fk_com_tpl_cby   FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_com_tpl_uby   FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enlaces de seguimiento: el botón de enlace de una plantilla apunta a {API}/comunicaciones/r.php?t={{1}} y cada envío lleva su token.
-- r.php registra el clic y redirige al destino guardado aquí (nunca a uno que venga por parámetro).
CREATE TABLE IF NOT EXISTS com_enlaces (
  token            CHAR(24)        NOT NULL PRIMARY KEY,
  id_sede          INT UNSIGNED    NOT NULL,
  destino          VARCHAR(1000)   NOT NULL,
  id_mensaje       BIGINT UNSIGNED NULL,
  id_campana       BIGINT UNSIGNED NULL,
  clics            INT UNSIGNED    NOT NULL DEFAULT 0,
  primer_clic_at   DATETIME        NULL,
  ultimo_clic_at   DATETIME        NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_com_enl_campana (id_campana),
  KEY idx_com_enl_msg (id_mensaje),
  CONSTRAINT fk_com_enl_sede FOREIGN KEY (id_sede)    REFERENCES le_sedes(id),
  CONSTRAINT fk_com_enl_msg  FOREIGN KEY (id_mensaje) REFERENCES com_mensajes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
