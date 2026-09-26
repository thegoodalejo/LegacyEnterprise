<?php
// Elimina una plantilla (L2+): la borra en Meta si ya estaba allá y la deja «eliminada» aquí (los mensajes enviados la siguen mostrando).
// Meta no deja reutilizar el nombre durante 30 días. POST: id.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_plantillas.php';

$ctx = comContext();
requireRole('L2');
$id = (int)($_POST['id'] ?? 0);
$conn = conectar();
$t = comPlantilla($conn, $ctx['id_sede'], $id);
if (!$t) authFail(404, 'Plantilla no encontrada');
if ($t['estado'] === 'eliminada') { $conn->close(); crmOk([], 'Ya estaba eliminada'); }
if (crmRow($conn, "SELECT 1 AS ok FROM com_campanas WHERE id_plantilla = ? AND estado IN ('programada','enviando','esperando_saldo','esperando_cupo','pausada') LIMIT 1", 'i', [$id])) {
    authFail(409, 'Una campaña en curso usa esta plantilla: termínala o cancélala antes');
}
if ($t['meta_id']) {
    $l = comLinea($conn, (int)$t['id_linea'], $ctx['id_sede'], false);
    if (!$l || !$l['token']) authFail(409, 'La línea de la plantilla no tiene token: no se puede borrar en Meta');
    $r = comGraph('DELETE', '/' . $t['waba_id'] . '/message_templates?' . http_build_query(['name' => $t['nombre'], 'hsm_id' => $t['meta_id']]), $l['token'], $l['graph_version']);
    if (!$r['ok'] && (int)($r['data']['error']['code'] ?? 0) !== 100) authFail(409, 'Meta no la borró: ' . comErrorDe($r)[1]);
}
crmExec($conn, "UPDATE com_plantillas SET estado = 'eliminada', updated_by = ? WHERE id = ?", 'ii', [$ctx['id_usuario'], $id]);
auditRegistro($conn, $ctx['id_sede'], 'comunicaciones', 'com_plantillas', $id, 'eliminada', ['nombre' => $t['nombre']]);
$conn->close();
crmOk([], 'Plantilla eliminada');
