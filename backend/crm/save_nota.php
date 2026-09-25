<?php
// Crea, edita o elimina (de forma lógica) una nota de una oportunidad. Editar o eliminar: su autor o L2+.
// POST: id (0 = nueva), id_oportunidad (solo al crear), nota, activo (0 = eliminar).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$id = (int)($_POST['id'] ?? 0);
$activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : 1;

$conn = conectar();
$conn->begin_transaction();
if ($id === 0) {
    $idOp = (int)($_POST['id_oportunidad'] ?? 0);
    if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_oportunidades WHERE id = ? AND id_sede = ? LIMIT 1', 'ii', [$idOp, $ctx['id_sede']])) authFail(404, 'Oportunidad no encontrada');
    $nota = crmClean($_POST['nota'] ?? null, 5000, 'Nota', true);
    crmExec($conn, 'INSERT INTO crm_oportunidad_notas (id_oportunidad, nota, created_by, updated_by) VALUES (?, ?, ?, ?)', 'isii', [$idOp, $nota, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_oportunidades', $idOp, 'nota_agregada');
} else {
    $n = crmRow($conn,
        'SELECT n.id, n.id_oportunidad, n.created_by FROM crm_oportunidad_notas n JOIN crm_oportunidades o ON o.id = n.id_oportunidad
          WHERE n.id = ? AND o.id_sede = ? AND n.activo = 1 LIMIT 1', 'ii', [$id, $ctx['id_sede']]);
    if (!$n) authFail(404, 'Nota no encontrada');
    if ((int)$n['created_by'] !== $ctx['id_usuario'] && roleRank($ctx['rol']) < roleRank('L2')) authFail(403, 'Solo su autor o L2 puede modificar la nota');
    if ($activo === 0) {
        crmExec($conn, 'UPDATE crm_oportunidad_notas SET activo = 0, updated_by = ? WHERE id = ?', 'ii', [$ctx['id_usuario'], $id]);
        auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_oportunidades', (int)$n['id_oportunidad'], 'nota_eliminada');
    } else {
        $nota = crmClean($_POST['nota'] ?? null, 5000, 'Nota', true);
        crmExec($conn, 'UPDATE crm_oportunidad_notas SET nota = ?, updated_by = ? WHERE id = ?', 'sii', [$nota, $ctx['id_usuario'], $id]);
    }
}
$conn->commit();
$conn->close();

crmOk(['id' => $id], 'Nota guardada');
