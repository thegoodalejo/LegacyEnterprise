<?php
// Detalle de una venta: cliente, documento, fecha, líneas y el lote de donde vino. POST: id.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_ventas.php';

$ctx = crmContext();
$id = (int)($_POST['id'] ?? 0);

$conn = conectar();
$v = crmRow($conn,
    'SELECT v.id, v.fecha, v.documento, v.total, v.unidades, v.activo, v.id_importacion, v.id_contacto, v.created_at,
            c.nombre_completo AS cliente, c.tipo AS cliente_tipo, i.archivo, COALESCE(u.nombre, u.email) AS creado_por
       FROM crm_ventas v JOIN crm_contactos c ON c.id = v.id_contacto
  LEFT JOIN crm_importaciones i ON i.id = v.id_importacion
  LEFT JOIN le_usuarios u ON u.id = v.created_by
      WHERE v.id = ? AND v.id_sede = ? LIMIT 1', 'ii', [$id, $ctx['id_sede']]);
if (!$v) authFail(404, 'Venta no encontrada');
$lineas = crmRows($conn,
    'SELECT l.id, l.id_item, COALESCE(i.codigo, l.codigo) AS codigo, COALESCE(i.nombre, l.descripcion, l.codigo) AS nombre, i.unidad, cat.nombre AS categoria,
            l.cantidad, l.precio_unitario, l.total
       FROM crm_venta_lineas l LEFT JOIN crm_catalogo_items i ON i.id = l.id_item LEFT JOIN crm_catalogo_categorias cat ON cat.id = i.id_categoria
      WHERE l.id_venta = ? ORDER BY l.id', 'i', [$id]);
$conn->close();

foreach (['id', 'id_contacto'] as $k) $v[$k] = (int)$v[$k];
$v['id_importacion'] = $v['id_importacion'] !== null ? (int)$v['id_importacion'] : null;
$v['total'] = (float)$v['total']; $v['unidades'] = (float)$v['unidades']; $v['activo'] = (int)$v['activo'] === 1;
foreach ($lineas as &$l) {
    $l['id'] = (int)$l['id']; $l['id_item'] = $l['id_item'] !== null ? (int)$l['id_item'] : null;
    $l['cantidad'] = (float)$l['cantidad']; $l['precio_unitario'] = (float)$l['precio_unitario']; $l['total'] = (float)$l['total'];
}
unset($l);

crmOk(['venta' => $v, 'lineas' => $lineas]);
