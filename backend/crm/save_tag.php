<?php
// Crea o edita una etiqueta de la empresa (L4+). Se desactivan, no se borran: en los contactos que ya la tienen se conserva.
// POST: id (0 = nueva), nombre, color (#RRGGBB), id_grupo (opcional), aplica_a (persona|organizacion, vacío = ambos), orden, activo.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
requireRole('L4');

$id = (int)($_POST['id'] ?? 0);
$nombre = crmClean($_POST['nombre'] ?? null, 50, 'Nombre', true);
$color = hexColorOrNull($_POST['color'] ?? '') ?? '#607D8B';
$idGrupo = (int)($_POST['id_grupo'] ?? 0) ?: null;
$aplicaA = (string)($_POST['aplica_a'] ?? '');
if ($aplicaA !== '' && !in_array($aplicaA, CRM_TIPOS, true)) authFail(400, 'aplica_a inválido');
$aplicaA = $aplicaA !== '' ? $aplicaA : null;
$orden = max(-32000, min(32000, (int)($_POST['orden'] ?? 0)));
$activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : 1;

$conn = conectar();
if ($idGrupo !== null && !crmRow($conn, 'SELECT 1 AS ok FROM crm_tags_grupos WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$idGrupo, $ctx['id_empresa']])) {
    authFail(400, 'Grupo inexistente');
}
if (crmRow($conn, 'SELECT 1 AS ok FROM crm_tags WHERE id_empresa = ? AND nombre = ? AND id <> ? LIMIT 1', 'isi', [$ctx['id_empresa'], $nombre, $id])) {
    authFail(409, 'Ya existe una etiqueta con ese nombre');
}
if ($id === 0) {
    crmExec($conn,
        'INSERT INTO crm_tags (id_empresa, id_grupo, nombre, color, aplica_a, orden, activo, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        'iisssiiii', [$ctx['id_empresa'], $idGrupo, $nombre, $color, $aplicaA, $orden, $activo, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
} else {
    if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_tags WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$id, $ctx['id_empresa']])) authFail(404, 'Etiqueta no encontrada');
    crmExec($conn,
        'UPDATE crm_tags SET id_grupo = ?, nombre = ?, color = ?, aplica_a = ?, orden = ?, activo = ?, updated_by = ? WHERE id = ? AND id_empresa = ?',
        'isssiiiii', [$idGrupo, $nombre, $color, $aplicaA, $orden, $activo, $ctx['id_usuario'], $id, $ctx['id_empresa']]);
}
$conn->close();

crmOk(['id' => $id, 'id_grupo' => $idGrupo, 'nombre' => $nombre, 'color' => $color, 'aplica_a' => $aplicaA, 'orden' => $orden, 'activo' => $activo === 1], 'Etiqueta guardada');
