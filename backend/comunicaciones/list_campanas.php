<?php
// Campañas de la sede (L2+), las más recientes primero, con sus contadores. POST: estado (opcional), pagina, por_pagina (máx. 100).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_campanas.php';

$ctx = comContext();
requireRole('L2');
$estado = (string)($_POST['estado'] ?? '');
$pagina = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(100, max(1, (int)($_POST['por_pagina'] ?? 30)));
$conn = conectar();
$where = 'c.id_sede = ?' . ($estado !== '' ? ' AND c.estado = ?' : '');
$types = $estado !== '' ? 'is' : 'i';
$params = $estado !== '' ? [$ctx['id_sede'], $estado] : [$ctx['id_sede']];
$total = (int)crmRow($conn, "SELECT COUNT(*) AS n FROM com_campanas c WHERE $where", $types, $params)['n'];
$rows = crmRows($conn, "SELECT c.*, p.nombre AS plantilla_nombre, p.idioma AS plantilla_idioma, COALESCE(p.categoria, p.categoria_solicitada) AS plantilla_categoria,
                               l.nombre AS linea_nombre, COALESCE(u.nombre, u.email) AS creada_por
                          FROM com_campanas c JOIN com_plantillas p ON p.id = c.id_plantilla JOIN com_lineas l ON l.id = c.id_linea
                     LEFT JOIN le_usuarios u ON u.id = c.created_by WHERE $where ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?",
    $types . 'ii', [...$params, $porPagina, ($pagina - 1) * $porPagina]);
$out = array_map(static fn($r) => comCampanaPublica($conn, $r), $rows);
$conn->close();
crmOk(['campanas' => $out, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina]);
