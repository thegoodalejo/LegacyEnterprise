<?php
// Helpers de metas del CRM (backend/crm/*meta*, *metrica*). Diseño: docs/modulos/crm.md («Metas»).
// Reglas que viven aquí para que ningún endpoint las reimplemente:
//   - métricas y metas son de la EMPRESA de la sesión; una meta de sede u organización además es de su SEDE y solo se ve desde ella;
//   - la meta de EMPRESA suma todas las sedes de la empresa y se devuelve solo como total (nunca filas de otras sedes);
//   - el período se normaliza siempre aquí (crmMetaPeriodo): un «mes» va del 1 al último día, un trimestre de enero/abril/julio/octubre…;
//   - el avance NO se guarda: se calcula al consultar (crmMetaProgreso) desde las ventas activas y las oportunidades activas,
//     con los datos hasta la fecha de CORTE (hoy, o el final del mes que se está mirando).

require_once __DIR__ . '/_crm.php';

const CRM_META_FUENTES = [
    'ventas_valor', 'ventas_unidades', 'ventas_numero', 'clientes_compra',
    'oportunidades_ganadas_valor', 'oportunidades_ganadas_numero', 'oportunidades_creadas',
];
const CRM_META_PERIODOS = ['mes', 'trimestre', 'semestre', 'anio', 'personalizado'];
const CRM_META_AMBITOS = ['empresa', 'sede', 'organizacion'];
const CRM_META_ESTADOS = ['cumplida', 'en_ritmo', 'en_riesgo', 'atrasada', 'no_cumplida', 'futura'];
const CRM_META_RIESGO = 0.9;          // debajo del ritmo esperado, pero con al menos el 90 % de lo esperado: «en riesgo»; menos: «atrasada»
const CRM_METAS_CALC_MAX = 5000;      // metas por consulta (el avance se calcula para todas antes de ordenar y paginar)
const CRM_META_DIAS_MAX = 1096;       // un período personalizado dura como mucho 3 años
const CRM_METAS_GENERAR_MAX = 2000;   // organizaciones por generación en lote
const CRM_META_VALOR_MAX = 1e14;

// ─── Métricas ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** 'moneda' para las fuentes en dinero; 'numero' para las demás. */
function crmMetaFormato(string $fuente): string
{
    return str_ends_with($fuente, '_valor') ? 'moneda' : 'numero';
}

/** true = la fuente sale de ventas importadas; false = de oportunidades. */
function crmMetaDeVentas(string $fuente): bool
{
    return str_starts_with($fuente, 'ventas_') || $fuente === 'clientes_compra';
}

function crmMetricaOut(array $r): array
{
    return [
        'id' => (int)$r['id'], 'nombre' => $r['nombre'], 'fuente' => $r['fuente'], 'formato' => crmMetaFormato($r['fuente']),
        'id_item' => $r['id_item'] !== null ? (int)$r['id_item'] : null, 'item_nombre' => $r['item_nombre'] ?? null,
        'id_categoria' => $r['id_categoria'] !== null ? (int)$r['id_categoria'] : null, 'categoria_nombre' => $r['categoria_nombre'] ?? null,
        'unidad' => $r['unidad'], 'descripcion' => $r['descripcion'], 'orden' => (int)$r['orden'], 'activo' => (int)$r['activo'] === 1,
        'metas' => (int)($r['metas'] ?? 0),
    ];
}

function crmMetricaSelect(): string
{
    return 'SELECT mt.id, mt.nombre, mt.fuente, mt.id_item, mt.id_categoria, mt.unidad, mt.descripcion, mt.orden, mt.activo,
                   i.nombre AS item_nombre, cat.nombre AS categoria_nombre, (SELECT COUNT(*) FROM crm_metas m WHERE m.id_metrica = mt.id AND m.activo = 1) AS metas
              FROM crm_metricas mt LEFT JOIN crm_catalogo_items i ON i.id = mt.id_item LEFT JOIN crm_catalogo_categorias cat ON cat.id = mt.id_categoria';
}

/** Métricas de la empresa (id => métrica), con el nombre del ítem o categoría que filtran y cuántas metas activas tienen. */
function crmMetricas(mysqli $conn, int $idEmpresa, bool $soloActivas = false): array
{
    $out = [];
    foreach (crmRows($conn, crmMetricaSelect() . ' WHERE mt.id_empresa = ?' . ($soloActivas ? ' AND mt.activo = 1' : '') . ' ORDER BY mt.orden, mt.nombre', 'i', [$idEmpresa]) as $r) {
        $out[(int)$r['id']] = crmMetricaOut($r);
    }
    return $out;
}

