<?php
// Crea o edita una app de Meta (plataforma, L5). Secretos cifrados; en una edición, un secreto vacío conserva el guardado.
// POST: id (0 = nueva), nombre, app_id, app_secret, verify_token, graph_version (vNN.N), activo (0|1).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

requirePlatformAdmin();
$u = $GLOBALS['authUser'];
$id = (int)($_POST['id'] ?? 0);
$nombre = crmClean($_POST['nombre'] ?? null, 100, 'Nombre', true);
$appId = crmDigits($_POST['app_id'] ?? '');
if ($appId === '' || strlen($appId) > 40) authFail(400, 'El App ID de Meta es obligatorio (solo números)');
$version = trim((string)($_POST['graph_version'] ?? COM_GRAPH_VERSION)) ?: COM_GRAPH_VERSION;
if (!preg_match('/^v\d{1,2}\.\d$/', $version)) authFail(400, 'Versión de Graph API inválida (ej. v23.0)');
$secret = trim((string)($_POST['app_secret'] ?? ''));
$verify = trim((string)($_POST['verify_token'] ?? ''));
$activo = ($_POST['activo'] ?? '1') === '0' ? 0 : 1;
if ($secret !== '' && !preg_match('/^[0-9a-f]{32}$/i', $secret)) authFail(400, 'El App Secret de Meta son 32 caracteres hexadecimales');
if ($verify !== '' && (strlen($verify) < 8 || strlen($verify) > 100)) authFail(400, 'El verify token debe tener entre 8 y 100 caracteres');

$conn = conectar();
if (crmRow($conn, 'SELECT id FROM com_meta_apps WHERE app_id = ? AND id <> ?', 'si', [$appId, $id])) authFail(409, 'Ya existe una app con ese App ID');

if ($id > 0) {
    if (!crmRow($conn, 'SELECT id FROM com_meta_apps WHERE id = ?', 'i', [$id])) authFail(404, 'App no encontrada');
    crmExec($conn, 'UPDATE com_meta_apps SET nombre = ?, app_id = ?, graph_version = ?, activo = ?, updated_by = ? WHERE id = ?',
        'sssiii', [$nombre, $appId, $version, $activo, $u['id'], $id]);
    if ($secret !== '') crmExec($conn, 'UPDATE com_meta_apps SET app_secret_enc = ? WHERE id = ?', 'si', [comCifrar($secret), $id]);
    if ($verify !== '') crmExec($conn, 'UPDATE com_meta_apps SET verify_token_enc = ? WHERE id = ?', 'si', [comCifrar($verify), $id]);
} else {
    if ($secret === '' || $verify === '') authFail(400, 'Para una app nueva, el App Secret y el verify token son obligatorios');
    crmExec($conn, 'INSERT INTO com_meta_apps (nombre, app_id, app_secret_enc, verify_token_enc, graph_version, activo, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'sssssiii', [$nombre, $appId, comCifrar($secret), comCifrar($verify), $version, $activo, $u['id'], $u['id']]);
    $id = (int)$conn->insert_id;
}
auditAdmin($conn, 'com_guardar_app', ['id_app' => $id, 'app_id' => $appId, 'secret_cambiado' => $secret !== '', 'verify_cambiado' => $verify !== '', 'activo' => $activo]);
$conn->close();
crmOk(['id' => $id, 'webhook_url' => comUrlWebhook($id)], 'App guardada');
