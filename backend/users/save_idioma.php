<?php
// Guarda el idioma preferido del usuario autenticado (es | en).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$u = requireAuth();
$idioma = $_POST['idioma'] ?? '';
if (!in_array($idioma, ['es', 'en'], true)) authFail(400, 'Idioma no soportado');

$conn = conectar();
$stmt = db_prepare_or_fail($conn, 'UPDATE le_usuarios SET idioma = ? WHERE id = ?');
$stmt->bind_param('si', $idioma, $u['id']);
$ok = $stmt->execute();
$stmt->close();
$conn->close();

echo json_encode(['action' => $ok, 'mensaje' => $ok ? 'Idioma guardado' : 'No se pudo guardar el idioma']);