/** Métrica de la empresa de la sesión por id, o null. */
function crmMetrica(mysqli $conn, array $ctx, int $id): ?array
{
    $r = crmRow($conn, crmMetricaSelect() . ' WHERE mt.id = ? AND mt.id_empresa = ? LIMIT 1', 'ii', [$id, $ctx['id_empresa']]);
    return $r ? crmMetricaOut($r) : null;
}

// ─── Períodos ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Período normalizado [inicio, fin] (AAAA-MM-DD). Para mes, trimestre, semestre y año basta una fecha cualquiera dentro del período;
 * «personalizado» usa $fecha como inicio y exige $fin (fin ≥ inicio, máximo 3 años). Corta con 400 si algo no cuadra.
 */
function crmMetaPeriodo(string $periodo, ?string $fecha, ?string $fin = null): array
{
    if (!in_array($periodo, CRM_META_PERIODOS, true)) authFail(400, 'Período inválido');
    if ($fecha === null) authFail(400, 'Falta la fecha del período');
    $d = new DateTimeImmutable($fecha);
    $y = (int)$d->format('Y');
    $m = (int)$d->format('n');
    if ($y < 2000 || $y > 2100) authFail(400, 'Año fuera de rango (2000–2100)');
    $inicioMes = static fn(int $mes) => new DateTimeImmutable(sprintf('%04d-%02d-01', $y, $mes));
    switch ($periodo) {
        case 'mes':
            $a = $inicioMes($m); $b = $a->modify('last day of this month'); break;
        case 'trimestre':
            $a = $inicioMes(intdiv($m - 1, 3) * 3 + 1); $b = $a->modify('+2 months')->modify('last day of this month'); break;
        case 'semestre':
            $a = $inicioMes($m <= 6 ? 1 : 7); $b = $a->modify('+5 months')->modify('last day of this month'); break;
        case 'anio':
            $a = $inicioMes(1); $b = new DateTimeImmutable("$y-12-31"); break;
        default:
            if ($fin === null) authFail(400, 'Falta la fecha final del período');
            $a = $d;
            $b = new DateTimeImmutable($fin);
            if ($b < $a) authFail(400, 'La fecha final es anterior a la inicial');
            if ((int)$a->diff($b)->days >= CRM_META_DIAS_MAX) authFail(400, 'Un período personalizado dura como mucho 3 años');
            if ((int)$b->format('Y') > 2100) authFail(400, 'Año fuera de rango (2000–2100)');
    }
    return [$a->format('Y-m-d'), $b->format('Y-m-d')];
}

/**
 * Períodos de comparación de un período: el anterior (mismo tipo, justo antes; en uno personalizado, los mismos días justo antes)
 * y el mismo del año anterior. Devuelve ['anterior' => [inicio, fin], 'anio_anterior' => [inicio, fin]].
 */
function crmMetaPeriodosReferencia(string $periodo, string $inicio, string $fin): array
{
    $a = new DateTimeImmutable($inicio);
    $b = new DateTimeImmutable($fin);
    if ($periodo === 'personalizado') {
        $dias = (int)$a->diff($b)->days + 1;
        $antes = [$a->modify("-$dias days")->format('Y-m-d'), $a->modify('-1 day')->format('Y-m-d')];
        $anio = [$a->modify('-1 year')->format('Y-m-d'), $b->modify('-1 year')->format('Y-m-d')];
        return ['anterior' => $antes, 'anio_anterior' => $anio];
    }
    $dia = $a->modify('-1 day')->format('Y-m-d');   // cualquier día del período anterior sirve para normalizarlo
    return ['anterior' => crmMetaPeriodo($periodo, $dia), 'anio_anterior' => crmMetaPeriodo($periodo, $a->modify('-1 year')->format('Y-m-d'))];
}

