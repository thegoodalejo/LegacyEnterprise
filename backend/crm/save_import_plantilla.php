<?php
// Guarda (crea o sobrescribe por nombre) o desactiva una plantilla de mapeo de importación de ventas (L2+).
// POST: nombre, mapeo (JSON: {columnas:{campo: índice de columna}, fila_encabezado, formato_fecha, decimal, opciones:{…}}), activo (0 = eliminar).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
requireRole('L2');
$nombre = crmClean($_POST['nombre'] ?? null, 80, 'Nombre', true);
$activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : 1;

$conn = conectar();
if ($activo === 0) {
    crmExec($conn, "UPDATE crm_import_plantillas SET activo = 0, updated_by = ? WHERE id_empresa = ? AND tipo = 'ventas' AND nombre = ?", 'iis', [$ctx['id_usuario'], $ctx['id_empresa'], $nombre]);
    $conn->close();
    crmOk([], 'Plantilla eliminada');
}
$mapeo = crmJsonParam('mapeo');
if (!$mapeo || !is_array($mapeo['columnas'] ?? null)) authFail(400, 'El mapeo de columnas es obligatorio');
$json = json_encode($mapeo, JSON_UNESCAPED_UNICODE);
if (strlen($json) > 20000) authFail(400, 'El mapeo es demasiado grande');
crmExec($conn,
    "INSERT INTO crm_import_plantillas (id_empresa, tipo, nombre, mapeo, created_by, updated_by) VALUES (?, 'ventas', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE mapeo = VALUES(mapeo), activo = 1, updated_by = VALUES(updated_by)",
    'issii', [$ctx['id_empresa'], $nombre, $json, $ctx['id_usuario'], $ctx['id_usuario']]);
$conn->close();

crmOk(['nombre' => $nombre], 'Plantilla guardada');
