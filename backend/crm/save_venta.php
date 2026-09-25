<?php
// Registra una venta escrita a mano (el «carrito» de la pantalla de ventas o del perfil del cliente). L2+, como importar: las ventas alimentan las metas.
// Queda con id_importacion NULL (= venta manual): no pertenece a ningún lote; se anula o restaura una por una (anular_venta.php).
// POST: id_contacto, fecha (AAAA-MM-DD), documento (opcional; no puede repetir el de otra venta activa de la sede),
//       lineas (JSON [{id_item | descripcion, cantidad, precio_unitario}]), validar (1 = solo revisar: valida todo y no guarda nada).
// Devuelve {id (0 al validar), total, unidades, lineas}. Reglas: crmVentaManualParsear (_lib/_crm_ventas.php).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_ventas.php';

$ctx = crmContext();
requireRole('L2');
$validar = ($_POST['validar'] ?? '0') === '1';

$conn = conectar();
$conn->begin_transaction();   // cualquier authFail posterior deja la transacción sin confirmar: se revierte sola
$v = crmVentaManualParsear($conn, $ctx, $_POST, crmJsonParam('lineas'));
if ($validar) {
    $conn->rollback();
    $conn->close();
    crmOk(['id' => 0, 'total' => $v['total'], 'unidades' => $v['unidades'], 'lineas' => count($v['lineas'])], 'Venta válida');
}
$id = crmVentaManualGuardar($conn, $ctx, $v);
$conn->commit();
$conn->close();

crmOk(['id' => $id, 'total' => $v['total'], 'unidades' => $v['unidades'], 'lineas' => count($v['lineas'])], 'Venta registrada');
