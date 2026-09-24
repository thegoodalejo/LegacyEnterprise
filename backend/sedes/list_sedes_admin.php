<?php
// Panel de plataforma (solo L5): todas las sedes con su empresa, código de invitación, usuarios y
// módulos vigentes. Filtros opcionales: q (nombre o id), id_empresa.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

requirePlatformAdmin();

$q = trim($_POST['q'] ?? '');
$idEmpresa = (int)($_POST['id_empresa'] ?? 0);
$like = '%' . $q . '%';
$idQ = ctype_digit($q) ? (int)$q : 0;

$conn = conectar();
$stmt = db_prepare_or_fail($conn,
    "SELECT s.id, s.nombre, s.codigo_invitacion, s.activo, s.id_empresa, e.nombre AS empresa_nombre, s.created_at,
            (SELECT COUNT(*) FROM le_usuario_sedes x WHERE x.id_sede = s.id AND x.state = 1) AS usuarios,
            (SELECT GROUP_CONCAT(sm.codigo_modulo ORDER BY m.orden)
               FROM le_sede_modulos sm JOIN le_modulos m ON m.codigo = sm.codigo_modulo AND m.activo = 1
              WHERE sm.id_sede = s.id AND sm.activo = 1
                AND (sm.fecha_inicio IS NULL OR sm.fecha_inicio <= CURDATE())
                AND (sm.fecha_fin IS NULL OR sm.fecha_fin >= CURDATE())) AS modulos
       FROM le_sedes s
       JOIN le_empresas e ON e.id = s.id_empresa
      WHERE (? = '' OR s.nombre LIKE ? OR s.id = ?)
        AND (? = 0 OR s.id_empresa = ?)
   ORDER BY e.nombre, s.activo DESC, s.nombre
      LIMIT 500");
$stmt->bind_param('ssiii', $q, $like, $idQ, $idEmpresa, $idEmpresa);
db_execute_or_fail($stmt);
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();
$conn->close();

foreach ($rows as &$r) {
    $r['id'] = (int)$r['id'];
    $r['id_empresa'] = (int)$r['id_empresa'];
    $r['activo'] = (int)$r['activo'] === 1;
    $r['usuarios'] = (int)$r['usuarios'];
    $r['modulos'] = $r['modulos'] ? explode(',', $r['modulos']) : [];
}

echo json_encode(['action' => true, 'mensaje' => 'OK', 'data' => ['sedes' => $rows]]);
