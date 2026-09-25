<?php
// Usuarios activos de la sede activa, para elegir responsable o filtrar por responsable / creador. Solo id y nombre.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();

$conn = conectar();
$rows = crmRows($conn,
    'SELECT u.id, COALESCE(u.nombre, u.email) AS nombre
       FROM le_usuario_sedes us JOIN le_usuarios u ON u.id = us.id_usuario
      WHERE us.id_sede = ? AND us.state = 1 AND u.state = 1
   ORDER BY nombre', 'i', [$ctx['id_sede']]);
$conn->close();
foreach ($rows as &$r) $r['id'] = (int)$r['id'];

crmOk(['usuarios' => $rows]);
