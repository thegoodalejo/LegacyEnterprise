<?php
// Lotes de importación de la sede, los más nuevos primero (cualquiera con acceso al CRM).
// POST: tipo (ventas —por defecto— | contactos), pagina, por_pagina (máx. 100).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_ventas.php';

$ctx = crmContext(($_POST['tipo'] ?? 'ventas') === 'contactos' ? CRM_MODULOS_CONTACTOS : ['crm']);
$pagina = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(CRM_POR_PAGINA_MAX, max(1, (int)($_POST['por_pagina'] ?? 25)));
$tipo = (string)($_POST['tipo'] ?? 'ventas');
if (!in_array($tipo, ['ventas', 'contactos'], true)) authFail(400, 'Tipo de importación inválido');

$conn = conectar();
$total = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_importaciones WHERE id_sede = ? AND tipo = ?', 'is', [$ctx['id_sede'], $tipo])['n'];
$rows = crmRows($conn,
    'SELECT i.id, i.archivo, i.estado, i.filas_total, i.filas_ok, i.filas_error, i.ventas_nuevas, i.ventas_reemplazadas, i.ventas_omitidas, i.items_creados,
            i.total_valor, i.fecha_desde, i.fecha_hasta, i.errores, i.created_at, i.revertido_at, i.tipo,
            i.contactos_nuevos, i.contactos_actualizados, i.contactos_omitidos, i.personas_creadas, i.vinculos_creados,
            JSON_UNQUOTE(JSON_EXTRACT(i.opciones, \'$.tipo\')) AS tipo_contacto,
            COALESCE(cu.nombre, cu.email) AS creado_por, COALESCE(ru.nombre, ru.email) AS revertido_por
       FROM crm_importaciones i
  LEFT JOIN le_usuarios cu ON cu.id = i.created_by
  LEFT JOIN le_usuarios ru ON ru.id = i.revertido_by
      WHERE i.id_sede = ? AND i.tipo = ? ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?', 'isii', [$ctx['id_sede'], $tipo, $porPagina, ($pagina - 1) * $porPagina]);
$conn->close();

foreach ($rows as &$r) {
    foreach (['id', 'filas_total', 'filas_ok', 'filas_error', 'ventas_nuevas', 'ventas_reemplazadas', 'ventas_omitidas', 'items_creados',
              'contactos_nuevos', 'contactos_actualizados', 'contactos_omitidos', 'personas_creadas', 'vinculos_creados'] as $k) $r[$k] = (int)$r[$k];
    $r['total_valor'] = (float)$r['total_valor'];
    $r['errores'] = $r['errores'] ? json_decode($r['errores'], true) : [];
}
unset($r);

crmOk(['importaciones' => $rows, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina]);
