<?php
// Revierte un lote de ventas (L2+): sus ventas quedan inactivas (no se borran) y el lote pasa a «revertida». Las ventas que ese lote había
// reemplazado NO se reactivan solas (pudieron cambiar después): si hace falta, se vuelve a importar el archivo anterior.
// POST: id_importacion. Deja auditoría (crm_revertir_importacion).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_ventas.php';

$ctx = crmContext();
requireRole('L2');
$id = (int)($_POST['id_importacion'] ?? 0);

$conn = conectar();
$conn->begin_transaction();
$lote = $id > 0 ? crmImportacion($conn, $ctx, $id) : null;
if (!$lote) authFail(404, 'Importación no encontrada');
if ($lote['estado'] === 'revertida') authFail(409, 'La importación ya estaba revertida');

$n = crmExec($conn, 'UPDATE crm_ventas SET activo = 0, updated_by = ? WHERE id_sede = ? AND id_importacion = ? AND activo = 1', 'iii', [$ctx['id_usuario'], $ctx['id_sede'], $id]);
crmExec($conn, "UPDATE crm_importaciones SET estado = 'revertida', revertido_at = CURRENT_TIMESTAMP, revertido_by = ?, updated_by = ? WHERE id = ? AND id_sede = ?",
    'iiii', [$ctx['id_usuario'], $ctx['id_usuario'], $id, $ctx['id_sede']]);
auditAdmin($conn, 'crm_revertir_importacion', ['id_importacion' => $id, 'archivo' => $lote['archivo'], 'ventas_desactivadas' => $n]);
$conn->commit();
$conn->close();

crmOk(['ventas_desactivadas' => $n], 'Importación revertida');
