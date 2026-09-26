<?php
// Cerrar una conversación (el asignado o L2+). POST: id, enviar_cierre (0|1, por defecto según los ajustes de la sede).
// Si la sede tiene mensaje de cierre y la ventana de 24 h sigue abierta, lo envía (si falla, igual se cierra). Si el cliente vuelve a escribir, se reabre.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bandeja.php';

$ctx = comContext();
$conn = conectar();
$c = comConversacionAcceso($conn, $ctx, (int)($_POST['id'] ?? 0), 'gestionar');
if ($c['estado'] === 'cerrada') { $conn->close(); crmOk([], 'Ya estaba cerrada'); }
$cfg = comConfigSede($conn, $ctx['id_sede']);
$enviar = isset($_POST['enviar_cierre']) ? $_POST['enviar_cierre'] === '1' : (bool)$cfg['enviar_texto_cierre'];
$aviso = null;
if ($enviar && $cfg['texto_cierre'] && comVentanaAbierta($c)) {
    $l = comLinea($conn, $c['id_linea']);
    $r = $l ? comEnviar($conn, $c, $l, ['origen' => 'sistema', 'payload' => comPayloadTexto($cfg['texto_cierre']), 'texto' => $cfg['texto_cierre'],
        'id_usuario' => $ctx['id_usuario']]) : ['ok' => false, 'error' => 'Línea inactiva'];
    if (!$r['ok']) $aviso = 'No se envió el mensaje de cierre: ' . $r['error'];
}
crmExec($conn, "UPDATE com_conversaciones SET estado = 'cerrada', cerrada_at = CURRENT_TIMESTAMP, cerrada_por = ?, id_flujo = NULL, nodo = NULL, no_leidos = 0,
                id_asignado = COALESCE(id_asignado, ?) WHERE id = ?", 'iii', [$ctx['id_usuario'], $ctx['id_usuario'], $c['id']]);
comNotaSistema($conn, $c, comNombreUsuario($conn, $ctx['id_usuario']) . ' cerró la conversación');
$conn->close();
crmOk(['aviso' => $aviso], $aviso ?? 'Conversación cerrada');
