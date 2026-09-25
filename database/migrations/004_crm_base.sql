-- 004_crm_base.sql — CRM v0: contactos (Persona / Organización), jerarquía de organizaciones, vínculos con roles,
-- campos personalizados, etiquetas y vocabulario por empresa.
-- Idempotente. Diseño y decisiones: docs/modulos/crm.md.
--
-- Patrón "party": crm_contactos es la tabla base (un solo espacio de ids para todo lo que apunte a un contacto:
-- etiquetas, valores personalizados, historial, y luego negocios/actividades) y cada tipo tiene su tabla de extensión 1–1.
-- Ámbitos: los contactos son de una SEDE (id_sede, siempre de la sesión); la configuración (campos personalizados,
-- etiquetas) es de la EMPRESA (id_empresa), compartida por todas sus sedes.
-- "Organización" y no "Empresa" para el tipo de contacto: le_empresas ya es el tenant que contrata la plataforma.
--
-- Auditoría (todas las tablas): created_at/updated_at (recDate/changeDate) y created_by/updated_by (usuario).
-- Las tablas de solo inserción/borrado (crm_contacto_tags) llevan únicamente created_*.
-- La eliminación de contactos es siempre lógica (activo = 0) y reversible; no hay borrado físico.

-- ─── Contactos ──────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_contactos (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede          INT UNSIGNED    NOT NULL,
  tipo             ENUM('persona','organizacion') NOT NULL,
  nombre_completo  VARCHAR(255)    NOT NULL,             -- nombres+apellidos o razón social: para listar y ordenar sin joins
  direccion        VARCHAR(255)    NULL,
  ciudad           VARCHAR(100)    NULL,
  lat              DECIMAL(9,6)    NULL,
  lng              DECIMAL(9,6)    NULL,
  telefono         VARCHAR(30)     NULL,
  id_responsable   INT UNSIGNED    NULL,                 -- usuario de la sede que lleva el contacto
  activo           TINYINT(1)      NOT NULL DEFAULT 1,   -- 0 = archivado ("eliminado"), se puede restaurar
  busqueda         VARCHAR(1000)   NOT NULL DEFAULT '',  -- nombre + documento + correo + teléfonos (con y sin formato); lo arma la app al guardar
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by       INT UNSIGNED    NULL,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by       INT UNSIGNED    NULL,
  KEY idx_crm_c_lista  (id_sede, tipo, activo),
  KEY idx_crm_c_nombre (id_sede, nombre_completo),
  KEY idx_crm_c_creado (id_sede, created_at),
  KEY idx_crm_c_resp   (id_responsable),
  CONSTRAINT fk_crm_c_sede FOREIGN KEY (id_sede)        REFERENCES le_sedes(id),
  CONSTRAINT fk_crm_c_resp FOREIGN KEY (id_responsable) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_c_cby  FOREIGN KEY (created_by)     REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_c_uby  FOREIGN KEY (updated_by)     REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_contactos_personas (
  id                   BIGINT UNSIGNED NOT NULL PRIMARY KEY,   -- = crm_contactos.id
  nombres              VARCHAR(100)    NOT NULL,
  apellidos            VARCHAR(100)    NULL,
  documento_tipo       VARCHAR(20)     NULL,                   -- CC, CE, pasaporte…
  documento_numero     VARCHAR(40)     NULL,
  correo               VARCHAR(190)    NULL,
  whatsapp_indicativo  VARCHAR(6)      NULL,                   -- sin "+", ej. 57
  whatsapp_numero      VARCHAR(20)     NULL,                   -- solo dígitos
  fecha_nacimiento     DATE            NULL,
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by           INT UNSIGNED    NULL,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by           INT UNSIGNED    NULL,
  KEY idx_crm_p_doc    (documento_numero),
  KEY idx_crm_p_correo (correo),
  CONSTRAINT fk_crm_p_contacto FOREIGN KEY (id)         REFERENCES crm_contactos(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_p_cby      FOREIGN KEY (created_by) REFERENCES le_usuarios(id)   ON DELETE SET NULL,
  CONSTRAINT fk_crm_p_uby      FOREIGN KEY (updated_by) REFERENCES le_usuarios(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_contactos_organizaciones (
  id                BIGINT UNSIGNED NOT NULL PRIMARY KEY,      -- = crm_contactos.id
  razon_social      VARCHAR(190)    NOT NULL,
  documento_tipo    VARCHAR(20)     NULL,                      -- NIT, código interno…
  documento_numero  VARCHAR(40)     NULL,
  correo_facturacion VARCHAR(190)   NULL,
  id_padre          BIGINT UNSIGNED NULL,                      -- organización a la que pertenece (matriz, conjunto, grupo…); sin ciclos (lo valida la app)
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by        INT UNSIGNED    NULL,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by        INT UNSIGNED    NULL,
  KEY idx_crm_o_doc (documento_numero),
  KEY idx_crm_o_padre (id_padre),
  CONSTRAINT fk_crm_o_contacto FOREIGN KEY (id)         REFERENCES crm_contactos(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_o_padre    FOREIGN KEY (id_padre)   REFERENCES crm_contactos(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_o_cby      FOREIGN KEY (created_by) REFERENCES le_usuarios(id)   ON DELETE SET NULL,
  CONSTRAINT fk_crm_o_uby      FOREIGN KEY (updated_by) REFERENCES le_usuarios(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roles que puede tener una Persona ante una Organización (dueño, compras, administrador…): lista por EMPRESA.
CREATE TABLE IF NOT EXISTS crm_roles_vinculo (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa  INT UNSIGNED NOT NULL,
  nombre      VARCHAR(60)  NOT NULL,
  orden       SMALLINT     NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT UNSIGNED NULL,
  UNIQUE KEY uq_crm_rv_nombre (id_empresa, nombre),
  CONSTRAINT fk_crm_rv_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_rv_cby     FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_rv_uby     FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Persona que representa a una Organización. Muchos a muchos: un administrador puede atender varias plantas.
-- Regla (en la aplicación, no en la BD): toda Organización tiene al menos una Persona vinculada.
CREATE TABLE IF NOT EXISTS crm_contacto_vinculos (
  id_organizacion  BIGINT UNSIGNED NOT NULL,
  id_persona       BIGINT UNSIGNED NOT NULL,
  id_rol           INT UNSIGNED    NULL,                       -- crm_roles_vinculo; NULL = sin rol
  principal        TINYINT(1)      NOT NULL DEFAULT 0,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by       INT UNSIGNED    NULL,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by       INT UNSIGNED    NULL,
  PRIMARY KEY (id_organizacion, id_persona),
  KEY idx_crm_v_persona (id_persona),
  KEY idx_crm_v_rol (id_rol),
  CONSTRAINT fk_crm_v_org FOREIGN KEY (id_organizacion) REFERENCES crm_contactos(id)   ON DELETE CASCADE,
  CONSTRAINT fk_crm_v_per FOREIGN KEY (id_persona)      REFERENCES crm_contactos(id)   ON DELETE CASCADE,
  CONSTRAINT fk_crm_v_rol FOREIGN KEY (id_rol)          REFERENCES crm_roles_vinculo(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_v_cby FOREIGN KEY (created_by)      REFERENCES le_usuarios(id)     ON DELETE SET NULL,
  CONSTRAINT fk_crm_v_uby FOREIGN KEY (updated_by)      REFERENCES le_usuarios(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Campos personalizados (por empresa) ────────────────────────────────────────────────────────────────────────
-- Definición. El tipo no se cambia una vez hay valores guardados (se desactiva el campo y se crea otro).
CREATE TABLE IF NOT EXISTS crm_campos_personalizados (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa   INT UNSIGNED NOT NULL,
  aplica_a     ENUM('persona','organizacion') NOT NULL,
  clave        VARCHAR(50)  NOT NULL,                          -- nombre técnico estable: talla, area_m2…
  etiqueta     VARCHAR(100) NOT NULL,                          -- lo que ve el usuario
  tipo_dato    ENUM('entero','decimal','texto','booleano','fecha') NOT NULL,
  obligatorio  TINYINT(1)   NOT NULL DEFAULT 0,
  orden        SMALLINT     NOT NULL DEFAULT 0,
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by   INT UNSIGNED NULL,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by   INT UNSIGNED NULL,
  UNIQUE KEY uq_crm_cp_clave (id_empresa, aplica_a, clave),
  CONSTRAINT fk_crm_cp_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_cp_cby     FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_cp_uby     FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Valores con una columna por tipo: solo la del tipo del campo queda con valor (las demás NULL). Así el filtro por
-- rango numérico o de fechas usa el tipo y el índice reales, sin castear texto.
-- valor_fecha es DATE (YYYY-MM-DD); el formato dd-mm-aaaa es solo de presentación en el frontend.
CREATE TABLE IF NOT EXISTS crm_campos_valores (
  id_contacto    BIGINT UNSIGNED NOT NULL,
  id_campo       INT UNSIGNED    NOT NULL,
  valor_entero   BIGINT          NULL,
  valor_decimal  DECIMAL(18,4)   NULL,
  valor_texto    VARCHAR(255)    NULL,
  valor_booleano TINYINT(1)      NULL,
  valor_fecha    DATE            NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by     INT UNSIGNED    NULL,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by     INT UNSIGNED    NULL,
  PRIMARY KEY (id_contacto, id_campo),
  KEY idx_crm_cv_entero  (id_campo, valor_entero),
  KEY idx_crm_cv_decimal (id_campo, valor_decimal),
  KEY idx_crm_cv_fecha   (id_campo, valor_fecha),
  KEY idx_crm_cv_texto   (id_campo, valor_texto),
  KEY idx_crm_cv_bool    (id_campo, valor_booleano),
  CONSTRAINT fk_crm_cv_contacto FOREIGN KEY (id_contacto) REFERENCES crm_contactos(id)            ON DELETE CASCADE,
  CONSTRAINT fk_crm_cv_campo    FOREIGN KEY (id_campo)    REFERENCES crm_campos_personalizados(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_cv_cby      FOREIGN KEY (created_by)  REFERENCES le_usuarios(id)               ON DELETE SET NULL,
  CONSTRAINT fk_crm_cv_uby      FOREIGN KEY (updated_by)  REFERENCES le_usuarios(id)               ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Etiquetas (por empresa) ────────────────────────────────────────────────────────────────────────────────────
-- Inspiradas en las de Kingdom (nombre + color), con agrupación opcional. Un tag no necesita grupo.
CREATE TABLE IF NOT EXISTS crm_tags_grupos (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa  INT UNSIGNED NOT NULL,
  nombre      VARCHAR(80)  NOT NULL,
  orden       SMALLINT     NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT UNSIGNED NULL,
  UNIQUE KEY uq_crm_tg_nombre (id_empresa, nombre),
  CONSTRAINT fk_crm_tg_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_tg_cby     FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_tg_uby     FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_tags (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa  INT UNSIGNED NOT NULL,
  id_grupo    INT UNSIGNED NULL,                               -- NULL = sin grupo
  nombre      VARCHAR(50)  NOT NULL,
  color       CHAR(7)      NOT NULL DEFAULT '#607D8B',         -- #RRGGBB elegido por el cliente (dato, no token de marca)
  aplica_a    ENUM('persona','organizacion') NULL,             -- NULL = sirve para ambos tipos
  orden       SMALLINT     NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT UNSIGNED NULL,
  UNIQUE KEY uq_crm_t_nombre (id_empresa, nombre),
  KEY idx_crm_t_grupo (id_grupo),
  CONSTRAINT fk_crm_t_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_t_grupo   FOREIGN KEY (id_grupo)   REFERENCES crm_tags_grupos(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_t_cby     FOREIGN KEY (created_by) REFERENCES le_usuarios(id)     ON DELETE SET NULL,
  CONSTRAINT fk_crm_t_uby     FOREIGN KEY (updated_by) REFERENCES le_usuarios(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relación contacto ↔ tag. La PK sirve "tags de este contacto"; el índice inverso, "contactos con este tag".
-- Una sola tabla para Persona y Organización porque comparten el espacio de ids de crm_contactos.
CREATE TABLE IF NOT EXISTS crm_contacto_tags (
  id_contacto  BIGINT UNSIGNED NOT NULL,
  id_tag       INT UNSIGNED    NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by   INT UNSIGNED    NULL,
  PRIMARY KEY (id_contacto, id_tag),
  KEY idx_crm_ct_tag (id_tag, id_contacto),
  CONSTRAINT fk_crm_ct_contacto FOREIGN KEY (id_contacto) REFERENCES crm_contactos(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_ct_tag      FOREIGN KEY (id_tag)      REFERENCES crm_tags(id)      ON DELETE CASCADE,
  CONSTRAINT fk_crm_ct_cby      FOREIGN KEY (created_by)  REFERENCES le_usuarios(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Vocabulario (por empresa) ──────────────────────────────────────────────────────────────────────────────────
-- Cómo llama la empresa a cada concepto en pantalla ("Paciente", "Planta"…). Solo lo que se personaliza: sin fila se
-- usa el nombre por defecto del idioma. clave: contacto (el registro en general), persona u organizacion.
CREATE TABLE IF NOT EXISTS crm_vocabulario (
  id_empresa  INT UNSIGNED NOT NULL,
  clave       ENUM('contacto','persona','organizacion') NOT NULL,
  singular    VARCHAR(40)  NOT NULL,
  plural      VARCHAR(40)  NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT UNSIGNED NULL,
  PRIMARY KEY (id_empresa, clave),
  CONSTRAINT fk_crm_voc_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_voc_cby     FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_voc_uby     FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
