<?php
// Líneas de WhatsApp de todas las sedes (plataforma, L5). POST: id_sede (opcional, filtra). Sin tokens: solo los últimos 4 caracteres.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

requirePlatformAdmin();
$idSede = (int)($_POST['id_sede'] ?? 0);
$conn = conectar();
$rows = crmRows($conn,
    'SELECT l.id, l.id_sede, s.nombre AS sede_nombre, e.nombre AS empresa_nombre, l.id_app, a.nombre AS app_nombre, l.nombre, l.telefono_visible,
            l.phone_number_id, l.waba_id, l.token_ultimos4, l.access_token_enc IS NOT NULL AS token_ok, l.nombre_verificado, l.calidad,
            l.nivel_mensajes, l.verificada_at, l.suscrita_at, l.webhook_numero, l.webhook_efectivo, l.webhook_revisado_at, l.ultimo_error, l.activo, l.updated_at
       FROM com_lineas l JOIN le_sedes s ON s.id = l.id_sede JOIN le_empresas e ON e.id = s.id_empresa JOIN com_meta_apps a ON a.id = l.id_app
      WHERE (? = 0 OR l.id_sede = ?) ORDER BY e.nombre, s.nombre, l.nombre', 'ii', [$idSede, $idSede]);
$conn->close();
foreach ($rows as &$r) {
    foreach (['id', 'id_sede', 'id_app'] as $k) $r[$k] = (int)$r[$k];
    $r['activo'] = (int)$r['activo'] === 1;
    $r['token_configurado'] = (int)$r['token_ok'] === 1;
    // ¿Los mensajes de este número llegan aquí? (lo último que reportó Meta; null = no se ha revisado)
    $r['webhook_aqui'] = $r['webhook_revisado_at'] === null ? null : $r['webhook_efectivo'] === comUrlWebhook($r['id_app']);
    unset($r['token_ok']);
}
crmOk(['lineas' => $rows, 'cifrado_disponible' => comCryptoDisponible()]);
