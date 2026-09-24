<?php
// Cambia la sede activa. L5 entra a cualquier sede sin membresía (soporte) y queda auditado;
// el resto solo a sedes con acceso activo. Devuelve la sesión nueva.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$u = requireAuth();
$idSede = (int)($_POST['id_sede'] ?? 0);
if ($idSede <= 0) authFail(400, 'id_sede requerido');

$conn = conectar();

if ($u['is_platform_admin']) {
    $stmt = db_prepare_or_fail($conn, 'SELECT id, nombre FROM le_sedes WHERE id = ?');
    $stmt->bind_param('i', $idSede);
} else {
    $stmt = db_prepare_or_fail($conn,
        'SELECT s.id, s.nombre FROM le_usuario_sedes us JOIN le_sedes s ON s.id = us.id_sede
          WHERE us.id_usuario = ? AND us.id_sede = ? AND us.state = 1 AND s.activo = 1');
    $stmt->bind_param('ii', $u['id'], $idSede);
}
$stmt->execute();
$sede = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$sede) {
    $conn->close();
    echo json_encode(['action' => false, 'mensaje' => 'No tienes acceso a esa sede']);
    exit;
}

$upd = db_prepare_or_fail($conn, 'UPDATE le_usuarios SET id_sede_activa = ? WHERE id = ?');
$upd->bind_param('ii', $idSede, $u['id']);
$ok = $upd->execute();
$upd->close();

if ($ok && $u['is_platform_admin']) {
    auditAdmin($conn, 'soporte_switch_sede', ['desde' => $u['id_sede'], 'hacia' => $idSede], $idSede);
}
$conn->close();

unset($GLOBALS['authUser']);
echo json_encode([
    'action'  => $ok,
    'mensaje' => $ok ? 'Ahora estás en ' . $sede['nombre'] : 'No se pudo cambiar de sede',
    'data'    => $ok ? sessionPayload() : null,
]);
