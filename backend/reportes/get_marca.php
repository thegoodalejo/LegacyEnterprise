<?php
// Marca del cliente para los reportes PDF/Excel: empresa, sede, colores, logo (data URI) y usuario que genera.
// Cualquier usuario con sede activa (los reportes no son solo del CRM). POST: sin parámetros.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_reportes.php';

requireSede();
$conn = conectar();
$marca = reporteMarca($conn, $GLOBALS['authUser']);
$conn->close();

echo json_encode(['action' => true, 'mensaje' => 'OK', 'data' => $marca], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
