<?php
// Estimación de una campaña (L2+): a cuántos llega (y por qué otros no), créditos necesarios frente al saldo, cupo de la línea y la vista previa
// del mensaje con los datos del primer destinatario. POST: id.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_campanas.php';

$ctx = comContext();
requireRole('L2');
$conn = conectar();
$c = comCampana($conn, $ctx['id_sede'], (int)($_POST['id'] ?? 0));
if (!$c) authFail(404, 'Campaña no encontrada');
$tpl = comPlantilla($conn, $ctx['id_sede'], (int)$c['id_plantilla']);
$cat = strtolower((string)($tpl['categoria'] ?? $tpl['categoria_solicitada']));
$aud = comCampanaAudiencia($conn, $ctx, json_decode($c['audiencia'] ?? '{}', true) ?: [], $cat === 'marketing');
$n = count($aud['destinatarios']);
$tarifa = comTarifa($conn, $cat);
$saldo = comPuedeEnviar($conn, $ctx['id_sede'], $cat, max(1, $n));
$linea = comLinea($conn, (int)$c['id_linea'], $ctx['id_sede']);
$muestra = null;
if ($n > 0) {
    $d = $aud['destinatarios'][0];
    $vals = comPlantillaValores($conn, $tpl, $d['id_contacto'], $d['wa_id'], $c['valores'] ? (json_decode($c['valores'], true) ?: []) : []);
    $muestra = ['nombre' => $d['nombre'], 'wa_id' => $d['wa_id'], 'texto' => comPlantillaTexto($tpl, $vals), 'faltan' => $vals['faltan']];
}
$cupo = $linea ? comCupoLinea($conn, $linea) : 0;
$conn->close();
crmOk([
    'destinatarios' => $n, 'seleccionados' => $aud['seleccionados'], 'organizaciones' => $aud['organizaciones'], 'sin_whatsapp' => $aud['sin_whatsapp'],
    'bajas' => $aud['bajas'], 'repetidos' => $aud['repetidos'], 'categoria' => $cat, 'creditos_por_mensaje' => $tarifa, 'creditos' => $tarifa * $n,
    'saldo' => $saldo['saldo'], 'alcanza' => $n > 0 && $saldo['ok'], 'cupo_24h' => $cupo === PHP_INT_MAX ? null : $cupo, 'muestra' => $muestra,
    'nota' => 'Meta cobra por mensaje entregado: el consumo real puede ser menor si algunos no se entregan.',
]);
