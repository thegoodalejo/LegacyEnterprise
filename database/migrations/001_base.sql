-- 001_base.sql — fundación: sedes, usuarios, accesos por sede, auditoría, notificaciones.
-- Reemplazar le_ por el prefijo de tablas de la app (ej. la_).
-- Idempotente: se puede correr dos veces sin error. La aplica migrate.sh y la registra en schema_migrations.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(191) NOT NULL PRIMARY KEY,
  applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- LegacyEnterprise: nivel Empresa por encima de las sedes (desvío consciente del estándar de la skill).
-- La empresa agrupa sedes para los módulos de Gerencia y lleva la marca blanca; los datos de negocio
-- siguen aislados por id_sede.
CREATE TABLE IF NOT EXISTS le_empresas (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(150) NOT NULL,
  nit               VARCHAR(30)  NULL,
  color_primario    CHAR(7)      NULL,               -- marca blanca: NULL = paleta Legacy Enterprise
  color_secundario  CHAR(7)      NULL,
  color_terciario   CHAR(7)      NULL,
  logo_url          VARCHAR(500) NULL,               -- R2 público; NULL = logo Legacy Enterprise
  activo            TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada sede es un cliente operativo (sus datos aislados), dentro de una empresa.
CREATE TABLE IF NOT EXISTS le_sedes (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa          INT UNSIGNED NOT NULL,
  nombre              VARCHAR(150) NOT NULL,
  logo_url            VARCHAR(500) NULL,
  codigo_invitacion   CHAR(8)      NOT NULL,
  activo              TINYINT(1)   NOT NULL DEFAULT 1,
  storage_quota_mb    INT UNSIGNED NULL,               -- NULL = sin límite
  storage_used_bytes  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_le_sedes_codigo (codigo_invitacion),
  KEY idx_le_sedes_empresa (id_empresa),
  CONSTRAINT fk_le_sedes_empresa FOREIGN KEY (id_empresa) REFERENCES le_empresas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS le_usuarios (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  firebase_uid       VARCHAR(128) NOT NULL,
  email              VARCHAR(190) NOT NULL,
  nombre             VARCHAR(150) NULL,
  foto_url           VARCHAR(500) NULL,
  auth_token_hash    CHAR(64)     NULL,               -- sha256 del ID token vigente; nunca el token crudo
  fcm_token          VARCHAR(512) NULL,
  idioma             VARCHAR(5)   NOT NULL DEFAULT 'es',
  is_platform_admin  TINYINT(1)   NOT NULL DEFAULT 0, -- L5: soporte/dueño de la plataforma, todas las sedes
  id_sede_activa     INT UNSIGNED NULL,               -- NULL = sin sede → onboarding
  state              TINYINT(1)   NOT NULL DEFAULT 1,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login         DATETIME NULL,
  UNIQUE KEY uq_le_usuarios_uid (firebase_uid),
  KEY idx_le_usuarios_token (auth_token_hash),
  KEY idx_le_usuarios_email (email),
  CONSTRAINT fk_le_usuarios_sede FOREIGN KEY (id_sede_activa) REFERENCES le_sedes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fuente de verdad del acceso: rol y privilegios POR SEDE. L5 no vive aquí (es is_platform_admin).
CREATE TABLE IF NOT EXISTS le_usuario_sedes (
  id_usuario   INT UNSIGNED NOT NULL,
  id_sede      INT UNSIGNED NOT NULL,
  rol          VARCHAR(10)  NOT NULL DEFAULT 'Nuevo',  -- Nuevo, L0..L4 (ver ROLE_RANK en auth.php)
  privilegios  JSON         NULL,                      -- ["usuarios","archivos",...]
  state        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_usuario, id_sede),
  KEY idx_le_us_sede (id_sede),
  CONSTRAINT fk_le_us_usuario FOREIGN KEY (id_usuario) REFERENCES le_usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_le_us_sede    FOREIGN KEY (id_sede)    REFERENCES le_sedes(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS le_H_admin (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede     INT UNSIGNED NULL,
  id_usuario  INT UNSIGNED NOT NULL,       -- quién hizo la acción
  accion      VARCHAR(60)  NOT NULL,       -- ej. soporte_switch_sede, update_user_access, delete_x
  detalle     JSON         NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_le_hadmin_sede (id_sede, created_at),
  KEY idx_le_hadmin_usuario (id_usuario, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS le_notificaciones (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid         CHAR(36)     NOT NULL,
  id_sede      INT UNSIGNED NOT NULL,
  id_usuario   INT UNSIGNED NOT NULL,
  title        VARCHAR(200) NOT NULL,
  body         VARCHAR(1000) NOT NULL DEFAULT '',
  link         VARCHAR(500) NULL,          -- destino puntual dentro de la app (/modulo/123) o URL externa
  tag          VARCHAR(60)  NOT NULL DEFAULT 'general',
  icon         VARCHAR(500) NULL,
  image        VARCHAR(500) NULL,
  custom_data  JSON         NULL,
  is_read      TINYINT(1)   NOT NULL DEFAULT 0,
  read_at      DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_le_notif_uuid (uuid),
  KEY idx_le_notif_bandeja (id_usuario, id_sede, is_read, created_at),
  CONSTRAINT fk_le_notif_usuario FOREIGN KEY (id_usuario) REFERENCES le_usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_le_notif_sede    FOREIGN KEY (id_sede)    REFERENCES le_sedes(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Semilla: una empresa y una sede iniciales. Ningún usuario: el dueño se marca L5 por SQL después de su primer login.
INSERT IGNORE INTO le_empresas (id, nombre) VALUES (1, 'Empresa Principal');
INSERT IGNORE INTO le_sedes (id, id_empresa, nombre, codigo_invitacion) VALUES (1, 1, 'Sede Principal', 'SEED0001');
