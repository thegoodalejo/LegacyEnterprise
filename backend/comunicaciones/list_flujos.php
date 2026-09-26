<?php
// Flujos del chatbot de la sede (L2+), con sus palabras de activación, cuántos pasos tienen y cuántas conversaciones están dentro ahora.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

$ctx = comContext();
requireRole('L2');
$conn = conectar();
$rows = crmRows($conn,
    "SELECT f.id, f.nombre, f.descripcion, f.activo, f.version, f.updated_at, COALESCE(u.nombre, u.email) AS actualizado_por,
            JSON_LENGTH(f.grafo, '$.nodos') AS pasos,
            (SELECT COUNT(*) FROM com_conversaciones c WHERE c.id_flujo = f.id AND c.estado = 'bot') AS en_curso
       FROM com_flujos f LEFT JOIN le_usuarios u ON u.id = f.updated_by
      WHERE f.id_sede = ? AND f.borrado = 0 ORDER BY f.activo DESC, f.nombre", 'i', [$ctx['id_sede']]);
$disp = crmRows($conn, 'SELECT d.id_flujo, d.tipo, d.texto, d.prioridad, d.id_linea FROM com_flujo_disparadores d JOIN com_flujos f ON f.id = d.id_flujo
                         WHERE f.id_sede = ? AND f.borrado = 0 ORDER BY d.prioridad DESC, d.texto', 'i', [$ctx['id_sede']]);
$cfg = comConfigSede($conn, $ctx['id_sede']);
$conn->close();
$porFlujo = [];
foreach ($disp as $d) $porFlujo[(int)$d['id_flujo']][] = ['tipo' => $d['tipo'], 'texto' => $d['texto'], 'prioridad' => (int)$d['prioridad'],
    'id_linea' => $d['id_linea'] !== null ? (int)$d['id_linea'] : null];
$out = array_map(static fn($r) => [
    'id' => (int)$r['id'], 'nombre' => $r['nombre'], 'descripcion' => $r['descripcion'], 'activo' => (int)$r['activo'] === 1, 'version' => (int)$r['version'],
    'pasos' => (int)$r['pasos'], 'en_curso' => (int)$r['en_curso'], 'updated_at' => $r['updated_at'], 'actualizado_por' => $r['actualizado_por'],
    'disparadores' => $porFlujo[(int)$r['id']] ?? [], 'es_respaldo' => $cfg['sin_coincidencia'] === 'flujo' && $cfg['id_flujo_respaldo'] === (int)$r['id'],
], $rows);
crmOk(['flujos' => $out, 'sin_coincidencia' => $cfg['sin_coincidencia'], 'palabras_asesor' => $cfg['palabras_asesor']]);
