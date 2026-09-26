<?php
// Importación de contactos (Personas u Organizaciones) por bloques (L2+). El navegador lee el archivo, interpreta las filas y las manda en bloques.
// POST accion:
//   simular   — filas (JSON), opciones (JSON), padres (JSON, opcional): procesa el bloque dentro de una transacción que se revierte; nada queda guardado.
//   iniciar   — archivo, filas_total, opciones (JSON), mapeo (JSON): crea el lote (tipo «contactos», estado «procesando») y devuelve {id}.
//   bloque    — id_importacion, filas (JSON), opciones (JSON): procesa y guarda el bloque; suma los contadores al lote.
//   finalizar — id_importacion: marca el lote como completo y deja la auditoría (crm_importar_contactos).
// filas = [{fila, clave, d: {nombres|razon_social, apellidos, documento_tipo, documento_numero, correo|correo_facturacion, telefono, whatsapp,
//          fecha_nacimiento, direccion, ciudad, lat, lng, responsable, etiquetas, organizacion, rol, pertenece_a, ref_nombres, ref_apellidos,
//          ref_rol, ref_telefono, ref_correo, ref_documento, ref_whatsapp}, campos: {id_campo: valor}}].
// opciones = {tipo (persona|organizacion), identificar (documento|nombre|campo|ninguno), id_campo, existentes (omitir|actualizar), indicativo, id_responsable}.
// Respuesta de simular/bloque: {filas_ok, filas_error, contactos_nuevos, contactos_actualizados, contactos_omitidos, personas_creadas, vinculos_creados,
// errores:[{fila, motivo}], organizaciones_no_encontradas, etiquetas_desconocidas, roles_desconocidos, responsables_desconocidos}.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_import_contactos.php';

$ctx = crmContext();
requireRole('L2');
$accion = (string)($_POST['accion'] ?? '');

$conn = conectar();

if ($accion === 'simular') {
    $op = crmImpcOpciones($conn, $ctx, crmJsonParam('opciones') ?? []);
    $conn->begin_transaction();
    $res = crmImpcProcesar($conn, $ctx, crmJsonParam('filas') ?? [], $op, null, (string)($_POST['archivo'] ?? ''), crmJsonParam('padres') ?? []);
    $conn->rollback();
    $conn->close();
    crmOk($res, 'Simulación');
}

if ($accion === 'iniciar') {
    $op = crmImpcOpciones($conn, $ctx, crmJsonParam('opciones') ?? []);
    $archivo = crmClean($_POST['archivo'] ?? null, 190, 'Archivo');
    $filas = max(0, min(10_000_000, (int)($_POST['filas_total'] ?? 0)));
    crmExec($conn, 'INSERT INTO crm_importaciones (id_sede, tipo, archivo, opciones, filas_total, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'isssiii', [$ctx['id_sede'], 'contactos', $archivo, json_encode($op + ['mapeo' => crmJsonParam('mapeo')], JSON_UNESCAPED_UNICODE), $filas, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
    $conn->close();
    crmOk(['id' => $id], 'Importación iniciada');
}

$id = (int)($_POST['id_importacion'] ?? 0);
$lote = $id > 0 ? crmImportacion($conn, $ctx, $id) : null;
if (!$lote || $lote['tipo'] !== 'contactos') authFail(404, 'Importación no encontrada');
if ($lote['estado'] !== 'procesando') authFail(409, 'La importación ya se cerró');

if ($accion === 'bloque') {
    $op = crmImpcOpciones($conn, $ctx, crmJsonParam('opciones') ?? []);
    $conn->begin_transaction();
    $res = crmImpcProcesar($conn, $ctx, crmJsonParam('filas') ?? [], $op, $id, (string)$lote['archivo']);
    $errores = json_decode((string)($lote['errores'] ?? '[]'), true) ?: [];
    $errores = array_slice(array_merge($errores, $res['errores']), 0, CRM_IMPORT_ERRORES_MAX);
    crmExec($conn,
        'UPDATE crm_importaciones SET filas_ok = filas_ok + ?, filas_error = filas_error + ?, contactos_nuevos = contactos_nuevos + ?,
                contactos_actualizados = contactos_actualizados + ?, contactos_omitidos = contactos_omitidos + ?, personas_creadas = personas_creadas + ?,
                vinculos_creados = vinculos_creados + ?, errores = ?, updated_by = ? WHERE id = ? AND id_sede = ?',
        'iiiiiiisiii', [$res['filas_ok'], $res['filas_error'], $res['contactos_nuevos'], $res['contactos_actualizados'], $res['contactos_omitidos'],
            $res['personas_creadas'], $res['vinculos_creados'], json_encode($errores, JSON_UNESCAPED_UNICODE), $ctx['id_usuario'], $id, $ctx['id_sede']]);
    $conn->commit();
    $conn->close();
    crmOk($res, 'Bloque importado');
}

if ($accion === 'finalizar') {
    $conn->begin_transaction();
    crmExec($conn, "UPDATE crm_importaciones SET estado = 'completa', updated_by = ? WHERE id = ? AND id_sede = ?", 'iii', [$ctx['id_usuario'], $id, $ctx['id_sede']]);
    $l = crmImportacion($conn, $ctx, $id);
    auditAdmin($conn, 'crm_importar_contactos', [
        'id_importacion' => $id, 'archivo' => $l['archivo'], 'filas_ok' => (int)$l['filas_ok'], 'filas_error' => (int)$l['filas_error'],
        'contactos_nuevos' => (int)$l['contactos_nuevos'], 'contactos_actualizados' => (int)$l['contactos_actualizados'], 'personas_creadas' => (int)$l['personas_creadas'],
    ]);
    $conn->commit();
    $conn->close();
    crmOk(['id' => $id], 'Importación completa');
}

authFail(400, 'Acción inválida');
