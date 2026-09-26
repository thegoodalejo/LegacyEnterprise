<?php
// Crea, edita o desactiva una respuesta rápida. POST: id (0 = nueva), equipo (0|1; las de equipo solo L2+), atajo, titulo, texto, activo (0|1).
// Personales: solo su dueño. El atajo es único entre las activas visibles para el usuario (equipo + suyas).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

$ctx = comContext();
$id = (int)($_POST['id'] ?? 0);
$equipo = ($_POST['equipo'] ?? '0') === '1';
$activo = ($_POST['activo'] ?? '1') === '0' ? 0 : 1;
$atajo = strtolower(trim((string)($_POST['atajo'] ?? ''), " /\t"));
if (!preg_match('/^[a-z0-9_-]{1,30}$/', $atajo)) authFail(400, 'El atajo lleva solo letras sin tildes, números, guion o guion bajo (máx. 30)');
$titulo = crmClean($_POST['titulo'] ?? null, 100, 'Título', true);
$texto = crmClean($_POST['texto'] ?? null, 4096, 'Texto', true);
if ($equipo && !comEsRol($ctx, 'L2')) authFail(403, 'Solo L2+ administra las respuestas de equipo');

$conn = conectar();
if ($id > 0) {
    $r = crmRow($conn, 'SELECT id_usuario FROM com_respuestas_rapidas WHERE id = ? AND id_sede = ?', 'ii', [$id, $ctx['id_sede']]);
    if (!$r) authFail(404, 'Respuesta no encontrada');
    $esEquipo = $r['id_usuario'] === null;
    if ($esEquipo && !comEsRol($ctx, 'L2')) authFail(403, 'Solo L2+ administra las respuestas de equipo');
    if (!$esEquipo && (int)$r['id_usuario'] !== $ctx['id_usuario']) authFail(403, 'Es una respuesta personal de otra persona');
    $equipo = $esEquipo;
}
if ($activo && crmRow($conn,
    'SELECT id FROM com_respuestas_rapidas WHERE id_sede = ? AND atajo = ? AND activo = 1 AND id <> ? AND (id_usuario IS NULL OR id_usuario = ?)',
    'isii', [$ctx['id_sede'], $atajo, $id, $ctx['id_usuario']])) authFail(409, "Ya hay una respuesta con el atajo /$atajo");
if ($id > 0) {
    crmExec($conn, 'UPDATE com_respuestas_rapidas SET atajo = ?, titulo = ?, texto = ?, activo = ?, updated_by = ? WHERE id = ?',
        'sssiii', [$atajo, $titulo, $texto, $activo, $ctx['id_usuario'], $id]);
} else {
    crmExec($conn, 'INSERT INTO com_respuestas_rapidas (id_sede, id_usuario, atajo, titulo, texto, activo, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'iisssiii', [$ctx['id_sede'], $equipo ? null : $ctx['id_usuario'], $atajo, $titulo, $texto, $activo, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
}
$conn->close();
crmOk(['id' => $id], 'Respuesta guardada');
