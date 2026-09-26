<?php
// Definición de campos personalizados de la empresa (los usan formularios y filtros; cualquiera con acceso al CRM).
// POST: aplica_a (persona|organizacion|oportunidad, opcional), solo_activos (0|1, por defecto 0).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext(CRM_MODULOS_CONTACTOS);
$aplicaA = $_POST['aplica_a'] ?? '';
if ($aplicaA !== '' && !in_array($aplicaA, CRM_APLICA_A, true)) authFail(400, 'aplica_a inválido');

$conn = conectar();
$campos = crmCampos($conn, $ctx['id_empresa'], $aplicaA !== '' ? $aplicaA : null, ($_POST['solo_activos'] ?? '0') === '1');
$conn->close();

crmOk(['campos' => $campos]);
