<?php
// Envía una plantilla a revisión de Meta (L2+). Crea la plantilla en Meta o, si ya existe (rechazada, aprobada o pausada), le manda los cambios.
// POST multipart: id, más (opcional) los mismos campos de save_plantilla.php para guardar cambios antes de enviar, y `ejemplo` (archivo) si el
// encabezado es imagen, video o documento (Meta pide una muestra).
// Revisión de categoría: una plantilla pedida como UTILIDAD con riesgo ALTO no se envía (409 con la revisión): hay que cambiar el texto o pedirla
// como marketing. Si Meta la aprueba en otra categoría, queda marcada «reclasificada» y se avisa.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_plantillas.php';

$ctx = comContext();
requireRole('L2');
$id = (int)($_POST['id'] ?? 0);
$conn = conectar();
$t = comPlantilla($conn, $ctx['id_sede'], $id);
if (!$t) authFail(404, 'Plantilla no encontrada');
if (in_array($t['estado'], ['eliminada', 'deshabilitada', 'pendiente'], true)) authFail(409, 'Esta plantilla no se puede enviar a revisión ahora (' . $t['estado'] . ')');

// Cambios que vienen con el envío (aprobada/pausada: se editan así; borrador/rechazada: pueden venir o no).
if (isset($_POST['cuerpo'])) {
    $src = $_POST;
    foreach (['encabezado', 'botones', 'variables'] as $k) $src[$k] = crmJsonParam($k);
    $src['id_linea'] = $src['id_linea'] ?? $t['id_linea'];
    $d = comPlantillaParsear($conn, $ctx, $src);
    if ($t['meta_id'] && ($d['nombre'] !== $t['nombre'] || $d['idioma'] !== $t['idioma'] || $d['linea']['waba_id'] !== $t['waba_id'])) {
        authFail(409, 'El nombre, el idioma y la cuenta de WhatsApp no cambian después de enviarla a Meta');
    }
    if ($t['meta_id'] && $d['categoria_solicitada'] !== $t['categoria_solicitada'] && $t['estado'] === 'aprobada') authFail(409, 'Meta no deja cambiar la categoría de una plantilla aprobada');
    $j = static fn($x) => $x === null ? null : json_encode($x, JSON_UNESCAPED_UNICODE);
    crmExec($conn, 'UPDATE com_plantillas SET id_linea = ?, waba_id = ?, nombre = ?, idioma = ?, categoria_solicitada = ?, encabezado = ?, cuerpo = ?, pie = ?,
                    botones = ?, variables = ?, updated_by = ? WHERE id = ?',
        'isssssssssii', [$d['linea']['id'], $d['linea']['waba_id'], $d['nombre'], $d['idioma'], $d['categoria_solicitada'], $j($d['encabezado']), $d['cuerpo'],
            $d['pie'], $j($d['botones']), $j($d['variables']), $ctx['id_usuario'], $id]);
    $t = comPlantilla($conn, $ctx['id_sede'], $id);
}

$rev = comPlantillaRevision($t);
if ($t['categoria_solicitada'] === 'UTILITY' && $rev['riesgo'] === 'alto') {
    http_response_code(409);
    echo json_encode(['action' => false, 'mensaje' => 'Meta la clasificaría como marketing: cambia el texto o pídela como marketing', 'data' => ['revision' => $rev]],
        JSON_UNESCAPED_UNICODE);
    exit;
}
$linea = comLinea($conn, (int)$t['id_linea'], $ctx['id_sede']);
if (!$linea || !$linea['token']) authFail(409, 'La línea de la plantilla está inactiva o sin token');

$enc = $t['encabezado'] ? json_decode($t['encabezado'], true) : null;
$handle = null;
if ($enc && $enc['tipo'] !== 'texto') {
    $f = $_FILES['ejemplo'] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) authFail(400, 'Adjunta un ejemplo del ' . $enc['tipo'] . ' del encabezado (Meta lo pide para revisar)');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    if (!in_array($mime, COM_TPL_MIME_ENCABEZADO[$enc['tipo']], true)) authFail(400, "El ejemplo no es un archivo válido para un encabezado de {$enc['tipo']} ($mime)");
    if ($f['size'] > ($enc['tipo'] === 'imagen' ? 5 : 16) * 1024 * 1024) authFail(400, 'El ejemplo es demasiado grande');
    [$handle, $err] = comSubirEjemploPlantilla($linea, $f['tmp_name'], $mime, basename((string)$f['name']));
    if (!$handle) authFail(502, 'Meta no aceptó el ejemplo: ' . $err);
}

$componentes = comPlantillaComponentesMeta($t, $handle);
if ($t['meta_id']) {
    $r = comGraph('POST', '/' . $t['meta_id'], $linea['token'], $linea['graph_version'], ['components' => $componentes]);
} else {
    $r = comGraph('POST', '/' . $linea['waba_id'] . '/message_templates', $linea['token'], $linea['graph_version'],
        ['name' => $t['nombre'], 'language' => $t['idioma'], 'category' => $t['categoria_solicitada'], 'components' => $componentes]);
}
if (!$r['ok']) {
    [, $err] = comErrorDe($r);
    $user = $r['data']['error']['error_user_msg'] ?? null;
    authFail(409, 'Meta rechazó el envío: ' . ($user ?: $err));
}
$metaId = (string)($r['data']['id'] ?? $t['meta_id']);
$estado = COM_TPL_ESTADO_META[strtoupper((string)($r['data']['status'] ?? 'PENDING'))] ?? 'pendiente';
crmExec($conn, "UPDATE com_plantillas SET meta_id = ?, estado = ?, motivo_rechazo = NULL, revision = ?, enviada_at = CURRENT_TIMESTAMP,
                aprobada_at = IF(? = 'aprobada', CURRENT_TIMESTAMP, aprobada_at), updated_by = ? WHERE id = ?",
    'ssssii', [$metaId, $estado, json_encode($rev, JSON_UNESCAPED_UNICODE), $estado, $ctx['id_usuario'], $id]);
if (!empty($r['data']['category'])) comPlantillaCategoria($conn, comPlantilla($conn, $ctx['id_sede'], $id), (string)$r['data']['category']);
auditRegistro($conn, $ctx['id_sede'], 'comunicaciones', 'com_plantillas', $id, 'enviada_a_meta', ['nombre' => $t['nombre'], 'categoria' => $t['categoria_solicitada'], 'riesgo' => $rev['riesgo']]);
$final = comPlantillaPublica(comPlantilla($conn, $ctx['id_sede'], $id));
$conn->close();
crmOk(['plantilla' => $final], $estado === 'aprobada' ? 'Meta la aprobó' : 'Enviada a revisión de Meta');
