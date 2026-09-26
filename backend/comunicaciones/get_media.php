<?php
// URL firmada (5 min) del archivo de un mensaje, guardado en el bucket privado de R2. POST: id (mensaje).
// Mismo permiso que ver la conversación.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bandeja.php';
require_once '../_lib/_r2.php';

$ctx = comContext();
$id = (int)($_POST['id'] ?? 0);
$conn = conectar();
$m = crmRow($conn, 'SELECT id_conversacion, id_sede, media_key, media_mime, media_nombre FROM com_mensajes WHERE id = ?', 'i', [$id]);
if (!$m || (int)$m['id_sede'] !== $ctx['id_sede']) authFail(404, 'Mensaje no encontrado');
comConversacionAcceso($conn, $ctx, (int)$m['id_conversacion']);
$conn->close();
if (!$m['media_key'] || !str_starts_with($m['media_key'], 'sedes/' . $ctx['id_sede'] . '/')) authFail(404, 'El archivo no está disponible');
crmOk(['url' => r2PresignGet($m['media_key'], 300), 'mime' => $m['media_mime'], 'nombre' => $m['media_nombre']]);
