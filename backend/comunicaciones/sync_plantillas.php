<?php
// Sincroniza las plantillas con Meta (L2+): estados, categorías (y reclasificaciones), calidad; trae las creadas fuera del sistema y marca las
// borradas en Meta. Una vez por cuenta de WhatsApp (WABA) de las líneas activas de la sede.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_plantillas.php';

$ctx = comContext();
requireRole('L2');
$conn = conectar();
$res = []; $vistas = [];
foreach (crmRows($conn, 'SELECT id, waba_id FROM com_lineas WHERE id_sede = ? AND activo = 1 ORDER BY id', 'i', [$ctx['id_sede']]) as $l) {
    if (isset($vistas[$l['waba_id']])) continue;
    $vistas[$l['waba_id']] = true;
    $linea = comLinea($conn, (int)$l['id'], $ctx['id_sede']);
    $res[] = ['waba_id' => $l['waba_id']] + (!$linea || !$linea['token'] ? ['error' => 'Línea sin token'] : comPlantillasSincronizar($conn, $ctx, $linea));
}
$conn->close();
if (!$res) authFail(409, 'La sede no tiene líneas activas');
crmOk(['cuentas' => $res], 'Plantillas sincronizadas');
