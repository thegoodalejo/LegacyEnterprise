<?php
// Cambia rol, privilegios y/o estado de un usuario EN LA SEDE ACTIVA.
// Reglas: L4 (o privilegio 'usuarios') gestiona su sede, sin asignar un rol >= al suyo ni tocar a
// alguien de su mismo rango o superior; L5 puede todo. Nadie se edita a sí mismo. L5 no se asigna aquí.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$idSede = requireSede();
$me = $GLOBALS['authUser'];
if (roleRank($me['rol']) < roleRank('L4') && !hasPrivilege('usuarios')) authFail(403, 'Sin acceso');

$idUsuario = (int)($_POST['id_usuario'] ?? 0);
$rol       = $_POST['rol'] ?? null;
$privs     = $_POST['privilegios'] ?? null;          // JSON string desde FormData
$state     = isset($_POST['state']) ? ((int)$_POST['state'] === 1 ? 1 : 0) : null;

if ($idUsuario <= 0) authFail(400, 'id_usuario requerido');
if ($idUsuario === $me['id']) authFail(400, 'No puedes cambiar tu propio acceso');
if ($rol !== null && (!isset(ROLE_RANK[$rol]) || $rol === 'L5')) authFail(400, 'Rol inválido');

if ($privs !== null) {
    if (is_string($privs)) $privs = json_decode($privs, true) ?? [];
    $privs = array_values(array_intersect(array_map('strval', (array)$privs), PRIVILEGES));
}

$conn = conectar();
$cur = db_prepare_or_fail($conn, 'SELECT rol, privilegios, state FROM le_usuario_sedes WHERE id_usuario = ? AND id_sede = ?');
$cur->bind_param('ii', $idUsuario, $idSede);
$cur->execute();
$actual = $cur->get_result()->fetch_assoc();
$cur->close();
if (!$actual) { $conn->close(); authFail(404, 'El usuario no pertenece a esta sede'); }

if (!$me['is_platform_admin']) {
    $miRango = roleRank($me['rol']);
    if (roleRank($actual['rol']) >= $miRango) { $conn->close(); authFail(403, 'No puedes modificar a un usuario de tu mismo rango o superior'); }
    if ($rol !== null && roleRank($rol) >= $miRango) { $conn->close(); authFail(403, 'No puedes asignar un rol igual o mayor al tuyo'); }
}

$nuevoRol   = $rol ?? $actual['rol'];
$nuevoPrivs = $privs !== null ? json_encode($privs) : $actual['privilegios'];
$nuevoState = $state ?? (int)$actual['state'];

$upd = db_prepare_or_fail($conn, 'UPDATE le_usuario_sedes SET rol = ?, privilegios = ?, state = ? WHERE id_usuario = ? AND id_sede = ?');
$upd->bind_param('ssiii', $nuevoRol, $nuevoPrivs, $nuevoState, $idUsuario, $idSede);
$ok = $upd->execute();
$upd->close();

if ($ok) {
    auditAdmin($conn, 'update_user_access', [
        'id_usuario' => $idUsuario,
        'antes'   => ['rol' => $actual['rol'], 'privilegios' => json_decode($actual['privilegios'] ?? '[]', true), 'state' => (int)$actual['state']],
        'despues' => ['rol' => $nuevoRol, 'privilegios' => json_decode($nuevoPrivs ?? '[]', true), 'state' => $nuevoState],
    ]);
}
$conn->close();

echo json_encode(['action' => $ok, 'mensaje' => $ok ? 'Acceso actualizado' : 'No se pudo actualizar el acceso']);
