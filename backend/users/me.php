<?php
// Sesión actual (usuario + sede activa + rol + privilegios). El frontend la recarga tras cambiar de sede.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';

echo json_encode(['action' => true, 'mensaje' => 'OK', 'data' => sessionPayload()]);
