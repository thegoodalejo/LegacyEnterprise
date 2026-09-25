<?php
// Ventas de la sede activa con filtros combinables (ver crmVentaFiltros). Cualquiera con acceso al CRM.
// POST: filtros (JSON), vista, pagina, por_pagina, orden (fecha|total|cliente|documento), dir.
//   lista      → {ventas:[…], total, pagina, por_pagina, resumen}
//   clientes   → {grupos:[{id, nombre, tipo, ventas, total, unidades, ultima}], total, …, resumen}   (ordenado por total)
//   items      → {grupos:[{id_item, codigo, nombre, categoria, cantidad, total, ventas}], …}      (líneas sin ítem: agrupadas por código/descripción)
//   categorias → {grupos:[{id_categoria, nombre, cantidad, total}]}
//   meses      → {grupos:[{mes (AAAA-MM), ventas, total, unidades}]}
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_ventas.php';

$ctx = crmContext();
$filtros = crmJsonParam('filtros') ?? [];
$vista = (string)($_POST['vista'] ?? 'lista');
$pagina = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(CRM_POR_PAGINA_MAX, max(1, (int)($_POST['por_pagina'] ?? 25)));
$offset = ($pagina - 1) * $porPagina;

$conn = conectar();
$w = crmVentaFiltros($conn, $ctx, $filtros);
$resumen = crmVentaResumen($conn, $w);
$base = crmVentaFrom() . ' WHERE ' . $w['sql'];
// Con líneas: los JOIN van antes del WHERE.
$conLineas = crmVentaFrom() . ' JOIN crm_venta_lineas l ON l.id_venta = v.id LEFT JOIN crm_catalogo_items i ON i.id = l.id_item'
    . ' LEFT JOIN crm_catalogo_categorias cat ON cat.id = i.id_categoria WHERE ' . $w['sql'];

switch ($vista) {
    case 'lista':
        $orden = ['fecha' => 'v.fecha', 'total' => 'v.total', 'cliente' => 'c.nombre_completo', 'documento' => 'v.documento'][$_POST['orden'] ?? 'fecha'] ?? 'v.fecha';
        $dir = strtolower((string)($_POST['dir'] ?? 'desc')) === 'asc' ? 'ASC' : 'DESC';
        $rows = crmRows($conn,
            "SELECT v.id, v.fecha, v.documento, v.total, v.unidades, v.activo, v.id_importacion, v.id_contacto, c.nombre_completo AS cliente, c.tipo AS cliente_tipo,
                    (SELECT COUNT(*) FROM crm_venta_lineas l WHERE l.id_venta = v.id) AS lineas
             $base ORDER BY $orden $dir, v.id DESC LIMIT ? OFFSET ?", $w['types'] . 'ii', [...$w['params'], $porPagina, $offset]);
        foreach ($rows as &$r) {
            foreach (['id', 'id_contacto', 'lineas'] as $k) $r[$k] = (int)$r[$k];
            $r['id_importacion'] = $r['id_importacion'] !== null ? (int)$r['id_importacion'] : null;
            $r['total'] = (float)$r['total']; $r['unidades'] = (float)$r['unidades']; $r['activo'] = (int)$r['activo'] === 1;
        }
        unset($r);
        $conn->close();
        crmOk(['ventas' => $rows, 'total' => $resumen['ventas'], 'pagina' => $pagina, 'por_pagina' => $porPagina, 'resumen' => $resumen]);

    case 'clientes':
        $n = (int)crmRow($conn, "SELECT COUNT(DISTINCT v.id_contacto) AS n $base", $w['types'], $w['params'])['n'];
        $rows = crmRows($conn,
            "SELECT v.id_contacto AS id, c.nombre_completo AS nombre, c.tipo, COUNT(*) AS ventas, SUM(v.total) AS total, SUM(v.unidades) AS unidades, MAX(v.fecha) AS ultima
             $base GROUP BY v.id_contacto, c.nombre_completo, c.tipo ORDER BY total DESC, v.id_contacto LIMIT ? OFFSET ?", $w['types'] . 'ii', [...$w['params'], $porPagina, $offset]);
        foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['ventas'] = (int)$r['ventas']; $r['total'] = (float)$r['total']; $r['unidades'] = (float)$r['unidades']; }
        unset($r);
        break;

    case 'items':
        $grupo = "COALESCE(CONCAT('i', l.id_item), CONCAT('c', COALESCE(l.codigo, l.descripcion, '')))";
        $n = (int)crmRow($conn, "SELECT COUNT(DISTINCT $grupo) AS n $conLineas", $w['types'], $w['params'])['n'];
        $rows = crmRows($conn,
            "SELECT MAX(l.id_item) AS id_item, COALESCE(MAX(i.codigo), MAX(l.codigo)) AS codigo, COALESCE(MAX(i.nombre), MAX(l.descripcion), MAX(l.codigo)) AS nombre,
                    MAX(cat.nombre) AS categoria, MAX(i.unidad) AS unidad, SUM(l.cantidad) AS cantidad, SUM(l.total) AS total, COUNT(DISTINCT v.id) AS ventas
             $conLineas
             GROUP BY $grupo ORDER BY total DESC LIMIT ? OFFSET ?", $w['types'] . 'ii', [...$w['params'], $porPagina, $offset]);
        foreach ($rows as &$r) { $r['id_item'] = $r['id_item'] !== null ? (int)$r['id_item'] : null; $r['cantidad'] = (float)$r['cantidad']; $r['total'] = (float)$r['total']; $r['ventas'] = (int)$r['ventas']; }
        unset($r);
        break;

    case 'categorias':
        $rows = crmRows($conn,
            "SELECT i.id_categoria, COALESCE(cat.nombre, '') AS nombre, SUM(l.cantidad) AS cantidad, SUM(l.total) AS total, COUNT(DISTINCT v.id) AS ventas
             $conLineas
             GROUP BY i.id_categoria, cat.nombre ORDER BY total DESC", $w['types'], $w['params']);
        foreach ($rows as &$r) { $r['id_categoria'] = $r['id_categoria'] !== null ? (int)$r['id_categoria'] : null; $r['cantidad'] = (float)$r['cantidad']; $r['total'] = (float)$r['total']; $r['ventas'] = (int)$r['ventas']; }
        unset($r);
        $n = count($rows);
        break;

    case 'meses':
        $rows = crmRows($conn,
            "SELECT DATE_FORMAT(v.fecha, '%Y-%m') AS mes, COUNT(*) AS ventas, SUM(v.total) AS total, SUM(v.unidades) AS unidades, COUNT(DISTINCT v.id_contacto) AS clientes
             $base GROUP BY mes ORDER BY mes", $w['types'], $w['params']);
        foreach ($rows as &$r) { $r['ventas'] = (int)$r['ventas']; $r['total'] = (float)$r['total']; $r['unidades'] = (float)$r['unidades']; $r['clientes'] = (int)$r['clientes']; }
        unset($r);
        $n = count($rows);
        break;

    default:
        authFail(400, 'Vista inválida');
}
$conn->close();

crmOk(['grupos' => $rows, 'total' => $n, 'pagina' => $pagina, 'por_pagina' => $porPagina, 'resumen' => $resumen]);
