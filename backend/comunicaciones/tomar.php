<?php
// Tomar una conversación de la cola (o del chatbot): queda en atención asignada a quien la toma. POST: id.
// Una asignada a otra persona no se «toma»: se transfiere (transferir_conversacion.php).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bandeja.php';

$ctx = comContext();
$conn = conectar();
$c = comConversacionAcceso($conn, $ctx, (int)($_POST['id'] ?? 0), 'escribir');
if ($c['estado'] === 'atencion' && $c['id_asignado'] === $ctx['id_usuario']) { $conn->close(); crmOk([], 'Ya la atiendes'); }
if ($c['estado'] === 'atencion') authFail(409, 'La atiende ' . comNombreUsuario($conn, (int)$c['id_asignado']) . ': pide que te la transfiera');
comAsignar($conn, $c, $ctx['id_usuario'], comNombreUsuario($conn, $ctx['id_usuario']) . ' tomó la conversación');
$conn->close();
crmOk([], 'Conversación tomada');
