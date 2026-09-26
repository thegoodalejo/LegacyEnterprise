<?php
// Tarifas: créditos que descuenta cada categoría de precio de Meta (plataforma, L5; no depende de la sede activa).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

requirePlatformAdmin();
$conn = conectar();
$rows = crmRows($conn, "SELECT categoria, nombre, creditos, updated_at FROM com_tarifas ORDER BY categoria = '*', creditos DESC, categoria");
$conn->close();
foreach ($rows as &$r) $r['creditos'] = (int)$r['creditos'];
crmOk(['tarifas' => $rows]);
