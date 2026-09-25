<?php
// Acciones en lote sobre oportunidades (y el caso de una sola): archivar, restaurar (L2+), tags_agregar, tags_quitar.
// POST: accion, seleccion (JSON: {ids:[…]} o {filtros:{…}, excluidos:[…], total_esperado:N}), tag_ids (JSON, solo tags_*).
// Una transacción; la selección se resuelve SIEMPRE dentro de la sede de la sesión. Historial: una fila por oportunidad, con un lote común.
// Devuelve {procesados, sin_cambios, omitidos:[{id,motivo,tag?}], omitidos_total, lote}.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$accion = (string)($_POST['accion'] ?? '');
if (in_array($accion, ['archivar', 'restaurar'], true)) requireRole('L2');
elseif (!in_array($accion, ['tags_agregar', 'tags_quitar'], true)) authFail(400, 'Acción inválida');

$conn = conectar();
$conn->begin_transaction();

$res = crmOpResolverSeleccion($conn, $ctx, crmJsonParam('seleccion') ?? []);
$ops = $res['oportunidades'];
$lote = historialLote();
$omitidos = [];
foreach ($res['no_encontrados'] as $idx) $omitidos[] = ['id' => $idx, 'motivo' => 'no_encontrado'];
$procesados = 0;
$sinCambios = 0;

if ($accion === 'archivar' || $accion === 'restaurar') {
    $destino = $accion === 'archivar' ? 0 : 1;
    $ids = [];
    foreach ($ops as $o) { if ((int)$o['activo'] === $destino) $sinCambios++; else $ids[] = (int)$o['id']; }
    foreach (array_chunk($ids, 500) as $chunk) {
        crmExec($conn, 'UPDATE crm_oportunidades SET activo = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id_sede = ? AND id IN (' . crmMarks(count($chunk)) . ')',
            'iii' . str_repeat('i', count($chunk)), [$destino, $ctx['id_usuario'], $ctx['id_sede'], ...$chunk]);
    }
    $procesados = count($ids);
    auditRegistroVarios($conn, $ctx['id_sede'], 'crm', 'crm_oportunidades', $ids, $accion === 'archivar' ? 'archivado' : 'restaurado', ['lote' => $lote]);
} else {
    $tagIds = crmInts(crmJsonParam('tag_ids') ?? []);
    if (!$tagIds) authFail(400, 'Elige al menos una etiqueta');
    if (count($tagIds) > CRM_TAGS_LOTE_MAX) authFail(400, 'Máximo ' . CRM_TAGS_LOTE_MAX . ' etiquetas por operación');
    $tags = crmTagsPorIds($conn, $ctx['id_empresa'], $tagIds);
    foreach ($tagIds as $tid) {
        if (!isset($tags[$tid])) authFail(400, 'Etiqueta inexistente');
        if ($accion === 'tags_agregar' && (int)$tags[$tid]['activo'] !== 1) authFail(400, 'La etiqueta «' . $tags[$tid]['nombre'] . '» está desactivada');
        if ($accion === 'tags_agregar' && $tags[$tid]['aplica_a'] !== null && $tags[$tid]['aplica_a'] !== 'oportunidad') {
            authFail(400, 'La etiqueta «' . $tags[$tid]['nombre'] . '» no aplica a oportunidades');
        }
    }
    $idsOp = array_map(static fn($o) => (int)$o['id'], $ops);
    $existentes = [];
    foreach (array_chunk($idsOp, 500) as $chunk) {
        foreach (crmRows($conn,
            'SELECT id_oportunidad, id_tag FROM crm_oportunidad_tags WHERE id_oportunidad IN (' . crmMarks(count($chunk)) . ') AND id_tag IN (' . crmMarks(count($tagIds)) . ')',
            str_repeat('i', count($chunk) + count($tagIds)), [...$chunk, ...$tagIds]) as $r) $existentes[$r['id_oportunidad'] . ':' . $r['id_tag']] = true;
    }
    $pares = []; $tocados = []; $porNombres = [];
    foreach ($idsOp as $ido) {
        $nombres = [];
        foreach ($tagIds as $tid) {
            $tiene = isset($existentes["$ido:$tid"]);
            if ($accion === 'tags_agregar' ? $tiene : !$tiene) continue;
            $pares[] = [$ido, $tid];
            $nombres[] = $tags[$tid]['nombre'];
        }
        if ($nombres) { $tocados[] = $ido; $porNombres[json_encode($nombres, JSON_UNESCAPED_UNICODE)][] = $ido; }
        else $sinCambios++;
    }
    if ($accion === 'tags_agregar') {
        foreach (array_chunk($pares, 400) as $chunk) {
            $vals = []; $params = [];
            foreach ($chunk as [$ido, $tid]) { $vals[] = '(?, ?, ?)'; array_push($params, $ido, $tid, $ctx['id_usuario']); }
            crmExec($conn, 'INSERT INTO crm_oportunidad_tags (id_oportunidad, id_tag, created_by) VALUES ' . implode(',', $vals), str_repeat('iii', count($chunk)), $params);
        }
    } else {
        foreach (array_chunk($tocados, 500) as $chunk) {
            crmExec($conn, 'DELETE FROM crm_oportunidad_tags WHERE id_oportunidad IN (' . crmMarks(count($chunk)) . ') AND id_tag IN (' . crmMarks(count($tagIds)) . ')',
                str_repeat('i', count($chunk) + count($tagIds)), [...$chunk, ...$tagIds]);
        }
    }
    crmOpTocar($conn, $ctx, $tocados);
    foreach ($porNombres as $json => $idsGrupo) {
        auditRegistroVarios($conn, $ctx['id_sede'], 'crm', 'crm_oportunidades', $idsGrupo,
            $accion === 'tags_agregar' ? 'tags_agregados' : 'tags_quitados', ['tags' => json_decode($json, true), 'lote' => $lote]);
    }
    $procesados = count($tocados);
}

$conn->commit();
$conn->close();

crmOk(['procesados' => $procesados, 'sin_cambios' => $sinCambios, 'omitidos' => array_slice($omitidos, 0, 50), 'omitidos_total' => count($omitidos), 'lote' => $lote]);
