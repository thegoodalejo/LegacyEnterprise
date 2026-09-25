<?php
// Notas de una oportunidad (bitácora), las más nuevas primero. `puede_editar`: su autor o L2+.
// POST: id_oportunidad, pagina, por_pagina (máx. 100).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$id = (int)($_POST['id_oportunidad'] ?? 0);
$pagina = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(CRM_POR_PAGINA_MAX, max(1, (int)($_POST['por_pagina'] ?? 50)));

$conn = conectar();
if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_oportunidades WHERE id = ? AND id_sede = ? LIMIT 1', 'ii', [$id, $ctx['id_sede']])) authFail(404, 'Oportunidad no encontrada');
$r = crmOpNotas($conn, $id, $pagina, $porPagina);
$conn->close();

$esL2 = roleRank($ctx['rol']) >= roleRank('L2');
foreach ($r['notas'] as &$n) $n['puede_editar'] = $esL2 || $n['id_autor'] === $ctx['id_usuario'];

crmOk(['notas' => $r['notas'], 'total' => $r['total'], 'pagina' => $pagina, 'por_pagina' => $porPagina]);
