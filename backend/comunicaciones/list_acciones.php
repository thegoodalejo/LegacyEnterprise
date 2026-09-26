<?php
// Lo que necesita el editor de flujos (L2+): acciones disponibles en la sede (según sus módulos) y los catálogos para configurarlas:
// etiquetas, personas del equipo, campos de las Personas, embudos/etapas abiertas (si hay CRM), flujos (para «Ir a otro flujo») y líneas.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bot.php';

$ctx = comContext();
requireRole('L2');
$conn = conectar();
$acciones = array_values(array_map('comAccionPublica', comAccionesDeSede($conn, $ctx['id_sede'])));
$tags = crmRows($conn, "SELECT id, nombre, color FROM crm_tags WHERE id_empresa = ? AND activo = 1 AND (aplica_a IS NULL OR aplica_a = 'persona') ORDER BY orden, nombre",
    'i', [$ctx['id_empresa']]);
$campos = crmRows($conn, "SELECT id, etiqueta, tipo_dato FROM crm_campos_personalizados WHERE id_empresa = ? AND aplica_a = 'persona' AND activo = 1 ORDER BY orden, etiqueta",
    'i', [$ctx['id_empresa']]);
$etapas = [];
if (comSedeTieneModulo($conn, $ctx['id_sede'], 'crm')) {
    $etapas = crmRows($conn,
        "SELECT e.id, e.nombre, b.nombre AS embudo FROM crm_etapas e JOIN crm_embudos b ON b.id = e.id_embudo AND b.activo = 1
          WHERE e.id_empresa = ? AND e.activo = 1 AND e.tipo = 'abierta' ORDER BY b.orden, b.nombre, e.orden", 'i', [$ctx['id_empresa']]);
}
$flujos = crmRows($conn, 'SELECT id, nombre, activo FROM com_flujos WHERE id_sede = ? AND borrado = 0 ORDER BY nombre', 'i', [$ctx['id_sede']]);
$lineas = crmRows($conn, 'SELECT id, nombre FROM com_lineas WHERE id_sede = ? AND activo = 1 ORDER BY nombre', 'i', [$ctx['id_sede']]);
$usuarios = comUsuariosModulo($conn, $ctx['id_sede']);
$conn->close();
$int = static fn(array $rows, array $ks = ['id']) => array_map(static function ($r) use ($ks) { foreach ($ks as $k) $r[$k] = (int)$r[$k]; return $r; }, $rows);
crmOk([
    'acciones' => $acciones, 'etiquetas' => $int($tags), 'campos' => $int($campos), 'etapas' => $int($etapas), 'usuarios' => $usuarios,
    'flujos' => array_map(static fn($f) => ['id' => (int)$f['id'], 'nombre' => $f['nombre'], 'activo' => (int)$f['activo'] === 1], $flujos),
    'lineas' => $int($lineas),
]);
