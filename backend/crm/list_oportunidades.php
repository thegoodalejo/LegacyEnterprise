<?php
// Listado y tablero de oportunidades de la sede activa. Filtros combinables (ver crmOpFiltros).
// POST: vista (lista|tablero), filtros (JSON), pagina, por_pagina, orden (creado|titulo|valor|etapa|cierre|contacto), dir (asc|desc).
//   lista   → {oportunidades, total, pagina, por_pagina, resumen, config}
//   tablero → {id_embudo, columnas:[{etapa, total, valor, ponderado, oportunidades, hay_mas}], resumen, config}. Cada columna trae las primeras
//             CRM_OP_TABLERO_POR_COLUMNA tarjetas; el resto se pide en modo lista con filtros.etapas = [id] y pagina.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$vista     = ($_POST['vista'] ?? 'lista') === 'tablero' ? 'tablero' : 'lista';
$filtros   = crmJsonParam('filtros') ?? [];
$pagina    = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(CRM_POR_PAGINA_MAX, max(1, (int)($_POST['por_pagina'] ?? 25)));

$conn = conectar();
$cfg = crmConfig($conn, $ctx['id_empresa']);

if ($vista === 'lista') {
    $f = crmOpFiltros($conn, $ctx, $filtros);
    $total = (int)crmRow($conn, 'SELECT COUNT(*) AS n ' . crmOpFrom() . ' WHERE ' . $f['sql'], $f['types'], $f['params'])['n'];
    $rows = crmRows($conn,
        crmOpSelect() . ' WHERE ' . $f['sql'] . ' ORDER BY ' . crmOpOrden($_POST['orden'] ?? 'creado', $_POST['dir'] ?? 'desc') . ' LIMIT ? OFFSET ?',
        $f['types'] . 'ii', [...$f['params'], $porPagina, ($pagina - 1) * $porPagina]);
    $rows = crmOpFilas($conn, $rows);
    $resumen = crmOpResumen($conn, $f);
    $conn->close();
    crmOk(['oportunidades' => $rows, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina, 'resumen' => $resumen, 'config' => $cfg]);
}

// ─── Tablero: una columna por etapa del embudo ───────────────────────────────────────────────────────────────────────
$embudos = crmEmbudos($conn, $ctx['id_empresa'], true);
$idEmbudo = (int)($filtros['id_embudo'] ?? 0);
$embudo = null;
foreach ($embudos as $e) if ($idEmbudo === 0 || $e['id'] === $idEmbudo) { $embudo = $e; break; }
if (!$embudo) crmOk(['id_embudo' => null, 'columnas' => [], 'resumen' => crmOpResumen($conn, ['sql' => '1 = 0', 'types' => '', 'params' => []]), 'config' => $cfg]);
$filtros['id_embudo'] = $embudo['id'];

$f = crmOpFiltros($conn, $ctx, $filtros);
$agregados = [];
foreach (crmRows($conn,
    'SELECT o.id_etapa, COUNT(*) AS n, COALESCE(SUM(o.valor), 0) AS valor ' . crmOpFrom() . ' WHERE ' . $f['sql'] . ' GROUP BY o.id_etapa', $f['types'], $f['params']) as $r) {
    $agregados[(int)$r['id_etapa']] = ['n' => (int)$r['n'], 'valor' => (float)$r['valor']];
}

$soloEtapas = crmInts($filtros['etapas'] ?? []);
$columnas = [];
foreach ($embudo['etapas'] as $etapa) {
    if ($soloEtapas && !in_array($etapa['id'], $soloEtapas, true)) continue;
    $ag = $agregados[$etapa['id']] ?? ['n' => 0, 'valor' => 0.0];
    if (!$etapa['activo'] && $ag['n'] === 0) continue;   // una etapa desactivada solo aparece si aún tiene oportunidades
    $orden = $etapa['tipo'] === 'abierta' ? 'o.valor DESC, o.id DESC' : 'COALESCE(o.fecha_cierre_real, DATE(o.created_at)) DESC, o.id DESC';
    $rows = $ag['n'] > 0
        ? crmOpFilas($conn, crmRows($conn, crmOpSelect() . ' WHERE ' . $f['sql'] . ' AND o.id_etapa = ? ORDER BY ' . $orden . ' LIMIT ?',
            $f['types'] . 'ii', [...$f['params'], $etapa['id'], CRM_OP_TABLERO_POR_COLUMNA]))
        : [];
    $columnas[] = [
        'etapa' => $etapa, 'total' => $ag['n'], 'valor' => round($ag['valor'], 2),
        'ponderado' => round($ag['valor'] * $etapa['probabilidad'] / 100, 2),
        'oportunidades' => $rows, 'hay_mas' => $ag['n'] > count($rows),
    ];
}
$resumen = crmOpResumen($conn, $f);
$conn->close();

crmOk(['id_embudo' => $embudo['id'], 'columnas' => $columnas, 'resumen' => $resumen, 'config' => $cfg]);
