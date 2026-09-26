<?php
// Enviar un archivo desde la bandeja (imagen, video, audio o documento). POST multipart: id_conversacion, archivo, caption (opcional).
// Se sube a Meta (/media) y se envía por id; una copia queda en el bucket privado de R2 para verlo en el hilo (si R2 está configurado).
// Mismas reglas que send_mensaje.php (toma la conversación, ventana de 24 h, créditos). Máx. 16 MB (5 MB para imágenes, límite de WhatsApp).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bandeja.php';
require_once '../_lib/_r2.php';

$ctx = comContext();
$f = $_FILES['archivo'] ?? null;
if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) authFail(400, 'No se recibió el archivo o llegó incompleto');
$mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
$tipo = comTipoPorMime($mime);
if ($tipo === null) authFail(400, "WhatsApp no admite este tipo de archivo ($mime)");
$max = $tipo === 'image' ? 5 : 16;
if ($f['size'] > $max * 1024 * 1024) authFail(400, "El archivo supera el límite de $max MB");
$caption = crmClean($_POST['caption'] ?? null, 1024, 'Texto del archivo');
$nombre = mb_substr(basename((string)($f['name'] ?? 'archivo')), 0, 200);

$conn = conectar();
$c = comConversacionAcceso($conn, $ctx, (int)($_POST['id_conversacion'] ?? 0), 'escribir');
$l = comLinea($conn, $c['id_linea']);
if (!$l) authFail(409, 'La línea de esta conversación está inactiva');
if (!comVentanaAbierta($c)) authFail(409, 'Pasaron más de 24 h desde el último mensaje del cliente: responde con una plantilla');
$saldo = comPuedeEnviar($conn, $c['id_sede'], 'service');
if (!$saldo['ok']) authFail(402, 'Sin créditos suficientes para enviar');

[$mediaId, $err] = comSubirMediaMeta($l, $f['tmp_name'], $mime, $nombre);
if (!$mediaId) authFail(502, 'WhatsApp no aceptó el archivo: ' . $err);
$media = ['mime' => $mime, 'nombre' => $nombre, 'bytes' => (int)$f['size']];
if (getenv('R2_ENDPOINT') && getenv('R2_BUCKET_PRIVATE')) {
    $up = r2Upload($conn, $f, $ctx['id_sede'], 'comunicaciones', [], 16, true);
    if ($up['success']) $media['key'] = $up['key'];
}
if ($c['estado'] !== 'atencion') {
    comAsignar($conn, $c, $ctx['id_usuario'], comNombreUsuario($conn, $ctx['id_usuario']) . ' tomó la conversación');
    $c = comConversacionFila($conn, $c['id']);
}
$r = comEnviar($conn, $c, $l, ['origen' => 'asesor', 'payload' => comPayloadMedia($tipo, $mediaId, $caption, $tipo === 'document' ? $nombre : null),
    'texto' => $caption, 'id_usuario' => $ctx['id_usuario'], 'media' => $media]);
$msg = $r['id'] ? crmRow($conn, COM_SQL_MENSAJES . ' WHERE m.id = ?', 'i', [$r['id']]) : null;
$conn->close();
if (!$r['ok'] && !$msg) authFail(409, $r['error']);
crmOk(['mensaje' => $msg ? comMensajePublico($msg) : null, 'ok' => $r['ok'], 'error' => $r['error']], $r['ok'] ? 'Enviado' : $r['error']);
