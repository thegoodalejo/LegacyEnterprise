<?php
// Recarga (o ajuste) de créditos en la bolsa de una empresa o de una sede (plataforma, L5).
// POST: ambito (empresa|sede), id_empresa | id_sede, tipo (recarga|ajuste), creditos, referencia (pago, factura), descripcion.
//   recarga: paquetes desde COM_RECARGA_MIN créditos; ajuste: cualquier cantidad distinta de 0 (negativa descuenta) con descripción obligatoria.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

requirePlatformAdmin();
$u = $GLOBALS['authUser'];
$ambito = (string)($_POST['ambito'] ?? '');
$tipo = (string)($_POST['tipo'] ?? 'recarga');
$creditos = (int)($_POST['creditos'] ?? 0);
$referencia = crmClean($_POST['referencia'] ?? null, 100, 'Referencia');
$descripcion = crmClean($_POST['descripcion'] ?? null, 255, 'Descripción');
if (!in_array($ambito, ['empresa', 'sede'], true)) authFail(400, 'Ámbito inválido');
if (!in_array($tipo, ['recarga', 'ajuste'], true)) authFail(400, 'Tipo inválido');
if ($tipo === 'recarga' && $creditos < COM_RECARGA_MIN) authFail(400, 'Las recargas son de ' . COM_RECARGA_MIN . ' créditos o más');
if ($tipo === 'ajuste' && ($creditos === 0 || $descripcion === null)) authFail(400, 'Un ajuste necesita una cantidad distinta de 0 y una descripción');
if (abs($creditos) > 100000000) authFail(400, 'Cantidad fuera de rango');

$conn = conectar();
if ($ambito === 'empresa') {
    $idEmpresa = (int)($_POST['id_empresa'] ?? 0);
    if (!crmRow($conn, 'SELECT 1 AS ok FROM le_empresas WHERE id = ?', 'i', [$idEmpresa])) authFail(400, 'Empresa inexistente');
    $idSede = null;
} else {
    $idSede = (int)($_POST['id_sede'] ?? 0);
    $s = crmRow($conn, 'SELECT id_empresa FROM le_sedes WHERE id = ?', 'i', [$idSede]);
    if (!$s) authFail(400, 'Sede inexistente');
    $idEmpresa = (int)$s['id_empresa'];
}
$conn->begin_transaction();
$b = comBilletera($conn, $ambito, $idEmpresa, $idSede);
$saldo = comMover($conn, $b['id'], $tipo, $creditos, $idSede, $descripcion ?? ($tipo === 'recarga' ? 'Recarga de créditos' : null), $referencia, (int)$u['id']);
auditAdmin($conn, 'com_' . $tipo, ['ambito' => $ambito, 'id_empresa' => $idEmpresa, 'id_sede' => $idSede, 'creditos' => $creditos,
    'referencia' => $referencia, 'saldo' => $saldo], $idSede);
$conn->commit();
comRevisarAlertas($conn, $b['id']);
$conn->close();
crmOk(['saldo' => $saldo], $tipo === 'recarga' ? 'Recarga registrada' : 'Ajuste registrado');
