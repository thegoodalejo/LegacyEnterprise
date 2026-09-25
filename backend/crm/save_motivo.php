<?php
// Crea o edita un motivo de cierre de la empresa (L4+). Se desactivan, no se borran: las oportunidades que lo tienen lo conservan.
// POST: id (0 = nuevo), tipo (ganada|perdida, fijo tras crear), nombre, orden, activo.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
requireRole('L4');

$id = (int)($_POST['id'] ?? 0);
$nombre = crmClean($_POST['nombre'] ?? null, 80, 'Nombre', true);
$orden = max(-32000, min(32000, (int)($_POST['orden'] ?? 0)));
$activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : 1;

$conn = conectar();
if ($id === 0) {
    $tipo = (string)($_POST['tipo'] ?? '');
    if (!in_array($tipo, ['ganada', 'perdida'], true)) authFail(400, 'Tipo inválido');
} else {
    $m = crmRow($conn, 'SELECT tipo FROM crm_motivos_cierre WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$id, $ctx['id_empresa']]);
    if (!$m) authFail(404, 'Motivo no encontrado');
    $tipo = $m['tipo'];
}
if (crmRow($conn, 'SELECT 1 AS ok FROM crm_motivos_cierre WHERE id_empresa = ? AND tipo = ? AND nombre = ? AND id <> ? LIMIT 1', 'issi', [$ctx['id_empresa'], $tipo, $nombre, $id])) {
    authFail(409, 'Ya existe un motivo con ese nombre');
}
if ($id === 0) {
    crmExec($conn, 'INSERT INTO crm_motivos_cierre (id_empresa, tipo, nombre, orden, activo, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'issiiii', [$ctx['id_empresa'], $tipo, $nombre, $orden, $activo, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
} else {
    crmExec($conn, 'UPDATE crm_motivos_cierre SET nombre = ?, orden = ?, activo = ?, updated_by = ? WHERE id = ? AND id_empresa = ?',
        'siiiii', [$nombre, $orden, $activo, $ctx['id_usuario'], $id, $ctx['id_empresa']]);
}
$conn->close();

crmOk(['id' => $id, 'tipo' => $tipo, 'nombre' => $nombre, 'orden' => $orden, 'activo' => $activo === 1], 'Motivo guardado');
