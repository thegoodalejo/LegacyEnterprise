<?php
// Cambia los créditos que descuenta una categoría de precio de Meta (plataforma, L5). POST: categoria, creditos (0–1000).
// Aplica a los cobros siguientes; los ya cobrados no cambian.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

requirePlatformAdmin();
$u = $GLOBALS['authUser'];
$cat = (string)($_POST['categoria'] ?? '');
$creditos = (int)($_POST['creditos'] ?? -1);
if ($creditos < 0 || $creditos > 1000) authFail(400, 'Los créditos por mensaje van de 0 a 1000');
$conn = conectar();
$antes = crmRow($conn, 'SELECT creditos FROM com_tarifas WHERE categoria = ?', 's', [$cat]);
if (!$antes) authFail(404, 'Categoría inexistente');
crmExec($conn, 'UPDATE com_tarifas SET creditos = ?, updated_by = ? WHERE categoria = ?', 'iis', [$creditos, $u['id'], $cat]);
auditAdmin($conn, 'com_tarifa', ['categoria' => $cat, 'antes' => (int)$antes['creditos'], 'despues' => $creditos]);
$conn->close();
crmOk([], 'Tarifa guardada');
