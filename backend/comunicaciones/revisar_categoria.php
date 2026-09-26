<?php
// Revisión de categoría mientras se escribe (L2+): el constructor la llama con una pausa. POST: encabezado (texto), cuerpo, pie, botones (JSON [texto]).
// Devuelve {riesgo, puntaje, motivos, transaccional, creditos: {utility, marketing}}.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_plantillas.php';

comContext();
requireRole('L2');
$bot = crmJsonParam('botones') ?? [];
$r = comRevisarCategoria(['encabezado' => mb_substr((string)($_POST['encabezado'] ?? ''), 0, 200), 'cuerpo' => mb_substr((string)($_POST['cuerpo'] ?? ''), 0, 2000),
    'pie' => mb_substr((string)($_POST['pie'] ?? ''), 0, 200), 'botones' => array_map(static fn($b) => mb_substr((string)$b, 0, 50), array_slice($bot, 0, 10))]);
$conn = conectar();
$r['creditos'] = ['utility' => comTarifa($conn, 'utility'), 'marketing' => comTarifa($conn, 'marketing')];
$conn->close();
crmOk($r);
