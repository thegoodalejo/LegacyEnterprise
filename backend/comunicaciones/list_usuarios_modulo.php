<?php
// Personas de la sede con acceso a Comunicaciones (L4 o privilegio `comunicaciones`): destinos de una transferencia y de avisos del chatbot.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

$ctx = comContext();
$conn = conectar();
$u = comUsuariosModulo($conn, $ctx['id_sede']);
$conn->close();
crmOk(['usuarios' => $u]);
