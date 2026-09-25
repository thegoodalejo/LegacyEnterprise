<?php
// Anula o restaura una venta registrada a mano (L2+). Anular = activo 0 (no se borra) y deja de contar en indicadores y metas.
// Las ventas importadas no se tocan una por una: se revierte su importación completa (revertir_importacion.php).
// POST: id, accion (anular | restaurar), motivo (obligatorio al anular). Restaurar exige que el número de documento siga libre.
// Historial: le_H_registros (tabla crm_ventas), acciones «anulado» (con el motivo) y «restaurado».
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_ventas.php';

$ctx = crmContext();
requireRole('L2');
$id = (int)($_POST['id'] ?? 0);
$accion = (string)($_POST['accion'] ?? '');
if (!in_array($accion, ['anular', 'restaurar'], true)) authFail(400, 'Acción inválida');

$conn = conectar();
$conn->begin_transaction();
$v = crmRow($conn, 'SELECT id, documento, activo, id_importacion FROM crm_ventas WHERE id = ? AND id_sede = ? LIMIT 1 FOR UPDATE', 'ii', [$id, $ctx['id_sede']]);
if (!$v) authFail(404, 'Venta no encontrada');
if ($v['id_importacion'] !== null) authFail(409, 'Esta venta vino de una importación: se revierte la importación completa desde la pestaña Importaciones');

if ($accion === 'anular') {
    if ((int)$v['activo'] !== 1) authFail(409, 'La venta ya estaba anulada');
    $motivo = crmClean($_POST['motivo'] ?? null, 255, 'Motivo de la anulación', true);
    crmExec($conn, 'UPDATE crm_ventas SET activo = 0, updated_by = ? WHERE id = ? AND id_sede = ?', 'iii', [$ctx['id_usuario'], $id, $ctx['id_sede']]);
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_ventas', $id, 'anulado', ['motivo' => $motivo]);
} else {
    if ((int)$v['activo'] === 1) authFail(409, 'La venta ya está activa');
    crmVentaExigirDocumentoLibre($conn, $ctx, $v['documento'], $id);
    crmExec($conn, 'UPDATE crm_ventas SET activo = 1, updated_by = ? WHERE id = ? AND id_sede = ?', 'iii', [$ctx['id_usuario'], $id, $ctx['id_sede']]);
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_ventas', $id, 'restaurado');
}
$conn->commit();
$conn->close();

crmOk(['id' => $id, 'activo' => $accion === 'restaurar'], $accion === 'anular' ? 'Venta anulada' : 'Venta restaurada');
