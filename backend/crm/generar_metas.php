<?php
// Genera metas de organización en lote para un período (L4+): la misma meta para todas, o cada una según su histórico con un crecimiento.
// POST: accion (simular|guardar), id_metrica (activa), periodo, fecha, fecha_fin (personalizado),
//       destino (todas|principales: sin organización padre), tags (JSON, opcional: solo las que tengan alguna de esas etiquetas),
//       base (fijo|historico), valor (fijo), referencia (anio_anterior|anterior), crecimiento (% sobre el histórico, −100 a 1000),
//       minimo (opcional: meta para las que no tienen histórico; sin mínimo, esas se omiten), redondeo (0, 1, 10, …, 1000000),
//       existentes (omitir|reemplazar: qué hacer con las organizaciones que ya tienen esa meta).
// simular → {filas:[…] (hasta 200, de mayor a menor meta), nuevas, reemplazadas, omitidas, sin_base, suma_meta, organizaciones, base:{inicio, fin}}
// guardar → lo mismo, ya escrito (una transacción; historial «creado»/«actualizado» con el mismo lote; auditoría crm_generar_metas).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_metas.php';

$ctx = crmContext();
requireRole('L4');

$accion = (string)($_POST['accion'] ?? 'simular');
if (!in_array($accion, ['simular', 'guardar'], true)) authFail(400, 'Acción inválida');
$periodo = (string)($_POST['periodo'] ?? '');
[$ini, $fin] = crmMetaPeriodo($periodo, crmFecha($_POST['fecha'] ?? null, 'Fecha'), crmFecha($_POST['fecha_fin'] ?? null, 'Fecha final'));
$destino = (string)($_POST['destino'] ?? 'todas');
if (!in_array($destino, ['todas', 'principales'], true)) authFail(400, 'Destino inválido');
$tags = array_slice(crmInts(crmJsonParam('tags') ?? []), 0, CRM_TAGS_LOTE_MAX);
$base = (string)($_POST['base'] ?? 'fijo');
if (!in_array($base, ['fijo', 'historico'], true)) authFail(400, 'Base inválida');
$existentes = ($_POST['existentes'] ?? 'omitir') === 'reemplazar' ? 'reemplazar' : 'omitir';
$redondeo = (int)($_POST['redondeo'] ?? 0);
if (!in_array($redondeo, [0, 1, 10, 100, 1000, 10000, 100000, 1000000], true)) authFail(400, 'Redondeo inválido');
$valor = 0.0; $referencia = 'anio_anterior'; $crecimiento = 0.0; $minimo = null;
$num = static function (string $k, string $label, bool $req) {
    $v = crmDecimal($_POST[$k] ?? null, $label);
    if ($v === null && $req) authFail(400, "$label es obligatorio");
    return $v === null ? null : (float)$v;
};
if ($base === 'fijo') {
    $valor = $num('valor', 'Meta', true);
    if ($valor <= 0 || $valor >= CRM_META_VALOR_MAX) authFail(400, 'La meta debe ser mayor que cero');
} else {
    $referencia = ($_POST['referencia'] ?? 'anio_anterior') === 'anterior' ? 'anterior' : 'anio_anterior';
    $crecimiento = $num('crecimiento', 'Crecimiento', false) ?? 0.0;
    if ($crecimiento < -100 || $crecimiento > 1000) authFail(400, 'El crecimiento va de −100 % a 1000 %');
    $minimo = $num('minimo', 'Mínimo', false);
    if ($minimo !== null && ($minimo <= 0 || $minimo >= CRM_META_VALOR_MAX)) authFail(400, 'El mínimo debe ser mayor que cero');
}

$conn = conectar();
$mt = crmMetrica($conn, $ctx, (int)($_POST['id_metrica'] ?? 0));
if (!$mt) authFail(404, 'Métrica no encontrada');
if (!$mt['activo']) authFail(400, 'La métrica está desactivada');

// 1. Organizaciones destino (activas, de la sede de la sesión).
$sql = "SELECT c.id, c.nombre_completo FROM crm_contactos c JOIN crm_contactos_organizaciones oo ON oo.id = c.id
         WHERE c.id_sede = ? AND c.tipo = 'organizacion' AND c.activo = 1";
