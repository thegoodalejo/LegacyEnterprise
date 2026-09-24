<?php
// Panel de plataforma (solo L5): habilita/deshabilita un módulo en una sede según lo contratado,
// con vigencia opcional. Queda auditado en le_H_admin.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

requirePlatformAdmin();
$me = $GLOBALS['authUser'];

$idSede = (int)($_POST['id_sede'] ?? 0);
$codigo = trim($_POST['codigo'] ?? '');
$activo = (int)($_POST['activo'] ?? 1) === 1 ? 1 : 0;
$notas  = trim($_POST['notas'] ?? '');
$notas  = $notas !== '' ? mb_substr($notas, 0, 255) : null;

$fecha = static function (string $campo): ?string {
    $v = trim($_POST[$campo] ?? '');
    if ($v === '') return null;
    $d = DateTime::createFromFormat('Y-m-d', $v);
    if (!$d || $d->format('Y-m-d') !== $v) authFail(400, "$campo inválida (usa AAAA-MM-DD)");
    return $v;
};
$inicio = $fecha('fecha_inicio');
$fin    = $fecha('fecha_fin');

if ($idSede <= 0) authFail(400, 'id_sede requerido');
if (!in_array($codigo, MODULES, true)) authFail(400, 'Módulo inválido');
if ($inicio && $fin && $fin < $inicio) authFail(400, 'La fecha de fin es anterior a la de inicio');

$conn = conectar();
$chk = db_prepare_or_fail($conn, 'SELECT id FROM le_sedes WHERE id = ?');
$chk->bind_param('i', $idSede);
$chk->execute();
$existe = (bool)$chk->get_result()->fetch_assoc();
$chk->close();
if (!$existe) { $conn->close(); authFail(404, 'La sede no existe'); }

$stmt = db_prepare_or_fail($conn,
    'INSERT INTO le_sede_modulos (id_sede, codigo_modulo, activo, fecha_inicio, fecha_fin, notas, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE activo = VALUES(activo), fecha_inicio = VALUES(fecha_inicio), fecha_fin = VALUES(fecha_fin),
                             notas = VALUES(notas), updated_by = VALUES(updated_by)');
$stmt->bind_param('isisssi', $idSede, $codigo, $activo, $inicio, $fin, $notas, $me['id']);
$ok = $stmt->execute();
$stmt->close();

if ($ok) auditAdmin($conn, 'save_sede_modulo', [
    'modulo' => $codigo, 'activo' => $activo, 'fecha_inicio' => $inicio, 'fecha_fin' => $fin, 'notas' => $notas,
], $idSede);
$conn->close();

echo json_encode(['action' => $ok, 'mensaje' => $ok ? ($activo ? 'Módulo habilitado' : 'Módulo deshabilitado') : 'No se pudo guardar']);
