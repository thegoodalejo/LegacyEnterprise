-- 005_crm_oportunidades.sql — CRM fase A: oportunidades con embudo configurable, motivos de cierre, catálogo de ítems
-- (productos, servicios, tratamientos…), líneas, notas, etiquetas y campos personalizados también para oportunidades.
-- Idempotente. Diseño y decisiones: docs/modulos/crm.md (Hoja de ruta).
--
-- Ámbitos, como el resto del CRM: la configuración (embudos, etapas, motivos, catálogo, moneda) es de la EMPRESA (id_empresa);
-- las oportunidades y sus líneas, notas, etiquetas y valores son de una SEDE (id_sede, siempre de la sesión).
-- Una oportunidad apunta a un Contacto (Persona u Organización) de su sede: «todo apunta al Contacto».
-- El estado (abierta/ganada/perdida) sale del TIPO de la etapa en que está. Nada se borra: etapas, embudos, motivos e ítems se
-- desactivan; las oportunidades se archivan (activo = 0).
-- Auditoría en todas las tablas: created_at/updated_at + created_by/updated_by (FK a le_usuarios, ON DELETE SET NULL).

-- ─── Configuración general de la empresa ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_config (
  id_empresa  INT UNSIGNED     NOT NULL PRIMARY KEY,
  moneda      CHAR(3)          NOT NULL DEFAULT 'COP',           -- código ISO 4217; sin conversión entre monedas
  decimales   TINYINT UNSIGNED NOT NULL DEFAULT 0,               -- decimales con que se muestran los montos
  created_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED     NULL,
  updated_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT UNSIGNED     NULL,
  CONSTRAINT fk_crm_cfg_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_cfg_cby     FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_cfg_uby     FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Embudos y etapas (por empresa) ─────────────────────────────────────────────────────────────────────────────────
-- Una empresa puede tener varios embudos; la pantalla muestra el selector solo cuando hay más de uno.
CREATE TABLE IF NOT EXISTS crm_embudos (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa  INT UNSIGNED NOT NULL,
  nombre      VARCHAR(80)  NOT NULL,
  orden       SMALLINT     NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT UNSIGNED NULL,
  UNIQUE KEY uq_crm_emb_nombre (id_empresa, nombre),
  CONSTRAINT fk_crm_emb_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_emb_cby     FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_emb_uby     FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- tipo: abierta = en curso; ganada / perdida = terminales (definen el estado de la oportunidad). probabilidad 0–100: alimenta el
-- valor ponderado (valor × probabilidad) del embudo; en las terminales la fija la app (ganada 100, perdida 0).
CREATE TABLE IF NOT EXISTS crm_etapas (
  id            INT UNSIGNED     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa    INT UNSIGNED     NOT NULL,
  id_embudo     INT UNSIGNED     NOT NULL,
  nombre        VARCHAR(80)      NOT NULL,
  orden         SMALLINT         NOT NULL DEFAULT 0,
  probabilidad  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  tipo          ENUM('abierta','ganada','perdida') NOT NULL DEFAULT 'abierta',
  color         CHAR(7)          NULL,                           -- #RRGGBB elegido por el cliente (dato, no token de marca)
  activo        TINYINT(1)       NOT NULL DEFAULT 1,
  created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by    INT UNSIGNED     NULL,
  updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by    INT UNSIGNED     NULL,
  UNIQUE KEY uq_crm_eta_nombre (id_embudo, nombre),
  KEY idx_crm_eta_empresa (id_empresa),
  CONSTRAINT fk_crm_eta_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_eta_embudo  FOREIGN KEY (id_embudo)  REFERENCES crm_embudos(id),
  CONSTRAINT fk_crm_eta_cby     FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_eta_uby     FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Motivos de cierre (por qué se ganó o se perdió), configurables por empresa.
CREATE TABLE IF NOT EXISTS crm_motivos_cierre (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa  INT UNSIGNED NOT NULL,
  tipo        ENUM('ganada','perdida') NOT NULL,
  nombre      VARCHAR(80)  NOT NULL,
  orden       SMALLINT     NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT UNSIGNED NULL,
  UNIQUE KEY uq_crm_mot_nombre (id_empresa, tipo, nombre),
  CONSTRAINT fk_crm_mot_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_mot_cby     FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_mot_uby     FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Catálogo de ítems (por empresa): lo que se vende — productos, servicios, tratamientos, mantenimientos… ────────
-- Lo usan las líneas de oportunidad y, más adelante, las ventas importadas y las metas por ítem o categoría.
CREATE TABLE IF NOT EXISTS crm_catalogo_categorias (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa  INT UNSIGNED NOT NULL,
  nombre      VARCHAR(80)  NOT NULL,
  orden       SMALLINT     NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT UNSIGNED NULL,
  UNIQUE KEY uq_crm_cat_nombre (id_empresa, nombre),
  CONSTRAINT fk_crm_cat_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_cat_cby     FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_cat_uby     FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_catalogo_items (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa    INT UNSIGNED  NOT NULL,
  id_categoria  INT UNSIGNED  NULL,
  codigo        VARCHAR(40)   NULL,                              -- opcional; único por empresa cuando existe (así las ventas importadas resuelven el ítem)
  nombre        VARCHAR(150)  NOT NULL,
  unidad        VARCHAR(30)   NULL,                              -- galón, sesión, hora, m²…
  precio_ref    DECIMAL(18,2) NULL,                              -- precio de referencia: sugiere el precio de la línea, no lo impone
  activo        TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by    INT UNSIGNED  NULL,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by    INT UNSIGNED  NULL,
  UNIQUE KEY uq_crm_it_codigo (id_empresa, codigo),
  KEY idx_crm_it_nombre (id_empresa, nombre),
  KEY idx_crm_it_cat (id_categoria),
  CONSTRAINT fk_crm_it_empresa FOREIGN KEY (id_empresa)   REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_it_cat     FOREIGN KEY (id_categoria) REFERENCES crm_catalogo_categorias(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_it_cby     FOREIGN KEY (created_by)   REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_it_uby     FOREIGN KEY (updated_by)   REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Oportunidades (por sede) ───────────────────────────────────────────────────────────────────────────────────────
-- valor = suma de las líneas cuando las hay (lo recalcula la app); sin líneas es el valor estimado que escribe el usuario.
-- estado/fecha_cierre_real/id_motivo_cierre los fija move_oportunidad según el tipo de la etapa. etapa_desde: cuándo entró a la etapa.
CREATE TABLE IF NOT EXISTS crm_oportunidades (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede                INT UNSIGNED    NOT NULL,
  id_embudo              INT UNSIGNED    NOT NULL,
  id_etapa               INT UNSIGNED    NOT NULL,
  titulo                 VARCHAR(190)    NOT NULL,
  id_contacto            BIGINT UNSIGNED NOT NULL,               -- Persona u Organización a la que se le vende
  id_persona_contacto    BIGINT UNSIGNED NULL,                   -- persona de referencia con quien se habla (opcional)
  id_responsable         INT UNSIGNED    NULL,                   -- usuario de la sede que la lleva
  valor                  DECIMAL(18,2)   NOT NULL DEFAULT 0,
  fecha_cierre_estimada  DATE            NULL,
  estado                 ENUM('abierta','ganada','perdida') NOT NULL DEFAULT 'abierta',
  fecha_cierre_real      DATE            NULL,
  id_motivo_cierre       INT UNSIGNED    NULL,
  descripcion            TEXT            NULL,
  etapa_desde            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activo                 TINYINT(1)      NOT NULL DEFAULT 1,     -- 0 = archivada; se restaura
  created_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by             INT UNSIGNED    NULL,
  updated_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by             INT UNSIGNED    NULL,
  KEY idx_crm_op_lista    (id_sede, estado, activo),
  KEY idx_crm_op_etapa    (id_sede, id_etapa, activo),
  KEY idx_crm_op_contacto (id_contacto),
  KEY idx_crm_op_persona  (id_persona_contacto),
  KEY idx_crm_op_resp     (id_responsable),
  KEY idx_crm_op_cierre   (id_sede, fecha_cierre_estimada),
  KEY idx_crm_op_creado   (id_sede, created_at),
  CONSTRAINT fk_crm_op_sede     FOREIGN KEY (id_sede)             REFERENCES le_sedes(id),
  CONSTRAINT fk_crm_op_embudo   FOREIGN KEY (id_embudo)           REFERENCES crm_embudos(id),
  CONSTRAINT fk_crm_op_etapa    FOREIGN KEY (id_etapa)            REFERENCES crm_etapas(id),
  CONSTRAINT fk_crm_op_contacto FOREIGN KEY (id_contacto)         REFERENCES crm_contactos(id),
  CONSTRAINT fk_crm_op_persona  FOREIGN KEY (id_persona_contacto) REFERENCES crm_contactos(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_op_resp     FOREIGN KEY (id_responsable)      REFERENCES le_usuarios(id)   ON DELETE SET NULL,
  CONSTRAINT fk_crm_op_motivo   FOREIGN KEY (id_motivo_cierre)    REFERENCES crm_motivos_cierre(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_op_cby      FOREIGN KEY (created_by)          REFERENCES le_usuarios(id)   ON DELETE SET NULL,
  CONSTRAINT fk_crm_op_uby      FOREIGN KEY (updated_by)          REFERENCES le_usuarios(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Líneas: qué se ofrece. id_item NULL = descripción libre. total = cantidad × precio (lo calcula la app).
CREATE TABLE IF NOT EXISTS crm_oportunidad_lineas (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_oportunidad   BIGINT UNSIGNED NOT NULL,
  orden            SMALLINT        NOT NULL DEFAULT 0,
  id_item          INT UNSIGNED    NULL,
  descripcion      VARCHAR(255)    NULL,
  cantidad         DECIMAL(14,4)   NOT NULL DEFAULT 1,
  precio_unitario  DECIMAL(18,4)   NOT NULL DEFAULT 0,
  total            DECIMAL(18,2)   NOT NULL DEFAULT 0,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by       INT UNSIGNED    NULL,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by       INT UNSIGNED    NULL,
  KEY idx_crm_opl_op (id_oportunidad, orden),
  KEY idx_crm_opl_item (id_item),
  CONSTRAINT fk_crm_opl_op   FOREIGN KEY (id_oportunidad) REFERENCES crm_oportunidades(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_opl_item FOREIGN KEY (id_item)        REFERENCES crm_catalogo_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_opl_cby  FOREIGN KEY (created_by)     REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_opl_uby  FOREIGN KEY (updated_by)     REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bitácora de notas de la oportunidad (aparte del historial automático de cambios). Se eliminan de forma lógica.
CREATE TABLE IF NOT EXISTS crm_oportunidad_notas (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_oportunidad   BIGINT UNSIGNED NOT NULL,
  nota             TEXT            NOT NULL,
  activo           TINYINT(1)      NOT NULL DEFAULT 1,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by       INT UNSIGNED    NULL,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by       INT UNSIGNED    NULL,
  KEY idx_crm_opn_op (id_oportunidad, created_at),
  CONSTRAINT fk_crm_opn_op  FOREIGN KEY (id_oportunidad) REFERENCES crm_oportunidades(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_opn_cby FOREIGN KEY (created_by)     REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_opn_uby FOREIGN KEY (updated_by)     REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Campos personalizados y etiquetas también para oportunidades ──────────────────────────────────────────────────
-- crm_campos_valores y crm_contacto_tags tienen FK a crm_contactos: para oportunidades hay tablas espejo con las mismas columnas
-- (una por tipo de dato), de modo que los filtros por rango usan el tipo y el índice reales.
CREATE TABLE IF NOT EXISTS crm_oportunidad_valores (
  id_oportunidad  BIGINT UNSIGNED NOT NULL,
  id_campo        INT UNSIGNED    NOT NULL,
  valor_entero    BIGINT          NULL,
  valor_decimal   DECIMAL(18,4)   NULL,
  valor_texto     VARCHAR(255)    NULL,
  valor_booleano  TINYINT(1)      NULL,
  valor_fecha     DATE            NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by      INT UNSIGNED    NULL,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by      INT UNSIGNED    NULL,
  PRIMARY KEY (id_oportunidad, id_campo),
  KEY idx_crm_opv_entero  (id_campo, valor_entero),
  KEY idx_crm_opv_decimal (id_campo, valor_decimal),
  KEY idx_crm_opv_fecha   (id_campo, valor_fecha),
  KEY idx_crm_opv_texto   (id_campo, valor_texto),
  KEY idx_crm_opv_bool    (id_campo, valor_booleano),
  CONSTRAINT fk_crm_opv_op    FOREIGN KEY (id_oportunidad) REFERENCES crm_oportunidades(id)          ON DELETE CASCADE,
  CONSTRAINT fk_crm_opv_campo FOREIGN KEY (id_campo)       REFERENCES crm_campos_personalizados(id)  ON DELETE CASCADE,
  CONSTRAINT fk_crm_opv_cby   FOREIGN KEY (created_by)     REFERENCES le_usuarios(id)                ON DELETE SET NULL,
  CONSTRAINT fk_crm_opv_uby   FOREIGN KEY (updated_by)     REFERENCES le_usuarios(id)                ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_oportunidad_tags (
  id_oportunidad  BIGINT UNSIGNED NOT NULL,
  id_tag          INT UNSIGNED    NOT NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by      INT UNSIGNED    NULL,
  PRIMARY KEY (id_oportunidad, id_tag),
  KEY idx_crm_opt_tag (id_tag, id_oportunidad),
  CONSTRAINT fk_crm_opt_op  FOREIGN KEY (id_oportunidad) REFERENCES crm_oportunidades(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_opt_tag FOREIGN KEY (id_tag)         REFERENCES crm_tags(id)          ON DELETE CASCADE,
  CONSTRAINT fk_crm_opt_cby FOREIGN KEY (created_by)     REFERENCES le_usuarios(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- «oportunidad» como destino de campos y etiquetas, y «oportunidad» / «item» en el vocabulario por empresa (MODIFY es idempotente).
ALTER TABLE crm_campos_personalizados MODIFY aplica_a ENUM('persona','organizacion','oportunidad') NOT NULL;
ALTER TABLE crm_tags MODIFY aplica_a ENUM('persona','organizacion','oportunidad') NULL;
ALTER TABLE crm_vocabulario MODIFY clave ENUM('contacto','persona','organizacion','oportunidad','item') NOT NULL;
