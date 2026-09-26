<?php
// Revierte un lote de importación (L2+) y lo deja «revertida». Nada se borra:
//   ventas    → sus ventas quedan inactivas. Las que ese lote había reemplazado NO se reactivan solas (pudieron cambiar después): si hace falta,
//               se vuelve a importar el archivo anterior.
//   contactos → se ARCHIVAN (activo = 0, restaurables) los contactos que ese lote creó (también las personas de referencia nuevas). Los que solo
//               actualizó quedan como están (sus cambios siguen en su historial).
// POST: id_importacion. Deja auditoría (crm_revertir_importacion). Devuelve {ventas_desactivadas} o {contactos_archivados}.
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

if ($lote['tipo'] === 'contactos') {
    $ids = array_map(static fn($r) => (int)$r['id'], crmRows($conn, 'SELECT id FROM crm_contactos WHERE id_sede = ? AND id_importacion = ? AND activo = 1', 'ii', [$ctx['id_sede'], $id]));
    foreach (array_chunk($ids, 500) as $chunk) {
        crmExec($conn, 'UPDATE crm_contactos SET activo = 0, updated_by = ? WHERE id_sede = ? AND id IN (' . crmMarks(count($chunk)) . ')',
            'ii' . str_repeat('i', count($chunk)), [$ctx['id_usuario'], $ctx['id_sede'], ...$chunk]);
    }
    auditRegistroVarios($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $ids, 'archivado', ['origen' => 'reversion_importacion', 'id_importacion' => $id, 'archivo' => $lote['archivo']]);
    $datos = ['contactos_archivados' => count($ids)];
} else {
    $datos = ['ventas_desactivadas' => crmExec($conn, 'UPDATE crm_ventas SET activo = 0, updated_by = ? WHERE id_sede = ? AND id_importacion = ? AND activo = 1', 'iii', [$ctx['id_usuario'], $ctx['id_sede'], $id])];
}
crmExec($conn, "UPDATE crm_importaciones SET estado = 'revertida', revertido_at = CURRENT_TIMESTAMP, revertido_by = ?, updated_by = ? WHERE id = ? AND id_sede = ?",
    'iiii', [$ctx['id_usuario'], $ctx['id_usuario'], $id, $ctx['id_sede']]);
auditAdmin($conn, 'crm_revertir_importacion', ['id_importacion' => $id, 'tipo' => $lote['tipo'], 'archivo' => $lote['archivo']] + $datos);
$conn->commit();
$conn->close();

crmOk($datos, 'Importación revertida');
