<?php
// Ítems del catálogo (productos, servicios, tratamientos…) de la empresa: selector de las líneas de una oportunidad y pantalla de configuración.
// POST: q (código o nombre, por palabras), id_categoria, solo_activos (0|1), pagina, por_pagina (máx. 100).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$pagina = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(CRM_POR_PAGINA_MAX, max(1, (int)($_POST['por_pagina'] ?? 50)));

$w = ['i.id_empresa = ?']; $t = 'i'; $p = [$ctx['id_empresa']];
if (($_POST['solo_activos'] ?? '0') === '1') $w[] = 'i.activo = 1';
if (!empty($_POST['id_categoria'])) { $w[] = 'i.id_categoria = ?'; $t .= 'i'; $p[] = (int)$_POST['id_categoria']; }
foreach (array_slice(preg_split('/\s+/u', trim((string)($_POST['q'] ?? ''))) ?: [], 0, 6) as $tok) {
    if ($tok === '') continue;
    $like = '%' . addcslashes(mb_substr($tok, 0, 60), '\%_') . '%';
    $w[] = '(i.nombre LIKE ? OR i.codigo LIKE ?)'; $t .= 'ss'; array_push($p, $like, $like);
}

$conn = conectar();
$total = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_catalogo_items i WHERE ' . implode(' AND ', $w), $t, $p)['n'];
$rows = crmRows($conn,
    'SELECT i.id, i.id_categoria, c.nombre AS categoria, i.codigo, i.nombre, i.unidad, i.precio_ref, i.activo
       FROM crm_catalogo_items i LEFT JOIN crm_catalogo_categorias c ON c.id = i.id_categoria
      WHERE ' . implode(' AND ', $w) . ' ORDER BY i.nombre, i.id LIMIT ? OFFSET ?', $t . 'ii', [...$p, $porPagina, ($pagina - 1) * $porPagina]);
$conn->close();

foreach ($rows as &$r) {
    $r['id'] = (int)$r['id'];
    $r['id_categoria'] = $r['id_categoria'] !== null ? (int)$r['id_categoria'] : null;
    $r['precio_ref'] = $r['precio_ref'] !== null ? (float)$r['precio_ref'] : null;
    $r['activo'] = (int)$r['activo'] === 1;
}

crmOk(['items' => $rows, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina]);
