<?php
// Importación de ventas por bloques (L2+). El navegador lee el archivo, agrupa las filas en ventas y las manda en bloques.
// POST accion:
//   simular   — ventas (JSON), opciones (JSON): procesa el bloque dentro de una transacción que se revierte; nada queda guardado.
//   iniciar   — archivo, filas_total, opciones (JSON): crea el lote (estado «procesando») y devuelve {id}.
//   bloque    — id_importacion, ventas (JSON), opciones (JSON): procesa y guarda el bloque; suma los contadores al lote.
//   finalizar — id_importacion: marca el lote como completo y deja la auditoría (crm_importar_ventas).
// ventas = [{fila, fecha (AAAA-MM-DD), cliente, documento, lineas:[{fila, codigo, descripcion, cantidad, precio, total}]}].
// opciones = {identificar (documento|nombre|campo), id_campo, items_nuevos (crear|sin_item), duplicados (omitir|reemplazar)}.
// Respuesta de simular/bloque: {filas_ok, filas_error, ventas_nuevas, ventas_reemplazadas, ventas_omitidas, items_creados, total_valor,
// fecha_desde, fecha_hasta, errores:[{fila, motivo}], clientes_no_encontrados:[…]}.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_ventas.php';

$ctx = crmContext();
requireRole('L2');
$accion = (string)($_POST['accion'] ?? '');

$conn = conectar();

if ($accion === 'simular') {
    $op = crmVentaOpciones(crmJsonParam('opciones') ?? []);
    $conn->begin_transaction();
    $res = crmVentasProcesar($conn, $ctx, crmJsonParam('ventas') ?? [], $op, null);
    $conn->rollback();
    $conn->close();
    crmOk($res, 'Simulación');
}

if ($accion === 'iniciar') {
    $op = crmVentaOpciones(crmJsonParam('opciones') ?? []);
    $archivo = crmClean($_POST['archivo'] ?? null, 190, 'Archivo');
    $filas = max(0, min(10_000_000, (int)($_POST['filas_total'] ?? 0)));
    crmExec($conn, 'INSERT INTO crm_importaciones (id_sede, tipo, archivo, opciones, filas_total, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'isssiii', [$ctx['id_sede'], 'ventas', $archivo, json_encode($op + ['mapeo' => crmJsonParam('mapeo')], JSON_UNESCAPED_UNICODE), $filas, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
    $conn->close();
    crmOk(['id' => $id], 'Importación iniciada');
}

$id = (int)($_POST['id_importacion'] ?? 0);
$lote = $id > 0 ? crmImportacion($conn, $ctx, $id) : null;
if (!$lote) authFail(404, 'Importación no encontrada');
if ($lote['estado'] !== 'procesando') authFail(409, 'La importación ya se cerró');

if ($accion === 'bloque') {
    $op = crmVentaOpciones(crmJsonParam('opciones') ?? []);
    $conn->begin_transaction();
    $res = crmVentasProcesar($conn, $ctx, crmJsonParam('ventas') ?? [], $op, $id);
    // Contadores acumulados del lote; los errores se agregan hasta el tope.
    $errores = json_decode((string)($lote['errores'] ?? '[]'), true) ?: [];
    $errores = array_slice(array_merge($errores, $res['errores']), 0, CRM_IMPORT_ERRORES_MAX);
    crmExec($conn,
        'UPDATE crm_importaciones SET filas_ok = filas_ok + ?, filas_error = filas_error + ?, ventas_nuevas = ventas_nuevas + ?, ventas_reemplazadas = ventas_reemplazadas + ?,
                ventas_omitidas = ventas_omitidas + ?, items_creados = items_creados + ?, total_valor = total_valor + ?,
                fecha_desde = IF(? IS NULL, fecha_desde, LEAST(COALESCE(fecha_desde, ?), ?)), fecha_hasta = IF(? IS NULL, fecha_hasta, GREATEST(COALESCE(fecha_hasta, ?), ?)),
                errores = ?, updated_by = ? WHERE id = ? AND id_sede = ?',
        'iiiiiidsssssssiii', [$res['filas_ok'], $res['filas_error'], $res['ventas_nuevas'], $res['ventas_reemplazadas'], $res['ventas_omitidas'], $res['items_creados'], $res['total_valor'],
            $res['fecha_desde'], $res['fecha_desde'], $res['fecha_desde'], $res['fecha_hasta'], $res['fecha_hasta'], $res['fecha_hasta'],
            json_encode($errores, JSON_UNESCAPED_UNICODE), $ctx['id_usuario'], $id, $ctx['id_sede']]);
    $conn->commit();
    $conn->close();
    crmOk($res, 'Bloque importado');
}

if ($accion === 'finalizar') {
    $conn->begin_transaction();
    crmExec($conn, "UPDATE crm_importaciones SET estado = 'completa', updated_by = ? WHERE id = ? AND id_sede = ?", 'iii', [$ctx['id_usuario'], $id, $ctx['id_sede']]);
    $l = crmImportacion($conn, $ctx, $id);
    auditAdmin($conn, 'crm_importar_ventas', [
        'id_importacion' => $id, 'archivo' => $l['archivo'], 'filas_ok' => (int)$l['filas_ok'], 'filas_error' => (int)$l['filas_error'],
        'ventas_nuevas' => (int)$l['ventas_nuevas'], 'ventas_reemplazadas' => (int)$l['ventas_reemplazadas'], 'total_valor' => (float)$l['total_valor'],
    ]);
    $conn->commit();
    $conn->close();
    crmOk(['id' => $id], 'Importación completa');
}

authFail(400, 'Acción inválida');
