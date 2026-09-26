-- 010_comunicaciones_base.sql — Comunicaciones (E1): módulo, apps y líneas de WhatsApp, conversaciones, mensajes, cola del webhook y créditos.
-- Idempotente. Diseño y decisiones: docs/modulos/comunicaciones.md.
--
-- Secretos (app secret, verify token, access token) SIEMPRE cifrados con AES-256-GCM por la app (_lib/_com_crypto.php, llave COM_SECRET_KEY
-- del entorno): aquí solo hay texto cifrado en base64. Los contactos son los del CRM (crm_contactos): no hay libreta propia.

-- ─── Módulo ────────────────────────────────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO le_modulos (codigo, nombre, orden) VALUES ('comunicaciones', 'Comunicaciones', 25);
-- La sede semilla (demo del dueño) tiene todos los módulos, como en la 002.
INSERT IGNORE INTO le_sede_modulos (id_sede, codigo_modulo, notas)
  SELECT s.id, 'comunicaciones', 'Semilla' FROM le_sedes s WHERE s.id = 1;

-- ─── Historial sin usuario: lo que hace el webhook o el worker («Sistema») ─────────────────────────────────────────
ALTER TABLE le_H_registros MODIFY id_usuario INT UNSIGNED NULL;

-- ─── WhatsApp → contacto: número completo (indicativo + número, solo dígitos) para buscar la Persona ──────────────
ALTER TABLE crm_contactos_personas
  ADD COLUMN IF NOT EXISTS whatsapp_e164 VARCHAR(26)
    AS (IF(whatsapp_numero IS NULL OR whatsapp_numero = '', NULL, CONCAT(IFNULL(whatsapp_indicativo, ''), whatsapp_numero))) STORED
    AFTER whatsapp_numero;
ALTER TABLE crm_contactos_personas ADD INDEX IF NOT EXISTS idx_crm_p_wa (whatsapp_e164);

