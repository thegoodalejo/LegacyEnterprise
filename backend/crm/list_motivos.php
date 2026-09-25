<?php
// Motivos de cierre (por qué se ganó o se perdió una oportunidad) de la empresa.
// POST: tipo (ganada|perdida, opcional), solo_activos (0|1, por defecto 0).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$tipo = (string)($_POST['tipo'] ?? '');
if ($tipo !== '' && !in_array($tipo, ['ganada', 'perdida'], true)) authFail(400, 'Tipo inválido');

$sql = 'SELECT id, tipo, nombre, orden, activo FROM crm_motivos_cierre WHERE id_empresa = ?';
$t = 'i'; $p = [$ctx['id_empresa']];
if ($tipo !== '') { $sql .= ' AND tipo = ?'; $t .= 's'; $p[] = $tipo; }
if (($_POST['solo_activos'] ?? '0') === '1') $sql .= ' AND activo = 1';

$conn = conectar();
$rows = crmRows($conn, $sql . ' ORDER BY tipo, orden, nombre', $t, $p);
$conn->close();
foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['orden'] = (int)$r['orden']; $r['activo'] = (int)$r['activo'] === 1; }

crmOk(['motivos' => $rows]);
