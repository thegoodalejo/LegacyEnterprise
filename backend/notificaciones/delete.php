<?php
// Borra UNA notificación. Solo si es del usuario autenticado.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$u = requireAuth();
$uuid = $_POST['uuid'] ?? '';
if (!preg_match('/^[0-9a-f-]{36}$/', $uuid)) authFail(400, 'uuid inválido');

$conn = conectar();
$stmt = db_prepare_or_fail($conn, 'DELETE FROM le_notificaciones WHERE uuid = ? AND id_usuario = ?');
$stmt->bind_param('si', $uuid, $u['id']);
$stmt->execute();
$n = $stmt->affected_rows;
$stmt->close();
$conn->close();

echo json_encode(['action' => $n > 0, 'mensaje' => $n > 0 ? 'Notificación eliminada' : 'No se encontró la notificación']);
