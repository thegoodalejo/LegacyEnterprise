<?php
// Subida genérica a R2. Cada módulo real suele tener su propio endpoint que llama a r2Upload()
// y guarda la 'key' en su tabla; este sirve de ejemplo y para avatares/logos.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_r2.php';

$idSede = requireSede();

// Lista blanca: módulo → [mimes, MB máx, privado, privilegio requerido]
$MODULOS = [
    'logos'      => [['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'], 2,  false, null],
    'avatares'   => [['image/png', 'image/jpeg', 'image/webp'],                  2,  false, null],
    'documentos' => [['application/pdf', 'image/png', 'image/jpeg'],             15, true,  'archivos'],
];

$modulo = $_POST['modulo'] ?? '';
if (!isset($MODULOS[$modulo])) authFail(400, 'Módulo no permitido');
[$mimes, $maxMB, $private, $priv] = $MODULOS[$modulo];
if ($priv !== null) requirePrivilege($priv);
if (empty($_FILES['file'])) authFail(400, 'Falta el archivo');

$conn = conectar();
$res = r2Upload($conn, $_FILES['file'], $idSede, $modulo, $mimes, $maxMB, $private);
if ($res['success']) auditAdmin($conn, 'upload_file', ['modulo' => $modulo, 'key' => $res['key'], 'size' => $res['size']]);
$conn->close();

echo json_encode([
    'action'  => $res['success'],
    'mensaje' => $res['success'] ? 'Archivo subido' : $res['error'],
    'data'    => $res['success'] ? ['key' => $res['key'], 'url' => $res['url'], 'mime' => $res['mime'], 'size' => $res['size']] : null,
]);
