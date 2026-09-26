<?php
// Respuestas rápidas de la bandeja: las de equipo de la sede y las personales de quien pregunta. POST: todas (1 = incluir inactivas, para editar).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

$ctx = comContext();
$todas = ($_POST['todas'] ?? '0') === '1';
$conn = conectar();
$rows = crmRows($conn,
    'SELECT id, id_usuario, atajo, titulo, texto, activo, updated_at FROM com_respuestas_rapidas
      WHERE id_sede = ? AND (id_usuario IS NULL OR id_usuario = ?)' . ($todas ? '' : ' AND activo = 1') . ' ORDER BY atajo',
    'ii', [$ctx['id_sede'], $ctx['id_usuario']]);
$conn->close();
$out = array_map(static fn($r) => ['id' => (int)$r['id'], 'equipo' => $r['id_usuario'] === null, 'atajo' => $r['atajo'], 'titulo' => $r['titulo'],
    'texto' => $r['texto'], 'activo' => (int)$r['activo'] === 1, 'updated_at' => $r['updated_at']], $rows);
crmOk(['respuestas' => $out, 'puede_equipo' => comEsRol($ctx, 'L2')]);
