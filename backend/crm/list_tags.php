<?php
// Catálogo de etiquetas y grupos de la empresa (selectores, filtros y pantalla de configuración).
// POST: solo_activos (0|1, por defecto 0).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext(CRM_MODULOS_CONTACTOS);
$soloActivos = ($_POST['solo_activos'] ?? '0') === '1' ? ' AND activo = 1' : '';

$conn = conectar();
$grupos = crmRows($conn, "SELECT id, nombre, orden, activo FROM crm_tags_grupos WHERE id_empresa = ?$soloActivos ORDER BY orden, nombre", 'i', [$ctx['id_empresa']]);
$tags = crmRows($conn, "SELECT id, id_grupo, nombre, color, aplica_a, orden, activo FROM crm_tags WHERE id_empresa = ?$soloActivos ORDER BY orden, nombre", 'i', [$ctx['id_empresa']]);
$conn->close();

foreach ($grupos as &$g) { $g['id'] = (int)$g['id']; $g['orden'] = (int)$g['orden']; $g['activo'] = (int)$g['activo'] === 1; }
foreach ($tags as &$t) {
    $t['id'] = (int)$t['id'];
    $t['id_grupo'] = $t['id_grupo'] !== null ? (int)$t['id_grupo'] : null;
    $t['orden'] = (int)$t['orden'];
    $t['activo'] = (int)$t['activo'] === 1;
}

crmOk(['grupos' => $grupos, 'tags' => $tags]);
