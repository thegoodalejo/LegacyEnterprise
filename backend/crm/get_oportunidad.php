<?php
// Detalle de una oportunidad: datos, líneas, etiquetas, campos personalizados, notas y las etapas de su embudo (para cambiarla de etapa).
// POST: id.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$id = (int)($_POST['id'] ?? 0);

$conn = conectar();
$op = $id > 0 ? crmOpBase($conn, $ctx, $id) : null;
if (!$op) authFail(404, 'Oportunidad no encontrada');

$etapas = [];
foreach (crmEmbudos($conn, $ctx['id_empresa']) as $e) {
    if ($e['id'] !== $op['id_embudo']) continue;
    // Las etapas desactivadas no se ofrecen, salvo la actual.
    $etapas = array_values(array_filter($e['etapas'], static fn($x) => $x['activo'] || $x['id'] === $op['id_etapa']));
}
$data = [
    'oportunidad' => $op,
    'lineas' => crmOpLineas($conn, $id),
    'tags' => crmOpTags($conn, $id),
    'campos' => crmCamposConValor($conn, $ctx, $id, 'oportunidad'),
    'notas' => crmOpNotas($conn, $id)['notas'],
    'etapas' => $etapas,
    'config' => crmConfig($conn, $ctx['id_empresa']),
];
$conn->close();

crmOk($data);