-- ─── Apps de Meta (plataforma, L5) ─────────────────────────────────────────────────────────────────────────────────
-- Una app puede servir a varios clientes (Tech Provider). El webhook es por app: …/comunicaciones/webhook.php?app=<id>.
CREATE TABLE IF NOT EXISTS com_meta_apps (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(100) NOT NULL,
  app_id            VARCHAR(40)  NOT NULL,
  app_secret_enc    TEXT         NULL,                 -- cifrado; firma de los webhooks (X-Hub-Signature-256)
  verify_token_enc  TEXT         NULL,                 -- cifrado; verificación GET del webhook
  graph_version     VARCHAR(10)  NOT NULL DEFAULT 'v23.0',
  activo            TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by        INT UNSIGNED NULL,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by        INT UNSIGNED NULL,
  UNIQUE KEY uq_com_app (app_id),
  CONSTRAINT fk_com_app_cby FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_com_app_uby FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Líneas de WhatsApp (por sede; las administra L5) ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS com_lineas (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede            INT UNSIGNED NOT NULL,
  id_app             INT UNSIGNED NOT NULL,
  nombre             VARCHAR(100) NOT NULL,              -- «Ventas Bogotá»
  telefono_visible   VARCHAR(30)  NULL,                  -- +57 300 123 4567 (lo que ve el usuario)
  phone_number_id    VARCHAR(40)  NOT NULL,              -- id del número en Meta (identifica la línea en el webhook)
  waba_id            VARCHAR(40)  NOT NULL,              -- cuenta de WhatsApp Business (plantillas y suscripción)
  access_token_enc   TEXT         NULL,                  -- cifrado; token permanente de usuario del sistema
  token_ultimos4     CHAR(4)      NULL,                  -- para reconocerlo en pantalla sin mostrarlo
  nombre_verificado  VARCHAR(150) NULL,                  -- verified_name de Meta (al probar la conexión)
  calidad            VARCHAR(20)  NULL,                  -- GREEN | YELLOW | RED | UNKNOWN
  nivel_mensajes     VARCHAR(30)  NULL,                  -- TIER_250 | TIER_1K | TIER_10K | TIER_100K | TIER_UNLIMITED
  verificada_at      DATETIME     NULL,                  -- última prueba de conexión correcta
  suscrita_at        DATETIME     NULL,                  -- WABA suscrita a la app (sin esto Meta no manda eventos)
  ultimo_error       VARCHAR(500) NULL,
  activo             TINYINT(1)   NOT NULL DEFAULT 1,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by         INT UNSIGNED NULL,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by         INT UNSIGNED NULL,
  UNIQUE KEY uq_com_linea_pnid (phone_number_id),
  KEY idx_com_linea_sede (id_sede, activo),
  CONSTRAINT fk_com_linea_sede FOREIGN KEY (id_sede)    REFERENCES le_sedes(id),
  CONSTRAINT fk_com_linea_app  FOREIGN KEY (id_app)     REFERENCES com_meta_apps(id),
  CONSTRAINT fk_com_linea_cby  FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_com_linea_uby  FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Ajustes de la sede (L4) ───────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS com_config_sede (
  id_sede                 INT UNSIGNED NOT NULL PRIMARY KEY,
  fuente_creditos         ENUM('sede','empresa') NOT NULL DEFAULT 'sede',
  palabras_asesor         VARCHAR(500) NOT NULL DEFAULT 'asesor, agente, humano',   -- pasan a la cola en cualquier punto del bot
  sesion_minutos          SMALLINT UNSIGNED NOT NULL DEFAULT 30,                    -- sin mensajes en este tiempo, el flujo activo se olvida
  sin_coincidencia        ENUM('bandeja','mensaje','flujo') NOT NULL DEFAULT 'bandeja',
  texto_sin_coincidencia  TEXT NULL,
  id_flujo_respaldo       BIGINT UNSIGNED NULL,                                     -- FK en la 012 (com_flujos)
  texto_transferencia     TEXT NULL,
  texto_cierre            TEXT NULL,
  enviar_texto_cierre     TINYINT(1) NOT NULL DEFAULT 0,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by              INT UNSIGNED NULL,
  updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by              INT UNSIGNED NULL,
  CONSTRAINT fk_com_cfg_sede FOREIGN KEY (id_sede)    REFERENCES le_sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_com_cfg_cby  FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_com_cfg_uby  FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Conversaciones: una por (línea, número de WhatsApp); se reabre cuando el cliente vuelve a escribir ─────────────
CREATE TABLE IF NOT EXISTS com_conversaciones (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede             INT UNSIGNED    NOT NULL,
  id_linea            INT UNSIGNED    NOT NULL,
  id_contacto         BIGINT UNSIGNED NULL,
  wa_id               VARCHAR(20)     NOT NULL,          -- número del cliente tal como lo manda Meta (solo dígitos)
  nombre_perfil       VARCHAR(150)    NULL,              -- nombre del perfil de WhatsApp
  estado              ENUM('bot','cola','atencion','cerrada') NOT NULL DEFAULT 'bot',
  id_asignado         INT UNSIGNED    NULL,
  asignada_at         DATETIME        NULL,
  id_flujo            BIGINT UNSIGNED NULL,              -- flujo del chatbot en curso (NULL = sin flujo: se evalúan disparadores)
  nodo                VARCHAR(40)     NULL,              -- nodo del grafo donde espera respuesta
  variables           LONGTEXT        NULL CHECK (variables IS NULL OR JSON_VALID(variables)),
  bot_actividad_at    DATETIME        NULL,              -- último paso del bot (vence con com_config_sede.sesion_minutos)
  ultimo_entrante_at  DATETIME        NULL,              -- abre la ventana de 24 h
  ultimo_mensaje_at   DATETIME        NULL,
  ultimo_mensaje_id   BIGINT UNSIGNED NULL,              -- para mostrar tipo, dirección y estado del último mensaje en la lista
  resumen             VARCHAR(200)    NULL,              -- texto del último mensaje (lista de la bandeja)
  no_leidos           INT UNSIGNED    NOT NULL DEFAULT 0,
  cerrada_at          DATETIME        NULL,
  cerrada_por         INT UNSIGNED    NULL,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_com_conv (id_linea, wa_id),
  KEY idx_com_conv_bandeja (id_sede, estado, ultimo_mensaje_at),
  KEY idx_com_conv_asignado (id_asignado, estado),
  KEY idx_com_conv_contacto (id_contacto),
  CONSTRAINT fk_com_conv_sede     FOREIGN KEY (id_sede)     REFERENCES le_sedes(id),
  CONSTRAINT fk_com_conv_linea    FOREIGN KEY (id_linea)    REFERENCES com_lineas(id),
  CONSTRAINT fk_com_conv_contacto FOREIGN KEY (id_contacto) REFERENCES crm_contactos(id) ON DELETE SET NULL,
  CONSTRAINT fk_com_conv_asignado FOREIGN KEY (id_asignado) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_com_conv_cerro    FOREIGN KEY (cerrada_por) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Mensajes ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- Estado con guarda de orden (la aplica la app): pendiente(0) → enviado(1) → entregado(2) → leido(3); fallido es final. Los entrantes: recibido.
CREATE TABLE IF NOT EXISTS com_mensajes (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede          INT UNSIGNED    NOT NULL,
  id_conversacion  BIGINT UNSIGNED NOT NULL,
  direccion        ENUM('entrante','saliente') NOT NULL,
  origen           ENUM('contacto','bot','asesor','campana','sistema') NOT NULL,
  tipo             VARCHAR(20)     NOT NULL,              -- text, image, audio, video, document, sticker, location, contacts, interactive, button, template, reaction, unsupported
  texto            TEXT            NULL,
  contenido        LONGTEXT        NULL CHECK (contenido IS NULL OR JSON_VALID(contenido)),   -- botones, lista, plantilla, ubicación, respuesta elegida…
  media_key        VARCHAR(255)    NULL,                  -- R2 privado: sedes/{id}/comunicaciones/…
  media_mime       VARCHAR(100)    NULL,
  media_nombre     VARCHAR(255)    NULL,
  media_bytes      INT UNSIGNED    NULL,
  wa_message_id    VARCHAR(128)    NULL,
  contexto_wa_id   VARCHAR(128)    NULL,                  -- mensaje al que responde (context.id de Meta)
  estado           ENUM('recibido','pendiente','enviado','entregado','leido','fallido') NOT NULL,
  error_codigo     INT             NULL,
  error_detalle    VARCHAR(500)    NULL,
  categoria        VARCHAR(30)     NULL,                  -- pricing.category de Meta (marketing, utility, authentication, service…)
  cobrable         TINYINT(1)      NULL,                  -- pricing.billable
  creditos         INT             NULL,                  -- créditos descontados
  id_billetera     INT UNSIGNED    NULL,
  cobrado_at       DATETIME        NULL,                  -- marca de idempotencia del cobro
  id_usuario       INT UNSIGNED    NULL,                  -- asesor que lo envió
  id_campana       BIGINT UNSIGNED NULL,                  -- FK en la 014
  enviado_at       DATETIME        NULL,
  entregado_at     DATETIME        NULL,
  leido_at         DATETIME        NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_com_msg_wamid (wa_message_id),
  KEY idx_com_msg_conv (id_conversacion, id),
  KEY idx_com_msg_sede (id_sede, created_at),
  CONSTRAINT fk_com_msg_sede FOREIGN KEY (id_sede)         REFERENCES le_sedes(id),
  CONSTRAINT fk_com_msg_conv FOREIGN KEY (id_conversacion) REFERENCES com_conversaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_com_msg_usr  FOREIGN KEY (id_usuario)      REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Cola del webhook: mensajes entrantes y estados que llegaron antes que su mensaje ─────────────────────────────
-- El único (línea, tipo, clave) deduplica los reintentos de Meta. clave = wa_message_id (mensaje) o wa_message_id:estado.
CREATE TABLE IF NOT EXISTS com_entrantes (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_linea        INT UNSIGNED    NOT NULL,
  tipo            ENUM('mensaje','estado') NOT NULL,
  clave           VARCHAR(160)    NOT NULL,
  payload         LONGTEXT        NOT NULL CHECK (JSON_VALID(payload)),
  estado          ENUM('pendiente','procesado','error') NOT NULL DEFAULT 'pendiente',
  intentos        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  error           VARCHAR(500)    NULL,
  procesar_desde  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,   -- reintentos con espera
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  procesado_at    DATETIME        NULL,
  UNIQUE KEY uq_com_ent (id_linea, tipo, clave),
  KEY idx_com_ent_cola (estado, procesar_desde),
  CONSTRAINT fk_com_ent_linea FOREIGN KEY (id_linea) REFERENCES com_lineas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Tarifas: categoría de precio de Meta → créditos (L5) ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS com_tarifas (
  categoria   VARCHAR(30)  NOT NULL PRIMARY KEY,        -- pricing.category de Meta; '*' = cualquier otra
  nombre      VARCHAR(60)  NOT NULL,
  creditos    INT UNSIGNED NOT NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT UNSIGNED NULL,
  CONSTRAINT fk_com_tar_uby FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO com_tarifas (categoria, nombre, creditos) VALUES
  ('marketing',      'Marketing',        20),
  ('utility',        'Utilidad',          1),
  ('authentication', 'Autenticación',     1),
  ('service',        'Servicio',          1),
  ('*',              'Otras categorías',  1);

-- ─── Créditos: bolsas (empresa o sede) y movimientos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS com_billeteras (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ambito        ENUM('empresa','sede') NOT NULL,
  id_empresa    INT UNSIGNED NOT NULL,
  id_sede       INT UNSIGNED NULL,                      -- solo ámbito sede
  saldo         BIGINT       NOT NULL DEFAULT 0,        -- puede quedar negativo por mensajes en vuelo (Meta cobra después de enviar)
  base_alerta   BIGINT       NOT NULL DEFAULT 0,        -- saldo tras la última recarga: 100 % para las alertas del 20 % y 5 %
  alerta_nivel  TINYINT UNSIGNED NOT NULL DEFAULT 0,    -- 0 ninguna · 1 avisó 20 % · 2 avisó 5 % · 3 avisó sin saldo
  ambito_ref    VARCHAR(20) AS (IF(ambito = 'empresa', CONCAT('e', id_empresa), CONCAT('s', id_sede))) STORED,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_com_bil (ambito_ref),
  KEY idx_com_bil_empresa (id_empresa),
  CONSTRAINT fk_com_bil_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id),
  CONSTRAINT fk_com_bil_sede    FOREIGN KEY (id_sede)    REFERENCES le_sedes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Consumo agregado por (bolsa, sede, día, categoría): una campaña grande no llena el libro. El detalle por mensaje está en com_mensajes.
CREATE TABLE IF NOT EXISTS com_movimientos (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_billetera     INT UNSIGNED NOT NULL,
  tipo             ENUM('recarga','consumo','ajuste','transferencia') NOT NULL,
  id_sede          INT UNSIGNED NULL,                   -- sede que consumió (consumo) o destino/origen (transferencia)
  fecha            DATE         NOT NULL,
  categoria        VARCHAR(30)  NULL,                   -- solo consumo
  cantidad         INT UNSIGNED NOT NULL DEFAULT 0,     -- mensajes (consumo)
  creditos         BIGINT       NOT NULL,               -- con signo: + recarga/entrada, − consumo/salida
  saldo_despues    BIGINT       NOT NULL,
  descripcion      VARCHAR(255) NULL,
  referencia       VARCHAR(100) NULL,                   -- pago, factura…
  id_billetera_contraparte INT UNSIGNED NULL,           -- transferencia
  consumo_ref      VARCHAR(80) AS (IF(tipo = 'consumo', CONCAT_WS('|', id_billetera, IFNULL(id_sede, 0), fecha, IFNULL(categoria, '')), NULL)) STORED,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by       INT UNSIGNED NULL,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_com_mov_consumo (consumo_ref),
  KEY idx_com_mov_bil (id_billetera, fecha),
  KEY idx_com_mov_sede (id_sede, fecha),
  CONSTRAINT fk_com_mov_bil FOREIGN KEY (id_billetera) REFERENCES com_billeteras(id),
  CONSTRAINT fk_com_mov_cby FOREIGN KEY (created_by)   REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
