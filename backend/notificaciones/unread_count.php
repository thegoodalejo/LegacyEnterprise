<?php
// Contador de la campanita (no leídas de la sede activa).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$idSede = requireSede();
$idUsuario = $GLOBALS['authUser']['id'];

$conn = conectar();
$stmt = db_prepare_or_fail($conn, 'SELECT COUNT(*) AS n FROM le_notificaciones WHERE id_usuario = ? AND id_sede = ? AND is_read = 0');
$stmt->bind_param('ii', $idUsuario, $idSede);
$stmt->execute();
$n = (int)$stmt->get_result()->fetch_assoc()['n'];
$stmt->close();
$conn->close();

echo json_encode(['action' => true, 'mensaje' => 'OK', 'data' => ['count' => $n]]);
