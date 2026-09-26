<?php
// Crea, edita o elimina (de forma lógica) una nota de un contacto. Compartida entre el CRM y Comunicaciones. Editar o eliminar: su autor o L2+.
// POST: id (0 = nueva), id_contacto (solo al crear), nota (máx. 5000), activo (0 = eliminar), id_conversacion (opcional: escrita desde la bandeja).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext(CRM_MODULOS_CONTACTOS);
$id = (int)($_POST['id'] ?? 0);
$activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : 1;

$conn = conectar();
$conn->begin_transaction();
if ($id === 0) {
    $idC = (int)($_POST['id_contacto'] ?? 0);
    if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_contactos WHERE id = ? AND id_sede = ? LIMIT 1', 'ii', [$idC, $ctx['id_sede']])) authFail(404, 'Contacto no encontrado');
    $nota = crmClean($_POST['nota'] ?? null, 5000, 'Nota', true);
    $idConv = (int)($_POST['id_conversacion'] ?? 0) ?: null;
    if ($idConv !== null && !crmRow($conn, 'SELECT 1 AS ok FROM com_conversaciones WHERE id = ? AND id_sede = ? AND id_contacto = ?', 'iii', [$idConv, $ctx['id_sede'], $idC])) {
        authFail(400, 'La conversación no es de este contacto');
    }
    crmExec($conn, 'INSERT INTO crm_contacto_notas (id_sede, id_contacto, nota, origen, id_conversacion, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'iissiii', [$ctx['id_sede'], $idC, $nota, $idConv ? 'comunicaciones' : 'crm', $idConv, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $idC, 'nota_agregada');
} else {
    $n = crmRow($conn, 'SELECT id, id_contacto, created_by FROM crm_contacto_notas WHERE id = ? AND id_sede = ? AND activo = 1 LIMIT 1', 'ii', [$id, $ctx['id_sede']]);
    if (!$n) authFail(404, 'Nota no encontrada');
    if ((int)$n['created_by'] !== $ctx['id_usuario'] && roleRank($ctx['rol']) < roleRank('L2')) authFail(403, 'Solo su autor o L2 puede modificar la nota');
    if ($activo === 0) {
        crmExec($conn, 'UPDATE crm_contacto_notas SET activo = 0, updated_by = ? WHERE id = ?', 'ii', [$ctx['id_usuario'], $id]);
        auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_contactos', (int)$n['id_contacto'], 'nota_eliminada');
    } else {
        $nota = crmClean($_POST['nota'] ?? null, 5000, 'Nota', true);
        crmExec($conn, 'UPDATE crm_contacto_notas SET nota = ?, updated_by = ? WHERE id = ?', 'sii', [$nota, $ctx['id_usuario'], $id]);
    }
}
$conn->commit();
$conn->close();
crmOk(['id' => $id], 'Nota guardada');
