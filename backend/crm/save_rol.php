<?php
// Crea o edita un rol de vínculo de la empresa (L4+). Se desactivan, no se borran: los vínculos que lo tienen lo conservan.
// POST: id (0 = nuevo), nombre, orden, activo.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext(CRM_MODULOS_CONTACTOS);
requireRole('L4');

$id = (int)($_POST['id'] ?? 0);
$nombre = crmClean($_POST['nombre'] ?? null, 60, 'Nombre', true);
$orden = max(-32000, min(32000, (int)($_POST['orden'] ?? 0)));
$activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : 1;

$conn = conectar();
if (crmRow($conn, 'SELECT 1 AS ok FROM crm_roles_vinculo WHERE id_empresa = ? AND nombre = ? AND id <> ? LIMIT 1', 'isi', [$ctx['id_empresa'], $nombre, $id])) {
    authFail(409, 'Ya existe un rol con ese nombre');
}
if ($id === 0) {
    crmExec($conn, 'INSERT INTO crm_roles_vinculo (id_empresa, nombre, orden, activo, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
        'isiiii', [$ctx['id_empresa'], $nombre, $orden, $activo, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
} else {
    if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_roles_vinculo WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$id, $ctx['id_empresa']])) authFail(404, 'Rol no encontrado');
    crmExec($conn, 'UPDATE crm_roles_vinculo SET nombre = ?, orden = ?, activo = ?, updated_by = ? WHERE id = ? AND id_empresa = ?',
        'siiiii', [$nombre, $orden, $activo, $ctx['id_usuario'], $id, $ctx['id_empresa']]);
}
$conn->close();

crmOk(['id' => $id, 'nombre' => $nombre, 'orden' => $orden, 'activo' => $activo === 1], 'Rol guardado');
