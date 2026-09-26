<?php
// Lista de la bandeja. POST: vista (cola | mias | todas | bot | cerradas; las tres últimas L2+), id_linea (opcional), q (nombre o número),
// limite (máx. 100). Devuelve las conversaciones (último mensaje, no leídos, ventana) y los contadores de cada vista para los distintivos.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bandeja.php';

$ctx = comContext();
$l2 = comEsRol($ctx, 'L2');
$vista = (string)($_POST['vista'] ?? 'cola');
if (!in_array($vista, ['cola', 'mias', 'todas', 'bot', 'cerradas'], true)) authFail(400, 'Vista inválida');
if (!$l2 && !in_array($vista, ['cola', 'mias'], true)) authFail(403, 'Solo L2+ ve todas las conversaciones');
$idLinea = (int)($_POST['id_linea'] ?? 0);
$q = trim((string)($_POST['q'] ?? ''));
$limite = min(100, max(1, (int)($_POST['limite'] ?? 50)));

$where = 'c.id_sede = ?';
$types = 'i';
$params = [$ctx['id_sede']];
switch ($vista) {
    case 'cola':     $where .= " AND c.estado = 'cola'"; break;
    case 'mias':     $where .= " AND c.estado = 'atencion' AND c.id_asignado = ?"; $types .= 'i'; $params[] = $ctx['id_usuario']; break;
    case 'todas':    $where .= " AND c.estado IN ('cola', 'atencion', 'bot')"; break;
    case 'bot':      $where .= " AND c.estado = 'bot'"; break;
    case 'cerradas': $where .= " AND c.estado = 'cerrada'"; break;
}
if ($idLinea > 0) { $where .= ' AND c.id_linea = ?'; $types .= 'i'; $params[] = $idLinea; }
if ($q !== '') {
    $digitos = preg_replace('/\D+/', '', $q) ?? '';
    $where .= ' AND (ct.nombre_completo LIKE ? OR c.nombre_perfil LIKE ?' . ($digitos !== '' ? ' OR c.wa_id LIKE ?' : '') . ')';
    $types .= $digitos !== '' ? 'sss' : 'ss';
    $params[] = "%$q%"; $params[] = "%$q%";
    if ($digitos !== '') $params[] = "%$digitos%";
}

$conn = conectar();
$rows = crmRows($conn,
    "SELECT c.id, c.estado, c.wa_id, c.nombre_perfil, c.id_linea, l.nombre AS linea_nombre, c.id_asignado, COALESCE(u.nombre, u.email) AS asignado_nombre,
            c.id_contacto, ct.nombre_completo AS contacto_nombre, c.no_leidos, c.ultimo_mensaje_at, c.ultimo_entrante_at, c.resumen,
            m.tipo AS ultimo_tipo, m.direccion AS ultimo_direccion, m.estado AS ultimo_estado, m.origen AS ultimo_origen
       FROM com_conversaciones c
       JOIN com_lineas l ON l.id = c.id_linea
  LEFT JOIN le_usuarios u ON u.id = c.id_asignado
  LEFT JOIN crm_contactos ct ON ct.id = c.id_contacto
  LEFT JOIN com_mensajes m ON m.id = c.ultimo_mensaje_id
      WHERE $where
   ORDER BY c.ultimo_mensaje_at DESC, c.id DESC LIMIT ?", $types . 'i', [...$params, $limite]);

$conteos = crmRow($conn,
    "SELECT SUM(estado = 'cola') AS cola, SUM(estado = 'atencion' AND id_asignado = ?) AS mias,
            SUM(estado = 'atencion' AND id_asignado = ? AND no_leidos > 0) AS mias_sin_leer, SUM(estado = 'bot') AS bot,
            SUM(estado IN ('cola', 'atencion', 'bot')) AS todas
       FROM com_conversaciones WHERE id_sede = ? AND estado <> 'cerrada'", 'iii', [$ctx['id_usuario'], $ctx['id_usuario'], $ctx['id_sede']]);
$conn->close();

$out = array_map(static function ($r) {
    $abierta = $r['ultimo_entrante_at'] !== null && (time() - strtotime($r['ultimo_entrante_at'])) < COM_VENTANA_SEG;
    return [
        'id' => (int)$r['id'], 'estado' => $r['estado'], 'wa_id' => $r['wa_id'], 'nombre' => $r['contacto_nombre'] ?: ($r['nombre_perfil'] ?: '+' . $r['wa_id']),
        'nombre_perfil' => $r['nombre_perfil'], 'id_contacto' => $r['id_contacto'] !== null ? (int)$r['id_contacto'] : null,
        'id_linea' => (int)$r['id_linea'], 'linea_nombre' => $r['linea_nombre'],
        'id_asignado' => $r['id_asignado'] !== null ? (int)$r['id_asignado'] : null, 'asignado_nombre' => $r['asignado_nombre'],
        'no_leidos' => (int)$r['no_leidos'], 'ultimo_mensaje_at' => $r['ultimo_mensaje_at'], 'ventana_abierta' => $abierta,
        'resumen' => $r['resumen'], 'ultimo' => $r['ultimo_tipo'] ? ['tipo' => $r['ultimo_tipo'], 'direccion' => $r['ultimo_direccion'],
            'estado' => $r['ultimo_estado'], 'origen' => $r['ultimo_origen']] : null,
    ];
}, $rows);
$c = static fn($k) => (int)($conteos[$k] ?? 0);
crmOk(['conversaciones' => $out, 'conteos' => ['cola' => $c('cola'), 'mias' => $c('mias'), 'mias_sin_leer' => $c('mias_sin_leer'),
    'bot' => $l2 ? $c('bot') : null, 'todas' => $l2 ? $c('todas') : null], 'ahora' => date('Y-m-d H:i:s')]);
