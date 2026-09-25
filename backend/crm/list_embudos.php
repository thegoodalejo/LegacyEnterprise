<?php
// Embudos de la empresa con sus etapas, y la configuración de montos (tablero, formularios y pantalla de configuración; cualquiera con acceso al CRM).
// POST: solo_activos (0|1, por defecto 0).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$conn = conectar();
$embudos = crmEmbudos($conn, $ctx['id_empresa'], ($_POST['solo_activos'] ?? '0') === '1');
$cfg = crmConfig($conn, $ctx['id_empresa']);
$conn->close();

crmOk(['embudos' => $embudos, 'config' => $cfg]);