$t = 'i'; $p = [$ctx['id_sede']];
if ($destino === 'principales') $sql .= ' AND oo.id_padre IS NULL';
if ($tags) { $sql .= ' AND EXISTS (SELECT 1 FROM crm_contacto_tags ct WHERE ct.id_contacto = c.id AND ct.id_tag IN (' . crmMarks(count($tags)) . '))'; $t .= str_repeat('i', count($tags)); array_push($p, ...$tags); }
$orgs = crmRows($conn, $sql . ' ORDER BY c.nombre_completo, c.id', $t, $p);
if (!$orgs) authFail(400, 'Ninguna organización cumple el destino elegido');
if (count($orgs) > CRM_METAS_GENERAR_MAX) authFail(400, 'Máximo ' . number_format(CRM_METAS_GENERAR_MAX, 0, ',', '.') . ' organizaciones por generación. Afina el destino con etiquetas.');
$ids = array_map(static fn($o) => (int)$o['id'], $orgs);

// 2. Base de cada organización (histórico con sus dependientes directas, igual que su avance).
$baseInfo = null;
$historico = [];
if ($base === 'historico') {
    [$bIni, $bFin] = crmMetaPeriodosReferencia($periodo, $ini, $fin)[$referencia];
    $baseInfo = ['inicio' => $bIni, 'fin' => $bFin, 'referencia' => $referencia];
    $bFin = min($bFin, date('Y-m-d'));
    if ($bFin >= $bIni) foreach (array_chunk($ids, 500) as $chunk) $historico += crmMetaConsulta($conn, $mt, $bIni, $bFin, 'organizacion', $chunk, $ctx['id_sede']);
}

