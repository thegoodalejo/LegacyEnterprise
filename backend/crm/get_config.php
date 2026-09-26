<?php
// Configuración general del CRM de la empresa: moneda y decimales de los montos (cualquiera con acceso al CRM).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext(CRM_MODULOS_CONTACTOS);
$conn = conectar();
$cfg = crmConfig($conn, $ctx['id_empresa']);
$conn->close();

crmOk($cfg);
