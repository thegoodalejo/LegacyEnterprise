-- 002_modulos.sql — módulos de la suite y su contratación por sede.
-- Idempotente. Un módulo está disponible en una sede si:
--   le_modulos.activo = 1  (interruptor global de plataforma)
--   y existe le_sede_modulos(activo = 1) con la fecha de hoy dentro de [fecha_inicio, fecha_fin] (NULL = sin límite).
-- Lo administra SOLO L5 (según lo contratado). El acceso de cada usuario al módulo lo gatea después la
-- sede: L4 ve todos los módulos habilitados; L0–L3 necesitan el privilegio con el código del módulo.

-- Catálogo. El ícono, color y navegación de cada módulo viven en el frontend (app-modules.ts);
-- aquí solo lo que el backend necesita para decidir acceso.
CREATE TABLE IF NOT EXISTS le_modulos (
  codigo      VARCHAR(30)  NOT NULL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  orden       SMALLINT     NOT NULL DEFAULT 0,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contrato de módulos por sede.
CREATE TABLE IF NOT EXISTS le_sede_modulos (
  id_sede        INT UNSIGNED NOT NULL,
  codigo_modulo  VARCHAR(30)  NOT NULL,
  activo         TINYINT(1)   NOT NULL DEFAULT 1,
  fecha_inicio   DATE         NULL,               -- NULL = desde siempre
  fecha_fin      DATE         NULL,               -- NULL = sin vencimiento
  notas          VARCHAR(255) NULL,               -- p.ej. número de contrato / plan
  updated_by     INT UNSIGNED NULL,               -- L5 que hizo el último cambio
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_sede, codigo_modulo),
  KEY idx_le_sm_modulo (codigo_modulo),
  CONSTRAINT fk_le_sm_sede   FOREIGN KEY (id_sede)       REFERENCES le_sedes(id)      ON DELETE CASCADE,
  CONSTRAINT fk_le_sm_modulo FOREIGN KEY (codigo_modulo) REFERENCES le_modulos(codigo) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO le_modulos (codigo, nombre, orden) VALUES
  ('crm',           'CRM',           10),
  ('agenda',        'Agenda',        20),
  ('servicios',     'Servicios',     30),
  ('pedidos',       'Pedidos',       40),
  ('integraciones', 'Integraciones', 50),
  ('gerencia',      'Gerencia',      60);

-- La sede semilla arranca con todo habilitado (demo del dueño). Las sedes nuevas nacen sin módulos.
INSERT IGNORE INTO le_sede_modulos (id_sede, codigo_modulo, notas)
  SELECT 1, codigo, 'Semilla' FROM le_modulos;
