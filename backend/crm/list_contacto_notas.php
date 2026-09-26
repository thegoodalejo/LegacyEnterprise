<?php
// Notas de un contacto (bitácora interna, compartida entre el CRM y Comunicaciones), las más nuevas primero. `puede_editar`: su autor o L2+.
// POST: id_contacto, pagina, por_pagina (máx. 100).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext(CRM_MODULOS_CONTACTOS);
$id = (int)($_POST['id_contacto'] ?? 0);
$pagina = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(CRM_POR_PAGINA_MAX, max(1, (int)($_POST['por_pagina'] ?? 30)));

$conn = conectar();
if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_contactos WHERE id = ? AND id_sede = ? LIMIT 1', 'ii', [$id, $ctx['id_sede']])) authFail(404, 'Contacto no encontrado');
$total = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_contacto_notas WHERE id_contacto = ? AND activo = 1', 'i', [$id])['n'];
$rows = crmRows($conn,
    'SELECT n.id, n.nota, n.origen, n.id_conversacion, n.created_at, n.updated_at, n.created_by AS id_autor, COALESCE(u.nombre, u.email) AS autor
       FROM crm_contacto_notas n LEFT JOIN le_usuarios u ON u.id = n.created_by
      WHERE n.id_contacto = ? AND n.activo = 1 ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?',
    'iii', [$id, $porPagina, ($pagina - 1) * $porPagina]);
$conn->close();
$esL2 = roleRank($ctx['rol']) >= roleRank('L2');
foreach ($rows as &$n) {
    $n['id'] = (int)$n['id'];
    $n['id_autor'] = $n['id_autor'] !== null ? (int)$n['id_autor'] : null;
    $n['id_conversacion'] = $n['id_conversacion'] !== null ? (int)$n['id_conversacion'] : null;
    $n['puede_editar'] = $esL2 || $n['id_autor'] === $ctx['id_usuario'];
}
crmOk(['notas' => $rows, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina]);
