<?php
// Vincula una Persona a una Organización (existente o nueva) o cambia su rol / si es la principal.
// POST: id_organizacion, id_persona | nuevo (JSON con los datos de una persona a crear), id_rol (de crm_roles_vinculo), principal (0|1).
// Devuelve la lista de vínculos de la organización.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
$idOrg = (int)($_POST['id_organizacion'] ?? 0);
$principal = ($_POST['principal'] ?? '0') === '1';

$conn = conectar();
$conn->begin_transaction();

$org = crmRow($conn, "SELECT id, nombre_completo FROM crm_contactos WHERE id = ? AND id_sede = ? AND tipo = 'organizacion' LIMIT 1", 'ii', [$idOrg, $ctx['id_sede']]);
if (!$org) authFail(404, 'Organización no encontrada');

if (!empty($_POST['id_persona'])) {
    $idPersona = (int)$_POST['id_persona'];
    $p = crmRow($conn, "SELECT id, nombre_completo FROM crm_contactos WHERE id = ? AND id_sede = ? AND tipo = 'persona' LIMIT 1", 'ii', [$idPersona, $ctx['id_sede']]);
    if (!$p) authFail(404, 'Persona no encontrada');
    $nombrePersona = $p['nombre_completo'];
} else {
    $nuevo = crmJsonParam('nuevo');
    if (!$nuevo) authFail(400, 'Indica una persona existente o los datos de una nueva');
    $d = crmParsearContacto($conn, $ctx, 'persona', $nuevo);
    $idPersona = crmInsertarContacto($conn, $ctx, 'persona', $d);
    $nombrePersona = $d['nombre_completo'];
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $idPersona, 'creado',
        ['tipo' => 'persona', 'nombre' => $nombrePersona, 'origen' => 'referencia_de_organizacion']);
}

$actual = crmRow($conn, 'SELECT id_rol, principal FROM crm_contacto_vinculos WHERE id_organizacion = ? AND id_persona = ?', 'ii', [$idOrg, $idPersona]);
$idRolActual = $actual && $actual['id_rol'] !== null ? (int)$actual['id_rol'] : null;
[$idRol, $rol] = crmRolDeVinculo($conn, $ctx, $_POST['id_rol'] ?? null, $idRolActual);
$hay = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_contacto_vinculos WHERE id_organizacion = ?', 'i', [$idOrg])['n'];
if ($hay === 0) $principal = true;   // la primera persona es la principal

if ($principal) {
    crmExec($conn, 'UPDATE crm_contacto_vinculos SET principal = 0, updated_by = ? WHERE id_organizacion = ? AND id_persona <> ? AND principal = 1',
        'iii', [$ctx['id_usuario'], $idOrg, $idPersona]);
}
if (!$actual) {
    crmExec($conn, 'INSERT INTO crm_contacto_vinculos (id_organizacion, id_persona, id_rol, principal, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
        'iiiiii', [$idOrg, $idPersona, $idRol, $principal ? 1 : 0, $ctx['id_usuario'], $ctx['id_usuario']]);
    crmLogVinculo($conn, $ctx, 'vinculo_agregado', $idOrg, $org['nombre_completo'], $idPersona, $nombrePersona, $rol);
} else {
    // Quitar la marca de principal a la única principal dejaría la organización sin ninguna: se conserva.
    if (!$principal && (int)$actual['principal'] === 1) $principal = true;
    if ($idRolActual !== $idRol || ((int)$actual['principal'] === 1) !== $principal) {
        crmExec($conn, 'UPDATE crm_contacto_vinculos SET id_rol = ?, principal = ?, updated_by = ? WHERE id_organizacion = ? AND id_persona = ?',
            'iiiii', [$idRol, $principal ? 1 : 0, $ctx['id_usuario'], $idOrg, $idPersona]);
        crmLogVinculo($conn, $ctx, 'vinculo_actualizado', $idOrg, $org['nombre_completo'], $idPersona, $nombrePersona, $rol);
    }
}
crmTocar($conn, $ctx, [$idOrg]);

$conn->commit();
$vinculos = crmVinculos($conn, $idOrg, 'organizacion');
$conn->close();

crmOk(['vinculos' => $vinculos], 'Vínculo guardado');
