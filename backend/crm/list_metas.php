<?php
// Metas visibles en la sesión con su avance calculado. Cualquiera con acceso al CRM.
// POST: vista (lista|panel|referencia).
//   lista      → filtros (JSON, ver crmMetaFiltros), corte (AAAA-MM-DD, opcional: datos hasta ese día; nunca después de hoy),
//                orden (avance|ritmo|meta|real|nombre|periodo), dir (asc|desc), pagina, por_pagina
//                → {metas:[…], total, pagina, por_pagina, conteo:{total, cumplida, en_ritmo, en_riesgo, atrasada, no_cumplida, futura}, corte, config}
//   panel      → fecha (AAAA-MM-DD, por defecto hoy): las metas vigentes ese día, en tres niveles y con datos hasta ese día (o hasta hoy)
//                → {fecha, corte, empresa:[…], sede:[…], organizaciones:{total, con_meta, activas, grupos:[…], atencion:[…]}, config}
//   referencia → id_metrica, ambito, id_contacto (ámbito organizacion), periodo, fecha, fecha_fin (personalizado)
//                → {inicio, fin, actual, anterior:{inicio, fin, real}, anio_anterior:{inicio, fin, real}}: para decidir cuánto pedir.
// El avance de la meta de EMPRESA suma todas las sedes de la empresa: solo se devuelve ese total.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_metas.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$vista = (string)($_POST['vista'] ?? 'lista');
$conn = conectar();
$cfg = crmConfig($conn, $ctx['id_empresa']);

