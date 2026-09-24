<?php
// Marca UNA notificación como leída. Solo si es del usuario autenticado.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$u = requireAuth();
$uuid = $_POST['uuid'] ?? '';
if (!preg_match('/^[0-9a-f-]{36}$/', $uuid)) authFail(400, 'uuid inválido');

$conn = conectar();
$stmt = db_prepare_or_fail($conn, 'UPDATE le_notificaciones SET is_read = 1, read_at = NOW() WHERE uuid = ? AND id_usuario = ? AND is_read = 0');
$stmt->bind_param('si', $uuid, $u['id']);
$ok = $stmt->execute();
$stmt->close();
$conn->close();

echo json_encode(['action' => $ok, 'mensaje' => $ok ? 'Marcada como leída' : 'No se pudo actualizar']);
