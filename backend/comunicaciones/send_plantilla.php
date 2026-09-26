<?php
// Envía una plantilla aprobada a un contacto (cualquiera con acceso al módulo): la forma de escribir fuera de la ventana de 24 h o de iniciar una
// conversación desde el perfil. Quien la envía queda atendiendo la conversación.
// POST multipart: id_plantilla, id_conversacion | (id_contacto + id_linea), valores (JSON {n: texto, h1: texto} para las variables «a mano»),
// destino (URL, si la plantilla tiene el botón de enlace de seguimiento), archivo (si el encabezado es imagen, video o documento).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bandeja.php';
require_once '../_lib/_com_plantillas.php';
require_once '../_lib/_r2.php';

$ctx = comContext();
$conn = conectar();
$tpl = comPlantilla($conn, $ctx['id_sede'], (int)($_POST['id_plantilla'] ?? 0));
if (!$tpl) authFail(404, 'Plantilla no encontrada');
if ($motivo = comPlantillaNoEnviable($tpl)) authFail(409, $motivo);

$idConv = (int)($_POST['id_conversacion'] ?? 0);
if ($idConv > 0) {
    $conv = comConversacionAcceso($conn, $ctx, $idConv, 'escribir');
    $linea = comLinea($conn, $conv['id_linea'], $ctx['id_sede']);
} else {
    $idContacto = (int)($_POST['id_contacto'] ?? 0);
    $c = crmRow($conn, "SELECT c.id, p.whatsapp_e164 FROM crm_contactos c JOIN crm_contactos_personas p ON p.id = c.id WHERE c.id = ? AND c.id_sede = ? AND c.activo = 1",
        'ii', [$idContacto, $ctx['id_sede']]);
    if (!$c) authFail(404, 'Contacto no encontrado (debe ser una Persona activa)');
    if (!$c['whatsapp_e164']) authFail(400, 'El contacto no tiene WhatsApp');
    $linea = comLinea($conn, (int)($_POST['id_linea'] ?? $tpl['id_linea']), $ctx['id_sede']);
    if (!$linea) authFail(409, 'Línea inactiva');
    $conv = comConversacionPara($conn, $linea, $c['whatsapp_e164'], null);
    if ($conv['id_contacto'] !== (int)$c['id']) crmExec($conn, 'UPDATE com_conversaciones SET id_contacto = ? WHERE id = ?', 'ii', [(int)$c['id'], $conv['id']]);
    $conv = comConversacionAcceso($conn, $ctx, $conv['id'], 'escribir');
}
if (!$linea) authFail(409, 'La línea de esta conversación está inactiva');
if ($linea['waba_id'] !== $tpl['waba_id']) authFail(409, 'La plantilla es de otra cuenta de WhatsApp: elige una de la línea de esta conversación');
$categoria = strtolower((string)($tpl['categoria'] ?? $tpl['categoria_solicitada']));
if ($categoria === 'marketing' && comEstaDeBaja($conn, $ctx['id_sede'], $conv['wa_id'])) authFail(409, 'El contacto pidió no recibir mensajes de marketing');

$valores = comPlantillaValores($conn, $tpl, $conv['id_contacto'], $conv['wa_id'], crmJsonParam('valores') ?? []);
if ($valores['faltan']) authFail(400, 'Completa las variables: ' . implode(', ', array_map(static fn($n) => $n === 'h1' ? 'encabezado' : '{{' . $n . '}}', $valores['faltan'])));

$enc = $tpl['encabezado'] ? json_decode($tpl['encabezado'], true) : null;
$mediaId = null; $media = [];
if ($enc && $enc['tipo'] !== 'texto') {
    $f = $_FILES['archivo'] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) authFail(400, 'Adjunta el ' . $enc['tipo'] . ' del encabezado');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    if (!in_array($mime, COM_TPL_MIME_ENCABEZADO[$enc['tipo']], true)) authFail(400, "Archivo no válido para el encabezado ($mime)");
    if ($f['size'] > ($enc['tipo'] === 'imagen' ? 5 : 16) * 1024 * 1024) authFail(400, 'El archivo es demasiado grande');
    $nombre = mb_substr(basename((string)$f['name']), 0, 200);
    [$mediaId, $err] = comSubirMediaMeta($linea, $f['tmp_name'], $mime, $nombre);
    if (!$mediaId) authFail(502, 'WhatsApp no aceptó el archivo: ' . $err);
    $media = ['mime' => $mime, 'nombre' => $nombre, 'bytes' => (int)$f['size']];
    if (getenv('R2_ENDPOINT') && getenv('R2_BUCKET_PRIVATE')) {
        $up = r2Upload($conn, $f, $ctx['id_sede'], 'comunicaciones', [], 16, true);
        if ($up['success']) $media['key'] = $up['key'];
    }
}
$token = comPlantillaTieneEnlace($tpl) ? comCrearEnlace($conn, $ctx['id_sede'], comValidarDestino($_POST['destino'] ?? null)) : null;

// Quien inicia (o retoma) la conversación la atiende. Una asignada a otra persona solo la alcanza L2+ (comConversacionAcceso) y no se reasigna.
if ($conv['estado'] !== 'atencion') {
    comAsignar($conn, $conv, $ctx['id_usuario'], comNombreUsuario($conn, $ctx['id_usuario']) . ' envió la plantilla «' . $tpl['nombre'] . '»');
    $conv = comConversacionFila($conn, $conv['id']);
}
$r = comEnviar($conn, $conv, $linea, [
    'origen' => 'asesor', 'id_usuario' => $ctx['id_usuario'], 'categoria' => $categoria, 'media' => $media,
    'payload' => comPlantillaPayload($tpl, $valores, $mediaId, $media['nombre'] ?? null, $token),
    'texto' => comPlantillaTexto($tpl, $valores),
    'contenido' => ['plantilla' => ['id' => (int)$tpl['id'], 'nombre' => $tpl['nombre'], 'idioma' => $tpl['idioma'], 'categoria' => $categoria,
        'encabezado' => $enc ? ['tipo' => $enc['tipo']] : null, 'botones' => json_decode($tpl['botones'] ?? '[]', true) ?: []]],
]);
if ($token && $r['id']) crmExec($conn, 'UPDATE com_enlaces SET id_mensaje = ? WHERE token = ?', 'is', [$r['id'], $token]);
$msg = $r['id'] ? crmRow($conn, COM_SQL_MENSAJES . ' WHERE m.id = ?', 'i', [$r['id']]) : null;
$conn->close();
if (!$r['ok'] && !$msg) authFail($r['clase'] === 'sin_creditos' ? 402 : 409, $r['error']);
crmOk(['mensaje' => $msg ? comMensajePublico($msg) : null, 'id_conversacion' => $conv['id'], 'ok' => $r['ok'], 'error' => $r['error']], $r['ok'] ? 'Plantilla enviada' : $r['error']);
