<?php
// Destinatarios de una campaña (L2+): para el reporte en vivo y la exportación. POST: id, estado (opcional: pendiente|enviado|entregado|leido|fallido|omitido,
// acumulados como los KPIs, o «respondieron» / «clics»), q (nombre o número), pagina, por_pagina (máx. 1000 para exportar). La primera página de una exportación deja auditoría.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_campanas.php';

$ctx = comContext();
requireRole('L2');
$id = (int)($_POST['id'] ?? 0);
$estado = (string)($_POST['estado'] ?? '');
$q = trim((string)($_POST['q'] ?? ''));
$pagina = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(1000, max(1, (int)($_POST['por_pagina'] ?? 50)));
$conn = conectar();
$c = comCampana($conn, $ctx['id_sede'], $id);
if (!$c) authFail(404, 'Campaña no encontrada');
$where = 'd.id_campana = ?';
$types = 'i'; $params = [$id];
if ($estado === 'respondieron') $where .= ' AND d.respondio_at IS NOT NULL';
elseif ($estado === 'clics') $where .= ' AND d.clic_at IS NOT NULL';
elseif ($estado !== '') {
    // Acumulados como los KPIs del reporte: «enviados» incluye entregados y leídos; «entregados», los leídos.
    $incluye = ['pendiente' => ['pendiente'], 'enviado' => ['enviado', 'entregado', 'leido'], 'entregado' => ['entregado', 'leido'],
                'leido' => ['leido'], 'fallido' => ['fallido'], 'omitido' => ['omitido']][$estado] ?? null;
    if (!$incluye) authFail(400, 'Estado inválido');
    $where .= ' AND d.estado IN (' . implode(',', array_fill(0, count($incluye), '?')) . ')';
    $types .= str_repeat('s', count($incluye)); array_push($params, ...$incluye);
}
if ($q !== '') { $where .= ' AND (d.nombre LIKE ? OR d.wa_id LIKE ?)'; $types .= 'ss'; $params[] = "%$q%"; $params[] = '%' . preg_replace('/\D+/', '', $q) . '%'; }
$total = (int)crmRow($conn, "SELECT COUNT(*) AS n FROM com_campana_destinatarios d WHERE $where", $types, $params)['n'];
$rows = crmRows($conn, "SELECT d.id, d.id_contacto, d.nombre, d.wa_id, d.estado, d.error, d.enviado_at, d.respondio_at, d.clic_at, m.entregado_at, m.leido_at, m.creditos
                          FROM com_campana_destinatarios d LEFT JOIN com_mensajes m ON m.id = d.id_mensaje
                         WHERE $where ORDER BY d.id LIMIT ? OFFSET ?", $types . 'ii', [...$params, $porPagina, ($pagina - 1) * $porPagina]);
if (($_POST['exportar'] ?? '0') === '1' && $pagina === 1) auditAdmin($conn, 'com_exportar_campana', ['id_campana' => $id, 'estado' => $estado, 'total' => $total]);
$conn->close();
foreach ($rows as &$r) {
    $r['id'] = (int)$r['id'];
    $r['id_contacto'] = $r['id_contacto'] !== null ? (int)$r['id_contacto'] : null;
    $r['creditos'] = $r['creditos'] !== null ? (int)$r['creditos'] : null;
}
crmOk(['destinatarios' => $rows, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina]);
