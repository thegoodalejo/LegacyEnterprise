<?php
// Saldo de créditos de la sede (cualquiera con acceso al módulo): la bolsa que usa (empresa o sede), consumo del mes por categoría y tarifas.
// L4 ve además el saldo de la otra bolsa (para transferir de la de la empresa a la de la sede).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

$ctx = comContext();
$conn = conectar();
$cfg = comConfigSede($conn, $ctx['id_sede']);
$b = comBilleteraDeSede($conn, $ctx['id_sede']);
$consumo = crmRows($conn,
    "SELECT categoria, SUM(cantidad) AS cantidad, -SUM(creditos) AS creditos FROM com_movimientos
      WHERE id_billetera = ? AND tipo = 'consumo' AND id_sede = ? AND fecha >= DATE_FORMAT(CURDATE(), '%Y-%m-01') GROUP BY categoria ORDER BY creditos DESC",
    'ii', [$b['id'], $ctx['id_sede']]);
foreach ($consumo as &$c) { $c['cantidad'] = (int)$c['cantidad']; $c['creditos'] = (int)$c['creditos']; }
unset($c);
$tarifas = crmRows($conn, "SELECT categoria, nombre, creditos FROM com_tarifas ORDER BY categoria = '*', creditos DESC, categoria");
foreach ($tarifas as &$t) $t['creditos'] = (int)$t['creditos'];
unset($t);

$otras = null;
if (comEsRol($ctx, 'L4')) {
    $e = comBilletera($conn, 'empresa', $ctx['id_empresa'], null);
    $s = comBilletera($conn, 'sede', $ctx['id_empresa'], $ctx['id_sede']);
    $otras = ['empresa' => $e['saldo'], 'sede' => $s['saldo']];
}
$conn->close();

$pct = $b['base_alerta'] > 0 ? max(0, min(100, (int)round($b['saldo'] * 100 / $b['base_alerta']))) : null;
crmOk([
    'fuente' => $cfg['fuente_creditos'],
    'billetera' => ['id' => $b['id'], 'ambito' => $b['ambito'], 'saldo' => $b['saldo'], 'base' => $b['base_alerta'], 'porcentaje' => $pct,
        'alerta_nivel' => $b['alerta_nivel']],
    'consumo_mes' => $consumo,
    'tarifas' => $tarifas,
    'bolsas' => $otras,
]);
