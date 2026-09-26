<?php
// Transferir una conversación a otra persona con acceso al módulo, o devolverla a la cola. POST: id, id_usuario (destino) | a_cola (1).
// Quién: el asignado o L2+. Avisa (campanita + push) a quien la recibe.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bandeja.php';

$ctx = comContext();
$aCola = ($_POST['a_cola'] ?? '0') === '1';
$destino = (int)($_POST['id_usuario'] ?? 0);
$conn = conectar();
$c = comConversacionAcceso($conn, $ctx, (int)($_POST['id'] ?? 0), 'gestionar');
if ($c['estado'] === 'cerrada') authFail(409, 'La conversación está cerrada');
$yo = comNombreUsuario($conn, $ctx['id_usuario']);

if ($aCola) {
    crmExec($conn, "UPDATE com_conversaciones SET estado = 'cola', id_asignado = NULL, asignada_at = NULL WHERE id = ?", 'i', [$c['id']]);
    comNotaSistema($conn, $c, "$yo devolvió la conversación a la cola");
    $conn->close();
    crmOk([], 'Devuelta a la cola');
}
if ($destino <= 0 || !comUsuarioTieneModulo($conn, $ctx['id_sede'], $destino)) authFail(400, 'Elige a una persona con acceso a Comunicaciones en esta sede');
if ($destino === $c['id_asignado']) authFail(409, 'Ya la atiende esa persona');
$nombreDestino = comNombreUsuario($conn, $destino);
comAsignar($conn, $c, $destino, "$yo transfirió la conversación a $nombreDestino");
$quien = $c['id_contacto'] ? (crmRow($conn, 'SELECT nombre_completo FROM crm_contactos WHERE id = ?', 'i', [$c['id_contacto']])['nombre_completo'] ?? null) : null;
notifyUser($conn, $ctx['id_sede'], $destino, 'Te transfirieron una conversación', "$yo te transfirió la conversación con " . ($quien ?: '+' . $c['wa_id']) . '.',
    '/m/comunicaciones/bandeja?c=' . $c['id'], 'com_transferencia', ['id_conversacion' => $c['id']]);
$conn->close();
crmOk([], 'Conversación transferida');
