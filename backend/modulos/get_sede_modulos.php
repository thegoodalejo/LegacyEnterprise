<?php
// Panel de plataforma (solo L5): catálogo de módulos con el estado del contrato en una sede.
// id_sede viene por POST a propósito: L5 administra cualquier sede (no es un endpoint operativo).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

requirePlatformAdmin();

$idSede = (int)($_POST['id_sede'] ?? 0);
if ($idSede <= 0) authFail(400, 'id_sede requerido');

$conn = conectar();
$stmt = db_prepare_or_fail($conn,
    'SELECT m.codigo, m.nombre, m.orden, m.activo AS catalogo_activo,
            sm.activo, sm.fecha_inicio, sm.fecha_fin, sm.notas, sm.updated_at,
            (sm.activo = 1 AND m.activo = 1
              AND (sm.fecha_inicio IS NULL OR sm.fecha_inicio <= CURDATE())
              AND (sm.fecha_fin IS NULL OR sm.fecha_fin >= CURDATE())) AS vigente
       FROM le_modulos m
  LEFT JOIN le_sede_modulos sm ON sm.codigo_modulo = m.codigo AND sm.id_sede = ?
   ORDER BY m.orden');
$stmt->bind_param('i', $idSede);
db_execute_or_fail($stmt);
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();
$conn->close();

foreach ($rows as &$r) {
    $r['orden'] = (int)$r['orden'];
    $r['catalogo_activo'] = (int)$r['catalogo_activo'] === 1;
    $r['contratado'] = $r['activo'] !== null;
    $r['activo'] = (int)$r['activo'] === 1;
    $r['vigente'] = (int)$r['vigente'] === 1;
}

echo json_encode(['action' => true, 'mensaje' => 'OK', 'data' => ['modulos' => $rows]]);