// ─── Valor real ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Valor real de una métrica entre dos fechas, para varios dueños a la vez. Devuelve [clave => valor]:
 *   empresa      → $ids = [id_empresa]; clave '0' (todas las sedes de la empresa);
 *   sede         → $ids = ids de sede; clave = id de sede;
 *   organizacion → $ids = ids de organizaciones de $idSede; clave = id de la organización. Cada una suma sus ventas u oportunidades y las de las
 *                  organizaciones que dependen DIRECTAMENTE de ella (como el perfil y el filtro «con dependientes» de Ventas).
 * Ventas: solo activas, por fecha de venta. Oportunidades: solo activas; ganadas por fecha de cierre real; nuevas por fecha de creación.
 * Con filtro de ítem o categoría, los montos y las cantidades salen de las líneas que cumplen el filtro y los conteos cuentan documentos
 * u oportunidades que tienen al menos una de esas líneas.
 */
function crmMetaConsulta(mysqli $conn, array $metrica, string $desde, string $hasta, string $ambito, array $ids, int $idSede = 0): array
{
    if (!$ids) return [];
    $fuente = $metrica['fuente'];
    $ventas = crmMetaDeVentas($fuente);
    $a = $ventas ? 'v' : 'o';
    $filtrada = $metrica['id_item'] !== null || $metrica['id_categoria'] !== null;
    $t = ''; $p = [];

    // 1. Origen y líneas (solo cuando hay filtro por ítem o categoría).
    $sql = $ventas ? 'FROM crm_ventas v' : 'FROM crm_oportunidades o';
    if ($filtrada) {
        $sql .= $ventas ? ' JOIN crm_venta_lineas l ON l.id_venta = v.id' : ' JOIN crm_oportunidad_lineas l ON l.id_oportunidad = o.id';
        if ($metrica['id_item'] !== null) { $sql .= ' AND l.id_item = ?'; $t .= 'i'; $p[] = $metrica['id_item']; }
        else { $sql .= ' JOIN crm_catalogo_items ci ON ci.id = l.id_item AND ci.id_categoria = ?'; $t .= 'i'; $p[] = $metrica['id_categoria']; }
    }
    // 2. Dueño: organizaciones con sus dependientes directas.
    if ($ambito === 'organizacion') {
        $m = crmMarks(count($ids));
        $sql .= " JOIN (SELECT c.id AS id_contacto, c.id AS objetivo FROM crm_contactos c WHERE c.id IN ($m)
                        UNION ALL
                        SELECT oo.id AS id_contacto, oo.id_padre AS objetivo FROM crm_contactos_organizaciones oo WHERE oo.id_padre IN ($m)) u ON u.id_contacto = $a.id_contacto";
        $t .= str_repeat('i', count($ids) * 2); array_push($p, ...$ids, ...$ids);
    }
    // 3. Condiciones.
    if ($ventas) {
        $w = 'v.activo = 1 AND v.fecha BETWEEN ? AND ?'; $t .= 'ss'; array_push($p, $desde, $hasta);
    } elseif ($fuente === 'oportunidades_creadas') {
        $w = 'o.activo = 1 AND o.created_at >= ? AND o.created_at < ?'; $t .= 'ss';
        array_push($p, $desde . ' 00:00:00', (new DateTimeImmutable($hasta))->modify('+1 day')->format('Y-m-d') . ' 00:00:00');
    } else {
        $w = "o.activo = 1 AND o.estado = 'ganada' AND o.fecha_cierre_real BETWEEN ? AND ?"; $t .= 'ss'; array_push($p, $desde, $hasta);
    }
    if ($ambito === 'empresa') {
        $w .= " AND $a.id_sede IN (SELECT s.id FROM le_sedes s WHERE s.id_empresa = ?)"; $t .= 'i'; $p[] = (int)$ids[0]; $clave = '0';
    } elseif ($ambito === 'sede') {
        $w .= " AND $a.id_sede IN (" . crmMarks(count($ids)) . ')'; $t .= str_repeat('i', count($ids)); array_push($p, ...$ids); $clave = "$a.id_sede";
    } else {
        $w .= " AND $a.id_sede = ?"; $t .= 'i'; $p[] = $idSede; $clave = 'u.objetivo';
    }
    // 4. Agregado según la fuente.
    $agg = match ($fuente) {
        'ventas_valor' => $filtrada ? 'SUM(l.total)' : 'SUM(v.total)',
        'ventas_unidades' => $filtrada ? 'SUM(l.cantidad)' : 'SUM(v.unidades)',
        'ventas_numero' => 'COUNT(DISTINCT v.id)',
        'clientes_compra' => 'COUNT(DISTINCT v.id_contacto)',
        'oportunidades_ganadas_valor' => $filtrada ? 'SUM(l.total)' : 'SUM(o.valor)',
        default => 'COUNT(DISTINCT o.id)',
    };
    $out = [];
    foreach (crmRows($conn, "SELECT $clave AS k, COALESCE($agg, 0) AS valor $sql WHERE $w GROUP BY k", $t, $p) as $r) {
        $out[(string)$r['k']] = (float)$r['valor'];
    }
    return $out;
}

