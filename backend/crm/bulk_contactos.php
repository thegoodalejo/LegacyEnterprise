<?php
// Acciones en lote sobre contactos (y el caso de uno solo): archivar, restaurar, tags_agregar, tags_quitar.
// POST: accion, seleccion (JSON: {ids:[…]} o {filtros:{…}, excluidos:[…], total_esperado:N}), tag_ids (JSON, solo tags_*).
// Una transacción; la selección se resuelve SIEMPRE dentro de la sede de la sesión (ids ajenos se reportan como no encontrados).
// Devuelve {procesados, sin_cambios, omitidos:[{id,motivo,tag?}], omitidos_total, lote}. Historial: una fila por contacto, mismo lote.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
$accion = (string)($_POST['accion'] ?? '');
if (in_array($accion, ['archivar', 'restaurar'], true)) requireRole('L2');
elseif (!in_array($accion, ['tags_agregar', 'tags_quitar'], true)) authFail(400, 'Acción inválida');

$conn = conectar();
$conn->begin_transaction();

$res = crmResolverSeleccion($conn, $ctx, crmJsonParam('seleccion') ?? []);
$contactos = $res['contactos'];
$lote = historialLote();
$omitidos = [];
foreach ($res['no_encontrados'] as $idx) $omitidos[] = ['id' => $idx, 'motivo' => 'no_encontrado'];
$procesados = 0;
$sinCambios = 0;

if ($accion === 'archivar' || $accion === 'restaurar') {
    $destino = $accion === 'archivar' ? 0 : 1;
    $ids = [];
    foreach ($contactos as $c) {
        if ((int)$c['activo'] === $destino) $sinCambios++; else $ids[] = (int)$c['id'];
    }
    foreach (array_chunk($ids, 500) as $chunk) {
        crmExec($conn,
            'UPDATE crm_contactos SET activo = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id_sede = ? AND id IN (' . crmMarks(count($chunk)) . ')',
            'iii' . str_repeat('i', count($chunk)), [$destino, $ctx['id_usuario'], $ctx['id_sede'], ...$chunk]);
    }
    $procesados = count($ids);
    auditRegistroVarios($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $ids, $accion === 'archivar' ? 'archivado' : 'restaurado', ['lote' => $lote]);
} else {
    $tagIds = crmInts(crmJsonParam('tag_ids') ?? []);
    if (!$tagIds) authFail(400, 'Elige al menos una etiqueta');
    if (count($tagIds) > CRM_TAGS_LOTE_MAX) authFail(400, 'Máximo ' . CRM_TAGS_LOTE_MAX . ' etiquetas por operación');
    $tags = crmTagsPorIds($conn, $ctx['id_empresa'], $tagIds);
    foreach ($tagIds as $tid) {
        if (!isset($tags[$tid])) authFail(400, 'Etiqueta inexistente');
        if ($accion === 'tags_agregar' && (int)$tags[$tid]['activo'] !== 1) authFail(400, 'La etiqueta «' . $tags[$tid]['nombre'] . '» está desactivada');
    }

    // Pares (contacto, tag) que ya existen, por bloques de contactos.
    $tipoDe = [];
    foreach ($contactos as $c) $tipoDe[(int)$c['id']] = $c['tipo'];
    $existentes = [];   // "idContacto:idTag" => true
    foreach (array_chunk(array_keys($tipoDe), 500) as $chunk) {
        foreach (crmRows($conn,
            'SELECT id_contacto, id_tag FROM crm_contacto_tags WHERE id_contacto IN (' . crmMarks(count($chunk)) . ') AND id_tag IN (' . crmMarks(count($tagIds)) . ')',
            str_repeat('i', count($chunk) + count($tagIds)), [...$chunk, ...$tagIds]) as $r) {
            $existentes[$r['id_contacto'] . ':' . $r['id_tag']] = true;
        }
    }

    $pares = [];        // pares a insertar o borrar
    $tocados = [];      // ids de contactos con algún cambio
    $porNombres = [];   // historial agrupado: JSON de nombres de tags => ids de contactos
    foreach ($tipoDe as $idc => $tipo) {
        $nombres = [];
        foreach ($tagIds as $tid) {
            $t = $tags[$tid];
            $tiene = isset($existentes["$idc:$tid"]);
            if ($accion === 'tags_agregar') {
                if ($t['aplica_a'] !== null && $t['aplica_a'] !== $tipo) { $omitidos[] = ['id' => $idc, 'motivo' => 'tag_no_aplica', 'tag' => $t['nombre']]; continue; }
                if ($tiene) continue;
            } elseif (!$tiene) {
                continue;
            }
            $pares[] = [$idc, $tid];
            $nombres[] = $t['nombre'];
        }
        if ($nombres) { $tocados[] = $idc; $porNombres[json_encode($nombres, JSON_UNESCAPED_UNICODE)][] = $idc; }
        else $sinCambios++;
    }

    if ($accion === 'tags_agregar') {
        foreach (array_chunk($pares, 400) as $chunk) {
            $vals = []; $params = [];
            foreach ($chunk as [$idc, $tid]) { $vals[] = '(?, ?, ?)'; array_push($params, $idc, $tid, $ctx['id_usuario']); }
            crmExec($conn, 'INSERT INTO crm_contacto_tags (id_contacto, id_tag, created_by) VALUES ' . implode(',', $vals),
                str_repeat('iii', count($chunk)), $params);
        }
    } else {
        foreach (array_chunk($tocados, 500) as $chunk) {
            crmExec($conn,
                'DELETE FROM crm_contacto_tags WHERE id_contacto IN (' . crmMarks(count($chunk)) . ') AND id_tag IN (' . crmMarks(count($tagIds)) . ')',
                str_repeat('i', count($chunk) + count($tagIds)), [...$chunk, ...$tagIds]);
        }
    }

    crmTocar($conn, $ctx, $tocados);
    foreach ($porNombres as $json => $idsGrupo) {
        auditRegistroVarios($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $idsGrupo,
            $accion === 'tags_agregar' ? 'tags_agregados' : 'tags_quitados', ['tags' => json_decode($json, true), 'lote' => $lote]);
    }
    $procesados = count($tocados);
}

$conn->commit();
$conn->close();

crmOk([
    'procesados' => $procesados, 'sin_cambios' => $sinCambios,
    'omitidos' => array_slice($omitidos, 0, 50), 'omitidos_total' => count($omitidos), 'lote' => $lote,
]);
