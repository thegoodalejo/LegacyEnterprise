<?php
// Categorías del catálogo de ítems (productos, servicios, tratamientos…) de la empresa.
// POST: solo_activos (0|1, por defecto 0).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$filtro = ($_POST['solo_activos'] ?? '0') === '1' ? ' AND activo = 1' : '';
$conn = conectar();
$rows = crmRows($conn, "SELECT id, nombre, orden, activo FROM crm_catalogo_categorias WHERE id_empresa = ?$filtro ORDER BY orden, nombre", 'i', [$ctx['id_empresa']]);
$conn->close();
foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['orden'] = (int)$r['orden']; $r['activo'] = (int)$r['activo'] === 1; }

crmOk(['categorias' => $rows]);
