<?php
// Crea o edita un grupo de etiquetas de la empresa (L4+). Se desactivan, no se borran.
// POST: id (0 = nuevo), nombre, orden, activo.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
requireRole('L4');

$id = (int)($_POST['id'] ?? 0);
$nombre = crmClean($_POST['nombre'] ?? null, 80, 'Nombre', true);
$orden = max(-32000, min(32000, (int)($_POST['orden'] ?? 0)));
$activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : 1;

$conn = conectar();
if (crmRow($conn, 'SELECT 1 AS ok FROM crm_tags_grupos WHERE id_empresa = ? AND nombre = ? AND id <> ? LIMIT 1', 'isi', [$ctx['id_empresa'], $nombre, $id])) {
    authFail(409, 'Ya existe un grupo con ese nombre');
}
if ($id === 0) {
    crmExec($conn, 'INSERT INTO crm_tags_grupos (id_empresa, nombre, orden, activo, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
        'isiiii', [$ctx['id_empresa'], $nombre, $orden, $activo, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
} else {
    if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_tags_grupos WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$id, $ctx['id_empresa']])) authFail(404, 'Grupo no encontrado');
    crmExec($conn, 'UPDATE crm_tags_grupos SET nombre = ?, orden = ?, activo = ?, updated_by = ? WHERE id = ? AND id_empresa = ?',
        'siiiii', [$nombre, $orden, $activo, $ctx['id_usuario'], $id, $ctx['id_empresa']]);
}
$conn->close();

crmOk(['id' => $id, 'nombre' => $nombre, 'orden' => $orden, 'activo' => $activo === 1], 'Grupo guardado');
