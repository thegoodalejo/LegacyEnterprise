<?php
// Oportunidades para exportar a PDF/Excel (los arma el navegador), por páginas. Misma selección que las acciones en lote:
// POST: seleccion (JSON {ids:[…]} o {filtros:{…}, excluidos:[…], total_esperado:N}), pagina, por_pagina (máx. 1000), formato (pdf|xlsx, para la auditoría).
// Devuelve {oportunidades:[…], lineas:[…] (las de las oportunidades de la página), campos:[definiciones activas], total, pagina, por_pagina, config}.
// Se rechaza (409) si el total cambió desde que el usuario lo vio. La primera página deja una fila en le_H_admin (crm_exportar).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$sel = crmJsonParam('seleccion') ?? [];
$pagina    = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(CRM_EXPORT_PAGINA_MAX, max(1, (int)($_POST['por_pagina'] ?? 500)));

$conn = conectar();
if (isset($sel['ids'])) {
    $ids = crmInts($sel['ids']);
    if (!$ids) authFail(400, 'No hay oportunidades seleccionadas');
    if (count($ids) > CRM_BULK_MAX) authFail(400, 'Máximo ' . CRM_BULK_MAX . ' oportunidades seleccionadas. Usa los resultados del filtro.');
    $w = ['sql' => 'o.id_sede = ? AND o.id IN (' . crmMarks(count($ids)) . ')', 'types' => 'i' . str_repeat('i', count($ids)), 'params' => [$ctx['id_sede'], ...$ids]];
} elseif (is_array($sel['filtros'] ?? null)) {
    $w = crmOpFiltros($conn, $ctx, $sel['filtros']);
    $excluidos = crmInts($sel['excluidos'] ?? []);
    if ($excluidos) {
        $w['sql'] .= ' AND o.id NOT IN (' . crmMarks(count($excluidos)) . ')';
        $w['types'] .= str_repeat('i', count($excluidos));
        array_push($w['params'], ...$excluidos);
    }
} else {
    authFail(400, 'Selección inválida');
}

$total = (int)crmRow($conn, 'SELECT COUNT(*) AS n ' . crmOpFrom() . ' WHERE ' . $w['sql'], $w['types'], $w['params'])['n'];
if (isset($sel['total_esperado']) && (int)$sel['total_esperado'] !== $total) authFail(409, 'Los resultados cambiaron desde que los seleccionaste. Vuelve a exportar.');
if ($total === 0) authFail(400, 'No hay oportunidades para exportar');
if ($total > CRM_EXPORT_MAX) authFail(400, 'Máximo ' . number_format(CRM_EXPORT_MAX, 0, ',', '.') . ' oportunidades por exportación. Afina el filtro.');

$rows = crmRows($conn,
    'SELECT o.id, o.titulo, o.valor, o.fecha_cierre_estimada, o.estado, o.fecha_cierre_real, o.etapa_desde, o.activo, o.created_at, o.updated_at, o.descripcion,
            c.nombre_completo AS contacto_nombre, c.tipo AS contacto_tipo, pc.nombre_completo AS persona_nombre,
            b.nombre AS embudo_nombre, b.orden AS embudo_orden, e.id AS id_etapa, e.nombre AS etapa_nombre, e.orden AS etapa_orden, e.tipo AS etapa_tipo,
            e.probabilidad AS etapa_probabilidad, m.nombre AS motivo_nombre,
            COALESCE(ru.nombre, ru.email) AS responsable_nombre, COALESCE(cu.nombre, cu.email) AS creado_por, COALESCE(uu.nombre, uu.email) AS modificado_por
       ' . crmOpFrom() . '
       JOIN crm_embudos b ON b.id = o.id_embudo
  LEFT JOIN crm_motivos_cierre m ON m.id = o.id_motivo_cierre
  LEFT JOIN le_usuarios cu ON cu.id = o.created_by
  LEFT JOIN le_usuarios uu ON uu.id = o.updated_by
      WHERE ' . $w['sql'] . '
   ORDER BY b.orden, b.id, e.orden, e.id, o.valor DESC, o.id
      LIMIT ? OFFSET ?',
    $w['types'] . 'ii', [...$w['params'], $porPagina, ($pagina - 1) * $porPagina]);

