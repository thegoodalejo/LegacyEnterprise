<?php
// «Probar conexión» de una línea (plataforma, L5): lee el número en la Graph API (nombre verificado, calidad, nivel de mensajes) y
// suscribe la WABA a la app (POST /{waba_id}/subscribed_apps): sin esa suscripción Meta no manda los mensajes al webhook.
// POST: id. Devuelve el resultado de cada paso.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

requirePlatformAdmin();
$id = (int)($_POST['id'] ?? 0);
$conn = conectar();
$l = comLinea($conn, $id, null, false);
if (!$l) authFail(404, 'Línea no encontrada');
if (!$l['token']) authFail(409, comCryptoDisponible() ? 'La línea no tiene token' : 'Falta COM_SECRET_KEY en el servidor: el token no se puede leer');

$num = comGraph('GET', '/' . $l['phone_number_id'] . '?fields=verified_name,display_phone_number,quality_rating,messaging_limit_tier,code_verification_status',
    $l['token'], $l['graph_version']);
$pasos = [];
if ($num['ok']) {
    $d = $num['data'];
    crmExec($conn, 'UPDATE com_lineas SET nombre_verificado = ?, calidad = ?, nivel_mensajes = ?, telefono_visible = COALESCE(telefono_visible, ?),
                    verificada_at = CURRENT_TIMESTAMP, ultimo_error = NULL WHERE id = ?',
        'ssssi', [$d['verified_name'] ?? null, $d['quality_rating'] ?? null, $d['messaging_limit_tier'] ?? null, $d['display_phone_number'] ?? null, $id]);
    $pasos[] = ['paso' => 'numero', 'ok' => true, 'detalle' => trim(($d['verified_name'] ?? '') . ' · ' . ($d['display_phone_number'] ?? ''), ' ·')];
} else {
    [, $err] = comErrorDe($num);
    crmExec($conn, 'UPDATE com_lineas SET ultimo_error = ? WHERE id = ?', 'si', [$err, $id]);
    $pasos[] = ['paso' => 'numero', 'ok' => false, 'detalle' => $err];
}

$sub = comGraph('POST', '/' . $l['waba_id'] . '/subscribed_apps', $l['token'], $l['graph_version'], []);
if ($sub['ok']) {
    crmExec($conn, 'UPDATE com_lineas SET suscrita_at = CURRENT_TIMESTAMP WHERE id = ?', 'i', [$id]);
    $pasos[] = ['paso' => 'suscripcion', 'ok' => true, 'detalle' => 'WABA suscrita a la app'];
} else {
    [, $err] = comErrorDe($sub);
    crmExec($conn, 'UPDATE com_lineas SET ultimo_error = ? WHERE id = ?', 'si', [$err, $id]);
    $pasos[] = ['paso' => 'suscripcion', 'ok' => false, 'detalle' => $err];
}
// Informativo (no hace fallar la prueba): a dónde manda Meta hoy los mensajes de este número. Si es la URL de otro sistema que comparte la
// app (LegacyChats), se usa «Recibir aquí los mensajes de este número» (webhook_linea.php).
$w = comLeerWebhookLinea($conn, $l);
$pasos[] = ['paso' => 'webhook', 'ok' => true, 'aqui' => $w['aqui'],
            'detalle' => $w['aviso'] ?? ($w['aqui'] ? 'Los mensajes llegan aquí' : 'Los mensajes llegan a ' . ($w['efectiva'] ?? '(sin URL)'))];
auditAdmin($conn, 'com_probar_linea', ['id_linea' => $id, 'pasos' => $pasos], $l['id_sede']);
$conn->close();
$ok = !in_array(false, array_column($pasos, 'ok'), true);
crmOk(['ok' => $ok, 'pasos' => $pasos], $ok ? 'Conexión correcta' : 'La prueba encontró problemas');
