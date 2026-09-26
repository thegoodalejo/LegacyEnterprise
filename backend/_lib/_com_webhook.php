<?php
// Eventos del webhook de Meta y cola del worker. El webhook (comunicaciones/webhook.php) ya validó la firma con el app secret de $app.
// Mensajes → cola com_entrantes (dedup por único) · estados → se aplican ya (o a la cola si su mensaje aún no tiene wa_message_id) ·
// plantillas, calidad y cuenta → se actualizan y se avisa. Diseño: docs/modulos/comunicaciones.md → «Webhook» y «Worker».

require_once __DIR__ . '/_com.php';
require_once __DIR__ . '/_com_bot.php';   // el worker pasa cada mensaje entrante al chatbot
require_once __DIR__ . '/_com_plantillas.php';   // eventos de plantillas (estado, categoría, calidad)
require_once __DIR__ . '/_com_campanas.php';    // estados, respuestas y envíos de campañas

/** Procesa el cuerpo de un POST del webhook. Devuelve cuántos mensajes nuevos quedaron en la cola (para despertar al worker). */
function comWebhookProcesar(mysqli $conn, array $app, array $body): int
{
    if (($body['object'] ?? '') !== 'whatsapp_business_account') return 0;
    $encolados = 0;
    foreach ($body['entry'] ?? [] as $entry) {
        $wabaId = (string)($entry['id'] ?? '');
        foreach ($entry['changes'] ?? [] as $ch) {
            $field = (string)($ch['field'] ?? '');
            $v = is_array($ch['value'] ?? null) ? $ch['value'] : [];
            try {
                switch ($field) {
                    case 'messages':
                        $encolados += comWebhookMensajes($conn, $app, $v);
                        break;
                    case 'message_template_status_update':
                        if (function_exists('comPlantillaEventoEstado')) comPlantillaEventoEstado($conn, $wabaId, $v);
                        break;
                    case 'template_category_update':
                        if (function_exists('comPlantillaEventoCategoria')) comPlantillaEventoCategoria($conn, $wabaId, $v);
                        break;
                    case 'message_template_quality_update':
                        if (function_exists('comPlantillaEventoCalidad')) comPlantillaEventoCalidad($conn, $wabaId, $v);
                        break;
                    case 'phone_number_quality_update':
                        comWebhookCalidadLinea($conn, $app, $wabaId, $v);
                        break;
                    case 'account_update':
                        error_log('[com_webhook] account_update WABA ' . $wabaId . ': ' . json_encode($v, JSON_UNESCAPED_UNICODE));
                        break;
                }
            } catch (Throwable $e) {
                error_log("[com_webhook] $field: " . $e->getMessage());
            }
        }
    }
    return $encolados;
}

/** field = messages: encola los mensajes y aplica los estados. Solo para líneas activas de ESTA app. */
function comWebhookMensajes(mysqli $conn, array $app, array $v): int
{
    $pnid = (string)($v['metadata']['phone_number_id'] ?? '');
    $l = $pnid !== '' ? crmRow($conn, 'SELECT id FROM com_lineas WHERE phone_number_id = ? AND id_app = ? AND activo = 1', 'si', [$pnid, (int)$app['id']]) : null;
    if (!$l) {
        if ($pnid !== '') error_log("[com_webhook] phone_number_id $pnid sin línea activa en la app {$app['id']}");
        return 0;
    }
    $idLinea = (int)$l['id'];
    $perfiles = [];
    foreach ($v['contacts'] ?? [] as $c) $perfiles[(string)($c['wa_id'] ?? '')] = $c['profile']['name'] ?? null;

    $n = 0;
    foreach ($v['messages'] ?? [] as $m) {
        $wamid = (string)($m['id'] ?? '');
        if ($wamid === '') continue;
        $payload = json_encode(['message' => $m, 'perfil' => $perfiles[(string)($m['from'] ?? '')] ?? null], JSON_UNESCAPED_UNICODE);
        $n += crmExec($conn, "INSERT IGNORE INTO com_entrantes (id_linea, tipo, clave, payload) VALUES (?, 'mensaje', ?, ?)", 'iss', [$idLinea, mb_substr($wamid, 0, 160), $payload]);
    }
    foreach ($v['statuses'] ?? [] as $st) {
        if (comAplicarEstado($conn, $st) === 'sin_mensaje') {
            // Llegó antes de que el envío guardara su wa_message_id (o es de un mensaje que no enviamos): el worker reintenta un par de veces.
            $clave = mb_substr(($st['id'] ?? '') . ':' . ($st['status'] ?? ''), 0, 160);
            $n += crmExec($conn, "INSERT IGNORE INTO com_entrantes (id_linea, tipo, clave, payload, procesar_desde) VALUES (?, 'estado', ?, ?, NOW() + INTERVAL 5 SECOND)",
                'iss', [$idLinea, $clave, json_encode($st, JSON_UNESCAPED_UNICODE)]);
        }
    }
    foreach ($v['errors'] ?? [] as $e) error_log('[com_webhook] error de Meta en la línea ' . $idLinea . ': ' . json_encode($e, JSON_UNESCAPED_UNICODE));
    return $n;
}

