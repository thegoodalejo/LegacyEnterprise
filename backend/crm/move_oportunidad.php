<?php
// Cambia una oportunidad de etapa (arrastrar en el tablero o «Mover a…»). Una etapa ganada/perdida la cierra (con motivo si la empresa los tiene
// configurados); una abierta la reabre. Una nota opcional queda en la bitácora.
// POST: id, id_etapa, id_motivo (solo al cerrar), fecha_cierre (AAAA-MM-DD, por defecto hoy), nota (opcional).
// Devuelve {cambio, oportunidad}. Una oportunidad archivada no se mueve: primero se restaura.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$id = (int)($_POST['id'] ?? 0);
$idEtapa = (int)($_POST['id_etapa'] ?? 0);
$idMotivo = (int)($_POST['id_motivo'] ?? 0) ?: null;
$fecha = crmFecha($_POST['fecha_cierre'] ?? null, 'Fecha de cierre');
$nota = crmClean($_POST['nota'] ?? null, 5000, 'Nota');

$conn = conectar();
$conn->begin_transaction();
$op = $id > 0 ? crmOpBase($conn, $ctx, $id) : null;
if (!$op) authFail(404, 'Oportunidad no encontrada');
if (!$op['activo']) authFail(409, 'La oportunidad está archivada. Restáurala para moverla.');

$detalle = crmOpMover($conn, $ctx, $op, $idEtapa, $idMotivo, $fecha);
if ($detalle !== null) auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_oportunidades', $id, 'etapa_cambiada', $detalle);
if ($nota !== null) {
    crmExec($conn, 'INSERT INTO crm_oportunidad_notas (id_oportunidad, nota, created_by, updated_by) VALUES (?, ?, ?, ?)', 'isii', [$id, $nota, $ctx['id_usuario'], $ctx['id_usuario']]);
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_oportunidades', $id, 'nota_agregada');
    if ($detalle === null) crmOpTocar($conn, $ctx, [$id]);
}
$conn->commit();
$nueva = crmOpBase($conn, $ctx, $id);
$conn->close();

crmOk(['cambio' => $detalle !== null, 'oportunidad' => $nueva], $detalle !== null ? 'Oportunidad movida' : 'Sin cambios');
