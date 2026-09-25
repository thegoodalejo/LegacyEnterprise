-- dev-seed-crm.sql — SOLO DESARROLLO LOCAL. No es migración: el CI solo despliega database/migrations/ y qa-sanitize.sql.
-- NUNCA correr en QA ni en producción: crea usuarios con tokens conocidos.
-- Requiere las migraciones 001–004 y MariaDB (usa el motor SEQUENCE). Idempotente (INSERT IGNORE con ids fijos).
-- Todos los datos son FICTICIOS (el repo es público). Uso:
--   mariadb -u… --default-character-set=utf8mb4 <bd> < database/dev-seed-crm.sql
--
-- Login de prueba (frontend en dev): window.__leDev.login('<token>') con:
--   dev-token-l5      plataforma (L5)                  dev-token-l2     L2, privilegio crm (archiva, ve historial)
--   dev-token-l4      admin de empresa (L4, configura)  dev-token-l1     L1, privilegio crm (sin archivar ni historial)
--   dev-token-nocrm   L1 sin privilegio crm (403)       dev-token-otro   L4 de OTRA empresa/sede (aislamiento)
-- Configuración de demostración de los tres pilotos: pinturas B2B (organización con NIT y zona), plantas de agua
-- (organización con área y capacidad) y clínica estética (personas con talla y peso).

SET NAMES utf8mb4;

-- Guarda: se niega a correr en una BD cuyo nombre contenga «prod» o «qa» (crea usuarios con tokens conocidos, incluido un L5).
DROP PROCEDURE IF EXISTS le_seed_guard;
DELIMITER //
CREATE PROCEDURE le_seed_guard()
BEGIN
  IF DATABASE() LIKE '%prod%' OR DATABASE() LIKE '%qa%' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'dev-seed-crm.sql es solo para desarrollo local: no correr en QA ni en produccion';
  END IF;
END//
DELIMITER ;
CALL le_seed_guard();
DROP PROCEDURE le_seed_guard;

-- ─── Otra empresa y sede (pruebas de aislamiento) ────────────────────────────────────────────────────────────────
INSERT IGNORE INTO le_empresas (id, nombre) VALUES (2, 'Otra Empresa Dev');
INSERT IGNORE INTO le_sedes (id, id_empresa, nombre, codigo_invitacion) VALUES (2, 2, 'Sede Otra Dev', 'DEVSEDE2');
INSERT IGNORE INTO le_sede_modulos (id_sede, codigo_modulo, notas) VALUES (2, 'crm', 'Dev');

-- ─── Usuarios de prueba ──────────────────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO le_usuarios (id, firebase_uid, email, nombre, auth_token_hash, is_platform_admin, id_sede_activa) VALUES
  (10, 'dev-uid-l5',    'l5@dev.test',    'Dev Plataforma L5', SHA2('dev-token-l5', 256),    1, 1),
  (11, 'dev-uid-l4',    'l4@dev.test',    'Dev Admin L4',      SHA2('dev-token-l4', 256),    0, 1),
  (12, 'dev-uid-l2',    'l2@dev.test',    'Dev Supervisor L2', SHA2('dev-token-l2', 256),    0, 1),
  (13, 'dev-uid-l1',    'l1@dev.test',    'Dev Vendedor L1',   SHA2('dev-token-l1', 256),    0, 1),
  (14, 'dev-uid-nocrm', 'nocrm@dev.test', 'Dev Sin CRM',       SHA2('dev-token-nocrm', 256), 0, 1),
  (15, 'dev-uid-otro',  'otro@dev.test',  'Dev Otra Empresa',  SHA2('dev-token-otro', 256),  0, 2);
INSERT IGNORE INTO le_usuario_sedes (id_usuario, id_sede, rol, privilegios) VALUES
  (11, 1, 'L4', NULL), (12, 1, 'L2', '["crm"]'), (13, 1, 'L1', '["crm"]'), (14, 1, 'L1', '[]'), (15, 2, 'L4', NULL);