// 3. Metas que ya existen para esas organizaciones (activas o eliminadas).
$ya = [];
foreach (array_chunk($ids, 500) as $chunk) {
    foreach (crmRows($conn, "SELECT id, id_contacto, activo, valor_meta FROM crm_metas
                              WHERE id_empresa = ? AND id_metrica = ? AND ambito = 'organizacion' AND fecha_inicio = ? AND fecha_fin = ? AND id_contacto IN (" . crmMarks(count($chunk)) . ')',
        'iiss' . str_repeat('i', count($chunk)), [$ctx['id_empresa'], $mt['id'], $ini, $fin, ...$chunk]) as $r) $ya[(int)$r['id_contacto']] = $r;
}

// 4. Meta propuesta por organización.
$res = ['nuevas' => 0, 'reemplazadas' => 0, 'omitidas' => 0, 'sin_base' => 0, 'suma_meta' => 0.0, 'organizaciones' => count($orgs), 'base' => $baseInfo];
$filas = [];
$redondear = static fn(float $v) => $redondeo > 0 ? round($v / $redondeo) * $redondeo : round($v, 4);
foreach ($orgs as $o) {
    $idc = (int)$o['id'];
    $b = $base === 'historico' ? ($historico[(string)$idc] ?? 0.0) : null;
    if ($base === 'fijo') $meta = $redondear($valor);
    elseif ($b > 0) $meta = $redondear($b * (1 + $crecimiento / 100));
    else $meta = $minimo !== null ? $redondear($minimo) : 0.0;
    $e = $ya[$idc] ?? null;
    $activa = $e && (int)$e['activo'] === 1;
    if ($activa && $existentes === 'omitir') $accionFila = 'omitir';   // la que ya tiene meta se queda como está, tenga o no histórico
    elseif ($meta <= 0) $accionFila = 'sin_base';
    elseif ($activa) $accionFila = 'reemplazar';
    else $accionFila = 'nueva';
    $res[['sin_base' => 'sin_base', 'omitir' => 'omitidas', 'reemplazar' => 'reemplazadas', 'nueva' => 'nuevas'][$accionFila]]++;
    if (in_array($accionFila, ['nueva', 'reemplazar'], true)) $res['suma_meta'] += $meta;
    $filas[] = ['id_contacto' => $idc, 'nombre' => $o['nombre_completo'], 'base' => $b, 'meta' => $meta, 'actual' => $e && $activa ? (float)$e['valor_meta'] : null,
                'accion' => $accionFila, '_existente' => $e];
}

if ($accion === 'guardar') {
    if (!$res['nuevas'] && !$res['reemplazadas']) authFail(400, 'No hay metas para guardar con estas opciones');
    $conn->begin_transaction();
    $lote = historialLote();
    $det = ['origen' => 'generar', 'lote' => $lote, 'metrica' => $mt['nombre'], 'ambito' => 'organizacion', 'periodo' => $periodo, 'inicio' => $ini, 'fin' => $fin];
    $nuevas = []; $cambiadas = [];
    foreach ($filas as $f) {
        if ($f['accion'] === 'nueva' && $f['_existente']) {   // eliminada antes: se reactiva
            crmExec($conn, 'UPDATE crm_metas SET periodo = ?, valor_meta = ?, activo = 1, updated_by = ? WHERE id = ?', 'sdii', [$periodo, $f['meta'], $ctx['id_usuario'], (int)$f['_existente']['id']]);
            $cambiadas[] = (int)$f['_existente']['id'];
        } elseif ($f['accion'] === 'nueva') {
            $nuevas[] = $f;
        } elseif ($f['accion'] === 'reemplazar') {
            crmExec($conn, 'UPDATE crm_metas SET valor_meta = ?, updated_by = ? WHERE id = ?', 'dii', [$f['meta'], $ctx['id_usuario'], (int)$f['_existente']['id']]);
            $cambiadas[] = (int)$f['_existente']['id'];
        }
    }
    $idsNuevas = [];
    foreach (array_chunk($nuevas, 200) as $chunk) {
        $vals = []; $params = [];
        foreach ($chunk as $f) {
            $vals[] = "(?, ?, 'organizacion', ?, ?, ?, ?, ?, ?, ?, ?)";
            array_push($params, $ctx['id_empresa'], $mt['id'], $ctx['id_sede'], $f['id_contacto'], $periodo, $ini, $fin, $f['meta'], $ctx['id_usuario'], $ctx['id_usuario']);
        }
        crmExec($conn, 'INSERT INTO crm_metas (id_empresa, id_metrica, ambito, id_sede, id_contacto, periodo, fecha_inicio, fecha_fin, valor_meta, created_by, updated_by) VALUES ' . implode(',', $vals),
            str_repeat('iiiisssdii', count($chunk)), $params);
        // Los ids se leen por la clave natural (no se asume que el autoincremento sea consecutivo).
        $idc = array_column($chunk, 'id_contacto');
        foreach (crmRows($conn, "SELECT id FROM crm_metas WHERE id_empresa = ? AND id_metrica = ? AND ambito = 'organizacion' AND fecha_inicio = ? AND fecha_fin = ? AND id_contacto IN (" . crmMarks(count($idc)) . ')',
            'iiss' . str_repeat('i', count($idc)), [$ctx['id_empresa'], $mt['id'], $ini, $fin, ...$idc]) as $r) $idsNuevas[] = (int)$r['id'];
    }
    auditRegistroVarios($conn, $ctx['id_sede'], 'crm', 'crm_metas', $idsNuevas, 'creado', $det);
    auditRegistroVarios($conn, $ctx['id_sede'], 'crm', 'crm_metas', $cambiadas, 'actualizado', $det);
    auditAdmin($conn, 'crm_generar_metas', ['metrica' => $mt['nombre'], 'inicio' => $ini, 'fin' => $fin, 'base' => $base, 'nuevas' => $res['nuevas'], 'reemplazadas' => $res['reemplazadas'], 'lote' => $lote]);
    $conn->commit();
}
$conn->close();

usort($filas, static fn($a, $b) => [$b['meta'], $a['nombre']] <=> [$a['meta'], $b['nombre']]);
$res['filas'] = array_map(static function ($f) { unset($f['_existente']); return $f; }, array_slice($filas, 0, 200));
$res['suma_meta'] = round($res['suma_meta'], 4);
$res['inicio'] = $ini; $res['fin'] = $fin;
crmOk($res, $accion === 'guardar' ? 'Metas generadas' : 'Simulación');
