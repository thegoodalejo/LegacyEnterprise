<?php
// Crea o edita un embudo de la empresa (L4+). Se desactivan, no se borran.
// POST: id (0 = nuevo), nombre, orden, activo. No se puede desactivar un embudo con oportunidades activas ni el último embudo activo.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
requireRole('L4');

$id = (int)($_POST['id'] ?? 0);
$nombre = crmClean($_POST['nombre'] ?? null, 80, 'Nombre', true);
$orden = max(-32000, min(32000, (int)($_POST['orden'] ?? 0)));
$activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : 1;

$conn = conectar();
$conn->begin_transaction();
if (crmRow($conn, 'SELECT 1 AS ok FROM crm_embudos WHERE id_empresa = ? AND nombre = ? AND id <> ? LIMIT 1', 'isi', [$ctx['id_empresa'], $nombre, $id])) {
    authFail(409, 'Ya existe un embudo con ese nombre');
}
if ($id === 0) {
    crmExec($conn, 'INSERT INTO crm_embudos (id_empresa, nombre, orden, activo, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
        'isiiii', [$ctx['id_empresa'], $nombre, $orden, $activo, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
    auditAdmin($conn, 'crm_crear_embudo', ['id_embudo' => $id, 'nombre' => $nombre]);
} else {
    if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_embudos WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$id, $ctx['id_empresa']])) authFail(404, 'Embudo no encontrado');
    if ($activo === 0) {
        $n = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_oportunidades WHERE id_embudo = ? AND activo = 1', 'i', [$id])['n'];
        if ($n > 0) authFail(409, "Este embudo tiene $n oportunidades activas. Archívalas o muévelas antes de desactivarlo.");
        $otros = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_embudos WHERE id_empresa = ? AND activo = 1 AND id <> ?', 'ii', [$ctx['id_empresa'], $id])['n'];
        if ($otros === 0) authFail(409, 'Debe quedar al menos un embudo activo.');
    }
    crmExec($conn, 'UPDATE crm_embudos SET nombre = ?, orden = ?, activo = ?, updated_by = ? WHERE id = ? AND id_empresa = ?',
        'siiiii', [$nombre, $orden, $activo, $ctx['id_usuario'], $id, $ctx['id_empresa']]);
    auditAdmin($conn, 'crm_editar_embudo', ['id_embudo' => $id, 'nombre' => $nombre, 'activo' => $activo]);
}
$conn->commit();
$conn->close();

crmOk(['id' => $id, 'nombre' => $nombre, 'orden' => $orden, 'activo' => $activo === 1], 'Embudo guardado');
