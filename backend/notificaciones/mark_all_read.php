<?php
// Marca como leídas TODAS las notificaciones del usuario en la sede activa.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$idSede = requireSede();
$idUsuario = $GLOBALS['authUser']['id'];

$conn = conectar();
$stmt = db_prepare_or_fail($conn, 'UPDATE le_notificaciones SET is_read = 1, read_at = NOW() WHERE id_usuario = ? AND id_sede = ? AND is_read = 0');
$stmt->bind_param('ii', $idUsuario, $idSede);
$ok = $stmt->execute();
$n = $stmt->affected_rows;
$stmt->close();
$conn->close();

echo json_encode(['action' => $ok, 'mensaje' => $ok ? "$n notificación(es) marcada(s) como leída(s)." : 'No se pudo actualizar', 'data' => ['updated' => $n]]);
