<?php
// Público. Lo usan el CI (confirma qué versión quedó publicada) y el frontend (chequeo de versión).
require_once 'cors.php';

$version = 'dev';   // el workflow de PDN reemplaza este valor por el hash del commit

echo json_encode(['action' => true, 'version' => $version, 'env' => getenv('APP_ENV') ?: 'qa']);
