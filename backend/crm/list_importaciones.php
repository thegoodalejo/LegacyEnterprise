<?php
// Lotes de importación de ventas de la sede, los más nuevos primero (cualquiera con acceso al CRM).
// POST: pagina, por_pagina (máx. 100).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_ventas.php';

$ctx = crmContext();
$pagina = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(CRM_POR_PAGINA_MAX, max(1, (int)($_POST['por_pagina'] ?? 25)));

$conn = conectar();
$total = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_importaciones WHERE id_sede = ?', 'i', [$ctx['id_sede']])['n'];
$rows = crmRows($conn,
    'SELECT i.id, i.archivo, i.estado, i.filas_total, i.filas_ok, i.filas_error, i.ventas_nuevas, i.ventas_reemplazadas, i.ventas_omitidas, i.items_creados,
            i.total_valor, i.fecha_desde, i.fecha_hasta, i.errores, i.created_at, i.revertido_at,
            COALESCE(cu.nombre, cu.email) AS creado_por, COALESCE(ru.nombre, ru.email) AS revertido_por
       FROM crm_importaciones i
  LEFT JOIN le_usuarios cu ON cu.id = i.created_by
  LEFT JOIN le_usuarios ru ON ru.id = i.revertido_by
      WHERE i.id_sede = ? ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?', 'iii', [$ctx['id_sede'], $porPagina, ($pagina - 1) * $porPagina]);
$conn->close();

foreach ($rows as &$r) {
    foreach (['id', 'filas_total', 'filas_ok', 'filas_error', 'ventas_nuevas', 'ventas_reemplazadas', 'ventas_omitidas', 'items_creados'] as $k) $r[$k] = (int)$r[$k];
    $r['total_valor'] = (float)$r['total_valor'];
    $r['errores'] = $r['errores'] ? json_decode($r['errores'], true) : [];
}
unset($r);

crmOk(['importaciones' => $rows, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina]);
