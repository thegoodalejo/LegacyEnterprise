<?php
// Transfiere créditos entre la bolsa de la empresa y la de la sede de la sesión (L4). POST: direccion (a_sede | a_empresa), creditos (> 0).
// La bolsa de origen debe tener saldo suficiente. Deja dos movimientos «transferencia» enlazados y auditoría.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

$ctx = comContext();
requireRole('L4');
$dir = (string)($_POST['direccion'] ?? '');
$creditos = (int)($_POST['creditos'] ?? 0);
if (!in_array($dir, ['a_sede', 'a_empresa'], true)) authFail(400, 'Dirección inválida');
if ($creditos <= 0 || $creditos > 100000000) authFail(400, 'Indica cuántos créditos transferir');

$conn = conectar();
$conn->begin_transaction();
$e = comBilletera($conn, 'empresa', $ctx['id_empresa'], null);
$s = comBilletera($conn, 'sede', $ctx['id_empresa'], $ctx['id_sede']);
[$origen, $destino] = $dir === 'a_sede' ? [$e, $s] : [$s, $e];
// Bloqueo de la fila de origen: dos transferencias a la vez no dejan el saldo en negativo.
$saldoOrigen = (int)crmRow($conn, 'SELECT saldo FROM com_billeteras WHERE id = ? FOR UPDATE', 'i', [$origen['id']])['saldo'];
if ($saldoOrigen < $creditos) authFail(409, 'Saldo insuficiente en la bolsa de ' . ($dir === 'a_sede' ? 'la empresa' : 'la sede') . " ($saldoOrigen créditos)");
$sede = crmRow($conn, 'SELECT nombre FROM le_sedes WHERE id = ?', 'i', [$ctx['id_sede']])['nombre'];
$desc = $dir === 'a_sede' ? "De la bolsa de la empresa a «{$sede}»" : "De «{$sede}» a la bolsa de la empresa";
comMover($conn, $origen['id'], 'transferencia', -$creditos, $ctx['id_sede'], $desc, null, $ctx['id_usuario'], $destino['id']);
$saldoDestino = comMover($conn, $destino['id'], 'transferencia', $creditos, $ctx['id_sede'], $desc, null, $ctx['id_usuario'], $origen['id']);
auditAdmin($conn, 'com_transferencia', ['direccion' => $dir, 'creditos' => $creditos]);
$conn->commit();
comRevisarAlertas($conn, $origen['id']);
$conn->close();
crmOk(['saldo_destino' => $saldoDestino], 'Transferencia registrada');