switch ($vista) {
    case 'lista':
        $filtros = crmJsonParam('filtros') ?? [];
        $corte = crmMetaCorte(crmFecha($_POST['corte'] ?? null, 'Corte') ?? crmFecha($filtros['fecha'] ?? null, 'Fecha'));
        $pagina = max(1, (int)($_POST['pagina'] ?? 1));
        $porPagina = min(CRM_POR_PAGINA_MAX, max(1, (int)($_POST['por_pagina'] ?? 25)));
        $dir = strtolower((string)($_POST['dir'] ?? 'asc')) === 'desc' ? 'desc' : 'asc';
        $metas = crmMetasConAvance($conn, $ctx, $filtros, $corte);
        $conteo = crmMetaConteo($metas);
        if (!empty($filtros['estado_avance'])) {
            $estados = array_values(array_intersect((array)$filtros['estado_avance'], CRM_META_ESTADOS));
            $metas = array_values(array_filter($metas, static fn($m) => in_array($m['estado'], $estados, true)));
        }
        $metas = crmMetaOrdenar($metas, (string)($_POST['orden'] ?? 'avance'), $dir);
        $total = count($metas);
        $pag = crmMetaCobertura($conn, $ctx, array_slice($metas, ($pagina - 1) * $porPagina, $porPagina));
        $conn->close();
        crmOk(['metas' => $pag, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina, 'conteo' => $conteo, 'corte' => $corte, 'config' => $cfg]);

    case 'panel':
        $fecha = crmFecha($_POST['fecha'] ?? null, 'Fecha') ?? date('Y-m-d');
        $corte = crmMetaCorte($fecha);
        $metas = crmMetasConAvance($conn, $ctx, ['fecha' => $fecha], $corte);
        $porAmbito = ['empresa' => [], 'sede' => [], 'organizacion' => []];
        foreach ($metas as $m) $porAmbito[$m['ambito']][] = $m;
        $orden = static fn(array $l) => crmMetaOrdenar($l, 'panel', 'asc');
        $empresa = crmMetaCobertura($conn, $ctx, $orden($porAmbito['empresa']));
        $sede = crmMetaCobertura($conn, $ctx, $orden($porAmbito['sede']));

        // Organizaciones: un grupo por métrica y período. Las sumas no cuentan dos veces: si la organización padre también tiene meta en el
        // grupo, la hija se cuenta en el número y en los estados, pero su meta y su real ya están dentro de los del padre.
        $orgs = $porAmbito['organizacion'];
        $grupos = [];
        foreach ($orgs as $m) {
            $k = $m['id_metrica'] . '|' . $m['fecha_inicio'] . '|' . $m['fecha_fin'];
            $grupos[$k] ??= [
                'id_metrica' => $m['id_metrica'], 'metrica_nombre' => $m['metrica_nombre'], 'metrica_orden' => $m['metrica_orden'], 'dias_total' => $m['dias_total'],
                'formato' => $m['formato'], 'unidad' => $m['unidad'], 'filtro' => $m['filtro'],
                'periodo' => $m['periodo'], 'fecha_inicio' => $m['fecha_inicio'], 'fecha_fin' => $m['fecha_fin'], 'tiempo_pct' => $m['tiempo_pct'],
                'n' => 0, 'meta' => 0.0, 'real' => 0.0, 'esperado' => 0.0, 'estados' => array_fill_keys(CRM_META_ESTADOS, 0), '_ids' => [],
            ];
            $grupos[$k]['n']++;
            $grupos[$k]['estados'][$m['estado']]++;
            $grupos[$k]['_ids'][$m['id_contacto']] = true;
        }
        foreach ($orgs as $m) {
            $k = $m['id_metrica'] . '|' . $m['fecha_inicio'] . '|' . $m['fecha_fin'];
            if ($m['id_padre'] !== null && isset($grupos[$k]['_ids'][$m['id_padre']])) continue;
            $grupos[$k]['meta'] += $m['valor_meta']; $grupos[$k]['real'] += $m['real']; $grupos[$k]['esperado'] += $m['esperado'];
        }
        foreach ($grupos as &$g) {
            unset($g['_ids']);
            $g['porcentaje'] = $g['meta'] > 0 ? round($g['real'] / $g['meta'] * 100, 2) : 0.0;
            $g['meta'] = round($g['meta'], 4); $g['real'] = round($g['real'], 4); $g['esperado'] = round($g['esperado'], 4);
        }
        unset($g);
        $grupos = array_values($grupos);
        usort($grupos, static fn($a, $b) => [$a['dias_total'], $a['metrica_orden'], $a['metrica_nombre'], $a['fecha_inicio']] <=> [$b['dias_total'], $b['metrica_orden'], $b['metrica_nombre'], $b['fecha_inicio']]);
        // Las que piden atención: atrasadas, en riesgo o terminadas sin cumplir, de peor a mejor ritmo.
        $atencion = crmMetaOrdenar(array_values(array_filter($orgs, static fn($m) => in_array($m['estado'], ['atrasada', 'en_riesgo', 'no_cumplida'], true))), 'ritmo', 'asc');
        $activas = (int)crmRow($conn, "SELECT COUNT(*) AS n FROM crm_contactos WHERE id_sede = ? AND tipo = 'organizacion' AND activo = 1", 'i', [$ctx['id_sede']])['n'];
        $conn->close();
        crmOk([
            'fecha' => $fecha, 'corte' => $corte, 'empresa' => $empresa, 'sede' => $sede,
            'organizaciones' => [
                'total' => count($orgs), 'con_meta' => count(array_unique(array_column($orgs, 'id_contacto'))), 'activas' => $activas,
                'conteo' => crmMetaConteo($orgs), 'grupos' => $grupos, 'atencion' => array_slice($atencion, 0, 5), 'atencion_total' => count($atencion),
            ],
            'config' => $cfg,
        ]);

    case 'referencia':
        $mt = crmMetrica($conn, $ctx, (int)($_POST['id_metrica'] ?? 0));
        if (!$mt) authFail(404, 'Métrica no encontrada');
        $ambito = (string)($_POST['ambito'] ?? '');
        if (!in_array($ambito, CRM_META_AMBITOS, true)) authFail(400, 'Ámbito inválido');
        [$ini, $fin] = crmMetaPeriodo((string)($_POST['periodo'] ?? ''), crmFecha($_POST['fecha'] ?? null, 'Fecha'), crmFecha($_POST['fecha_fin'] ?? null, 'Fecha final'));
        $ids = match ($ambito) {
            'empresa' => [$ctx['id_empresa']],
            'sede' => [$ctx['id_sede']],
            default => [crmMetaOrganizacion($conn, $ctx, (int)($_POST['id_contacto'] ?? 0))[0]],
        };
        $clave = $ambito === 'empresa' ? '0' : (string)$ids[0];
        $hoy = date('Y-m-d');
        $real = static function (string $a, string $b) use ($conn, $mt, $ambito, $ids, $ctx, $clave, $hoy): float {
            $b = min($b, $hoy);
            return $b < $a ? 0.0 : (crmMetaConsulta($conn, $mt, $a, $b, $ambito, $ids, $ctx['id_sede'])[$clave] ?? 0.0);
        };
        $out = ['inicio' => $ini, 'fin' => $fin, 'actual' => $real($ini, $fin)];
        foreach (crmMetaPeriodosReferencia((string)$_POST['periodo'], $ini, $fin) as $k => [$a, $b]) $out[$k] = ['inicio' => $a, 'fin' => $b, 'real' => $real($a, $b)];
        $conn->close();
        crmOk($out + ['formato' => $mt['formato'], 'config' => $cfg]);

    default:
        authFail(400, 'Vista inválida');
}