-- ─── Campos personalizados (empresa 1) ───────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO crm_campos_personalizados (id, id_empresa, aplica_a, clave, etiqueta, tipo_dato, obligatorio, orden, created_by, updated_by) VALUES
  (1,  1, 'persona',      'peso_kg',          'Peso (kg)',         'decimal',  0, 1, 11, 11),
  (2,  1, 'persona',      'talla',            'Talla',             'texto',    0, 2, 11, 11),
  (3,  1, 'persona',      'num_hijos',        'Número de hijos',   'entero',   0, 3, 11, 11),
  (4,  1, 'persona',      'acepta_marketing', 'Acepta marketing',  'booleano', 0, 4, 11, 11),
  (5,  1, 'persona',      'ultima_visita',    'Última visita',     'fecha',    0, 5, 11, 11),
  (6,  1, 'organizacion', 'area_m2',          'Área (m²)',         'decimal',  0, 1, 11, 11),
  (7,  1, 'organizacion', 'zona_comercial',   'Zona comercial',    'texto',    0, 2, 11, 11),
  (8,  1, 'organizacion', 'capacidad_lps',    'Capacidad (L/s)',   'entero',   0, 3, 11, 11),
  (9,  1, 'organizacion', 'es_franquicia',    'Es franquicia',     'booleano', 0, 4, 11, 11),
  (10, 1, 'organizacion', 'fecha_apertura',   'Fecha de apertura', 'fecha',    0, 5, 11, 11);

-- ─── Etiquetas (empresa 1; el tag 9 es de la empresa 2 para probar aislamiento) ─────────────────────────────────
INSERT IGNORE INTO crm_tags_grupos (id, id_empresa, nombre, orden, created_by, updated_by) VALUES
  (1, 1, 'Zona', 1, 11, 11), (2, 1, 'Prioridad', 2, 11, 11), (3, 2, 'Grupo ajeno', 1, 15, 15);
INSERT IGNORE INTO crm_tags (id, id_empresa, id_grupo, nombre, color, aplica_a, orden, created_by, updated_by) VALUES
  (1, 1, 1,    'Norte',    '#1E88E5', 'organizacion', 1, 11, 11),
  (2, 1, 1,    'Sur',      '#43A047', 'organizacion', 2, 11, 11),
  (3, 1, 1,    'Centro',   '#FB8C00', 'organizacion', 3, 11, 11),
  (4, 1, 2,    'Alta',     '#E53935', NULL,           1, 11, 11),
  (5, 1, 2,    'Media',    '#FDD835', NULL,           2, 11, 11),
  (6, 1, 2,    'Baja',     '#90A4AE', NULL,           3, 11, 11),
  (7, 1, NULL, 'VIP',      '#8E24AA', NULL,           1, 11, 11),
  (8, 1, NULL, 'Alérgico', '#D81B60', 'persona',      2, 11, 11),
  (9, 2, 3,    'Ajena',    '#000000', NULL,           1, 15, 15);

-- ─── Roles de vínculo (empresa 1) ────────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO crm_roles_vinculo (id, id_empresa, nombre, orden, created_by, updated_by) VALUES
  (1, 1, 'Dueño', 1, 11, 11), (2, 1, 'Compras', 2, 11, 11), (3, 1, 'Administrador', 3, 11, 11), (4, 1, 'Contabilidad', 4, 11, 11);

-- ─── 60 personas ficticias (ids 1001–1060) ───────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO crm_contactos (id, id_sede, tipo, nombre_completo, direccion, ciudad, telefono, id_responsable, activo, busqueda, created_at, created_by, updated_at, updated_by)
SELECT 1000 + seq, 1, 'persona', CONCAT(nom, ' ', ape),
       CONCAT('Calle ', seq, ' # ', 10 + (seq % 40), '-', seq % 90),
       ELT(1 + (seq % 5), 'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga'),
       CONCAT('300', LPAD(1000000 + (seq * 1379) % 9000000, 7, '0')),
       ELT(1 + (seq % 3), 11, 12, NULL),
       IF(seq % 17 = 0, 0, 1),
       CONCAT_WS(' ', CONCAT(nom, ' ', ape), CONCAT('persona', seq, '@example.test'),
                 CONCAT('300', LPAD(1000000 + (seq * 1379) % 9000000, 7, '0')),
                 CONCAT('10', LPAD((seq * 7919) % 100000000, 8, '0'))),
       NOW() - INTERVAL seq DAY, ELT(1 + (seq % 2), 11, 12), NOW() - INTERVAL seq DAY, 11
  FROM (SELECT seq,
               ELT(1 + (seq % 12), 'José', 'María', 'Andrés', 'Ángela', 'Sofía', 'Camilo', 'Valentina', 'Juan', 'Laura', 'Nicolás', 'Daniela', 'Sebastián') AS nom,
               ELT(1 + (seq % 9), 'García', 'Rodríguez', 'Martínez', 'López', 'Gómez', 'Pérez', 'Sánchez', 'Ramírez', 'Torres') AS ape
          FROM seq_1_to_60) x;

