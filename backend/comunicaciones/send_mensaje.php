<?php
// Enviar un texto desde la bandeja. POST: id_conversacion, texto (máx. 4096).
// Si la conversación estaba en la cola, en el chatbot o cerrada, quien escribe la toma (el chatbot se detiene). Solo dentro de la ventana de 24 h:
// fuera de ella se responde con una plantilla (send_plantilla.php). Sin créditos, no sale.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bandeja.php';

$ctx = comContext();
$texto = trim((string)($_POST['texto'] ?? ''));
if ($texto === '') authFail(400, 'Escribe un mensaje');
if (mb_strlen($texto) > COM_TEXTO_MAX) authFail(400, 'El mensaje es demasiado largo (máx. ' . COM_TEXTO_MAX . ' caracteres)');

$conn = conectar();
$c = comConversacionAcceso($conn, $ctx, (int)($_POST['id_conversacion'] ?? 0), 'escribir');
$l = comLinea($conn, $c['id_linea']);
if (!$l) authFail(409, 'La línea de esta conversación está inactiva');
if (!comVentanaAbierta($c)) authFail(409, 'Pasaron más de 24 h desde el último mensaje del cliente: responde con una plantilla');
if ($c['estado'] !== 'atencion') {
    comAsignar($conn, $c, $ctx['id_usuario'], comNombreUsuario($conn, $ctx['id_usuario']) . ' tomó la conversación');
    $c = comConversacionFila($conn, $c['id']);
}
$r = comEnviar($conn, $c, $l, ['origen' => 'asesor', 'payload' => comPayloadTexto($texto), 'texto' => $texto, 'id_usuario' => $ctx['id_usuario']]);
$msg = $r['id'] ? crmRow($conn, COM_SQL_MENSAJES . ' WHERE m.id = ?', 'i', [$r['id']]) : null;
$conn->close();
if (!$r['ok'] && !$msg) authFail($r['clase'] === 'sin_creditos' ? 402 : 409, $r['error']);
crmOk(['mensaje' => $msg ? comMensajePublico($msg) : null, 'ok' => $r['ok'], 'error' => $r['error']], $r['ok'] ? 'Enviado' : $r['error']);
