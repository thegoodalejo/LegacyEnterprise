<?php
// Guarda (o limpia con token vacío) el token de push del dispositivo del usuario autenticado.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$u = requireAuth();
$token = trim($_POST['fcm_token'] ?? '');
$token = $token !== '' ? substr($token, 0, 512) : null;

$conn = conectar();
$stmt = db_prepare_or_fail($conn, 'UPDATE le_usuarios SET fcm_token = ? WHERE id = ?');
$stmt->bind_param('si', $token, $u['id']);
$ok = $stmt->execute();
$stmt->close();
$conn->close();

echo json_encode(['action' => $ok, 'mensaje' => $ok ? 'Token guardado' : 'No se pudo guardar el token']);
