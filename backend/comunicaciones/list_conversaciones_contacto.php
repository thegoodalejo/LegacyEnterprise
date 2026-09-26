<?php
// Conversaciones de WhatsApp de un contacto (tarjeta «Conversaciones» del perfil). POST: id_contacto.
// L0/L1 ven solo las que podrían abrir en la bandeja (cola, chatbot o suyas).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

$ctx = comContext();
$id = (int)($_POST['id_contacto'] ?? 0);
$conn = conectar();
if (!crmRow($conn, 'SELECT 1 AS ok FROM crm_contactos WHERE id = ? AND id_sede = ?', 'ii', [$id, $ctx['id_sede']])) authFail(404, 'Contacto no encontrado');
$rows = crmRows($conn,
    'SELECT c.id, c.estado, c.wa_id, c.id_linea, l.nombre AS linea_nombre, c.id_asignado, COALESCE(u.nombre, u.email) AS asignado_nombre,
            c.ultimo_mensaje_at, c.ultimo_entrante_at, c.resumen, c.no_leidos,
            (SELECT COUNT(*) FROM com_mensajes m WHERE m.id_conversacion = c.id) AS mensajes
       FROM com_conversaciones c JOIN com_lineas l ON l.id = c.id_linea LEFT JOIN le_usuarios u ON u.id = c.id_asignado
      WHERE c.id_sede = ? AND c.id_contacto = ? ORDER BY c.ultimo_mensaje_at DESC', 'ii', [$ctx['id_sede'], $id]);
$conn->close();
$l2 = comEsRol($ctx, 'L2');
$out = [];
foreach ($rows as $r) {
    $asig = $r['id_asignado'] !== null ? (int)$r['id_asignado'] : null;
    $puede = $l2 || $asig === $ctx['id_usuario'] || in_array($r['estado'], ['cola', 'bot'], true) || ($r['estado'] === 'cerrada' && $asig === null);
    $out[] = [
        'id' => (int)$r['id'], 'estado' => $r['estado'], 'wa_id' => $r['wa_id'], 'id_linea' => (int)$r['id_linea'], 'linea_nombre' => $r['linea_nombre'],
        'asignado_nombre' => $r['asignado_nombre'], 'ultimo_mensaje_at' => $r['ultimo_mensaje_at'], 'resumen' => $puede ? $r['resumen'] : null,
        'no_leidos' => (int)$r['no_leidos'], 'mensajes' => (int)$r['mensajes'], 'puede_abrir' => $puede,
        'ventana_abierta' => $r['ultimo_entrante_at'] !== null && (time() - strtotime($r['ultimo_entrante_at'])) < COM_VENTANA_SEG,
    ];
}
crmOk(['conversaciones' => $out]);
