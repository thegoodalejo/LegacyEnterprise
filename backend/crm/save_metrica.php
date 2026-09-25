<?php
// Crea o edita una métrica de metas de la empresa (L4+). Se desactivan, no se borran: sus metas se conservan.
// La fuente y el filtro (ítem o categoría) solo se pueden cambiar mientras la métrica no tenga metas (activas o eliminadas): después
// cambiarían el significado de metas ya puestas. Para medir otra cosa se crea otra métrica.
// POST: id (0 = nueva), nombre, fuente (ver CRM_META_FUENTES), id_item | id_categoria (opcional, uno u otro), unidad (solo fuentes que no son dinero),
//       descripcion, orden, activo.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_metas.php';

$ctx = crmContext();
requireRole('L4');

$id = (int)($_POST['id'] ?? 0);
$nombre = crmClean($_POST['nombre'] ?? null, 80, 'Nombre', true);
$fuente = (string)($_POST['fuente'] ?? '');
if (!in_array($fuente, CRM_META_FUENTES, true)) authFail(400, 'Fuente inválida');
$idItem = (int)($_POST['id_item'] ?? 0) ?: null;
$idCat = (int)($_POST['id_categoria'] ?? 0) ?: null;
if ($idItem && $idCat) authFail(400, 'Filtra por un ítem o por una categoría, no por ambos');
$unidad = crmMetaFormato($fuente) === 'moneda' ? null : crmClean($_POST['unidad'] ?? null, 30, 'Unidad');
$descripcion = crmClean($_POST['descripcion'] ?? null, 255, 'Descripción');
$orden = max(-32000, min(32000, (int)($_POST['orden'] ?? 0)));
$activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : 1;

$conn = conectar();
if ($idItem && !crmRow($conn, 'SELECT 1 AS ok FROM crm_catalogo_items WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$idItem, $ctx['id_empresa']])) authFail(404, 'Ítem no encontrado');
if ($idCat && !crmRow($conn, 'SELECT 1 AS ok FROM crm_catalogo_categorias WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$idCat, $ctx['id_empresa']])) authFail(404, 'Categoría no encontrada');
if ($id > 0) {
    $act = crmRow($conn, 'SELECT fuente, id_item, id_categoria FROM crm_metricas WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$id, $ctx['id_empresa']]);
    if (!$act) authFail(404, 'Métrica no encontrada');
    $cambia = $act['fuente'] !== $fuente || (int)$act['id_item'] !== (int)$idItem || (int)$act['id_categoria'] !== (int)$idCat;
    if ($cambia && crmRow($conn, 'SELECT 1 AS ok FROM crm_metas WHERE id_metrica = ? LIMIT 1', 'i', [$id])) {
        authFail(409, 'La métrica ya tiene metas: su fuente y su filtro no se pueden cambiar. Crea otra métrica para medir algo distinto.');
    }
}
if (crmRow($conn, 'SELECT 1 AS ok FROM crm_metricas WHERE id_empresa = ? AND nombre = ? AND id <> ? LIMIT 1', 'isi', [$ctx['id_empresa'], $nombre, $id])) {
    authFail(409, 'Ya existe una métrica con ese nombre');
}

if ($id === 0) {
    crmExec($conn, 'INSERT INTO crm_metricas (id_empresa, nombre, fuente, id_item, id_categoria, unidad, descripcion, orden, activo, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        'issiissiiii', [$ctx['id_empresa'], $nombre, $fuente, $idItem, $idCat, $unidad, $descripcion, $orden, $activo, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
} else {
    crmExec($conn, 'UPDATE crm_metricas SET nombre = ?, fuente = ?, id_item = ?, id_categoria = ?, unidad = ?, descripcion = ?, orden = ?, activo = ?, updated_by = ?
                     WHERE id = ? AND id_empresa = ?',
        'ssiissiiiii', [$nombre, $fuente, $idItem, $idCat, $unidad, $descripcion, $orden, $activo, $ctx['id_usuario'], $id, $ctx['id_empresa']]);
}
$m = crmMetrica($conn, $ctx, $id);
$conn->close();

crmOk($m, 'Métrica guardada');
