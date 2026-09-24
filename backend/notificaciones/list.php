<?php
// Notificaciones del usuario en la sede activa, más recientes primero. Paginación con 'before' (id).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$idSede = requireSede();
$idUsuario = $GLOBALS['authUser']['id'];
$before = (int)($_POST['before'] ?? 0);
$limit = min(100, max(1, (int)($_POST['limit'] ?? 50)));

$conn = conectar();
$stmt = db_prepare_or_fail($conn,
    'SELECT id, uuid, title, body, link, tag, icon, image, custom_data, is_read, created_at
       FROM le_notificaciones
      WHERE id_usuario = ? AND id_sede = ? AND (? = 0 OR id < ?)
   ORDER BY id DESC
      LIMIT ?');
$stmt->bind_param('iiiii', $idUsuario, $idSede, $before, $before, $limit);
$stmt->execute();
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();
$conn->close();

foreach ($rows as &$r) {
    $r['id'] = (int)$r['id'];
    $r['is_read'] = (int)$r['is_read'] === 1;
    $r['custom_data'] = $r['custom_data'] ? json_decode($r['custom_data'], true) : null;
}

echo json_encode(['action' => true, 'mensaje' => 'OK', 'data' => $rows]);
