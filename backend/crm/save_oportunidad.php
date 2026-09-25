<?php
// Crea o edita una oportunidad (todo en una transacción). El formulario manda el registro completo; en edición, lo que no se manda no se toca.
// POST: id (0 = nueva), titulo, id_contacto, id_persona_contacto, id_responsable, valor, fecha_cierre_estimada, descripcion,
//       id_embudo / id_etapa (solo al crear; sin etapa arranca en la primera abierta del embudo),
//       lineas (JSON [{id_item|descripcion, cantidad, precio_unitario}]: si vienen, reemplazan las actuales y el valor pasa a ser su suma),
//       campos (JSON {id_campo: valor}), tag_ids (JSON). El cambio de etapa va aparte (move_oportunidad).
// Devuelve {id}.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$id = (int)($_POST['id'] ?? 0);
$dinero = static fn(float $v): string => number_format($v, 2, '.', '');

$conn = conectar();
$conn->begin_transaction();   // cualquier authFail posterior deja la transacción sin confirmar: se revierte sola

if ($id === 0) {
    $d = crmOpParsear($conn, $ctx, $_POST, null);
    $idEtapa = (int)($_POST['id_etapa'] ?? 0);
    $etapa = $idEtapa > 0 ? crmEtapa($conn, $ctx, $idEtapa) : crmEtapaInicial($conn, $ctx, (int)($_POST['id_embudo'] ?? 0));
    if (!$etapa) authFail(400, 'Configura un embudo con al menos una etapa abierta antes de crear oportunidades');
    if ($etapa['tipo'] !== 'abierta' || !$etapa['activo']) authFail(400, 'Una oportunidad nueva empieza en una etapa abierta y activa');
    if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_embudos WHERE id = ? AND id_empresa = ? AND activo = 1 LIMIT 1', 'ii', [$etapa['id_embudo'], $ctx['id_empresa']])) authFail(400, 'El embudo está desactivado');

    $items = crmJsonParam('lineas');
    $pl = $items !== null ? crmOpLineasParsear($conn, $ctx, $items) : ['lineas' => [], 'suma' => 0.0];
    $valor = $pl['lineas'] ? $pl['suma'] : $d['valor'];

    crmExec($conn,
        'INSERT INTO crm_oportunidades (id_sede, id_embudo, id_etapa, titulo, id_contacto, id_persona_contacto, id_responsable, valor, fecha_cierre_estimada, descripcion, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        'iiisiiisssii', [$ctx['id_sede'], $etapa['id_embudo'], $etapa['id'], $d['titulo'], $d['id_contacto'], $d['id_persona_contacto'], $d['id_responsable'],
            $dinero($valor), $d['fecha_cierre_estimada'], $d['descripcion'], $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_oportunidades', $id, 'creado',
        ['titulo' => $d['titulo'], 'contacto' => ['id' => $d['id_contacto'], 'nombre' => $d['contacto_nombre']], 'etapa' => $etapa['nombre'], 'valor' => $valor]);
    if ($pl['lineas']) crmOpGuardarLineas($conn, $ctx, $id, $pl['lineas']);
    crmGuardarCampos($conn, $ctx, $id, 'oportunidad', crmJsonParam('campos') ?? []);   // valida obligatorios aunque no manden nada
    if (($tags = crmJsonParam('tag_ids')) !== null) crmSetTags($conn, $ctx, $id, 'oportunidad', $tags);
} else {
    $actual = crmOpBase($conn, $ctx, $id);
    if (!$actual) authFail(404, 'Oportunidad no encontrada');
    $d = crmOpParsear($conn, $ctx, $_POST, $actual);

    $lineasAntes = crmOpLineas($conn, $id);
    $items = crmJsonParam('lineas');
    $pl = null;
    if ($items !== null) $pl = crmOpLineasParsear($conn, $ctx, $items, array_values(array_filter(array_column($lineasAntes, 'id_item'))));
    $valor = $pl !== null ? ($pl['lineas'] ? $pl['suma'] : $d['valor']) : ($lineasAntes ? $actual['valor'] : $d['valor']);

    $antes = ['titulo' => $actual['titulo'], 'contacto' => $actual['contacto_nombre'], 'persona_contacto' => $actual['persona_nombre'], 'responsable' => $actual['responsable_nombre'],
              'valor' => $actual['valor'], 'fecha_cierre_estimada' => $actual['fecha_cierre_estimada'], 'descripcion' => $actual['descripcion']];
    $despues = ['titulo' => $d['titulo'], 'contacto' => $d['contacto_nombre'], 'persona_contacto' => $d['persona_nombre'], 'responsable' => $d['responsable_nombre'],
                'valor' => $valor, 'fecha_cierre_estimada' => $d['fecha_cierre_estimada'], 'descripcion' => $d['descripcion']];
    $cambios = historialDiff($antes, $despues);
    $tocar = false;

    if ($cambios) {
        crmExec($conn,
            'UPDATE crm_oportunidades SET titulo = ?, id_contacto = ?, id_persona_contacto = ?, id_responsable = ?, valor = ?, fecha_cierre_estimada = ?, descripcion = ?, updated_by = ?
              WHERE id = ? AND id_sede = ?',
            'siiisssiii', [$d['titulo'], $d['id_contacto'], $d['id_persona_contacto'], $d['id_responsable'], $dinero($valor), $d['fecha_cierre_estimada'], $d['descripcion'],
                $ctx['id_usuario'], $id, $ctx['id_sede']]);
    }
    if ($pl !== null) {
        $ra = crmOpResumenLineas($lineasAntes); $rd = crmOpResumenLineas($pl['lineas']);
        if ($ra !== $rd) { $cambios[] = ['campo' => 'lineas', 'antes' => $ra !== '' ? $ra : null, 'despues' => $rd !== '' ? $rd : null]; $tocar = true; }
        crmOpGuardarLineas($conn, $ctx, $id, $pl['lineas']);
    }
    $detalle = [];
    if (($campos = crmJsonParam('campos')) !== null) {
        $c = crmGuardarCampos($conn, $ctx, $id, 'oportunidad', $campos);
        if ($c) { $cambios = array_merge($cambios, $c); $tocar = true; }
    }
    if (($tags = crmJsonParam('tag_ids')) !== null) {
        $t = crmSetTags($conn, $ctx, $id, 'oportunidad', $tags);
        if ($t['agregados'] || $t['quitados']) { $detalle['tags'] = $t; $tocar = true; }
    }
    if ($cambios) $detalle['cambios'] = $cambios;
    if ($detalle) auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_oportunidades', $id, 'actualizado', $detalle);
    if ($tocar) crmOpTocar($conn, $ctx, [$id]);
}

$conn->commit();
$conn->close();

crmOk(['id' => $id], 'Oportunidad guardada');
