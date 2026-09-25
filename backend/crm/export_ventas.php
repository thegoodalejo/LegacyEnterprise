<?php
// Ventas para exportar a PDF/Excel (los arma el navegador), por páginas, con sus líneas.
// POST: filtros (JSON, ver crmVentaFiltros), pagina, por_pagina (máx. 1000), total_esperado (opcional: 409 si cambió), formato (pdf|xlsx, auditoría).
// Devuelve {ventas:[…] (lote = archivo de la importación; NULL = registrada a mano; oportunidad = título si se registró desde una), lineas:[…] (las de las ventas de la página), total, pagina, por_pagina,
// resumen, config}. La primera página audita crm_exportar.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_ventas.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$filtros = crmJsonParam('filtros') ?? [];
$pagina = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(CRM_EXPORT_PAGINA_MAX, max(1, (int)($_POST['por_pagina'] ?? 500)));

$conn = conectar();
$w = crmVentaFiltros($conn, $ctx, $filtros);
$resumen = crmVentaResumen($conn, $w);
$total = $resumen['ventas'];
if (isset($_POST['total_esperado']) && $_POST['total_esperado'] !== '' && (int)$_POST['total_esperado'] !== $total) authFail(409, 'Los resultados cambiaron. Vuelve a exportar.');
if ($total === 0) authFail(400, 'No hay ventas para exportar');
if ($total > CRM_EXPORT_MAX) authFail(400, 'Máximo ' . number_format(CRM_EXPORT_MAX, 0, ',', '.') . ' ventas por exportación. Afina el filtro.');

$rows = crmRows($conn,
    'SELECT v.id, v.fecha, v.documento, v.total, v.unidades, v.activo, v.id_contacto, c.nombre_completo AS cliente, c.tipo AS cliente_tipo,
            COALESCE(po.documento_numero, pp.documento_numero) AS cliente_documento,
            IF(v.id_importacion IS NULL, NULL, COALESCE(i.archivo, CONCAT(\'#\', v.id_importacion))) AS lote, op.titulo AS oportunidad
       FROM crm_ventas v JOIN crm_contactos c ON c.id = v.id_contacto
  LEFT JOIN crm_oportunidades op ON op.id = v.id_oportunidad
  LEFT JOIN crm_contactos_organizaciones po ON po.id = c.id LEFT JOIN crm_contactos_personas pp ON pp.id = c.id
  LEFT JOIN crm_importaciones i ON i.id = v.id_importacion
      WHERE ' . $w['sql'] . ' ORDER BY v.fecha, v.id LIMIT ? OFFSET ?', $w['types'] . 'ii', [...$w['params'], $porPagina, ($pagina - 1) * $porPagina]);
$ids = array_map(static fn($r) => (int)$r['id'], $rows);
$lineas = [];
if ($ids) {
    $lineas = crmRows($conn,
        'SELECT l.id_venta, COALESCE(i.codigo, l.codigo) AS codigo, COALESCE(i.nombre, l.descripcion, l.codigo) AS nombre, cat.nombre AS categoria, i.unidad,
                l.cantidad, l.precio_unitario, l.total
           FROM crm_venta_lineas l LEFT JOIN crm_catalogo_items i ON i.id = l.id_item LEFT JOIN crm_catalogo_categorias cat ON cat.id = i.id_categoria
          WHERE l.id_venta IN (' . crmMarks(count($ids)) . ') ORDER BY l.id_venta, l.id', str_repeat('i', count($ids)), $ids);
}
if ($pagina === 1) {
    $fmt = in_array($_POST['formato'] ?? '', ['pdf', 'xlsx'], true) ? $_POST['formato'] : null;
    auditAdmin($conn, 'crm_exportar', ['reporte' => 'ventas', 'formato' => $fmt, 'filas' => $total, 'filtros' => $filtros]);
}
$cfg = crmConfig($conn, $ctx['id_empresa']);
$conn->close();

foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['id_contacto'] = (int)$r['id_contacto']; $r['total'] = (float)$r['total']; $r['unidades'] = (float)$r['unidades']; $r['activo'] = (int)$r['activo'] === 1; }
unset($r);
foreach ($lineas as &$l) { $l['id_venta'] = (int)$l['id_venta']; $l['cantidad'] = (float)$l['cantidad']; $l['precio_unitario'] = (float)$l['precio_unitario']; $l['total'] = (float)$l['total']; }
unset($l);

crmOk(['ventas' => $rows, 'lineas' => $lineas, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina, 'resumen' => $resumen, 'config' => $cfg]);
