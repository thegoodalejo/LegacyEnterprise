<?php
// Una campaña (L2+) con contadores, su plantilla y los fallos agrupados por motivo. POST: id.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_campanas.php';

$ctx = comContext();
requireRole('L2');
$conn = conectar();
$c = comCampana($conn, $ctx['id_sede'], (int)($_POST['id'] ?? 0));
if (!$c) authFail(404, 'Campaña no encontrada');
$out = comCampanaPublica($conn, $c);
$tpl = comPlantilla($conn, $ctx['id_sede'], (int)$c['id_plantilla']);
$out['plantilla'] = $tpl ? comPlantillaPublica($tpl) : null;
$out['errores'] = crmRows($conn, "SELECT error, COUNT(*) AS n FROM com_campana_destinatarios WHERE id_campana = ? AND estado IN ('fallido','omitido') GROUP BY error ORDER BY n DESC LIMIT 10",
    'i', [(int)$c['id']]);
foreach ($out['errores'] as &$e) $e['n'] = (int)$e['n'];
unset($e);
$conn->close();
crmOk(['campana' => $out]);