/**
 * Valor real de cada meta con los datos hasta la fecha de corte: [id_meta => valor]. Agrupa las metas por métrica, ámbito y período
 * y resuelve cada grupo con una sola consulta (las de organización, con GROUP BY por organización). Las metas futuras no consultan nada.
 */
function crmMetaReales(mysqli $conn, array $ctx, array $metas, array $metricas, string $corte): array
{
    $grupos = [];
    foreach ($metas as $m) {
        $hasta = min($m['fecha_fin'], $corte);
        if ($hasta < $m['fecha_inicio'] || !isset($metricas[(int)$m['id_metrica']])) continue;
        $grupos[$m['id_metrica'] . '|' . $m['ambito'] . '|' . $m['fecha_inicio'] . '|' . $hasta][] = $m;
    }
    $out = [];
    foreach ($grupos as $g) {
        $mt = $metricas[(int)$g[0]['id_metrica']];
        $desde = $g[0]['fecha_inicio'];
        $hasta = min($g[0]['fecha_fin'], $corte);
        $ambito = $g[0]['ambito'];
        if ($ambito === 'empresa') {
            $v = crmMetaConsulta($conn, $mt, $desde, $hasta, 'empresa', [$ctx['id_empresa']]);
            foreach ($g as $m) $out[(int)$m['id']] = $v['0'] ?? 0.0;
            continue;
        }
        $clave = $ambito === 'sede' ? 'id_sede' : 'id_contacto';
        $ids = array_values(array_unique(array_map(static fn($m) => (int)$m[$clave], $g)));
        $v = [];
        foreach (array_chunk($ids, 500) as $chunk) $v += crmMetaConsulta($conn, $mt, $desde, $hasta, $ambito, $chunk, $ctx['id_sede']);
        foreach ($g as $m) $out[(int)$m['id']] = $v[(string)(int)$m[$clave]] ?? 0.0;
    }
    return $out;
}

/**
 * Avance de una meta a la fecha de corte. Ritmo lineal: lo esperado a la fecha es la meta × días transcurridos / días del período.
 * Si el corte es HOY, el día de hoy todavía no cuenta como transcurrido (a primera hora no hay nada que esperar de hoy).
 * Estados: futura (no ha empezado) · cumplida (real ≥ meta, en cualquier momento) · no_cumplida (terminó sin llegar) · en_ritmo (real ≥ esperado)
 * · en_riesgo (real ≥ 90 % de lo esperado) · atrasada.
 */
function crmMetaCalcular(array $m, float $real, string $corte, string $hoy): array
{
    $ini = new DateTimeImmutable($m['fecha_inicio']);
    $fin = new DateTimeImmutable($m['fecha_fin']);
    $c = new DateTimeImmutable($corte);
    $total = (int)$ini->diff($fin)->days + 1;
    $trans = $c < $ini ? 0 : min($total, (int)$ini->diff($c)->days + 1);
    if ($corte === $hoy && $c <= $fin && $trans > 0) $trans--;
    $meta = (float)$m['valor_meta'];
    $esperado = $meta * $trans / $total;
    $cerrada = $trans >= $total;
    if ($c < $ini) $estado = 'futura';
    elseif ($meta > 0 && $real >= $meta) $estado = 'cumplida';
    elseif ($cerrada) $estado = 'no_cumplida';
    elseif ($real >= $esperado) $estado = 'en_ritmo';
    elseif ($real >= $esperado * CRM_META_RIESGO) $estado = 'en_riesgo';
    else $estado = 'atrasada';
    return [
        'real' => round($real, 4),
        'porcentaje' => $meta > 0 ? round($real / $meta * 100, 2) : 0.0,
        'esperado' => round($esperado, 4),
        'tiempo_pct' => round($trans / $total * 100, 2),
        'ritmo' => $esperado > 0 ? round($real / $esperado, 4) : null,
        'proyeccion' => $trans > 0 ? round($cerrada ? $real : $real * $total / $trans, 4) : null,
        'faltante' => round(max(0.0, $meta - $real), 4),
        'dias_total' => $total,
        'dias_transcurridos' => $trans,
        'estado' => $estado,
    ];
}

