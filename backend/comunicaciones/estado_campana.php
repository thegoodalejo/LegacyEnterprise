<?php
// Pausar, reanudar o cancelar una campaña (L2+). POST: id, accion (pausar | reanudar | cancelar).
// Cancelar deja «omitidos» a los que faltaban (lo ya enviado queda). Reanudar vuelve a «enviando» (o «programada» si aún no llega su hora).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_campanas.php';

$ctx = comContext();
requireRole('L2');
$accion = (string)($_POST['accion'] ?? '');
$conn = conectar();
$c = comCampana($conn, $ctx['id_sede'], (int)($_POST['id'] ?? 0));
if (!$c) authFail(404, 'Campaña no encontrada');
$id = (int)$c['id'];
switch ($accion) {
    case 'pausar':
        if (!in_array($c['estado'], ['programada', 'enviando', 'esperando_saldo', 'esperando_cupo'], true)) authFail(409, 'La campaña no se está enviando');
        crmExec($conn, "UPDATE com_campanas SET estado = 'pausada', motivo_pausa = 'Pausada por una persona', reintentar_desde = NULL, updated_by = ? WHERE id = ?", 'ii', [$ctx['id_usuario'], $id]);
        break;
    case 'reanudar':
        if ($c['estado'] !== 'pausada') authFail(409, 'La campaña no está pausada');
        $prog = $c['programada_para'] && strtotime($c['programada_para']) > time() && $c['iniciada_at'] === null;
        crmExec($conn, "UPDATE com_campanas SET estado = ?, motivo_pausa = NULL, reintentar_desde = NULL, iniciada_at = COALESCE(iniciada_at, ?), updated_by = ? WHERE id = ?",
            'ssii', [$prog ? 'programada' : 'enviando', $prog ? null : date('Y-m-d H:i:s'), $ctx['id_usuario'], $id]);
        if (!$prog) comDespertarWorker();
        break;
    case 'cancelar':
        if (!in_array($c['estado'], COM_CAMP_ACTIVAS, true)) authFail(409, 'La campaña ya terminó');
        crmExec($conn, "UPDATE com_campana_destinatarios SET estado = 'omitido', error = 'Campaña cancelada' WHERE id_campana = ? AND estado = 'pendiente'", 'i', [$id]);
        crmExec($conn, "UPDATE com_campanas SET estado = 'cancelada', completada_at = CURRENT_TIMESTAMP, motivo_pausa = NULL, reintentar_desde = NULL, updated_by = ? WHERE id = ?",
            'ii', [$ctx['id_usuario'], $id]);
        break;
    default:
        authFail(400, 'Acción inválida');
}
auditRegistro($conn, $ctx['id_sede'], 'comunicaciones', 'com_campanas', $id, $accion === 'cancelar' ? 'cancelada' : ($accion === 'pausar' ? 'pausada' : 'reanudada'), ['nombre' => $c['nombre']]);
$conn->close();
crmOk([], ['pausar' => 'Campaña pausada', 'reanudar' => 'Campaña reanudada', 'cancelar' => 'Campaña cancelada'][$accion]);
