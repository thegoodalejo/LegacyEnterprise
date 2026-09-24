<?php
// Panel de plataforma (solo L5): sube el logo de marca blanca de una empresa a R2 (bucket público)
// y reemplaza el anterior. Campos: id_empresa, file.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_r2.php';

requirePlatformAdmin();

$idEmpresa = (int)($_POST['id_empresa'] ?? 0);
if ($idEmpresa <= 0) authFail(400, 'id_empresa requerido');
if (empty($_FILES['file'])) authFail(400, 'Falta el archivo');

$conn = conectar();
$s = db_prepare_or_fail($conn, 'SELECT logo_url FROM le_empresas WHERE id = ?');
$s->bind_param('i', $idEmpresa);
$s->execute();
$empresa = $s->get_result()->fetch_assoc();
$s->close();
if (!$empresa) { $conn->close(); authFail(404, 'La empresa no existe'); }

$res = r2UploadBranding($_FILES['file'], $idEmpresa);
if (!$res['success']) {
    $conn->close();
    echo json_encode(['action' => false, 'mensaje' => $res['error']]);
    exit;
}

$u = db_prepare_or_fail($conn, 'UPDATE le_empresas SET logo_url = ? WHERE id = ?');
$u->bind_param('si', $res['url'], $idEmpresa);
$ok = $u->execute();
$u->close();

if ($ok) {
    r2DeleteBrandingUrl($empresa['logo_url'], $idEmpresa);
    auditAdmin($conn, 'upload_logo_empresa', ['id_empresa' => $idEmpresa, 'key' => $res['key']], null);
}
$conn->close();

echo json_encode(['action' => $ok, 'mensaje' => $ok ? 'Logo actualizado' : 'No se pudo guardar el logo', 'data' => $ok ? ['logo_url' => $res['url']] : null]);