// ─── Listado ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** SELECT común de metas (alias m, mt = métrica, c = organización, oo = su extensión, s = sede). */
function crmMetaSelect(): string
{
    return 'SELECT m.id, m.id_metrica, m.ambito, m.id_sede, m.id_contacto, m.periodo, m.fecha_inicio, m.fecha_fin, m.valor_meta, m.nota, m.activo,
                   m.created_at, m.updated_at, mt.nombre AS metrica_nombre, mt.fuente, mt.unidad, mt.orden AS metrica_orden, mt.activo AS metrica_activa,
                   c.nombre_completo AS contacto_nombre, c.activo AS contacto_activo, oo.id_padre, s.nombre AS sede_nombre
              ' . crmMetaFrom();
}

function crmMetaFrom(): string
{
    return 'FROM crm_metas m JOIN crm_metricas mt ON mt.id = m.id_metrica
         LEFT JOIN crm_contactos c ON c.id = m.id_contacto LEFT JOIN crm_contactos_organizaciones oo ON oo.id = m.id_contacto
         LEFT JOIN le_sedes s ON s.id = m.id_sede';
}

/**
 * WHERE (alias m, mt, c) de las metas visibles en la sesión: las de ámbito empresa de su empresa y las de sede u organización de SU sede.
 * Claves: fecha (vigentes ese día), desde (terminan ese día o después), hasta (empiezan ese día o antes), ambito, id_metrica, id_contacto,
 * q (nombre de la organización o de la métrica, por palabras), estado (activas|inactivas|todas; por defecto activas).
 */
function crmMetaFiltros(array $ctx, array $f): array
{
    $w = ['m.id_empresa = ?', "(m.ambito = 'empresa' OR m.id_sede = ?)"]; $t = 'ii'; $p = [$ctx['id_empresa'], $ctx['id_sede']];
    $estado = $f['estado'] ?? 'activas';
    if ($estado === 'activas') $w[] = 'm.activo = 1';
    elseif ($estado === 'inactivas') $w[] = 'm.activo = 0';
    elseif ($estado !== 'todas') authFail(400, 'Filtro de estado inválido');
    $fecha = crmFecha($f['fecha'] ?? null, 'Fecha');
    if ($fecha !== null) { $w[] = 'm.fecha_inicio <= ? AND m.fecha_fin >= ?'; $t .= 'ss'; array_push($p, $fecha, $fecha); }
    $desde = crmFecha($f['desde'] ?? null, 'Desde');
    if ($desde !== null) { $w[] = 'm.fecha_fin >= ?'; $t .= 's'; $p[] = $desde; }
    $hasta = crmFecha($f['hasta'] ?? null, 'Hasta');
    if ($hasta !== null) { $w[] = 'm.fecha_inicio <= ?'; $t .= 's'; $p[] = $hasta; }
    if (!empty($f['ambito'])) {
        if (!in_array($f['ambito'], CRM_META_AMBITOS, true)) authFail(400, 'Ámbito inválido');
        $w[] = 'm.ambito = ?'; $t .= 's'; $p[] = $f['ambito'];
    }
    if (!empty($f['id_metrica'])) { $w[] = 'm.id_metrica = ?'; $t .= 'i'; $p[] = (int)$f['id_metrica']; }
    if (!empty($f['id_contacto'])) { $w[] = 'm.id_contacto = ?'; $t .= 'i'; $p[] = (int)$f['id_contacto']; }
    foreach (array_slice(preg_split('/\s+/u', trim((string)($f['q'] ?? ''))) ?: [], 0, 6) as $tok) {
        if ($tok === '') continue;
        $like = '%' . addcslashes(mb_substr($tok, 0, 60), '\%_') . '%';
        $w[] = '(c.busqueda LIKE ? OR mt.nombre LIKE ?)'; $t .= 'ss'; array_push($p, $like, $like);
    }
    return ['sql' => implode(' AND ', $w), 'types' => $t, 'params' => $p];
}

