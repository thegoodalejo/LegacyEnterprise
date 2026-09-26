<?php
// Bolsas de créditos de todas las empresas y sedes (plataforma, L5), con la fuente que eligió cada sede y si tiene el módulo contratado.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

requirePlatformAdmin();
$conn = conectar();
$empresas = crmRows($conn, 'SELECT id, nombre FROM le_empresas ORDER BY nombre');
$sedes = crmRows($conn,
    "SELECT s.id, s.id_empresa, s.nombre, COALESCE(c.fuente_creditos, 'sede') AS fuente,
            EXISTS(SELECT 1 FROM le_sede_modulos sm WHERE sm.id_sede = s.id AND sm.codigo_modulo = 'comunicaciones' AND sm.activo = 1) AS contratado
       FROM le_sedes s LEFT JOIN com_config_sede c ON c.id_sede = s.id ORDER BY s.nombre");
$bil = [];
foreach (crmRows($conn, 'SELECT id, ambito_ref, saldo, base_alerta, alerta_nivel, updated_at FROM com_billeteras') as $b) $bil[$b['ambito_ref']] = $b;
$ultimas = crmRows($conn,
    "SELECT m.id, m.tipo, m.fecha, m.creditos, m.referencia, m.descripcion, m.created_at, b.ambito, b.id_empresa, b.id_sede, COALESCE(u.nombre, u.email) AS usuario
       FROM com_movimientos m JOIN com_billeteras b ON b.id = m.id_billetera LEFT JOIN le_usuarios u ON u.id = m.created_by
      WHERE m.tipo IN ('recarga', 'ajuste') ORDER BY m.id DESC LIMIT 30");
$conn->close();

$saldo = static fn(string $ref) => isset($bil[$ref]) ? (int)$bil[$ref]['saldo'] : 0;
$out = [];
foreach ($empresas as $e) {
    $id = (int)$e['id'];
    $out[] = [
        'id' => $id, 'nombre' => $e['nombre'], 'saldo' => $saldo('e' . $id),
        'sedes' => array_values(array_map(static fn($s) => [
            'id' => (int)$s['id'], 'nombre' => $s['nombre'], 'fuente' => $s['fuente'], 'contratado' => (int)$s['contratado'] === 1, 'saldo' => $saldo('s' . $s['id']),
        ], array_filter($sedes, static fn($s) => (int)$s['id_empresa'] === $id))),
    ];
}
foreach ($ultimas as &$m) {
    foreach (['id', 'creditos', 'id_empresa'] as $k) $m[$k] = (int)$m[$k];
    $m['id_sede'] = $m['id_sede'] !== null ? (int)$m['id_sede'] : null;
}
crmOk(['empresas' => $out, 'ultimas' => $ultimas, 'recarga_minima' => COM_RECARGA_MIN]);
