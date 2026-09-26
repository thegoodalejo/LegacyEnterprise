<?php
// Plantillas de la sede. POST: enviables (1 = solo las aprobadas que el sistema puede enviar: para la bandeja y las campañas; cualquiera con
// acceso al módulo), id_linea (opcional). Sin «enviables»: todas menos las eliminadas (administración, L2+), incluir_eliminadas (1).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_plantillas.php';

$ctx = comContext();
$enviables = ($_POST['enviables'] ?? '0') === '1';
if (!$enviables) requireRole('L2');
$idLinea = (int)($_POST['id_linea'] ?? 0);
$conn = conectar();
$where = 'p.id_sede = ?';
$types = 'i'; $params = [$ctx['id_sede']];
if ($enviables) $where .= " AND p.estado = 'aprobada'";
elseif (($_POST['incluir_eliminadas'] ?? '0') !== '1') $where .= " AND p.estado <> 'eliminada'";
if ($idLinea > 0) {
    $l = comLineaDeSede($conn, $ctx, $idLinea);
    $where .= ' AND p.waba_id = ?'; $types .= 's'; $params[] = $l['waba_id'];
}
$rows = crmRows($conn, "SELECT p.*, l.nombre AS linea_nombre, COALESCE(u.nombre, u.email) AS creada_por FROM com_plantillas p JOIN com_lineas l ON l.id = p.id_linea
                         LEFT JOIN le_usuarios u ON u.id = p.created_by WHERE $where ORDER BY p.updated_at DESC", $types, $params);
$tarifas = ['marketing' => comTarifa($conn, 'marketing'), 'utility' => comTarifa($conn, 'utility'), 'authentication' => comTarifa($conn, 'authentication')];
$conn->close();
$out = [];
foreach ($rows as $r) {
    $p = comPlantillaPublica($r);
    $p['no_enviable'] = comPlantillaNoEnviable($r);
    if ($enviables && $p['no_enviable']) continue;
    $p['creditos'] = $tarifas[strtolower((string)($r['categoria'] ?? $r['categoria_solicitada']))] ?? 1;
    $out[] = $p;
}
crmOk(['plantillas' => $out, 'tarifas' => $tarifas, 'url_seguimiento' => comUrlSeguimiento()]);