$campos = array_values(array_filter(crmCampos($conn, $ctx['id_empresa'], 'oportunidad'), static fn($d) => $d['activo']));
$tipoCampo = [];
foreach ($campos as $d) $tipoCampo[$d['id']] = $d['tipo_dato'];

$ids = array_map(static fn($r) => (int)$r['id'], $rows);
$tags = []; $valores = []; $lineas = [];
if ($ids) {
    $m = crmMarks(count($ids));
    $ti = str_repeat('i', count($ids));
    foreach (crmRows($conn, "SELECT ot.id_oportunidad, t.nombre FROM crm_oportunidad_tags ot JOIN crm_tags t ON t.id = ot.id_tag WHERE ot.id_oportunidad IN ($m) ORDER BY t.orden, t.nombre", $ti, $ids) as $r) {
        $tags[(int)$r['id_oportunidad']][] = $r['nombre'];
    }
    foreach (crmRows($conn, "SELECT id_oportunidad, id_campo, valor_entero, valor_decimal, valor_texto, valor_booleano, valor_fecha FROM crm_oportunidad_valores WHERE id_oportunidad IN ($m)", $ti, $ids) as $r) {
        $tipo = $tipoCampo[(int)$r['id_campo']] ?? null;
        if ($tipo !== null) $valores[(int)$r['id_oportunidad']][(int)$r['id_campo']] = crmValorDeFila($r, $tipo);
    }
    foreach (crmRows($conn,
        "SELECT l.id_oportunidad, l.orden, i.codigo AS item_codigo, i.nombre AS item_nombre, i.unidad AS item_unidad, cat.nombre AS categoria,
                l.descripcion, l.cantidad, l.precio_unitario, l.total
           FROM crm_oportunidad_lineas l
      LEFT JOIN crm_catalogo_items i ON i.id = l.id_item
      LEFT JOIN crm_catalogo_categorias cat ON cat.id = i.id_categoria
          WHERE l.id_oportunidad IN ($m) ORDER BY l.id_oportunidad, l.orden, l.id", $ti, $ids) as $r) {
        foreach (['cantidad', 'precio_unitario', 'total'] as $k) $r[$k] = (float)$r[$k];
        $r['id_oportunidad'] = (int)$r['id_oportunidad'];
        unset($r['orden']);
        $lineas[] = $r;
    }
}

if ($pagina === 1) {
    $fmt = in_array($_POST['formato'] ?? '', ['pdf', 'xlsx'], true) ? $_POST['formato'] : null;
    auditAdmin($conn, 'crm_exportar', [
        'reporte' => 'oportunidades', 'formato' => $fmt, 'filas' => $total,
        'seleccion' => isset($sel['ids']) ? ['ids' => count(crmInts($sel['ids']))] : ['filtros' => $sel['filtros'], 'excluidos' => count(crmInts($sel['excluidos'] ?? []))],
    ]);
}
$cfg = crmConfig($conn, $ctx['id_empresa']);
$conn->close();

foreach ($rows as &$r) {
    foreach (['id', 'embudo_orden', 'id_etapa', 'etapa_orden', 'etapa_probabilidad'] as $k) $r[$k] = (int)$r[$k];
    $r['valor'] = (float)$r['valor'];
    $r['activo'] = (int)$r['activo'] === 1;
    $r['etiquetas'] = $tags[$r['id']] ?? [];
    $r['campos'] = (object)($valores[$r['id']] ?? []);
}
unset($r);

crmOk([
    'oportunidades' => $rows, 'lineas' => $lineas, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina, 'config' => $cfg,
    'campos' => array_map(static fn($d) => ['id' => $d['id'], 'etiqueta' => $d['etiqueta'], 'tipo_dato' => $d['tipo_dato']], $campos),
]);
