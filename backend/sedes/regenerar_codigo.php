<?php
// Regenera el código de invitación de la SEDE ACTIVA (el anterior deja de servir).
// L4 de la sede o privilegio 'usuarios'; L5 usa además save_sede.php para cualquier sede.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$idSede = requireSede();
if (roleRank($GLOBALS['authUser']['rol']) < roleRank('L4') && !hasPrivilege('usuarios')) authFail(403, 'Sin acceso');

$codigo = strtoupper(bin2hex(random_bytes(4)));
$conn = conectar();
$stmt = db_prepare_or_fail($conn, 'UPDATE le_sedes SET codigo_invitacion = ? WHERE id = ?');
$stmt->bind_param('si', $codigo, $idSede);
$ok = $stmt->execute();
$stmt->close();
if ($ok) auditAdmin($conn, 'regenerar_codigo', []);
$conn->close();

echo json_encode(['action' => $ok, 'mensaje' => $ok ? 'Código regenerado' : 'No se pudo regenerar el código', 'data' => $ok ? ['codigo_invitacion' => $codigo] : null]);
