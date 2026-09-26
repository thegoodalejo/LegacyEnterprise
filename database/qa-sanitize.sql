-- database/qa-sanitize.sql — saneo PROPIO de la app después de copiar PDN → QA (ver references/gitflow.md).
-- Lo ejecuta /opt/vps-tools/reset-qa-from-prod.sh en cada push a `qa`, DESPUÉS del saneo genérico
-- (fcm_token / auth_token_hash / auth_token / id_token ya quedan en NULL) y ANTES de las migraciones nuevas.
-- Reemplazar le_ por el prefijo de tablas. Debe ser idempotente y tolerar tablas que aún no existan en PDN.
--
-- Regla: todo lo que en QA podría escribirle a un cliente real o usar credenciales de producción.
-- Ejemplos reales (LegacyChats, refresh-qa-db.sh):
--   UPDATE le_whatsapp_numbers SET activo = 0, access_token = '', webhook_verify_token = '';
--   UPDATE le_campaigns SET estado = 'pausada' WHERE estado IN ('encolada','enviando','esperando_cupo');
--   UPDATE le_inbound_queue SET estado = 'fallido', error_detalle = 'QA: copia de PDN' WHERE estado IN ('pendiente','procesando');
--
-- Cada módulo agrega aquí su bloque (tolerante a tablas que aún no existan en PDN).

-- ─── CRM (migración 004): datos personales de contactos ─────────────────────────────────────────────────────────
-- QA es una copia de PDN: ningún correo, WhatsApp ni teléfono real debe sobrevivir (una prueba de envío llegaría a un
-- cliente de verdad). Se conservan nombres y documentos (sirven para probar búsquedas). Tolera que las tablas aún no
-- existan (primer deploy: PDN todavía no tiene la migración 004) y es idempotente.
DROP PROCEDURE IF EXISTS le_qa_sanitize_crm;
DELIMITER //
CREATE PROCEDURE le_qa_sanitize_crm()
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'crm_contactos') > 0 THEN
    UPDATE crm_contactos_personas
       SET correo = IF(correo IS NULL, NULL, CONCAT('persona', id, '@qa.invalid')),
           whatsapp_numero = IF(whatsapp_numero IS NULL, NULL, CONCAT('5550', LPAD(id, 6, '0')));
    UPDATE crm_contactos_organizaciones
       SET correo_facturacion = IF(correo_facturacion IS NULL, NULL, CONCAT('facturacion', id, '@qa.invalid'));
    UPDATE crm_contactos
       SET telefono = IF(telefono IS NULL, NULL, CONCAT('555', LPAD(id, 7, '0')));
    -- `busqueda` guarda copia de esos datos (para el buscador): se rearma con los ya enmascarados.
    UPDATE crm_contactos c
      LEFT JOIN crm_contactos_personas p ON p.id = c.id
      LEFT JOIN crm_contactos_organizaciones o ON o.id = c.id
       SET c.busqueda = LEFT(CONCAT_WS(' ', c.nombre_completo, COALESCE(p.correo, o.correo_facturacion), c.telefono,
                                       COALESCE(p.documento_numero, o.documento_numero), p.whatsapp_numero), 1000);
  END IF;
  -- Oportunidades (migración 005): las notas y descripciones son texto libre y pueden traer datos personales de un cliente real.
  IF (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'crm_oportunidades') > 0 THEN
    UPDATE crm_oportunidad_notas SET nota = CONCAT('Nota ', id);
    UPDATE crm_oportunidades SET descripcion = IF(descripcion IS NULL, NULL, CONCAT('Descripción de la oportunidad ', id));
  END IF;
  -- Metas (migración 007): la nota es texto libre.
  IF (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'crm_metas') > 0 THEN
    UPDATE crm_metas SET nota = IF(nota IS NULL, NULL, CONCAT('Nota de la meta ', id));
  END IF;
END//
DELIMITER ;
CALL le_qa_sanitize_crm();
DROP PROCEDURE le_qa_sanitize_crm;

-- ─── Comunicaciones (migraciones 010–014): WhatsApp ─────────────────────────────────────────────────────────────
-- Nada en QA debe escribirle a un cliente real ni usar credenciales de PDN: líneas y apps inactivas y sin secretos (además QA tiene otra
-- COM_SECRET_KEY: lo cifrado en PDN no se podría leer), cola del webhook vacía, campañas en curso pausadas. El contenido de las conversaciones
-- y los números de WhatsApp son datos personales: se enmascaran. Tolera que las tablas aún no existan en PDN.
DROP PROCEDURE IF EXISTS le_qa_sanitize_com;
DELIMITER //
CREATE PROCEDURE le_qa_sanitize_com()
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'com_lineas') > 0 THEN
    UPDATE com_lineas SET activo = 0, access_token_enc = NULL, token_ultimos4 = NULL, suscrita_at = NULL, verificada_at = NULL;
    UPDATE com_meta_apps SET activo = 0, app_secret_enc = NULL, verify_token_enc = NULL;
    -- Lo que Meta reportó en PDN (a dónde llegan los mensajes de cada número) no aplica a QA (migración 015).
    IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'com_lineas' AND column_name = 'webhook_numero') > 0 THEN
      UPDATE com_lineas SET webhook_numero = NULL, webhook_efectivo = NULL, webhook_revisado_at = NULL;
    END IF;
    DELETE FROM com_entrantes;
    UPDATE com_conversaciones SET wa_id = CONCAT('5550', LPAD(id, 8, '0')), nombre_perfil = IF(nombre_perfil IS NULL, NULL, CONCAT('Cliente ', id)),
                                  resumen = IF(resumen IS NULL, NULL, CONCAT('Mensaje ', id)), variables = NULL;
    UPDATE com_mensajes SET texto = IF(texto IS NULL, NULL, CONCAT('Mensaje ', id)), contenido = NULL, media_key = NULL, media_nombre = NULL
     WHERE origen <> 'sistema';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'crm_contacto_notas') > 0 THEN
    UPDATE crm_contacto_notas SET nota = CONCAT('Nota ', id);
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'com_campanas') > 0 THEN
    UPDATE com_campanas SET estado = 'pausada', motivo_pausa = 'QA: copia de PDN'
     WHERE estado IN ('programada', 'enviando', 'esperando_saldo', 'esperando_cupo');
    UPDATE com_campanas SET media_id = NULL, media_key = NULL;
    UPDATE com_campana_destinatarios SET wa_id = CONCAT('5551', LPAD(id, 8, '0')), nombre = CONCAT('Destinatario ', id);
    UPDATE com_bajas SET wa_id = CONCAT('5552', LPAD(id, 8, '0'));
    UPDATE com_enlaces SET destino = 'https://example.com/';
  END IF;
END//
DELIMITER ;
CALL le_qa_sanitize_com();
DROP PROCEDURE le_qa_sanitize_com;
