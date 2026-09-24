<?php
// Panel de plataforma (solo L5): empresas con su marca blanca y cantidad de sedes.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

requirePlatformAdmin();

$conn = conectar();
$stmt = db_prepare_or_fail($conn,
    'SELECT e.id, e.nombre, e.nit, e.color_primario, e.color_secundario, e.color_terciario, e.logo_url, e.activo, e.created_at,
            (SELECT COUNT(*) FROM le_sedes s WHERE s.id_empresa = e.id) AS sedes
       FROM le_empresas e
   ORDER BY e.activo DESC, e.nombre');
db_execute_or_fail($stmt);
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();
$conn->close();

foreach ($rows as &$r) {
    $r['id'] = (int)$r['id'];
    $r['activo'] = (int)$r['activo'] === 1;
    $r['sedes'] = (int)$r['sedes'];
}

echo json_encode(['action' => true, 'mensaje' => 'OK', 'data' => ['empresas' => $rows]]);
