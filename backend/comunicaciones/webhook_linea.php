<?php
// A dónde manda Meta los eventos de UN número (plataforma, L5). Meta permite un webhook alterno por número (prioridad número → WABA → app):
// así una línea recibe aquí sus mensajes y estados aunque la URL de la app de Meta siga siendo la de otro sistema (LegacyChats mientras
// convivan). Los eventos de plantillas y de la cuenta siempre van a la URL de la app (así funciona Meta).
// POST: id (línea), accion: ver | activar (el número apunta a nuestro webhook) | quitar (vuelve a la URL de la WABA o de la app).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

requirePlatformAdmin();
$id = (int)($_POST['id'] ?? 0);
$accion = (string)($_POST['accion'] ?? 'ver');
if (!in_array($accion, ['ver', 'activar', 'quitar'], true)) authFail(400, 'Acción inválida');
$conn = conectar();
$l = comLinea($conn, $id, null, false);
if (!$l) authFail(404, 'Línea no encontrada');
if (!$l['token']) authFail(409, comCryptoDisponible() ? 'La línea no tiene token' : 'Falta COM_SECRET_KEY en el servidor: el token no se puede leer');
$app = crmRow($conn, 'SELECT app_secret_enc, verify_token_enc FROM com_meta_apps WHERE id = ?', 'i', [$l['id_app']]);
$ruta = '/' . $l['phone_number_id'];

if ($accion === 'activar') {
    // Sin App Secret no se puede validar la firma: todo lo que Meta mande se rechazaría y se perderían mensajes.
    if (!comDescifrar($app['app_secret_enc'])) authFail(409, 'La app de Meta no tiene App Secret: sin él los mensajes que lleguen se rechazan. Guárdalo primero en «Apps de Meta».');
    $verify = comDescifrar($app['verify_token_enc']);
    if (!$verify) authFail(409, 'La app de Meta no tiene verify token. Guárdalo primero en «Apps de Meta».');
    // Meta verifica la URL (GET con hub.challenge) antes de aceptarla: responde nuestro webhook con el verify token de la app.
    $r = comGraph('POST', $ruta, $l['token'], $l['graph_version'],
        ['webhook_configuration' => ['override_callback_uri' => comUrlWebhook($l['id_app']), 'verify_token' => $verify]]);
} elseif ($accion === 'quitar') {
    $r = comGraph('POST', $ruta, $l['token'], $l['graph_version'], ['webhook_configuration' => ['override_callback_uri' => '']]);
}
if (isset($r) && !$r['ok']) {
    [, $err] = comErrorDe($r);
    crmExec($conn, 'UPDATE com_lineas SET ultimo_error = ? WHERE id = ?', 'si', [$err, $id]);
    auditAdmin($conn, 'com_webhook_linea', ['id_linea' => $id, 'accion' => $accion, 'ok' => false, 'error' => $err], $l['id_sede']);
    authFail(502, 'Meta no aceptó el cambio: ' . $err);
}

// Lo que Meta dice hoy (número, WABA y app). Si no se puede leer, se informa sin fallar: el cambio ya quedó hecho.
$w = comLeerWebhookLinea($conn, $l);
if ($accion !== 'ver') {
    auditAdmin($conn, 'com_webhook_linea', ['id_linea' => $id, 'accion' => $accion, 'ok' => true, 'efectiva' => $w['efectiva']], $l['id_sede']);
}
$conn->close();
crmOk($w, $accion === 'activar' ? 'Los mensajes de este número llegan ahora aquí'
    : ($accion === 'quitar' ? 'El número volvió a la URL de la app' : 'Configuración leída'));
