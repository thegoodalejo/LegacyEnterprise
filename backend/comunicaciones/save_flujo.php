<?php
// Guarda un flujo del chatbot completo (L2+): datos, grafo validado y palabras de activación. También lo enciende, apaga o elimina.
// POST: id (0 = nuevo), nombre, descripcion, activo (0|1), grafo (JSON {nodos, conexiones}), disparadores (JSON [{tipo, texto, prioridad, id_linea}]),
//       version (la que se editó: si otra persona guardó después → 409), eliminar (1 = borrado lógico; no si es el flujo de respaldo).
// Una palabra de activación no puede activar dos flujos encendidos (misma palabra y tipo en las mismas líneas) → 409.
// Devuelve {id, version, avisos} (avisos: pasos a los que no se llega, opciones sin destino).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bot.php';

$ctx = comContext();
requireRole('L2');
$id = (int)($_POST['id'] ?? 0);
$conn = conectar();
$actual = $id > 0 ? crmRow($conn, 'SELECT id, nombre, activo, version FROM com_flujos WHERE id = ? AND id_sede = ? AND borrado = 0', 'ii', [$id, $ctx['id_sede']]) : null;
if ($id > 0 && !$actual) authFail(404, 'Flujo no encontrado');

if (($_POST['eliminar'] ?? '0') === '1') {
    $cfg = comConfigSede($conn, $ctx['id_sede']);
    if ($cfg['sin_coincidencia'] === 'flujo' && $cfg['id_flujo_respaldo'] === $id) authFail(409, 'Es el flujo de respaldo de la sede: cambia los ajustes antes de eliminarlo');
    crmExec($conn, 'UPDATE com_flujos SET borrado = 1, activo = 0, updated_by = ? WHERE id = ?', 'ii', [$ctx['id_usuario'], $id]);
    crmExec($conn, "UPDATE com_conversaciones SET id_flujo = NULL, nodo = NULL WHERE id_flujo = ? AND estado = 'bot'", 'i', [$id]);
    auditRegistro($conn, $ctx['id_sede'], 'comunicaciones', 'com_flujos', $id, 'eliminado', ['nombre' => $actual['nombre']]);
    $conn->close();
    crmOk(['id' => $id], 'Flujo eliminado');
}

$nombre = crmClean($_POST['nombre'] ?? null, 100, 'Nombre', true);
$desc = crmClean($_POST['descripcion'] ?? null, 255, 'Descripción');
$activo = ($_POST['activo'] ?? '0') === '1' ? 1 : 0;
$version = (int)($_POST['version'] ?? 0);
if ($actual && $version > 0 && $version !== (int)$actual['version']) authFail(409, 'Otra persona guardó este flujo mientras lo editabas: recarga para ver sus cambios');

$sede = ['id_sede' => $ctx['id_sede'], 'id_empresa' => $ctx['id_empresa']];
[$grafo, $avisos] = comBotValidarGrafo($conn, $sede, crmJsonParam('grafo'), $id);

// Palabras de activación: normalizadas, sin repetir, líneas de la sede.
$disp = [];
$lineas = array_map('intval', array_column(crmRows($conn, 'SELECT id FROM com_lineas WHERE id_sede = ?', 'i', [$ctx['id_sede']]), 'id'));
foreach (crmJsonParam('disparadores') ?? [] as $d) {
    $tipo = (string)($d['tipo'] ?? 'exacta');
    if (!in_array($tipo, ['exacta', 'empieza', 'contiene'], true)) authFail(400, 'Tipo de palabra de activación inválido');
    $texto = crmClean($d['texto'] ?? null, 100, 'Palabra de activación', true);
    $norm = comNormalizar($texto);
    if ($norm === '') authFail(400, "La palabra de activación «{$texto}» no tiene letras ni números");
    $idLinea = (int)($d['id_linea'] ?? 0) ?: null;
    if ($idLinea !== null && !in_array($idLinea, $lineas, true)) authFail(400, 'Línea inválida en una palabra de activación');
    $disp["$tipo|$norm|$idLinea"] = ['tipo' => $tipo, 'texto' => $texto, 'norm' => $norm, 'prioridad' => max(-100, min(100, (int)($d['prioridad'] ?? 0))), 'id_linea' => $idLinea];
}
if (count($disp) > 30) authFail(400, 'Máximo 30 palabras de activación por flujo');
if ($activo) {
    foreach ($disp as $d) {
        $choque = crmRow($conn,
            'SELECT f.nombre FROM com_flujo_disparadores x JOIN com_flujos f ON f.id = x.id_flujo AND f.activo = 1 AND f.borrado = 0
              WHERE x.id_sede = ? AND x.id_flujo <> ? AND x.tipo = ? AND x.texto_norm = ? AND (x.id_linea IS NULL OR ? IS NULL OR x.id_linea = ?) LIMIT 1',
            'iissii', [$ctx['id_sede'], $id, $d['tipo'], $d['norm'], $d['id_linea'], $d['id_linea']]);
        if ($choque) authFail(409, "La palabra «{$d['texto']}» ya activa el flujo «{$choque['nombre']}»");
    }
}

$json = json_encode($grafo, JSON_UNESCAPED_UNICODE);
$conn->begin_transaction();
if ($actual) {
    crmExec($conn, 'UPDATE com_flujos SET nombre = ?, descripcion = ?, activo = ?, grafo = ?, version = version + 1, updated_by = ? WHERE id = ?',
        'ssisii', [$nombre, $desc, $activo, $json, $ctx['id_usuario'], $id]);
    $accion = (int)$actual['activo'] !== $activo ? ($activo ? 'activado' : 'desactivado') : 'actualizado';
} else {
    crmExec($conn, 'INSERT INTO com_flujos (id_sede, nombre, descripcion, activo, grafo, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'ississi', [$ctx['id_sede'], $nombre, $desc, $activo, $json, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
    $accion = 'creado';
}
crmExec($conn, 'DELETE FROM com_flujo_disparadores WHERE id_flujo = ?', 'i', [$id]);
foreach ($disp as $d) {
    crmExec($conn, 'INSERT INTO com_flujo_disparadores (id_flujo, id_sede, tipo, texto, texto_norm, prioridad, id_linea) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'iisssii', [$id, $ctx['id_sede'], $d['tipo'], $d['texto'], $d['norm'], $d['prioridad'], $d['id_linea']]);
}
// Conversaciones esperando en un paso que ya no existe: el siguiente mensaje vuelve a evaluar las palabras de activación.
$ids = array_column($grafo['nodos'], 'id');
foreach (crmRows($conn, "SELECT id, nodo FROM com_conversaciones WHERE id_flujo = ? AND estado = 'bot'", 'i', [$id]) as $c) {
    if (!$activo || !in_array($c['nodo'], $ids, true)) crmExec($conn, 'UPDATE com_conversaciones SET id_flujo = NULL, nodo = NULL WHERE id = ?', 'i', [(int)$c['id']]);
}
auditRegistro($conn, $ctx['id_sede'], 'comunicaciones', 'com_flujos', $id, $accion, ['nombre' => $nombre, 'pasos' => count($grafo['nodos']), 'palabras' => array_column($disp, 'texto')]);
$nuevaVersion = (int)crmRow($conn, 'SELECT version FROM com_flujos WHERE id = ?', 'i', [$id])['version'];
$conn->commit();
$conn->close();
crmOk(['id' => $id, 'version' => $nuevaVersion, 'avisos' => $avisos], 'Flujo guardado');
