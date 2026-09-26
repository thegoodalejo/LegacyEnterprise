<?php
// Líneas activas de la sede de la sesión (sin datos sensibles). Para elegir la línea en la bandeja, plantillas y campañas.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

$ctx = comContext();
$conn = conectar();
$rows = crmRows($conn,
    'SELECT id, id_sede, nombre, telefono_visible, nombre_verificado, calidad, nivel_mensajes, activo FROM com_lineas WHERE id_sede = ? AND activo = 1 ORDER BY nombre',
    'i', [$ctx['id_sede']]);
$conn->close();
crmOk(['lineas' => array_map('comLineaPublica', $rows)]);