/** Calidad y nivel de mensajes de una línea (phone_number_quality_update). Avisa a L4 si baja. */
function comWebhookCalidadLinea(mysqli $conn, array $app, string $wabaId, array $v): void
{
    $digitos = preg_replace('/\D+/', '', (string)($v['display_phone_number'] ?? '')) ?? '';
    $lineas = crmRows($conn, 'SELECT id, id_sede, nombre, telefono_visible FROM com_lineas WHERE waba_id = ? AND id_app = ?', 'si', [$wabaId, (int)$app['id']]);
    if (count($lineas) > 1 && $digitos !== '') {
        $lineas = array_values(array_filter($lineas, static fn($l) => (preg_replace('/\D+/', '', (string)$l['telefono_visible']) ?? '') === $digitos));
    }
    $evento = (string)($v['event'] ?? '');
    $tier = isset($v['current_limit']) ? (string)$v['current_limit'] : null;
    foreach ($lineas as $l) {
        $calidad = $evento === 'FLAGGED' ? 'RED' : ($evento === 'UNFLAGGED' ? 'GREEN' : null);
        crmExec($conn, 'UPDATE com_lineas SET calidad = COALESCE(?, calidad), nivel_mensajes = COALESCE(?, nivel_mensajes) WHERE id = ?', 'ssi', [$calidad, $tier, (int)$l['id']]);
        if (in_array($evento, ['FLAGGED', 'DOWNGRADE'], true)) {
            $ids = array_column(crmRows($conn, "SELECT id_usuario FROM le_usuario_sedes WHERE id_sede = ? AND rol = 'L4' AND state = 1", 'i', [(int)$l['id_sede']]), 'id_usuario');
            notifyUsers($conn, (int)$l['id_sede'], $ids, 'Calidad de la línea de WhatsApp',
                'Meta marcó la línea «' . $l['nombre'] . '» (' . $evento . '). Revisa las plantillas y las campañas recientes.', '/m/comunicaciones/configuracion', 'com_linea');
        }
    }
}

/**
 * Worker: procesa hasta $max elementos de la cola que ya tocan. Devuelve cuántos procesó (0 = cola vacía).
 * Un error en un elemento no detiene los demás: se reintenta con espera creciente y a los 5 intentos queda en «error».
 */
function comProcesarCola(mysqli $conn, int $max = 50): int
{
    $filas = crmRows($conn, "SELECT * FROM com_entrantes WHERE estado = 'pendiente' AND procesar_desde <= NOW() ORDER BY id LIMIT ?", 'i', [$max]);
    foreach ($filas as $f) {
        $id = (int)$f['id'];
        $payload = json_decode($f['payload'], true) ?: [];
        try {
            if ($f['tipo'] === 'mensaje') {
                $linea = comLinea($conn, (int)$f['id_linea'], null, false);
                if (!$linea) throw new RuntimeException('Línea inexistente');
                comProcesarMensajeEntrante($conn, $linea, $payload);
            } elseif (comAplicarEstado($conn, $payload) === 'sin_mensaje') {
                if ((int)$f['intentos'] < 3) {
                    crmExec($conn, 'UPDATE com_entrantes SET intentos = intentos + 1, procesar_desde = NOW() + INTERVAL ? SECOND WHERE id = ?', 'ii', [20 * ((int)$f['intentos'] + 1), $id]);
                    continue;
                }
                crmExec($conn, "UPDATE com_entrantes SET estado = 'error', error = 'Mensaje no encontrado (no lo envió este sistema)', procesado_at = NOW() WHERE id = ?", 'i', [$id]);
                continue;
            }
            crmExec($conn, "UPDATE com_entrantes SET estado = 'procesado', procesado_at = NOW(), error = NULL WHERE id = ?", 'i', [$id]);
        } catch (Throwable $e) {
            if (method_exists($conn, 'rollback')) @$conn->rollback();
            $intentos = (int)$f['intentos'] + 1;
            $msg = mb_substr($e->getMessage(), 0, 500);
            error_log("[com_worker] entrante $id: $msg");
            crmExec($conn, "UPDATE com_entrantes SET intentos = ?, error = ?, estado = IF(? >= 5, 'error', 'pendiente'), procesar_desde = NOW() + INTERVAL ? SECOND WHERE id = ?",
                'isiii', [$intentos, $msg, $intentos, 30 * $intentos, $id]);
        }
    }
    return count($filas);
}