INSERT IGNORE INTO crm_contactos_personas (id, nombres, apellidos, documento_tipo, documento_numero, correo, whatsapp_indicativo, whatsapp_numero, fecha_nacimiento, created_by, updated_by)
SELECT 1000 + seq, nom, ape, 'CC', CONCAT('10', LPAD((seq * 7919) % 100000000, 8, '0')), CONCAT('persona', seq, '@example.test'),
       '57', CONCAT('300', LPAD(1000000 + (seq * 1379) % 9000000, 7, '0')), CURDATE() - INTERVAL (20 + seq % 40) YEAR, 11, 11
  FROM (SELECT seq,
               ELT(1 + (seq % 12), 'José', 'María', 'Andrés', 'Ángela', 'Sofía', 'Camilo', 'Valentina', 'Juan', 'Laura', 'Nicolás', 'Daniela', 'Sebastián') AS nom,
               ELT(1 + (seq % 9), 'García', 'Rodríguez', 'Martínez', 'López', 'Gómez', 'Pérez', 'Sánchez', 'Ramírez', 'Torres') AS ape
          FROM seq_1_to_60) x;

-- ─── 20 organizaciones ficticias (ids 2001–2020) ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO crm_contactos (id, id_sede, tipo, nombre_completo, direccion, ciudad, telefono, id_responsable, activo, busqueda, created_at, created_by, updated_at, updated_by)
SELECT 2000 + seq, 1, 'organizacion', rs,
       CONCAT('Carrera ', seq, ' # ', 20 + seq, '-', seq * 3),
       ELT(1 + (seq % 5), 'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga'),
       CONCAT('601', LPAD(2000000 + (seq * 4231) % 7000000, 7, '0')),
       ELT(1 + (seq % 3), 11, 12, NULL),
       IF(seq % 9 = 0, 0, 1),
       CONCAT_WS(' ', rs, CONCAT('facturacion', seq, '@example.test'), CONCAT('601', LPAD(2000000 + (seq * 4231) % 7000000, 7, '0')),
                 CONCAT('900', LPAD((seq * 104729) % 1000000, 6, '0'), '-', seq % 10)),
       NOW() - INTERVAL (seq * 2) DAY, 11, NOW() - INTERVAL (seq * 2) DAY, 11
  FROM (SELECT seq, CONCAT(ELT(1 + (seq % 5), 'Pinturas El Arcoíris', 'Distribuidora Norte', 'Planta de Agua La Esperanza', 'Franquicia ColorMax', 'Mantenimiento Hídrico'), ' ', seq) AS rs
          FROM seq_1_to_20) x;

INSERT IGNORE INTO crm_contactos_organizaciones (id, razon_social, documento_tipo, documento_numero, correo_facturacion, id_padre, created_by, updated_by)
SELECT 2000 + seq, rs, 'NIT', CONCAT('900', LPAD((seq * 104729) % 1000000, 6, '0'), '-', seq % 10), CONCAT('facturacion', seq, '@example.test'),
       IF(seq BETWEEN 11 AND 15, 2000 + seq - 10, NULL), 11, 11
  FROM (SELECT seq, CONCAT(ELT(1 + (seq % 5), 'Pinturas El Arcoíris', 'Distribuidora Norte', 'Planta de Agua La Esperanza', 'Franquicia ColorMax', 'Mantenimiento Hídrico'), ' ', seq) AS rs
          FROM seq_1_to_20) x;

-- Cada organización con su persona principal; las 10 primeras, además una segunda (contabilidad).
INSERT IGNORE INTO crm_contacto_vinculos (id_organizacion, id_persona, id_rol, principal, created_by, updated_by)
SELECT 2000 + seq, 1000 + seq, 1 + (seq % 3), 1, 11, 11 FROM seq_1_to_20;
INSERT IGNORE INTO crm_contacto_vinculos (id_organizacion, id_persona, id_rol, principal, created_by, updated_by)
SELECT 2000 + seq, 1020 + seq, 4, 0, 11, 11 FROM seq_1_to_10;

