-- dev-seed-comunicaciones.sql — SOLO DESARROLLO LOCAL (después de dev-seed-crm.sql). No es migración: el CI no lo despliega.
-- NUNCA correr en QA ni en producción: crea usuarios con tokens conocidos. Todos los datos son FICTICIOS (el repo es público).
--
-- Sede 3 «Sede Solo Comunicaciones» (empresa 1): solo el módulo comunicaciones (un cliente que compró solo el chatbot).
-- Login de prueba (frontend en dev): window.__leDev.login('<token>') con:
--   dev-token-com-l4   L4 de la sede 3 (configura, transfiere créditos)
--   dev-token-com-l2   L2 de la sede 3, privilegio comunicaciones (plantillas, campañas, chatbot)
--   dev-token-com-l1   L1 de la sede 3, privilegio comunicaciones (bandeja)
--   dev-token-l1com    L1 de la sede 1 (CRM + Comunicaciones) con privilegio comunicaciones y SIN crm
-- La sede 1 ya tiene comunicaciones (migración 010, sede semilla).

SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS le_seed_guard;
DELIMITER //
CREATE PROCEDURE le_seed_guard()
BEGIN
  IF DATABASE() LIKE '%prod%' OR DATABASE() LIKE '%qa%' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'dev-seed-comunicaciones.sql es solo para desarrollo local: no correr en QA ni en produccion';
  END IF;
END//
DELIMITER ;
CALL le_seed_guard();
DROP PROCEDURE le_seed_guard;

INSERT IGNORE INTO le_sedes (id, id_empresa, nombre, codigo_invitacion) VALUES (3, 1, 'Sede Solo Comunicaciones', 'DEVSEDE3');
INSERT IGNORE INTO le_sede_modulos (id_sede, codigo_modulo, notas) VALUES (3, 'comunicaciones', 'Dev');

INSERT IGNORE INTO le_usuarios (id, firebase_uid, email, nombre, auth_token_hash, is_platform_admin, id_sede_activa) VALUES
  (20, 'dev-uid-com-l4', 'com-l4@dev.test', 'Dev Comunicaciones L4', SHA2('dev-token-com-l4', 256), 0, 3),
  (21, 'dev-uid-com-l2', 'com-l2@dev.test', 'Dev Comunicaciones L2', SHA2('dev-token-com-l2', 256), 0, 3),
  (22, 'dev-uid-com-l1', 'com-l1@dev.test', 'Dev Asesora L1',        SHA2('dev-token-com-l1', 256), 0, 3),
  (23, 'dev-uid-l1com',  'l1com@dev.test',  'Dev Asesor Sede 1',     SHA2('dev-token-l1com', 256),  0, 1);
INSERT IGNORE INTO le_usuario_sedes (id_usuario, id_sede, rol, privilegios) VALUES
  (20, 3, 'L4', NULL), (21, 3, 'L2', '["comunicaciones"]'), (22, 3, 'L1', '["comunicaciones"]'), (23, 1, 'L1', '["comunicaciones"]');

-- Contactos de la sede 3 (dos con WhatsApp: los reconoce un mensaje entrante).
INSERT IGNORE INTO crm_contactos (id, id_sede, tipo, nombre_completo, ciudad, activo, busqueda, created_by, updated_by) VALUES
  (9001, 3, 'persona', 'Lucía Fernández', 'Bogotá', 1, 'Lucía Fernández 3001112233 573001112233', 20, 20),
  (9002, 3, 'persona', 'Tomás Rivera', 'Medellín', 1, 'Tomás Rivera 3002223344 573002223344', 20, 20),
  (9003, 3, 'persona', 'Sofía Castro', 'Cali', 1, 'Sofía Castro', 20, 20);
INSERT IGNORE INTO crm_contactos_personas (id, nombres, apellidos, whatsapp_indicativo, whatsapp_numero, created_by, updated_by) VALUES
  (9001, 'Lucía', 'Fernández', '57', '3001112233', 20, 20),
  (9002, 'Tomás', 'Rivera', '57', '3002223344', 20, 20),
  (9003, 'Sofía', 'Castro', NULL, NULL, 20, 20);
INSERT IGNORE INTO crm_contacto_tags (id_contacto, id_tag, created_by) VALUES (9001, 7, 20);
