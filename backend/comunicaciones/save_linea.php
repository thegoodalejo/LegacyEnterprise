<?php
// Crea o edita una línea de WhatsApp de una sede (plataforma, L5). El token se cifra; en una edición, vacío conserva el guardado.
// POST: id (0 = nueva), id_sede, id_app, nombre, telefono_visible, phone_number_id, waba_id, access_token, activo (0|1).
// Después de guardar conviene «Probar conexión» (probar_linea.php): lee el número en Meta y suscribe la WABA a la app.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

requirePlatformAdmin();
$u = $GLOBALS['authUser'];
$id = (int)($_POST['id'] ?? 0);
$idSede = (int)($_POST['id_sede'] ?? 0);
$idApp = (int)($_POST['id_app'] ?? 0);
$nombre = crmClean($_POST['nombre'] ?? null, 100, 'Nombre', true);
$telefono = crmClean($_POST['telefono_visible'] ?? null, 30, 'Teléfono visible');
$pnid = crmDigits($_POST['phone_number_id'] ?? '');
$waba = crmDigits($_POST['waba_id'] ?? '');
$token = trim((string)($_POST['access_token'] ?? ''));
$activo = ($_POST['activo'] ?? '1') === '0' ? 0 : 1;
if ($pnid === '' || strlen($pnid) > 40) authFail(400, 'El Phone Number ID es obligatorio (solo números)');
if ($waba === '' || strlen($waba) > 40) authFail(400, 'El WABA ID es obligatorio (solo números)');
if ($token !== '' && (strlen($token) < 50 || preg_match('/\s/', $token))) authFail(400, 'El token de acceso no parece válido');

$conn = conectar();
if (!crmRow($conn, 'SELECT 1 AS ok FROM le_sedes WHERE id = ?', 'i', [$idSede])) authFail(400, 'Sede inexistente');
if (!crmRow($conn, 'SELECT 1 AS ok FROM com_meta_apps WHERE id = ?', 'i', [$idApp])) authFail(400, 'App de Meta inexistente');
if (crmRow($conn, 'SELECT id FROM com_lineas WHERE phone_number_id = ? AND id <> ?', 'si', [$pnid, $id])) authFail(409, 'Ese Phone Number ID ya está registrado en otra línea');

$ult4 = $token !== '' ? substr($token, -4) : null;
if ($id > 0) {
    if (!crmRow($conn, 'SELECT id FROM com_lineas WHERE id = ?', 'i', [$id])) authFail(404, 'Línea no encontrada');
    crmExec($conn, 'UPDATE com_lineas SET id_sede = ?, id_app = ?, nombre = ?, telefono_visible = ?, phone_number_id = ?, waba_id = ?, activo = ?, updated_by = ? WHERE id = ?',
        'iissssiii', [$idSede, $idApp, $nombre, $telefono, $pnid, $waba, $activo, $u['id'], $id]);
    if ($token !== '') {
        crmExec($conn, 'UPDATE com_lineas SET access_token_enc = ?, token_ultimos4 = ?, verificada_at = NULL, suscrita_at = NULL WHERE id = ?',
            'ssi', [comCifrar($token), $ult4, $id]);
    }
} else {
    if ($token === '') authFail(400, 'Para una línea nueva, el token de acceso es obligatorio');
    crmExec($conn,
        'INSERT INTO com_lineas (id_sede, id_app, nombre, telefono_visible, phone_number_id, waba_id, access_token_enc, token_ultimos4, activo, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        'iissssssiii', [$idSede, $idApp, $nombre, $telefono, $pnid, $waba, comCifrar($token), $ult4, $activo, $u['id'], $u['id']]);
    $id = (int)$conn->insert_id;
}
auditAdmin($conn, 'com_guardar_linea', ['id_linea' => $id, 'id_sede' => $idSede, 'phone_number_id' => $pnid, 'token_cambiado' => $token !== '', 'activo' => $activo], $idSede);
$conn->close();
crmOk(['id' => $id], 'Línea guardada');
