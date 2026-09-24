<?php
// URL temporal (5 min) para ver/descargar un archivo del bucket PRIVADO de la sede activa.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_r2.php';

$idSede = requireSede();
requirePrivilege('archivos');

$key = $_POST['key'] ?? '';
// La clave debe ser de la sede de la sesión: nunca se prefirma un archivo de otro cliente.
if (!str_starts_with($key, "sedes/{$idSede}/") || str_contains($key, '..')) authFail(403, 'Archivo no disponible');

echo json_encode(['action' => true, 'mensaje' => 'OK', 'data' => ['url' => r2PresignGet($key, 300), 'expires_in' => 300]]);
