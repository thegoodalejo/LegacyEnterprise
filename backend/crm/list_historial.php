<?php
// Historial de cambios de un contacto (quién cambió qué y cuándo). L2+.
// POST: id_contacto, desde (AAAA-MM-DD; por defecto hoy − 3 meses), pagina, por_pagina.
// Se conserva todo; por defecto se muestran los últimos 3 meses y `hay_anteriores` avisa si hay más atrás.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
requireRole('L2');

$id = (int)($_POST['id_contacto'] ?? 0);
$desde = crmFecha($_POST['desde'] ?? null, 'Desde') ?? (new DateTimeImmutable('-3 months'))->format('Y-m-d');
$pagina = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(100, max(1, (int)($_POST['por_pagina'] ?? 30)));

$conn = conectar();
if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_contactos WHERE id = ? AND id_sede = ? LIMIT 1', 'ii', [$id, $ctx['id_sede']])) authFail(404, 'Contacto no encontrado');

$base = "FROM le_H_registros h WHERE h.id_sede = ? AND h.modulo = 'crm' AND h.tabla = 'crm_contactos' AND h.id_registro = ?";
$total = (int)crmRow($conn, "SELECT COUNT(*) AS n $base AND h.created_at >= ?", 'iis', [$ctx['id_sede'], $id, $desde . ' 00:00:00'])['n'];
$rows = crmRows($conn,
    "SELECT h.id, h.accion, h.detalle, h.created_at, h.id_usuario, COALESCE(u.nombre, u.email) AS usuario
       FROM le_H_registros h LEFT JOIN le_usuarios u ON u.id = h.id_usuario
      WHERE h.id_sede = ? AND h.modulo = 'crm' AND h.tabla = 'crm_contactos' AND h.id_registro = ? AND h.created_at >= ?
   ORDER BY h.created_at DESC, h.id DESC LIMIT ? OFFSET ?",
    'iisii', [$ctx['id_sede'], $id, $desde . ' 00:00:00', $porPagina, ($pagina - 1) * $porPagina]);
$anteriores = crmRow($conn, "SELECT 1 AS ok $base AND h.created_at < ? LIMIT 1", 'iis', [$ctx['id_sede'], $id, $desde . ' 00:00:00']) !== null;
$conn->close();

foreach ($rows as &$r) {
    $r['id'] = (int)$r['id'];
    $r['id_usuario'] = (int)$r['id_usuario'];
    $r['detalle'] = $r['detalle'] ? json_decode($r['detalle'], true) : null;
}

crmOk(['historial' => $rows, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina, 'desde' => $desde, 'hay_anteriores' => $anteriores]);
