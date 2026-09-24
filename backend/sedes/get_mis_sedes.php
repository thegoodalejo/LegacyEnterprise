<?php
// Sedes a las que el usuario puede cambiar.
// - Usuario normal: sus sedes con acceso activo.
// - L5: TODAS las sedes (activas e inactivas), con buscador por nombre o id y límite.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

$u = requireAuth();
$conn = conectar();

if ($u['is_platform_admin']) {
    $q = trim($_POST['q'] ?? '');
    $limit = min(100, max(1, (int)($_POST['limit'] ?? 50)));
    $like = '%' . $q . '%';
    $idQ = ctype_digit($q) ? (int)$q : 0;
    $stmt = db_prepare_or_fail($conn,
        "SELECT s.id, s.nombre, s.logo_url, s.activo, e.nombre AS empresa_nombre,
                (SELECT COUNT(*) FROM le_usuario_sedes x WHERE x.id_sede = s.id AND x.state = 1) AS usuarios,
                'L5' AS rol
           FROM le_sedes s
           JOIN le_empresas e ON e.id = s.id_empresa
          WHERE (? = '' OR s.nombre LIKE ? OR s.id = ?)
       ORDER BY s.activo DESC, s.nombre
          LIMIT ?");
    $stmt->bind_param('ssii', $q, $like, $idQ, $limit);
} else {
    $stmt = db_prepare_or_fail($conn,
        'SELECT s.id, s.nombre, s.logo_url, s.activo, us.rol, e.nombre AS empresa_nombre
           FROM le_usuario_sedes us
           JOIN le_sedes s ON s.id = us.id_sede
           JOIN le_empresas e ON e.id = s.id_empresa
          WHERE us.id_usuario = ? AND us.state = 1 AND s.activo = 1
       ORDER BY s.nombre');
    $stmt->bind_param('i', $u['id']);
}

db_execute_or_fail($stmt);
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();
$conn->close();

foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['activo'] = (int)$r['activo'] === 1; }

echo json_encode(['action' => true, 'mensaje' => 'OK', 'data' => [
    'sedes'       => $rows,
    'id_activa'   => $u['id_sede'],
    'es_soporte'  => $u['is_platform_admin'],
]]);
