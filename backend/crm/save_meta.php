<?php
// Crea o edita una meta (L4+). Historial en le_H_registros (tabla crm_metas).
// Nueva: id = 0, id_metrica (activa), ambito (empresa|sede|organizacion), id_contacto (Organización activa de la sede; solo ámbito organizacion),
//        periodo (mes|trimestre|semestre|anio|personalizado), fecha (un día cualquiera del período; en personalizado, el inicio),
//        fecha_fin (solo personalizado), valor_meta (> 0), nota.
//        La sede de una meta de sede u organización es la de la sesión. Si ya existe la misma meta (métrica, dueño y período) → 409;
//        si existía eliminada, se reactiva con los datos nuevos.
// Edición: id + valor_meta, nota, activo (0 = eliminar, lógico y restaurable; 1 = restaurar). Métrica, ámbito, dueño y período no cambian:
//        para otro período se crea otra meta.
// Devuelve la meta con su avance a hoy.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_metas.php';

$ctx = crmContext();
requireRole('L4');

$id = (int)($_POST['id'] ?? 0);
$nota = crmClean($_POST['nota'] ?? null, 255, 'Nota');
$valorTxt = crmDecimal($_POST['valor_meta'] ?? null, 'Meta');
if ($valorTxt === null && ($id === 0 || isset($_POST['valor_meta']))) authFail(400, 'Meta es obligatoria');
if ($valorTxt !== null && ((float)$valorTxt <= 0 || (float)$valorTxt >= CRM_META_VALOR_MAX)) authFail(400, 'La meta debe ser mayor que cero');

$conn = conectar();
$conn->begin_transaction();
$etiquetas = ['valor_meta' => 'Meta', 'nota' => 'Nota'];

if ($id === 0) {
    $mt = crmMetrica($conn, $ctx, (int)($_POST['id_metrica'] ?? 0));
    if (!$mt) authFail(404, 'Métrica no encontrada');
    if (!$mt['activo']) authFail(400, 'La métrica está desactivada');
    $ambito = (string)($_POST['ambito'] ?? '');
    if (!in_array($ambito, CRM_META_AMBITOS, true)) authFail(400, 'Ámbito inválido');
    $periodo = (string)($_POST['periodo'] ?? '');
    [$ini, $fin] = crmMetaPeriodo($periodo, crmFecha($_POST['fecha'] ?? null, 'Fecha'), crmFecha($_POST['fecha_fin'] ?? null, 'Fecha final'));
    $idSede = $ambito === 'empresa' ? null : $ctx['id_sede'];
    $idContacto = null; $dueno = $ambito === 'empresa' ? 'Empresa' : 'Sede';
    if ($ambito === 'organizacion') [$idContacto, $dueno] = crmMetaOrganizacion($conn, $ctx, (int)($_POST['id_contacto'] ?? 0));
    $ref = $idContacto ?? $idSede ?? 0;

    $ex = crmRow($conn, 'SELECT id, activo, valor_meta, nota FROM crm_metas WHERE id_empresa = ? AND id_metrica = ? AND ambito = ? AND ambito_ref = ? AND fecha_inicio = ? AND fecha_fin = ? LIMIT 1 FOR UPDATE',
        'iisiss', [$ctx['id_empresa'], $mt['id'], $ambito, $ref, $ini, $fin]);
    if ($ex && (int)$ex['activo'] === 1) authFail(409, 'Ya existe una meta de «' . $mt['nombre'] . '» para ' . ($ambito === 'organizacion' ? $dueno : mb_strtolower($dueno)) . ' en ese período');
    $detalle = ['metrica' => $mt['nombre'], 'ambito' => $ambito, 'dueno' => $dueno, 'periodo' => $periodo, 'inicio' => $ini, 'fin' => $fin, 'valor_meta' => $valorTxt];
    if ($ex) {
        $id = (int)$ex['id'];
        crmExec($conn, 'UPDATE crm_metas SET periodo = ?, valor_meta = ?, nota = ?, activo = 1, updated_by = ? WHERE id = ?', 'sssii', [$periodo, $valorTxt, $nota, $ctx['id_usuario'], $id]);
        auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_metas', $id, 'restaurado',
            $detalle + ['cambios' => historialDiff(['valor_meta' => crmDecimalNorm((string)$ex['valor_meta']), 'nota' => $ex['nota']], ['valor_meta' => $valorTxt, 'nota' => $nota], $etiquetas)]);
    } else {
        crmExec($conn, 'INSERT INTO crm_metas (id_empresa, id_metrica, ambito, id_sede, id_contacto, periodo, fecha_inicio, fecha_fin, valor_meta, nota, created_by, updated_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            'iisiisssssii', [$ctx['id_empresa'], $mt['id'], $ambito, $idSede, $idContacto, $periodo, $ini, $fin, $valorTxt, $nota, $ctx['id_usuario'], $ctx['id_usuario']]);
        $id = (int)$conn->insert_id;
        auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_metas', $id, 'creado', $detalle);
    }
} else {
    $act = crmMetaBase($conn, $ctx, $id);
    if (!$act) authFail(404, 'Meta no encontrada');
    $activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : (int)$act['activo'];
    $nuevo = ['valor_meta' => $valorTxt ?? crmDecimalNorm((string)$act['valor_meta']), 'nota' => array_key_exists('nota', $_POST) ? $nota : $act['nota']];
    $cambios = historialDiff(['valor_meta' => crmDecimalNorm((string)$act['valor_meta']), 'nota' => $act['nota']], $nuevo, $etiquetas);
    if ($cambios || $activo !== (int)$act['activo']) {
        crmExec($conn, 'UPDATE crm_metas SET valor_meta = ?, nota = ?, activo = ?, updated_by = ? WHERE id = ?', 'ssiii', [$nuevo['valor_meta'], $nuevo['nota'], $activo, $ctx['id_usuario'], $id]);
        $accion = $activo !== (int)$act['activo'] ? ($activo ? 'restaurado' : 'eliminado') : 'actualizado';
        auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_metas', $id, $accion, ['metrica' => $act['metrica_nombre'], 'ambito' => $act['ambito'],
            'dueno' => $act['contacto_nombre'] ?? $act['sede_nombre'], 'inicio' => $act['fecha_inicio'], 'fin' => $act['fecha_fin'], 'cambios' => $cambios]);
    }
}
$conn->commit();

$meta = crmMetaCobertura($conn, $ctx, crmMetaProgreso($conn, $ctx, [crmMetaBase($conn, $ctx, $id)], date('Y-m-d')))[0];
$conn->close();
crmOk($meta, 'Meta guardada');
