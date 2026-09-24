<?php
// Panel de plataforma (solo L5): crear sede, renombrar, activar/desactivar, regenerar código.
// La lista para el panel sale de get_mis_sedes.php (para L5 devuelve todas).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

requirePlatformAdmin();

$id         = (int)($_POST['id'] ?? 0);
$idEmpresa  = (int)($_POST['id_empresa'] ?? 0);   // obligatoria al crear; al editar, mueve la sede de empresa
$nombre     = trim($_POST['nombre'] ?? '');
$activo     = isset($_POST['activo']) ? ((int)$_POST['activo'] === 1 ? 1 : 0) : null;
$regenerar  = ($_POST['regenerar_codigo'] ?? '0') === '1';

$genCodigo = static fn() => strtoupper(bin2hex(random_bytes(4)));
$conn = conectar();

if ($idEmpresa > 0) {
    $e = db_prepare_or_fail($conn, 'SELECT id FROM le_empresas WHERE id = ?');
    $e->bind_param('i', $idEmpresa);
    $e->execute();
    $existe = (bool)$e->get_result()->fetch_assoc();
    $e->close();
    if (!$existe) { $conn->close(); authFail(400, 'La empresa no existe'); }
}

if ($id === 0) {
    if ($nombre === '') authFail(400, 'nombre requerido');
    if ($idEmpresa <= 0) authFail(400, 'id_empresa requerido');
    $codigo = $genCodigo();
    $stmt = db_prepare_or_fail($conn, 'INSERT INTO le_sedes (id_empresa, nombre, codigo_invitacion) VALUES (?, ?, ?)');
    $stmt->bind_param('iss', $idEmpresa, $nombre, $codigo);
    $ok = $stmt->execute();       // choque de UNIQUE en el código: probabilidad ínfima, se reintenta desde la UI
    $id = $ok ? (int)$conn->insert_id : 0;
    $stmt->close();
    if ($ok) auditAdmin($conn, 'create_sede', ['nombre' => $nombre, 'id_empresa' => $idEmpresa], $id);
} else {
    $sets = []; $types = ''; $vals = [];
    if ($idEmpresa > 0)   { $sets[] = 'id_empresa = ?';        $types .= 'i'; $vals[] = $idEmpresa; }
    if ($nombre !== '')   { $sets[] = 'nombre = ?';            $types .= 's'; $vals[] = $nombre; }
    if ($activo !== null) { $sets[] = 'activo = ?';            $types .= 'i'; $vals[] = $activo; }
    if ($regenerar)       { $sets[] = 'codigo_invitacion = ?'; $types .= 's'; $vals[] = $genCodigo(); }
    if (!$sets) authFail(400, 'Nada que actualizar');
    $types .= 'i'; $vals[] = $id;
    $stmt = db_prepare_or_fail($conn, 'UPDATE le_sedes SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $stmt->bind_param($types, ...$vals);
    $ok = $stmt->execute();
    $stmt->close();
    if ($ok) auditAdmin($conn, 'update_sede', ['nombre' => $nombre ?: null, 'id_empresa' => $idEmpresa ?: null, 'activo' => $activo, 'regenerar' => $regenerar], $id);
}

$sede = null;
if ($ok) {
    $s = db_prepare_or_fail($conn, 'SELECT id, id_empresa, nombre, codigo_invitacion, activo FROM le_sedes WHERE id = ?');
    $s->bind_param('i', $id);
    $s->execute();
    $sede = $s->get_result()->fetch_assoc();
    $s->close();
}
$conn->close();

echo json_encode(['action' => $ok, 'mensaje' => $ok ? 'Sede guardada' : 'No se pudo guardar la sede', 'data' => $sede]);
