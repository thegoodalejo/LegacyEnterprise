<?php
// Crea o edita un ítem del catálogo (L4+). Se desactivan, no se borran: las líneas que lo usan lo conservan.
// POST: id (0 = nuevo), codigo (opcional, único por empresa), nombre, id_categoria (opcional), unidad (opcional), precio_ref (opcional), activo.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
requireRole('L4');

$id = (int)($_POST['id'] ?? 0);
$codigo = crmClean($_POST['codigo'] ?? null, 40, 'Código');
$nombre = crmClean($_POST['nombre'] ?? null, 150, 'Nombre', true);
$unidad = crmClean($_POST['unidad'] ?? null, 30, 'Unidad');
$idCategoria = (int)($_POST['id_categoria'] ?? 0) ?: null;
$precio = crmDecimal($_POST['precio_ref'] ?? null, 'Precio de referencia');
if ($precio !== null && ((float)$precio < 0 || (float)$precio >= 1e15)) authFail(400, 'El precio de referencia está fuera de rango');
$activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : 1;

$conn = conectar();
if ($idCategoria !== null && !crmRow($conn, 'SELECT 1 AS ok FROM crm_catalogo_categorias WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$idCategoria, $ctx['id_empresa']])) {
    authFail(400, 'Categoría inexistente');
}
if ($codigo !== null && crmRow($conn, 'SELECT 1 AS ok FROM crm_catalogo_items WHERE id_empresa = ? AND codigo = ? AND id <> ? LIMIT 1', 'isi', [$ctx['id_empresa'], $codigo, $id])) {
    authFail(409, 'Ya existe un ítem con ese código');
}
if ($id === 0) {
    crmExec($conn,
        'INSERT INTO crm_catalogo_items (id_empresa, id_categoria, codigo, nombre, unidad, precio_ref, activo, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        'iissssiii', [$ctx['id_empresa'], $idCategoria, $codigo, $nombre, $unidad, $precio, $activo, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
} else {
    if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_catalogo_items WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$id, $ctx['id_empresa']])) authFail(404, 'Ítem no encontrado');
    crmExec($conn,
        'UPDATE crm_catalogo_items SET id_categoria = ?, codigo = ?, nombre = ?, unidad = ?, precio_ref = ?, activo = ?, updated_by = ? WHERE id = ? AND id_empresa = ?',
        'issssiiii', [$idCategoria, $codigo, $nombre, $unidad, $precio, $activo, $ctx['id_usuario'], $id, $ctx['id_empresa']]);
}
$conn->close();

crmOk(['id' => $id, 'id_categoria' => $idCategoria, 'codigo' => $codigo, 'nombre' => $nombre, 'unidad' => $unidad,
       'precio_ref' => $precio !== null ? (float)$precio : null, 'activo' => $activo === 1], 'Ítem guardado');
