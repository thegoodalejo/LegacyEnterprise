<?php
// Onboarding: el usuario se une a una sede con su código (o QR /onboarding?codigo=XXXX).
// Queda con rol 'Nuevo' y esa sede como activa; un L4 de la sede (o L5) le asigna acceso.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$u = requireAuth();
$codigo = strtoupper(trim($_POST['codigo'] ?? ''));
if (!preg_match('/^[A-Z0-9]{8}$/', $codigo)) authFail(400, 'Código inválido');

$conn = conectar();
$stmt = db_prepare_or_fail($conn, 'SELECT id, nombre FROM le_sedes WHERE codigo_invitacion = ? AND activo = 1 LIMIT 1');
$stmt->bind_param('s', $codigo);
$stmt->execute();
$sede = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$sede) {
    $conn->close();
    echo json_encode(['action' => false, 'mensaje' => 'El código no corresponde a ninguna sede activa']);
    exit;
}
$idSede = (int)$sede['id'];

// Un acceso desactivado por el admin de la sede no se reactiva con el código.
$chk = db_prepare_or_fail($conn, 'SELECT state FROM le_usuario_sedes WHERE id_usuario = ? AND id_sede = ?');
$chk->bind_param('ii', $u['id'], $idSede);
$chk->execute();
$prev = $chk->get_result()->fetch_assoc();
$chk->close();
if ($prev && (int)$prev['state'] !== 1) {
    $conn->close();
    echo json_encode(['action' => false, 'mensaje' => 'Tu acceso a esta sede está desactivado. Contacta al administrador.']);
    exit;
}

$conn->begin_transaction();
$ins = db_prepare_or_fail($conn,
    "INSERT INTO le_usuario_sedes (id_usuario, id_sede, rol, privilegios) VALUES (?, ?, 'Nuevo', JSON_ARRAY())
     ON DUPLICATE KEY UPDATE state = state");   // si ya existía (incluso desactivada) no se toca su rol
$ins->bind_param('ii', $u['id'], $idSede);
$ok1 = $ins->execute();
$ins->close();

$upd = db_prepare_or_fail($conn, 'UPDATE le_usuarios SET id_sede_activa = ? WHERE id = ?');
$upd->bind_param('ii', $idSede, $u['id']);
$ok2 = $upd->execute();
$upd->close();

if ($ok1 && $ok2) {
    auditAdmin($conn, 'join_sede', ['codigo' => $codigo], $idSede);
    $conn->commit();
} else {
    $conn->rollback();
}
$conn->close();

unset($GLOBALS['authUser']);
echo json_encode([
    'action'  => $ok1 && $ok2,
    'mensaje' => $ok1 && $ok2 ? 'Te uniste a ' . $sede['nombre'] : 'No se pudo unir a la sede',
    'data'    => $ok1 && $ok2 ? sessionPayload() : null,
]);
