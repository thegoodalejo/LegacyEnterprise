<?php
// Movimientos de créditos (L2+): recargas, consumo diario por categoría, ajustes y transferencias.
// POST: bolsa (actual —la que usa la sede— | sede | empresa; las dos últimas solo L4), desde, hasta (AAAA-MM-DD), tipo (opcional), pagina,
//       por_pagina (máx. 1000, para exportar). En la bolsa de la empresa, L2/L3 ven solo el consumo de su sede (y recargas y transferencias).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

$ctx = comContext();
requireRole('L2');
$bolsa = (string)($_POST['bolsa'] ?? 'actual');
if (!in_array($bolsa, ['actual', 'sede', 'empresa'], true)) authFail(400, 'Bolsa inválida');
if ($bolsa !== 'actual' && !comEsRol($ctx, 'L4')) authFail(403, 'Solo L4 elige la bolsa');
$desde = crmFecha($_POST['desde'] ?? null, 'Desde') ?? date('Y-m-01', strtotime('-2 months'));
$hasta = crmFecha($_POST['hasta'] ?? null, 'Hasta') ?? date('Y-m-d');
$tipo = (string)($_POST['tipo'] ?? '');
if ($tipo !== '' && !in_array($tipo, ['recarga', 'consumo', 'ajuste', 'transferencia'], true)) authFail(400, 'Tipo inválido');
$pagina = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(1000, max(1, (int)($_POST['por_pagina'] ?? 50)));

$conn = conectar();
$b = match ($bolsa) {
    'actual'  => comBilleteraDeSede($conn, $ctx['id_sede']),
    'sede'    => comBilletera($conn, 'sede', $ctx['id_empresa'], $ctx['id_sede']),
    'empresa' => comBilletera($conn, 'empresa', $ctx['id_empresa'], null),
};
$where = 'm.id_billetera = ? AND m.fecha BETWEEN ? AND ?';
$types = 'iss';
$params = [$b['id'], $desde, $hasta];
if ($tipo !== '') { $where .= ' AND m.tipo = ?'; $types .= 's'; $params[] = $tipo; }
if ($b['ambito'] === 'empresa' && !comEsRol($ctx, 'L4')) { $where .= " AND (m.tipo <> 'consumo' OR m.id_sede = ?)"; $types .= 'i'; $params[] = $ctx['id_sede']; }

$total = (int)crmRow($conn, "SELECT COUNT(*) AS n FROM com_movimientos m WHERE $where", $types, $params)['n'];
$rows = crmRows($conn,
    "SELECT m.id, m.tipo, m.fecha, m.categoria, t.nombre AS categoria_nombre, m.cantidad, m.creditos, m.saldo_despues, m.descripcion, m.referencia,
            m.id_sede, s.nombre AS sede_nombre, m.created_at, m.updated_at, COALESCE(u.nombre, u.email) AS usuario
       FROM com_movimientos m LEFT JOIN le_sedes s ON s.id = m.id_sede LEFT JOIN le_usuarios u ON u.id = m.created_by
       LEFT JOIN com_tarifas t ON t.categoria = m.categoria
      WHERE $where ORDER BY m.fecha DESC, m.id DESC LIMIT ? OFFSET ?",
    $types . 'ii', [...$params, $porPagina, ($pagina - 1) * $porPagina]);
$conn->close();
foreach ($rows as &$r) {
    foreach (['id', 'cantidad', 'creditos', 'saldo_despues'] as $k) $r[$k] = (int)$r[$k];
    $r['id_sede'] = $r['id_sede'] !== null ? (int)$r['id_sede'] : null;
}
crmOk(['movimientos' => $rows, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina,
    'bolsa' => ['id' => $b['id'], 'ambito' => $b['ambito'], 'saldo' => $b['saldo']], 'desde' => $desde, 'hasta' => $hasta]);
