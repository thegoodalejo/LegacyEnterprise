<?php
// Una conversación con sus mensajes. POST: id, y para el polling liviano: desde_id (mensajes con id mayor) y desde (AAAA-MM-DD HH:MM:SS:
// además los que cambiaron de estado desde entonces, para las palomitas). Sin desde_id: los últimos `limite` (máx. 100); antes_de pagina hacia atrás.
// Devuelve `ahora` (reloj del servidor) para el siguiente `desde`.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bandeja.php';

$ctx = comContext();
$id = (int)($_POST['id'] ?? 0);
$desdeId = (int)($_POST['desde_id'] ?? 0);
$desde = trim((string)($_POST['desde'] ?? ''));
$antesDe = (int)($_POST['antes_de'] ?? 0);
$limite = min(100, max(1, (int)($_POST['limite'] ?? 50)));
if ($desde !== '' && !DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $desde)) authFail(400, 'desde inválido');

$conn = conectar();
$ahora = date('Y-m-d H:i:s');
$c = comConversacionAcceso($conn, $ctx, $id);
if ($desdeId > 0) {
    $rows = crmRows($conn, COM_SQL_MENSAJES . ' WHERE m.id_conversacion = ? AND (m.id > ? OR (? <> \'\' AND m.updated_at >= ?)) ORDER BY m.id',
        'iiss', [$id, $desdeId, $desde, $desde]);
    $hayAnteriores = null;
} else {
    $rows = crmRows($conn, COM_SQL_MENSAJES . ' WHERE m.id_conversacion = ? AND (? = 0 OR m.id < ?) ORDER BY m.id DESC LIMIT ?',
        'iiii', [$id, $antesDe, $antesDe, $limite + 1]);
    $hayAnteriores = count($rows) > $limite;
    $rows = array_reverse(array_slice($rows, 0, $limite));
}
$out = ['conversacion' => comConversacionPublica($conn, $c), 'mensajes' => array_map('comMensajePublico', $rows), 'ahora' => $ahora];
if ($hayAnteriores !== null) $out['hay_anteriores'] = $hayAnteriores;
$conn->close();
crmOk($out);
