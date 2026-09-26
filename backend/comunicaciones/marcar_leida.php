<?php
// Marca la conversación como leída (no_leidos = 0) y avisa a WhatsApp que se leyó el último mensaje del cliente (palomitas azules).
// POST: id. El aviso a Meta es de mejor esfuerzo: si falla, no importa.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bandeja.php';

$ctx = comContext();
$conn = conectar();
$c = comConversacionAcceso($conn, $ctx, (int)($_POST['id'] ?? 0));
if ($c['no_leidos'] > 0) {
    crmExec($conn, 'UPDATE com_conversaciones SET no_leidos = 0 WHERE id = ?', 'i', [$c['id']]);
    $ultimo = crmRow($conn, "SELECT wa_message_id FROM com_mensajes WHERE id_conversacion = ? AND direccion = 'entrante' AND wa_message_id IS NOT NULL ORDER BY id DESC LIMIT 1",
        'i', [$c['id']]);
    $l = $ultimo ? comLinea($conn, $c['id_linea']) : null;
    if ($l && $l['token']) {
        comGraph('POST', '/' . $l['phone_number_id'] . '/messages', $l['token'], $l['graph_version'],
            ['messaging_product' => 'whatsapp', 'status' => 'read', 'message_id' => $ultimo['wa_message_id']], null, 8);
    }
}
$conn->close();
crmOk([]);
