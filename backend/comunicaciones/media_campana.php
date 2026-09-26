<?php
// Sube el archivo del encabezado (imagen, video o documento) de una campaña en borrador (L2+): va a Meta (vale 30 días) y una copia a R2.
// POST multipart: id, archivo.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_campanas.php';
require_once '../_lib/_r2.php';

$ctx = comContext();
requireRole('L2');
$conn = conectar();
$c = comCampana($conn, $ctx['id_sede'], (int)($_POST['id'] ?? 0));
if (!$c) authFail(404, 'Campaña no encontrada');
if (!in_array($c['estado'], ['borrador', 'programada', 'pausada', 'esperando_saldo', 'esperando_cupo'], true)) authFail(409, 'La campaña ya se está enviando o terminó');
$tpl = comPlantilla($conn, $ctx['id_sede'], (int)$c['id_plantilla']);
$enc = $tpl['encabezado'] ? json_decode($tpl['encabezado'], true) : null;
if (!$enc || $enc['tipo'] === 'texto') authFail(400, 'La plantilla no tiene encabezado multimedia');
$f = $_FILES['archivo'] ?? null;
if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) authFail(400, 'No se recibió el archivo');
$mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
if (!in_array($mime, COM_TPL_MIME_ENCABEZADO[$enc['tipo']], true)) authFail(400, "Archivo no válido para un encabezado de {$enc['tipo']} ($mime)");
if ($f['size'] > ($enc['tipo'] === 'imagen' ? 5 : 16) * 1024 * 1024) authFail(400, 'El archivo es demasiado grande');
$linea = comLinea($conn, (int)$c['id_linea'], $ctx['id_sede']);
if (!$linea) authFail(409, 'Línea inactiva');
$nombre = mb_substr(basename((string)$f['name']), 0, 200);
[$mediaId, $err] = comSubirMediaMeta($linea, $f['tmp_name'], $mime, $nombre);
if (!$mediaId) authFail(502, 'WhatsApp no aceptó el archivo: ' . $err);
$key = null;
if (getenv('R2_ENDPOINT') && getenv('R2_BUCKET_PRIVATE')) {
    $up = r2Upload($conn, $f, $ctx['id_sede'], 'comunicaciones', [], 16, true);
    if ($up['success']) $key = $up['key'];
}
crmExec($conn, 'UPDATE com_campanas SET media_id = ?, media_key = ?, media_nombre = ?, media_mime = ?, media_subida_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?',
    'ssssii', [$mediaId, $key, $nombre, $mime, $ctx['id_usuario'], (int)$c['id']]);
$conn->close();
crmOk(['nombre' => $nombre], 'Archivo listo');
