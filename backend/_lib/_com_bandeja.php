<?php
// Bandeja de Comunicaciones: quién ve y quién escribe en una conversación, y cómo se entregan al frontend.
// Reglas (docs/modulos/comunicaciones.md → «Bandeja» y «Permisos»):
//   ver       — L2+ cualquiera de la sede; L0/L1 las de la cola o del chatbot y las asignadas a él (también cerradas).
//   escribir  — lo que puede ver, salvo una asignada a otro (solo L2+). Escribir desde la cola la toma.
//   gestionar — transferir o cerrar: el asignado o L2+.

require_once __DIR__ . '/_com.php';

const COM_TEXTO_MAX = 4096;

/** Conversación de la sede con permiso para $accion (ver | escribir | gestionar), o corta con 404/403. */
function comConversacionAcceso(mysqli $conn, array $ctx, int $id, string $accion = 'ver'): array
{
    $c = $id > 0 ? comConversacionFila($conn, $id) : null;
    if (!$c || $c['id_sede'] !== $ctx['id_sede']) authFail(404, 'Conversación no encontrada');
    $l2 = comEsRol($ctx, 'L2');
    $mia = $c['id_asignado'] === $ctx['id_usuario'];
    $libre = in_array($c['estado'], ['cola', 'bot'], true) || ($c['estado'] === 'cerrada' && ($c['id_asignado'] === null || $mia));
    if (!$l2 && !$mia && !$libre) authFail(403, 'La conversación está asignada a otra persona');
    if ($accion === 'escribir' && !$l2 && $c['estado'] === 'atencion' && !$mia) authFail(403, 'La conversación está asignada a otra persona');
    if ($accion === 'gestionar' && !$l2 && !$mia) authFail(403, 'Solo quien atiende la conversación (o L2+) puede hacer esto');
    return $c;
}

/** Mensaje para el frontend: sin la clave de R2 (el medio se pide aparte con URL firmada). */
function comMensajePublico(array $m): array
{
    $contenido = $m['contenido'] ? (json_decode($m['contenido'], true) ?: null) : null;
    return [
        'id' => (int)$m['id'], 'direccion' => $m['direccion'], 'origen' => $m['origen'], 'tipo' => $m['tipo'], 'texto' => $m['texto'],
        'contenido' => $contenido,
        'media' => ($m['media_key'] || $m['media_mime'] || ($contenido['medio_error'] ?? null)) ? [
            'disponible' => $m['media_key'] !== null, 'mime' => $m['media_mime'], 'nombre' => $m['media_nombre'],
            'bytes' => $m['media_bytes'] !== null ? (int)$m['media_bytes'] : null, 'error' => $contenido['medio_error'] ?? null,
        ] : null,
        'estado' => $m['estado'], 'error_detalle' => $m['error_detalle'], 'error_codigo' => $m['error_codigo'] !== null ? (int)$m['error_codigo'] : null,
        'categoria' => $m['categoria'], 'creditos' => $m['creditos'] !== null ? (int)$m['creditos'] : null,
        'usuario' => $m['usuario'] ?? null, 'id_campana' => $m['id_campana'] !== null ? (int)$m['id_campana'] : null,
        'created_at' => $m['created_at'], 'enviado_at' => $m['enviado_at'], 'entregado_at' => $m['entregado_at'], 'leido_at' => $m['leido_at'],
    ];
}

const COM_SQL_MENSAJES = 'SELECT m.*, COALESCE(u.nombre, u.email) AS usuario FROM com_mensajes m LEFT JOIN le_usuarios u ON u.id = m.id_usuario';

/** Conversación para el frontend: estado, ventana de 24 h, línea, asignado y el contacto (con etiquetas). */
function comConversacionPublica(mysqli $conn, array $c): array
{
    $extra = crmRow($conn,
        'SELECT l.nombre AS linea_nombre, l.telefono_visible AS linea_telefono, COALESCE(u.nombre, u.email) AS asignado_nombre,
                ct.nombre_completo AS contacto_nombre, ct.tipo AS contacto_tipo, ct.activo AS contacto_activo
           FROM com_conversaciones c JOIN com_lineas l ON l.id = c.id_linea LEFT JOIN le_usuarios u ON u.id = c.id_asignado
           LEFT JOIN crm_contactos ct ON ct.id = c.id_contacto WHERE c.id = ?', 'i', [$c['id']]);
    $vence = $c['ultimo_entrante_at'] ? date('Y-m-d H:i:s', strtotime($c['ultimo_entrante_at']) + 24 * 3600) : null;
    return [
        'id' => $c['id'], 'estado' => $c['estado'], 'wa_id' => $c['wa_id'], 'nombre_perfil' => $c['nombre_perfil'],
        'id_linea' => $c['id_linea'], 'linea_nombre' => $extra['linea_nombre'] ?? null, 'linea_telefono' => $extra['linea_telefono'] ?? null,
        'id_asignado' => $c['id_asignado'], 'asignado_nombre' => $extra['asignado_nombre'] ?? null,
        'id_contacto' => $c['id_contacto'], 'contacto_nombre' => $extra['contacto_nombre'] ?? null, 'contacto_activo' => ($extra['contacto_activo'] ?? 1) == 1,
        'etiquetas' => $c['id_contacto'] ? crmContactoTags($conn, $c['id_contacto']) : [],
        'ventana_abierta' => comVentanaAbierta($c), 'ventana_vence' => $vence, 'no_leidos' => $c['no_leidos'],
        'id_flujo' => $c['id_flujo'], 'ultimo_mensaje_at' => $c['ultimo_mensaje_at'], 'cerrada_at' => $c['cerrada_at'],
        // Lo que capturó el chatbot (ciudad, correo…), sin las internas que empiezan con _.
        'variables' => (object)array_filter($c['variables'] ?? [], static fn($k) => !str_starts_with((string)$k, '_'), ARRAY_FILTER_USE_KEY),
    ];
}

/** Asigna la conversación a un usuario (estado atención) y deja la nota del sistema. */
function comAsignar(mysqli $conn, array $conv, int $idUsuario, string $nota): void
{
    crmExec($conn, "UPDATE com_conversaciones SET estado = 'atencion', id_asignado = ?, asignada_at = CURRENT_TIMESTAMP, id_flujo = NULL, nodo = NULL,
                    cerrada_at = NULL, cerrada_por = NULL WHERE id = ?", 'ii', [$idUsuario, $conv['id']]);
    comNotaSistema($conn, $conv, $nota);
}

function comNombreUsuario(mysqli $conn, int $id): string
{
    $r = crmRow($conn, 'SELECT COALESCE(nombre, email) AS n FROM le_usuarios WHERE id = ?', 'i', [$id]);
    return $r['n'] ?? 'Usuario';
}
