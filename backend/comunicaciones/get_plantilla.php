<?php
// Una plantilla (L2+) con su revisión de categoría actual y los créditos por mensaje. POST: id.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_plantillas.php';

$ctx = comContext();
requireRole('L2');
$conn = conectar();
$t = comPlantilla($conn, $ctx['id_sede'], (int)($_POST['id'] ?? 0));
if (!$t) authFail(404, 'Plantilla no encontrada');
$p = comPlantillaPublica($t);
$p['revision_actual'] = comPlantillaRevision($t);
$p['no_enviable'] = comPlantillaNoEnviable($t);
$p['usos'] = (int)crmRow($conn, "SELECT COUNT(*) AS n FROM com_mensajes WHERE id_sede = ? AND tipo = 'template' AND JSON_VALUE(contenido, '$.plantilla.id') = ?",
    'ii', [$ctx['id_sede'], (int)$t['id']])['n'];
$conn->close();
crmOk(['plantilla' => $p]);
