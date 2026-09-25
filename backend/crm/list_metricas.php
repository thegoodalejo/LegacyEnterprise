<?php
// Métricas de metas de la empresa (QUÉ se mide). Cualquiera con acceso al CRM: las usan el panel de metas y sus filtros.
// POST: solo_activas (0|1, por defecto 0). Devuelve {metricas:[…], config}.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_metas.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$conn = conectar();
$metricas = array_values(crmMetricas($conn, $ctx['id_empresa'], ($_POST['solo_activas'] ?? '0') === '1'));
$cfg = crmConfig($conn, $ctx['id_empresa']);
$conn->close();

crmOk(['metricas' => $metricas, 'config' => $cfg]);
