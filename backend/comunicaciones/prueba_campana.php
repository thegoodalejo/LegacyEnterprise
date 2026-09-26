<?php
// Envío de prueba de una campaña a UN contacto de la sede (L2+): el mismo mensaje que recibirán los destinatarios. Consume créditos como cualquier envío.
// POST: id, id_contacto (Persona con WhatsApp).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_campanas.php';

$ctx = comContext();
requireRole('L2');
$conn = conectar();
$c = comCampana($conn, $ctx['id_sede'], (int)($_POST['id'] ?? 0));
if (!$c) authFail(404, 'Campaña no encontrada');
$tpl = crmRow($conn, 'SELECT * FROM com_plantillas WHERE id = ?', 'i', [(int)$c['id_plantilla']]);
$linea = comLinea($conn, (int)$c['id_linea'], $ctx['id_sede']);
if (!$linea) authFail(409, 'La línea está inactiva');
comCampanaValidar($conn, $ctx, $c, $tpl, $linea);
$p = crmRow($conn, "SELECT c.id, c.nombre_completo, p.whatsapp_e164 FROM crm_contactos c JOIN crm_contactos_personas p ON p.id = c.id WHERE c.id = ? AND c.id_sede = ? AND c.activo = 1",
    'ii', [(int)($_POST['id_contacto'] ?? 0), $ctx['id_sede']]);
if (!$p || !$p['whatsapp_e164']) authFail(400, 'Elige una Persona de la sede con WhatsApp');
$saldo = comPuedeEnviar($conn, $ctx['id_sede'], strtolower((string)($tpl['categoria'] ?? $tpl['categoria_solicitada'])));
if (!$saldo['ok']) authFail(402, 'Sin créditos suficientes para la prueba');
$r = comCampanaEnviarUno($conn, $c, $tpl, $linea, ['id_contacto' => (int)$p['id'], 'wa_id' => $p['whatsapp_e164']], true);
$conn->close();
if (!$r['ok']) authFail(409, 'No se envió la prueba: ' . $r['error']);
crmOk(['id_mensaje' => $r['id']], 'Prueba enviada a ' . $p['nombre_completo']);