/** Da tipos a las filas de crmMetaSelect() y les agrega el avance a la fecha de corte. */
function crmMetaProgreso(mysqli $conn, array $ctx, array $rows, string $corte, ?array $metricas = null): array
{
    $metricas ??= crmMetricas($conn, $ctx['id_empresa']);
    $hoy = date('Y-m-d');
    $reales = crmMetaReales($conn, $ctx, $rows, $metricas, $corte);
    $out = [];
    foreach ($rows as $r) {
        $mt = $metricas[(int)$r['id_metrica']] ?? null;
        $o = [
            'id' => (int)$r['id'], 'id_metrica' => (int)$r['id_metrica'], 'metrica_nombre' => $r['metrica_nombre'], 'fuente' => $r['fuente'],
            'formato' => crmMetaFormato($r['fuente']), 'unidad' => $r['unidad'], 'metrica_orden' => (int)$r['metrica_orden'], 'metrica_activa' => (int)$r['metrica_activa'] === 1,
            'filtro' => $mt ? ($mt['item_nombre'] ?? $mt['categoria_nombre']) : null,
            'ambito' => $r['ambito'], 'id_sede' => $r['id_sede'] !== null ? (int)$r['id_sede'] : null, 'sede_nombre' => $r['sede_nombre'],
            'id_contacto' => $r['id_contacto'] !== null ? (int)$r['id_contacto'] : null, 'contacto_nombre' => $r['contacto_nombre'],
            'contacto_activo' => $r['contacto_activo'] !== null ? (int)$r['contacto_activo'] === 1 : null,
            'id_padre' => $r['id_padre'] !== null ? (int)$r['id_padre'] : null,
            'periodo' => $r['periodo'], 'fecha_inicio' => $r['fecha_inicio'], 'fecha_fin' => $r['fecha_fin'], 'valor_meta' => (float)$r['valor_meta'],
            'nota' => $r['nota'], 'activo' => (int)$r['activo'] === 1, 'created_at' => $r['created_at'], 'updated_at' => $r['updated_at'],
        ];
        $out[] = $o + crmMetaCalcular($r, $reales[(int)$r['id']] ?? 0.0, $corte, $hoy);
    }
    return $out;
}

/**
 * Cobertura de las metas de sede y de empresa: cuánto suman las metas del nivel de abajo con la misma métrica y el mismo período.
 *   sede    → metas de organización de esa sede; no suma una organización cuya organización padre también tiene meta (ya la incluye).
 *   empresa → metas de sede de todas las sedes de la empresa (solo el total y cuántas).
 * Agrega a cada meta 'cobertura' => ['n' => …, 'suma' => …] (null en las de organización).
 */
function crmMetaCobertura(mysqli $conn, array $ctx, array $metas): array
{
    foreach ($metas as &$m) {
        $m['cobertura'] = null;
        if ($m['ambito'] === 'sede') {
            $r = crmRow($conn,
                "SELECT COUNT(*) AS n, COALESCE(SUM(m.valor_meta), 0) AS suma
                   FROM crm_metas m LEFT JOIN crm_contactos_organizaciones oo ON oo.id = m.id_contacto
                  WHERE m.activo = 1 AND m.ambito = 'organizacion' AND m.id_sede = ? AND m.id_metrica = ? AND m.fecha_inicio = ? AND m.fecha_fin = ?
                    AND NOT EXISTS (SELECT 1 FROM crm_metas p WHERE p.activo = 1 AND p.ambito = 'organizacion' AND p.id_contacto = oo.id_padre
                                       AND p.id_metrica = m.id_metrica AND p.fecha_inicio = m.fecha_inicio AND p.fecha_fin = m.fecha_fin)",
                'iiss', [$m['id_sede'], $m['id_metrica'], $m['fecha_inicio'], $m['fecha_fin']]);
        } elseif ($m['ambito'] === 'empresa') {
            $r = crmRow($conn,
                "SELECT COUNT(*) AS n, COALESCE(SUM(valor_meta), 0) AS suma FROM crm_metas
                  WHERE activo = 1 AND ambito = 'sede' AND id_empresa = ? AND id_metrica = ? AND fecha_inicio = ? AND fecha_fin = ?",
                'iiss', [$ctx['id_empresa'], $m['id_metrica'], $m['fecha_inicio'], $m['fecha_fin']]);
        } else {
            continue;
        }
        $m['cobertura'] = ['n' => (int)$r['n'], 'suma' => (float)$r['suma']];
    }
    unset($m);
    return $metas;
}

