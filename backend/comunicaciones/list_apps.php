<?php
// Apps de Meta registradas (plataforma, L5). Nunca devuelve los secretos: solo si están configurados y la URL del webhook de cada app.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

requirePlatformAdmin();
$conn = conectar();
$rows = crmRows($conn,
    'SELECT a.id, a.nombre, a.app_id, a.graph_version, a.activo, a.app_secret_enc IS NOT NULL AS secret_ok, a.verify_token_enc IS NOT NULL AS verify_ok,
            a.updated_at, (SELECT COUNT(*) FROM com_lineas l WHERE l.id_app = a.id AND l.activo = 1) AS lineas
       FROM com_meta_apps a ORDER BY a.activo DESC, a.nombre');
$conn->close();
$out = array_map(static fn($r) => [
    'id' => (int)$r['id'], 'nombre' => $r['nombre'], 'app_id' => $r['app_id'], 'graph_version' => $r['graph_version'],
    'activo' => (int)$r['activo'] === 1, 'secret_configurado' => (int)$r['secret_ok'] === 1, 'verify_configurado' => (int)$r['verify_ok'] === 1,
    'lineas' => (int)$r['lineas'], 'webhook_url' => comUrlWebhook((int)$r['id']), 'updated_at' => $r['updated_at'],
], $rows);
crmOk(['apps' => $out, 'cifrado_disponible' => comCryptoDisponible()]);
