-- 006_crm_ventas.sql — CRM fase B: ventas importadas desde Excel/CSV (por lotes revertibles) y plantillas de mapeo de columnas.
-- Idempotente. Diseño y decisiones: docs/modulos/crm.md («Ventas importadas»).
--
-- Una venta es un documento (factura, remisión…) de un Contacto de la sede en una fecha, con líneas de ítems. Llegan desde un archivo que
-- el navegador lee y manda por bloques; cada carga es un LOTE (crm_importaciones) que se puede revertir: revertir apaga sus ventas
-- (activo = 0), no las borra. Las tablas se pensaron para que un futuro módulo de Ventas/Facturación escriba en las mismas
-- (id_importacion NULL = venta creada por otro medio).
-- Auditoría en todas las tablas: created_at/updated_at + created_by/updated_by (FK a le_usuarios, ON DELETE SET NULL).

-- ─── Lotes de importación (por sede) ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_importaciones (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede        INT UNSIGNED    NOT NULL,
  tipo           ENUM('ventas')  NOT NULL DEFAULT 'ventas',
  archivo        VARCHAR(190)    NULL,                           -- nombre del archivo tal como lo eligió el usuario
  estado         ENUM('procesando','completa','revertida') NOT NULL DEFAULT 'procesando',
  opciones       JSON            NULL,                           -- mapeo y opciones con que se cargó (para saber cómo se interpretó)
  filas_total    INT UNSIGNED    NOT NULL DEFAULT 0,
  filas_ok       INT UNSIGNED    NOT NULL DEFAULT 0,
  filas_error    INT UNSIGNED    NOT NULL DEFAULT 0,
  ventas_nuevas  INT UNSIGNED    NOT NULL DEFAULT 0,
  ventas_reemplazadas INT UNSIGNED NOT NULL DEFAULT 0,
  ventas_omitidas INT UNSIGNED   NOT NULL DEFAULT 0,             -- duplicadas que se dejaron como estaban
  items_creados  INT UNSIGNED    NOT NULL DEFAULT 0,
  total_valor    DECIMAL(18,2)   NOT NULL DEFAULT 0,
  fecha_desde    DATE            NULL,                           -- rango de fechas de las ventas cargadas
  fecha_hasta    DATE            NULL,
  errores        JSON            NULL,                           -- las primeras filas con error: [{fila, motivo}]
  revertido_at   DATETIME        NULL,
  revertido_by   INT UNSIGNED    NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by     INT UNSIGNED    NULL,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by     INT UNSIGNED    NULL,
  KEY idx_crm_imp_sede (id_sede, created_at),
  CONSTRAINT fk_crm_imp_sede FOREIGN KEY (id_sede)      REFERENCES le_sedes(id),
  CONSTRAINT fk_crm_imp_rby  FOREIGN KEY (revertido_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_imp_cby  FOREIGN KEY (created_by)   REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_imp_uby  FOREIGN KEY (updated_by)   REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Ventas (por sede) ──────────────────────────────────────────────────────────────────────────────────────────────
-- documento: número de factura/remisión; identifica duplicados dentro de la sede entre las ventas activas (lo valida la app: no es UNIQUE
-- porque una venta reemplazada o revertida conserva su número).
CREATE TABLE IF NOT EXISTS crm_ventas (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede         INT UNSIGNED    NOT NULL,
  id_contacto     BIGINT UNSIGNED NOT NULL,                      -- cliente (Organización o Persona)
  fecha           DATE            NOT NULL,
  documento       VARCHAR(60)     NULL,
  total           DECIMAL(18,2)   NOT NULL DEFAULT 0,            -- suma de las líneas
  unidades        DECIMAL(18,4)   NOT NULL DEFAULT 0,            -- suma de las cantidades (para metas por unidades)
  id_importacion  BIGINT UNSIGNED NULL,
  activo          TINYINT(1)      NOT NULL DEFAULT 1,            -- 0 = revertida o reemplazada
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by      INT UNSIGNED    NULL,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by      INT UNSIGNED    NULL,
  KEY idx_crm_ven_fecha    (id_sede, activo, fecha),
  KEY idx_crm_ven_contacto (id_contacto, activo, fecha),
  KEY idx_crm_ven_doc      (id_sede, documento),
  KEY idx_crm_ven_imp      (id_importacion),
  CONSTRAINT fk_crm_ven_sede     FOREIGN KEY (id_sede)        REFERENCES le_sedes(id),
  CONSTRAINT fk_crm_ven_contacto FOREIGN KEY (id_contacto)    REFERENCES crm_contactos(id),
  CONSTRAINT fk_crm_ven_imp      FOREIGN KEY (id_importacion) REFERENCES crm_importaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_ven_cby      FOREIGN KEY (created_by)     REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_ven_uby      FOREIGN KEY (updated_by)     REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Líneas: el ítem del catálogo cuando se reconoce por su código; si no, queda el código y la descripción del archivo.
CREATE TABLE IF NOT EXISTS crm_venta_lineas (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_venta         BIGINT UNSIGNED NOT NULL,
  id_item          INT UNSIGNED    NULL,
  codigo           VARCHAR(40)     NULL,                         -- código tal como vino en el archivo
  descripcion      VARCHAR(255)    NULL,
  cantidad         DECIMAL(14,4)   NOT NULL DEFAULT 0,
  precio_unitario  DECIMAL(18,4)   NOT NULL DEFAULT 0,
  total            DECIMAL(18,2)   NOT NULL DEFAULT 0,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by       INT UNSIGNED    NULL,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by       INT UNSIGNED    NULL,
  KEY idx_crm_vl_venta (id_venta),
  KEY idx_crm_vl_item  (id_item),
  CONSTRAINT fk_crm_vl_venta FOREIGN KEY (id_venta)   REFERENCES crm_ventas(id)         ON DELETE CASCADE,
  CONSTRAINT fk_crm_vl_item  FOREIGN KEY (id_item)    REFERENCES crm_catalogo_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_vl_cby   FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_vl_uby   FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Plantillas de mapeo (por empresa) ──────────────────────────────────────────────────────────────────────────────
-- Qué columna del archivo va a cada dato y con qué opciones (formato de fecha, separador decimal, cómo reconocer al cliente…),
-- para repetir la misma carga cada mes sin volver a configurarla.
CREATE TABLE IF NOT EXISTS crm_import_plantillas (
  id          INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa  INT UNSIGNED   NOT NULL,
  tipo        ENUM('ventas') NOT NULL DEFAULT 'ventas',
  nombre      VARCHAR(80)    NOT NULL,
  mapeo       JSON           NOT NULL,
  activo      TINYINT(1)     NOT NULL DEFAULT 1,
  created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED   NULL,
  updated_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT UNSIGNED   NULL,
  UNIQUE KEY uq_crm_ip_nombre (id_empresa, tipo, nombre),
  CONSTRAINT fk_crm_ip_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_ip_cby     FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_ip_uby     FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
