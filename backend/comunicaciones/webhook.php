<?php
// Webhook de WhatsApp Cloud API (Meta). PÚBLICO: sin sesión ni CORS; la seguridad es la firma X-Hub-Signature-256 con el app secret.
// Una URL por app de Meta (…/comunicaciones/webhook.php?app=<id>): así el secreto se conoce ANTES de validar.
//   GET  — verificación: si hub.verify_token coincide con el de la app, responde hub.challenge en text/plain (si no, 403).
//   POST — valida la firma sobre el cuerpo crudo, procesa (_com_webhook.php), responde 200 enseguida y despierta al worker.
// Meta reintenta si no recibe 200: los duplicados se descartan por los únicos de com_entrantes y com_mensajes.
require_once '../db_connection.php';
require_once '../_lib/_com_webhook.php';

header('Content-Type: text/plain; charset=utf-8');
$idApp = (int)($_GET['app'] ?? 0);
$conn = conectar();
$app = $idApp > 0 ? crmRow($conn, 'SELECT * FROM com_meta_apps WHERE id = ? AND activo = 1', 'i', [$idApp]) : null;
if (!$app) { http_response_code(404); echo 'App desconocida'; exit; }

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    // PHP convierte los puntos de los nombres del query string en guiones bajos: hub.mode → hub_mode.
    $esperado = comDescifrar($app['verify_token_enc']);
    $token = (string)($_GET['hub_verify_token'] ?? '');
    if (($_GET['hub_mode'] ?? '') === 'subscribe' && $esperado !== null && $token !== '' && hash_equals($esperado, $token)) {
        echo (string)($_GET['hub_challenge'] ?? '');
        exit;
    }
    http_response_code(403);
    echo 'Verificación rechazada';
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); exit; }

$raw = (string)file_get_contents('php://input');
$firma = (string)($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
$secreto = comDescifrar($app['app_secret_enc']);
if ($secreto === null) {
    error_log("[com_webhook] app {$app['id']} sin app secret legible (¿falta COM_SECRET_KEY?)");
    http_response_code(500);
    echo 'App sin configurar';
    exit;
}
if ($firma === '' || !hash_equals('sha256=' . hash_hmac('sha256', $raw, $secreto), $firma)) {
    http_response_code(403);
    echo 'Firma inválida';
    exit;
}

$body = json_decode($raw, true);
$encolados = is_array($body) ? comWebhookProcesar($conn, $app, $body) : 0;
$conn->close();
echo 'OK';
if ($encolados > 0) comDespertarWorker();
