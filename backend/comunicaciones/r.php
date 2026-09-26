<?php
// Enlace de seguimiento (PÚBLICO): el botón de enlace de las plantillas apunta aquí con un token por envío. Registra el clic y redirige al destino
// guardado para ese token (nunca a uno que venga por parámetro: no es un open redirect). GET: t (24 hex).
require_once '../db_connection.php';
require_once '../_lib/_crm.php';

$t = (string)($_GET['t'] ?? '');
if (!preg_match('/^[0-9a-f]{24}$/', $t)) { comRNoEncontrado(); }
$conn = conectar();
$e = crmRow($conn, 'SELECT token, destino, id_campana FROM com_enlaces WHERE token = ?', 's', [$t]);
if (!$e) { $conn->close(); comRNoEncontrado(); }
crmExec($conn, 'UPDATE com_enlaces SET clics = clics + 1, primer_clic_at = COALESCE(primer_clic_at, CURRENT_TIMESTAMP), ultimo_clic_at = CURRENT_TIMESTAMP WHERE token = ?', 's', [$t]);
if ($e['id_campana'] !== null) {
    crmExec($conn, 'UPDATE com_campana_destinatarios SET clic_at = COALESCE(clic_at, CURRENT_TIMESTAMP) WHERE link_token = ?', 's', [$t]);
}
$conn->close();
header('Cache-Control: no-store');
header('Location: ' . $e['destino'], true, 302);
exit;

function comRNoEncontrado(): never
{
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Enlace no válido</title>'
       . '<p style="font-family:sans-serif;padding:2rem">Este enlace no es válido o ya no existe.</p>';
    exit;
}
