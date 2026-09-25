<?php
// Crea o edita una etapa de un embudo (L4+). Se desactivan, no se borran.
// POST: id (0 = nueva), id_embudo (solo al crear), nombre, orden, probabilidad (0–100), tipo (abierta|ganada|perdida), color (#RRGGBB, opcional), activo.
// El tipo decide el estado de las oportunidades que caen ahí. En las terminales la probabilidad la fija la app (ganada 100, perdida 0).
// Reglas: el tipo no cambia si la etapa ya tiene oportunidades; no se desactiva con oportunidades activas; cada embudo conserva al menos una etapa abierta activa.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
requireRole('L4');

$id = (int)($_POST['id'] ?? 0);
$nombre = crmClean($_POST['nombre'] ?? null, 80, 'Nombre', true);
$orden = max(-32000, min(32000, (int)($_POST['orden'] ?? 0)));
$tipo = (string)($_POST['tipo'] ?? 'abierta');
if (!in_array($tipo, ['abierta', 'ganada', 'perdida'], true)) authFail(400, 'Tipo de etapa inválido');
$prob = $tipo === 'ganada' ? 100 : ($tipo === 'perdida' ? 0 : (int)($_POST['probabilidad'] ?? 0));
if ($prob < 0 || $prob > 100) authFail(400, 'La probabilidad va de 0 a 100');
$color = hexColorOrNull($_POST['color'] ?? '');
$activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : 1;

$conn = conectar();
$conn->begin_transaction();

if ($id === 0) {
    $idEmbudo = (int)($_POST['id_embudo'] ?? 0);
    if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_embudos WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$idEmbudo, $ctx['id_empresa']])) authFail(400, 'Embudo inexistente');
    $actual = null;
} else {
    $actual = crmEtapa($conn, $ctx, $id);
    if (!$actual) authFail(404, 'Etapa no encontrada');
    $idEmbudo = $actual['id_embudo'];
}
if (crmRow($conn, 'SELECT 1 AS ok FROM crm_etapas WHERE id_embudo = ? AND nombre = ? AND id <> ? LIMIT 1', 'isi', [$idEmbudo, $nombre, $id])) {
    authFail(409, 'Ya existe una etapa con ese nombre en este embudo');
}

if ($actual) {
    if ($actual['tipo'] !== $tipo && crmRow($conn, 'SELECT 1 AS ok FROM crm_oportunidades WHERE id_etapa = ? LIMIT 1', 'i', [$id])) {
        authFail(409, 'El tipo no se puede cambiar porque la etapa ya tiene oportunidades. Crea otra etapa.');
    }
    if ($activo === 0 && $actual['activo']) {
        $n = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_oportunidades WHERE id_etapa = ? AND activo = 1', 'i', [$id])['n'];
        if ($n > 0) authFail(409, "Esta etapa tiene $n oportunidades activas. Muévelas antes de desactivarla.");
    }
}
// Cada embudo activo conserva al menos una etapa abierta activa (si no, no se podrían crear oportunidades).
$abiertasOtras = (int)crmRow($conn, "SELECT COUNT(*) AS n FROM crm_etapas WHERE id_embudo = ? AND tipo = 'abierta' AND activo = 1 AND id <> ?", 'ii', [$idEmbudo, $id])['n'];
$abiertasSiGuarda = $abiertasOtras + (($tipo === 'abierta' && $activo === 1) ? 1 : 0);
if ($actual && $abiertasSiGuarda === 0) authFail(409, 'El embudo debe conservar al menos una etapa abierta activa.');

if ($id === 0) {
    crmExec($conn,
        'INSERT INTO crm_etapas (id_empresa, id_embudo, nombre, orden, probabilidad, tipo, color, activo, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        'iisiissiii', [$ctx['id_empresa'], $idEmbudo, $nombre, $orden, $prob, $tipo, $color, $activo, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
    auditAdmin($conn, 'crm_crear_etapa', ['id_etapa' => $id, 'id_embudo' => $idEmbudo, 'nombre' => $nombre, 'tipo' => $tipo]);
} else {
    crmExec($conn,
        'UPDATE crm_etapas SET nombre = ?, orden = ?, probabilidad = ?, tipo = ?, color = ?, activo = ?, updated_by = ? WHERE id = ? AND id_empresa = ?',
        'siissiiii', [$nombre, $orden, $prob, $tipo, $color, $activo, $ctx['id_usuario'], $id, $ctx['id_empresa']]);
    auditAdmin($conn, 'crm_editar_etapa', ['id_etapa' => $id, 'nombre' => $nombre, 'tipo' => $tipo, 'probabilidad' => $prob, 'activo' => $activo]);
}
$conn->commit();
$etapa = crmEtapa($conn, $ctx, $id);
$conn->close();

crmOk($etapa, 'Etapa guardada');
