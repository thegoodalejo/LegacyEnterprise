<?php
// Ajustes de Comunicaciones de la sede (L4): fuente de créditos, comportamiento del chatbot y textos. Con los flujos activos (para el de respaldo).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

$ctx = comContext();
requireRole('L4');
$conn = conectar();
$cfg = comConfigSede($conn, $ctx['id_sede']);
$flujos = [];
if (crmRow($conn, "SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'com_flujos'")) {
    $flujos = crmRows($conn, 'SELECT id, nombre FROM com_flujos WHERE id_sede = ? AND activo = 1 AND borrado = 0 ORDER BY nombre', 'i', [$ctx['id_sede']]);
    foreach ($flujos as &$f) $f['id'] = (int)$f['id'];
    unset($f);
}
$conn->close();
unset($cfg['created_at'], $cfg['created_by'], $cfg['updated_by']);
$cfg['enviar_texto_cierre'] = (int)$cfg['enviar_texto_cierre'] === 1;
crmOk(['config' => $cfg, 'flujos' => $flujos]);
