<?php
// Quita el vínculo entre una Organización y una Persona. Una organización nunca se queda sin personas.
// POST: id_organizacion, id_persona. Devuelve los vínculos que quedan.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
$idOrg = (int)($_POST['id_organizacion'] ?? 0);
$idPersona = (int)($_POST['id_persona'] ?? 0);

$conn = conectar();
$conn->begin_transaction();

$org = crmRow($conn, "SELECT id, nombre_completo FROM crm_contactos WHERE id = ? AND id_sede = ? AND tipo = 'organizacion' LIMIT 1", 'ii', [$idOrg, $ctx['id_sede']]);
if (!$org) authFail(404, 'Organización no encontrada');
$v = crmRow($conn,
    'SELECT ro.nombre AS rol, v.principal, c.nombre_completo
       FROM crm_contacto_vinculos v JOIN crm_contactos c ON c.id = v.id_persona LEFT JOIN crm_roles_vinculo ro ON ro.id = v.id_rol
      WHERE v.id_organizacion = ? AND v.id_persona = ?',
    'ii', [$idOrg, $idPersona]);
if (!$v) authFail(404, 'Vínculo no encontrado');

$hay = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_contacto_vinculos WHERE id_organizacion = ?', 'i', [$idOrg])['n'];
if ($hay <= 1) authFail(409, 'Una organización necesita al menos una persona de referencia');

crmExec($conn, 'DELETE FROM crm_contacto_vinculos WHERE id_organizacion = ? AND id_persona = ?', 'ii', [$idOrg, $idPersona]);
if ((int)$v['principal'] === 1) {   // pasa la marca de principal a otra persona
    crmExec($conn, 'UPDATE crm_contacto_vinculos SET principal = 1, updated_by = ? WHERE id_organizacion = ? ORDER BY created_at LIMIT 1',
        'ii', [$ctx['id_usuario'], $idOrg]);
}
crmLogVinculo($conn, $ctx, 'vinculo_quitado', $idOrg, $org['nombre_completo'], $idPersona, $v['nombre_completo'], $v['rol']);
crmTocar($conn, $ctx, [$idOrg]);

$conn->commit();
$vinculos = crmVinculos($conn, $idOrg, 'organizacion');
$conn->close();

crmOk(['vinculos' => $vinculos], 'Vínculo eliminado');