-- ─── Valores de campos personalizados ────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO crm_campos_valores (id_contacto, id_campo, valor_decimal, created_by, updated_by) SELECT 1000 + seq, 1, 50 + (seq % 40) + 0.5, 11, 11 FROM seq_1_to_40;
INSERT IGNORE INTO crm_campos_valores (id_contacto, id_campo, valor_texto,   created_by, updated_by) SELECT 1000 + seq, 2, ELT(1 + (seq % 4), 'S', 'M', 'L', 'XL'), 11, 11 FROM seq_1_to_40;
INSERT IGNORE INTO crm_campos_valores (id_contacto, id_campo, valor_entero,  created_by, updated_by) SELECT 1000 + seq, 3, seq % 4, 11, 11 FROM seq_1_to_40;
INSERT IGNORE INTO crm_campos_valores (id_contacto, id_campo, valor_booleano, created_by, updated_by) SELECT 1000 + seq, 4, seq % 2, 11, 11 FROM seq_1_to_40;
INSERT IGNORE INTO crm_campos_valores (id_contacto, id_campo, valor_fecha,   created_by, updated_by) SELECT 1000 + seq, 5, CURDATE() - INTERVAL (seq * 3) DAY, 11, 11 FROM seq_1_to_40;
INSERT IGNORE INTO crm_campos_valores (id_contacto, id_campo, valor_decimal, created_by, updated_by) SELECT 2000 + seq, 6, 100 + seq * 37.25, 11, 11 FROM seq_1_to_20;
INSERT IGNORE INTO crm_campos_valores (id_contacto, id_campo, valor_texto,   created_by, updated_by) SELECT 2000 + seq, 7, ELT(1 + (seq % 3), 'Norte', 'Sur', 'Centro'), 11, 11 FROM seq_1_to_20;
INSERT IGNORE INTO crm_campos_valores (id_contacto, id_campo, valor_entero,  created_by, updated_by) SELECT 2000 + seq, 8, 10 + seq * 5, 11, 11 FROM seq_1_to_20;
INSERT IGNORE INTO crm_campos_valores (id_contacto, id_campo, valor_booleano, created_by, updated_by) SELECT 2000 + seq, 9, seq % 2, 11, 11 FROM seq_1_to_20;
INSERT IGNORE INTO crm_campos_valores (id_contacto, id_campo, valor_fecha,   created_by, updated_by) SELECT 2000 + seq, 10, CURDATE() - INTERVAL (seq * 40) DAY, 11, 11 FROM seq_1_to_20;

-- ─── Etiquetas asignadas ─────────────────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO crm_contacto_tags (id_contacto, id_tag, created_by) SELECT 1000 + seq, 7, 11 FROM seq_1_to_60 WHERE seq % 7 = 0;           -- VIP
INSERT IGNORE INTO crm_contacto_tags (id_contacto, id_tag, created_by) SELECT 1000 + seq, 4, 11 FROM seq_1_to_60 WHERE seq % 5 = 0;           -- Alta
INSERT IGNORE INTO crm_contacto_tags (id_contacto, id_tag, created_by) SELECT 1000 + seq, 5, 11 FROM seq_1_to_60 WHERE seq % 5 = 1;           -- Media
INSERT IGNORE INTO crm_contacto_tags (id_contacto, id_tag, created_by) SELECT 1000 + seq, 8, 11 FROM seq_1_to_60 WHERE seq % 11 = 0;          -- Alérgico
INSERT IGNORE INTO crm_contacto_tags (id_contacto, id_tag, created_by) SELECT 2000 + seq, 1 + (seq % 3), 11 FROM seq_1_to_20;                -- zona
INSERT IGNORE INTO crm_contacto_tags (id_contacto, id_tag, created_by) SELECT 2000 + seq, 4, 11 FROM seq_1_to_20 WHERE seq % 4 = 0;          -- Alta

-- ─── Un contacto de la sede 2 (aislamiento) ──────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO crm_contactos (id, id_sede, tipo, nombre_completo, ciudad, telefono, busqueda, created_by, updated_by)
  VALUES (3001, 2, 'persona', 'Persona Ajena', 'Quito', '3009999999', 'Persona Ajena 3009999999', 15, 15);
INSERT IGNORE INTO crm_contactos_personas (id, nombres, apellidos, created_by, updated_by) VALUES (3001, 'Persona', 'Ajena', 15, 15);
INSERT IGNORE INTO crm_contacto_tags (id_contacto, id_tag, created_by) VALUES (3001, 9, 15);

-- ─── Historial inicial: una fila "creado" por contacto sembrado ──────────────────────────────────────────────────
INSERT INTO le_H_registros (id_sede, modulo, tabla, id_registro, id_usuario, accion, detalle, created_at)
SELECT c.id_sede, 'crm', 'crm_contactos', c.id, 11, 'creado', JSON_OBJECT('tipo', c.tipo, 'nombre', c.nombre_completo, 'origen', 'dev-seed'), c.created_at
  FROM crm_contactos c
 WHERE c.id BETWEEN 1001 AND 3001
   AND NOT EXISTS (SELECT 1 FROM le_H_registros h WHERE h.modulo = 'crm' AND h.tabla = 'crm_contactos' AND h.id_registro = c.id AND h.accion = 'creado');
