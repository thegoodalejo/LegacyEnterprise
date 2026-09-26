<?php
// Guarda una plantilla como BORRADOR (L2+), sin enviarla a Meta. POST: id (0 = nueva), id_linea, nombre, idioma, categoria (UTILITY|MARKETING),
// encabezado (JSON {tipo, texto, variable}), cuerpo, pie, botones (JSON [{tipo: respuesta|enlace, texto}]), variables (JSON [{n, ejemplo, origen, valor, defecto}]).
// Solo se editan aquí los borradores y las rechazadas; una aprobada se cambia enviándola otra vez a revisión (enviar_plantilla.php).
// Devuelve {id, nombre (normalizado), revision}.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_plantillas.php';

$ctx = comContext();
requireRole('L2');
$id = (int)($_POST['id'] ?? 0);
$conn = conectar();
$actual = $id > 0 ? comPlantilla($conn, $ctx['id_sede'], $id) : null;
if ($id > 0 && !$actual) authFail(404, 'Plantilla no encontrada');
if ($actual && !in_array($actual['estado'], ['borrador', 'rechazada'], true)) authFail(409, 'Solo se editan borradores o rechazadas: para cambiar una aprobada, envíala a revisión con los cambios');

$src = $_POST;
foreach (['encabezado', 'botones', 'variables'] as $k) $src[$k] = crmJsonParam($k);
$d = comPlantillaParsear($conn, $ctx, $src);
if ($actual && $actual['meta_id'] && ($d['nombre'] !== $actual['nombre'] || $d['idioma'] !== $actual['idioma'] || $d['linea']['waba_id'] !== $actual['waba_id'])) {
    authFail(409, 'El nombre, el idioma y la cuenta de WhatsApp no cambian después de enviarla a Meta (duplícala para crear otra)');
}
if (crmRow($conn, 'SELECT id FROM com_plantillas WHERE waba_id = ? AND nombre = ? AND idioma = ? AND id <> ?', 'sssi', [$d['linea']['waba_id'], $d['nombre'], $d['idioma'], $id])) {
    authFail(409, "Ya existe una plantilla «{$d['nombre']}» en ese idioma para esta cuenta de WhatsApp");
}
$j = static fn($x) => $x === null ? null : json_encode($x, JSON_UNESCAPED_UNICODE);
if ($actual) {
    crmExec($conn, 'UPDATE com_plantillas SET id_linea = ?, waba_id = ?, nombre = ?, idioma = ?, categoria_solicitada = ?, encabezado = ?, cuerpo = ?, pie = ?,
                    botones = ?, variables = ?, updated_by = ? WHERE id = ?',
        'isssssssssii', [$d['linea']['id'], $d['linea']['waba_id'], $d['nombre'], $d['idioma'], $d['categoria_solicitada'], $j($d['encabezado']), $d['cuerpo'], $d['pie'],
            $j($d['botones']), $j($d['variables']), $ctx['id_usuario'], $id]);
} else {
    crmExec($conn, 'INSERT INTO com_plantillas (id_sede, id_linea, waba_id, nombre, idioma, categoria_solicitada, encabezado, cuerpo, pie, botones, variables, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        'iisssssssssii', [$ctx['id_sede'], $d['linea']['id'], $d['linea']['waba_id'], $d['nombre'], $d['idioma'], $d['categoria_solicitada'], $j($d['encabezado']),
            $d['cuerpo'], $d['pie'], $j($d['botones']), $j($d['variables']), $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
}
$conn->close();
crmOk(['id' => $id, 'nombre' => $d['nombre'], 'revision' => comPlantillaRevision($d)], 'Borrador guardado');
