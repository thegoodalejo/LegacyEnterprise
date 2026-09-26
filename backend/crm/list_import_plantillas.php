<?php
// Plantillas de mapeo de columnas guardadas por la empresa (para repetir una importación). POST: tipo (ventas —por defecto— | contactos).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
$tipo = (string)($_POST['tipo'] ?? 'ventas');
if (!in_array($tipo, ['ventas', 'contactos'], true)) authFail(400, 'Tipo de plantilla inválido');
$conn = conectar();
$rows = crmRows($conn, 'SELECT id, nombre, mapeo, updated_at FROM crm_import_plantillas WHERE id_empresa = ? AND tipo = ? AND activo = 1 ORDER BY nombre', 'is', [$ctx['id_empresa'], $tipo]);
$conn->close();
foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['mapeo'] = json_decode($r['mapeo'], true); }
unset($r);

crmOk(['plantillas' => $rows]);