/** Conteo por estado de una lista de metas con avance: {total, cumplida, en_ritmo, en_riesgo, atrasada, no_cumplida, futura}. */
function crmMetaConteo(array $metas): array
{
    $c = ['total' => count($metas)] + array_fill_keys(CRM_META_ESTADOS, 0);
    foreach ($metas as $m) $c[$m['estado']]++;
    return $c;
}

/** Ordena metas con avance. orden: avance|ritmo|meta|real|nombre|periodo|panel; dir asc|desc. Empate: nombre de la organización y id.
 *  «panel»: la más corta primero (mes antes que año), luego el orden de la métrica en la configuración y su nombre. */
function crmMetaOrdenar(array $metas, string $orden, string $dir): array
{
    $clave = match ($orden) {
        'ritmo' => static fn($m) => $m['ritmo'] ?? ($m['estado'] === 'futura' ? INF : $m['porcentaje'] / 100),
        'meta' => static fn($m) => $m['valor_meta'],
        'real' => static fn($m) => $m['real'],
        'periodo' => static fn($m) => $m['fecha_inicio'],
        'nombre' => static fn($m) => mb_strtolower(($m['contacto_nombre'] ?? '') . ' ' . $m['metrica_nombre']),
        'panel' => static fn($m) => [$m['dias_total'], $m['metrica_orden'], mb_strtolower($m['metrica_nombre']), $m['fecha_inicio']],
        default => static fn($m) => $m['porcentaje'],
    };
    $s = $dir === 'desc' ? -1 : 1;
    usort($metas, static function ($a, $b) use ($clave, $s) {
        $c = $clave($a) <=> $clave($b);
        if ($c === 0) $c = mb_strtolower((string)$a['contacto_nombre']) <=> mb_strtolower((string)$b['contacto_nombre']);
        return $c !== 0 ? $c * $s : $a['id'] <=> $b['id'];
    });
    return $metas;
}

/** Metas visibles con los filtros, con su avance a la fecha de corte (corta con 400 si pasan del tope de cálculo). */
function crmMetasConAvance(mysqli $conn, array $ctx, array $filtros, string $corte): array
{
    $w = crmMetaFiltros($ctx, $filtros);
    $n = (int)crmRow($conn, 'SELECT COUNT(*) AS n ' . crmMetaFrom() . ' WHERE ' . $w['sql'], $w['types'], $w['params'])['n'];
    if ($n > CRM_METAS_CALC_MAX) authFail(400, 'Demasiadas metas con estos filtros (máx. ' . number_format(CRM_METAS_CALC_MAX, 0, ',', '.') . '). Afina el filtro.');
    $rows = crmRows($conn, crmMetaSelect() . ' WHERE ' . $w['sql'] . ' ORDER BY m.id', $w['types'], $w['params']);
    return crmMetaProgreso($conn, $ctx, $rows, $corte);
}

/** Meta visible en la sesión por id (sin avance), o null. */
function crmMetaBase(mysqli $conn, array $ctx, int $id): ?array
{
    $r = crmRow($conn, crmMetaSelect() . " WHERE m.id = ? AND m.id_empresa = ? AND (m.ambito = 'empresa' OR m.id_sede = ?) LIMIT 1",
        'iii', [$id, $ctx['id_empresa'], $ctx['id_sede']]);
    return $r ?: null;
}

/**
 * Organización de la sede de la sesión para una meta: existe, es Organización y está activa. Devuelve [id, nombre].
 */
function crmMetaOrganizacion(mysqli $conn, array $ctx, int $id): array
{
    $c = crmRow($conn, "SELECT id, nombre_completo, activo FROM crm_contactos WHERE id = ? AND id_sede = ? AND tipo = 'organizacion' LIMIT 1", 'ii', [$id, $ctx['id_sede']]);
    if (!$c) authFail(404, 'Organización no encontrada');
    if ((int)$c['activo'] !== 1) authFail(400, 'La organización está archivada');
    return [(int)$c['id'], $c['nombre_completo']];
}

/** Fecha de corte de una consulta: la pedida (o hoy), nunca después de hoy (no hay datos del futuro). */
function crmMetaCorte(?string $fecha): string
{
    $hoy = date('Y-m-d');
    return $fecha !== null && $fecha < $hoy ? $fecha : $hoy;
}
