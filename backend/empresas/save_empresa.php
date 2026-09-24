<?php
// Panel de plataforma (solo L5): crear/editar empresa y su marca blanca.
// Colores: los tres o ninguno (vacíos = paleta Legacy Enterprise). quitar_logo=1 vuelve al logo por defecto.
// El logo se sube aparte con empresas/upload_logo.php (R2).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

requirePlatformAdmin();

$id       = (int)($_POST['id'] ?? 0);
$nombre   = trim($_POST['nombre'] ?? '');
$nit      = trim($_POST['nit'] ?? '');
$activo   = isset($_POST['activo']) ? ((int)$_POST['activo'] === 1 ? 1 : 0) : 1;
$c1       = hexColorOrNull($_POST['color_primario'] ?? '');
$c2       = hexColorOrNull($_POST['color_secundario'] ?? '');
$c3       = hexColorOrNull($_POST['color_terciario'] ?? '');
$quitarLogo = ($_POST['quitar_logo'] ?? '0') === '1';

if ($nombre === '') authFail(400, 'nombre requerido');
if (mb_strlen($nombre) > 150) authFail(400, 'nombre demasiado largo');
$nit = $nit !== '' ? mb_substr($nit, 0, 30) : null;
$colores = [$c1, $c2, $c3];
if (count(array_filter($colores)) !== 0 && count(array_filter($colores)) !== 3) {
    authFail(400, 'Define los tres colores de la marca o ninguno');
}

$conn = conectar();
if ($id === 0) {
    $stmt = db_prepare_or_fail($conn,
        'INSERT INTO le_empresas (nombre, nit, color_primario, color_secundario, color_terciario, activo) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->bind_param('sssssi', $nombre, $nit, $c1, $c2, $c3, $activo);
    $ok = $stmt->execute();
    $id = $ok ? (int)$conn->insert_id : 0;
    $stmt->close();
    if ($ok) auditAdmin($conn, 'create_empresa', ['id_empresa' => $id, 'nombre' => $nombre], null);
} else {
    $sql = 'UPDATE le_empresas SET nombre = ?, nit = ?, color_primario = ?, color_secundario = ?, color_terciario = ?, activo = ?'
         . ($quitarLogo ? ', logo_url = NULL' : '') . ' WHERE id = ?';
    $stmt = db_prepare_or_fail($conn, $sql);
    $stmt->bind_param('sssssii', $nombre, $nit, $c1, $c2, $c3, $activo, $id);
    $ok = $stmt->execute() && $stmt->affected_rows >= 0;
    $stmt->close();
    if ($ok) auditAdmin($conn, 'update_empresa', [
        'id_empresa' => $id, 'nombre' => $nombre, 'colores' => $colores, 'activo' => $activo, 'quitar_logo' => $quitarLogo,
    ], null);
}

$empresa = null;
if ($ok) {
    $s = db_prepare_or_fail($conn,
        'SELECT id, nombre, nit, color_primario, color_secundario, color_terciario, logo_url, activo FROM le_empresas WHERE id = ?');
    $s->bind_param('i', $id);
    $s->execute();
    $empresa = $s->get_result()->fetch_assoc();
    $s->close();
    if (!$empresa) $ok = false;
}
$conn->close();

echo json_encode(['action' => $ok, 'mensaje' => $ok ? 'Empresa guardada' : 'No se pudo guardar la empresa', 'data' => $empresa]);
