<?php
// Un flujo del chatbot con su grafo completo y sus palabras de activación (L2+). POST: id.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

$ctx = comContext();
requireRole('L2');
$id = (int)($_POST['id'] ?? 0);
$conn = conectar();
$f = crmRow($conn, 'SELECT f.id, f.nombre, f.descripcion, f.activo, f.grafo, f.version, f.updated_at, COALESCE(u.nombre, u.email) AS actualizado_por
                      FROM com_flujos f LEFT JOIN le_usuarios u ON u.id = f.updated_by WHERE f.id = ? AND f.id_sede = ? AND f.borrado = 0', 'ii', [$id, $ctx['id_sede']]);
if (!$f) authFail(404, 'Flujo no encontrado');
$disp = crmRows($conn, 'SELECT tipo, texto, prioridad, id_linea FROM com_flujo_disparadores WHERE id_flujo = ? ORDER BY prioridad DESC, texto', 'i', [$id]);
$conn->close();
crmOk(['flujo' => [
    'id' => (int)$f['id'], 'nombre' => $f['nombre'], 'descripcion' => $f['descripcion'], 'activo' => (int)$f['activo'] === 1, 'version' => (int)$f['version'],
    'grafo' => json_decode($f['grafo'], true), 'updated_at' => $f['updated_at'], 'actualizado_por' => $f['actualizado_por'],
    'disparadores' => array_map(static fn($d) => ['tipo' => $d['tipo'], 'texto' => $d['texto'], 'prioridad' => (int)$d['prioridad'],
        'id_linea' => $d['id_linea'] !== null ? (int)$d['id_linea'] : null], $disp),
]]);
