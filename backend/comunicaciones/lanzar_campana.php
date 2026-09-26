<?php
// Lanza una campaña en borrador (L2+): valida plantilla, enlace, encabezado y variables; arma los destinatarios; exige saldo para todos; y la deja
// «enviando» (el worker la envía) o «programada» si tiene fecha futura. POST: id, total_esperado (los destinatarios que vio el usuario en la
// estimación: si cambiaron, 409 para que la revise).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_campanas.php';

$ctx = comContext();
requireRole('L2');
$conn = conectar();
$c = comCampana($conn, $ctx['id_sede'], (int)($_POST['id'] ?? 0));
if (!$c) authFail(404, 'Campaña no encontrada');
if ($c['estado'] !== 'borrador') authFail(409, 'La campaña ya se lanzó');
$tpl = crmRow($conn, 'SELECT * FROM com_plantillas WHERE id = ?', 'i', [(int)$c['id_plantilla']]);
$linea = comLinea($conn, (int)$c['id_linea'], $ctx['id_sede']);
if (!$linea) authFail(409, 'La línea está inactiva');
comCampanaValidar($conn, $ctx, $c, $tpl, $linea);
$cat = strtolower((string)($tpl['categoria'] ?? $tpl['categoria_solicitada']));

$conn->begin_transaction();
$n = comCampanaMaterializar($conn, $ctx, $c, $tpl);
if (isset($_POST['total_esperado']) && (int)$_POST['total_esperado'] !== $n) authFail(409, "Ahora son $n destinatarios (la audiencia cambió): revisa la estimación");
$saldo = comPuedeEnviar($conn, $ctx['id_sede'], $cat, $n);
if (!$saldo['ok']) authFail(402, "Créditos insuficientes: la campaña necesita {$saldo['necesarios']} y el saldo es {$saldo['saldo']}");
$prog = $c['programada_para'] && strtotime($c['programada_para']) > time();
crmExec($conn, 'UPDATE com_campanas SET estado = ?, total = ?, creditos_estimados = ?, iniciada_at = ?, updated_by = ? WHERE id = ?',
    'siisii', [$prog ? 'programada' : 'enviando', $n, $saldo['necesarios'], $prog ? null : date('Y-m-d H:i:s'), $ctx['id_usuario'], (int)$c['id']]);
auditRegistro($conn, $ctx['id_sede'], 'comunicaciones', 'com_campanas', (int)$c['id'], 'lanzada', ['nombre' => $c['nombre'], 'destinatarios' => $n,
    'creditos_estimados' => $saldo['necesarios'], 'programada_para' => $prog ? $c['programada_para'] : null]);
$conn->commit();
$conn->close();
if (!$prog) comDespertarWorker();
crmOk(['destinatarios' => $n, 'estado' => $prog ? 'programada' : 'enviando'], $prog ? 'Campaña programada' : 'Campaña en envío');
