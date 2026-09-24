<?php
// Usuarios de la sede activa con su rol, privilegios y estado. L4+ o privilegio 'usuarios'.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$idSede = requireSede();
if (roleRank($GLOBALS['authUser']['rol']) < roleRank('L4') && !hasPrivilege('usuarios')) authFail(403, 'Sin acceso');

$conn = conectar();
$stmt = db_prepare_or_fail($conn,
    'SELECT u.id, u.email, u.nombre, u.foto_url, us.rol, us.privilegios, us.state, us.created_at
       FROM le_usuario_sedes us
       JOIN le_usuarios u ON u.id = us.id_usuario
      WHERE us.id_sede = ?
   ORDER BY us.state DESC, u.nombre');
$stmt->bind_param('i', $idSede);
db_execute_or_fail($stmt);
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();
$modulosSede = modulosSede($conn, $idSede);
$c = db_prepare_or_fail($conn, 'SELECT codigo_invitacion FROM le_sedes WHERE id = ?');
$c->bind_param('i', $idSede);
db_execute_or_fail($c);
$codigo = $c->get_result()->fetch_assoc()['codigo_invitacion'] ?? null;
$c->close();
$conn->close();

foreach ($rows as &$r) {
    $r['id'] = (int)$r['id'];
    $r['state'] = (int)$r['state'] === 1;
    $r['privilegios'] = $r['privilegios'] ? (json_decode($r['privilegios'], true) ?: []) : [];
}

echo json_encode(['action' => true, 'mensaje' => 'OK', 'data' => [
    'usuarios' => $rows, 'roles' => array_keys(array_filter(ROLE_RANK, fn($r) => $r < ROLE_RANK['L5'])), 'privilegios' => PRIVILEGES,
    // Solo tiene sentido asignar privilegios de módulos contratados en esta sede.
    'modulos_sede' => $modulosSede,
    // Para invitar gente a la sede (código de 8 caracteres o QR con /onboarding?codigo=).
    'codigo_invitacion' => $codigo,
]]);
