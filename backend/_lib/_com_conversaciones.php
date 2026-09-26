<?php
// Conversaciones y mensajes de WhatsApp: número → contacto, alta de conversación, registrar entrantes, enviar salientes y aplicar estados.
// Lo usan el webhook, el worker, la bandeja, el chatbot y las campañas. Diseño: docs/modulos/comunicaciones.md → «WhatsApp» y «Bandeja».

const COM_RANGO_ESTADO = ['pendiente' => 0, 'enviado' => 1, 'entregado' => 2, 'leido' => 3];
const COM_ESTADO_META = ['sent' => 'enviado', 'delivered' => 'entregado', 'read' => 'leido', 'failed' => 'fallido'];
const COM_VENTANA_SEG = 24 * 3600 - 120;   // 24 h menos un margen: Meta cuenta desde su reloj
// Códigos de país de 2 dígitos (ITU-T E.164). 1 y 7 son de un dígito; el resto de códigos tienen 3.
const COM_CODIGOS_PAIS_2 = ['20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49', '51', '52',
    '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98'];

/** Separa un número internacional (solo dígitos) en [indicativo, número local]. */
function comDividirNumero(string $e164): array
{
    $d = preg_replace('/\D+/', '', $e164) ?? '';
    if ($d === '') return [null, null];
    $len = in_array($d[0], ['1', '7'], true) ? 1 : (in_array(substr($d, 0, 2), COM_CODIGOS_PAIS_2, true) ? 2 : 3);
    if (strlen($d) <= $len + 3) return [null, $d];
    return [substr($d, 0, $len), substr($d, $len)];
}

/**
 * Persona de la sede con ese WhatsApp (la activa más antigua); si no existe, la crea con el nombre del perfil de WhatsApp.
 * Alta del sistema: sin exigir campos obligatorios, historial «Sistema» con origen whatsapp.
 */
function comContactoPorWhatsapp(mysqli $conn, int $idSede, string $waId, ?string $nombrePerfil): int
{
    $r = crmRow($conn,
        "SELECT c.id FROM crm_contactos c JOIN crm_contactos_personas p ON p.id = c.id
          WHERE c.id_sede = ? AND c.tipo = 'persona' AND p.whatsapp_e164 = ? ORDER BY c.activo DESC, c.id LIMIT 1", 'is', [$idSede, $waId]);
    if ($r) return (int)$r['id'];

    [$ind, $num] = comDividirNumero($waId);
    $nombre = trim((string)$nombrePerfil);
    $nombre = $nombre !== '' ? mb_substr($nombre, 0, 100) : 'WhatsApp +' . $waId;
    $d = [
        'direccion' => null, 'ciudad' => null, 'telefono' => null, 'lat' => null, 'lng' => null, 'id_responsable' => null,
        'nombres' => $nombre, 'apellidos' => null, 'documento_tipo' => null, 'documento_numero' => null, 'correo' => null,
        'whatsapp_indicativo' => $ind, 'whatsapp_numero' => $num, 'fecha_nacimiento' => null, 'nombre_completo' => $nombre,
        'busqueda' => crmBuildBusqueda([$nombre], [$num, $waId]),
    ];
    $id = crmInsertarContacto($conn, ['id_sede' => $idSede, 'id_usuario' => null], 'persona', $d);
    auditRegistroSistema($conn, $idSede, 'crm', 'crm_contactos', $id, 'creado', ['origen' => 'whatsapp', 'wa_id' => $waId]);
    return $id;
}

function comConversacionFila(mysqli $conn, int $id): ?array
{
    $c = crmRow($conn, 'SELECT * FROM com_conversaciones WHERE id = ?', 'i', [$id]);
    if (!$c) return null;
    foreach (['id', 'id_sede', 'id_linea', 'id_contacto', 'id_asignado', 'id_flujo', 'no_leidos', 'cerrada_por', 'ultimo_mensaje_id'] as $k) {
        if ($c[$k] !== null) $c[$k] = (int)$c[$k];
    }
    $c['variables'] = $c['variables'] ? (json_decode($c['variables'], true) ?: []) : [];
    return $c;
}

/** Conversación de (línea, número); la crea (y la Persona si hace falta) si no existe. Actualiza el nombre del perfil. */
function comConversacionPara(mysqli $conn, array $linea, string $waId, ?string $nombrePerfil): array
{
    $c = crmRow($conn, 'SELECT id, id_contacto, nombre_perfil FROM com_conversaciones WHERE id_linea = ? AND wa_id = ?', 'is', [$linea['id'], $waId]);
    if ($c) {
        $id = (int)$c['id'];
        $perfil = $nombrePerfil !== null && trim($nombrePerfil) !== '' ? mb_substr(trim($nombrePerfil), 0, 150) : null;
        if ($perfil !== null && $perfil !== $c['nombre_perfil']) crmExec($conn, 'UPDATE com_conversaciones SET nombre_perfil = ? WHERE id = ?', 'si', [$perfil, $id]);
        if ($c['id_contacto'] === null) {
            $idContacto = comContactoPorWhatsapp($conn, $linea['id_sede'], $waId, $nombrePerfil);
            crmExec($conn, 'UPDATE com_conversaciones SET id_contacto = ? WHERE id = ?', 'ii', [$idContacto, $id]);
        }
        return comConversacionFila($conn, $id);
    }
    $idContacto = comContactoPorWhatsapp($conn, $linea['id_sede'], $waId, $nombrePerfil);
    $perfil = $nombrePerfil !== null && trim($nombrePerfil) !== '' ? mb_substr(trim($nombrePerfil), 0, 150) : null;
    crmExec($conn, "INSERT IGNORE INTO com_conversaciones (id_sede, id_linea, id_contacto, wa_id, nombre_perfil, estado) VALUES (?, ?, ?, ?, ?, 'bot')",
        'iiiss', [$linea['id_sede'], $linea['id'], $idContacto, $waId, $perfil]);
    $id = (int)crmRow($conn, 'SELECT id FROM com_conversaciones WHERE id_linea = ? AND wa_id = ?', 'is', [$linea['id'], $waId])['id'];
    return comConversacionFila($conn, $id);
}

/**
 * Traduce un mensaje entrante de Meta a [tipo, texto, contenido, medio].
 * medio = ['id' => media id de Meta, 'mime', 'nombre'] o null.
 */
function comParsearEntrante(array $m): array
{
    $tipo = (string)($m['type'] ?? 'unsupported');
    $texto = null; $contenido = null; $medio = null;
    switch ($tipo) {
        case 'text':
            $texto = (string)($m['text']['body'] ?? '');
            break;
        case 'interactive':
            $it = $m['interactive'] ?? [];
            if (($it['type'] ?? '') === 'button_reply') {
                $texto = (string)($it['button_reply']['title'] ?? '');
                $contenido = ['respuesta' => ['tipo' => 'boton', 'id' => (string)($it['button_reply']['id'] ?? ''), 'titulo' => $texto]];
            } elseif (($it['type'] ?? '') === 'list_reply') {
                $texto = (string)($it['list_reply']['title'] ?? '');
                $contenido = ['respuesta' => ['tipo' => 'lista', 'id' => (string)($it['list_reply']['id'] ?? ''), 'titulo' => $texto,
                    'descripcion' => $it['list_reply']['description'] ?? null]];
            } else {
                $contenido = ['original' => $it];
            }
            break;
        case 'button':   // botón de respuesta rápida de una plantilla (campañas)
            $texto = (string)($m['button']['text'] ?? '');
            $contenido = ['respuesta' => ['tipo' => 'plantilla', 'id' => (string)($m['button']['payload'] ?? ''), 'titulo' => $texto]];
            break;
        case 'image': case 'video': case 'audio': case 'document': case 'sticker':
            $x = $m[$tipo] ?? [];
            $texto = isset($x['caption']) ? (string)$x['caption'] : null;
            $medio = ['id' => (string)($x['id'] ?? ''), 'mime' => (string)($x['mime_type'] ?? ''), 'nombre' => $x['filename'] ?? null];
            if (!empty($x['voice'])) $contenido = ['nota_de_voz' => true];
            break;
        case 'location':
            $x = $m['location'] ?? [];
            $contenido = ['ubicacion' => ['lat' => $x['latitude'] ?? null, 'lng' => $x['longitude'] ?? null, 'nombre' => $x['name'] ?? null, 'direccion' => $x['address'] ?? null]];
            $texto = trim(($x['name'] ?? '') . ' ' . ($x['address'] ?? '')) ?: null;
            break;
        case 'contacts':
            $contenido = ['contactos' => array_map(static fn($c) => ['nombre' => $c['name']['formatted_name'] ?? '',
                'telefonos' => array_column($c['phones'] ?? [], 'phone')], $m['contacts'] ?? [])];
            $texto = implode(', ', array_column($contenido['contactos'], 'nombre')) ?: null;
            break;
        case 'reaction':
            $texto = (string)($m['reaction']['emoji'] ?? '');
            $contenido = ['reaccion' => ['emoji' => $texto, 'a' => $m['reaction']['message_id'] ?? null]];
            break;
        default:
            $contenido = ['original' => $tipo, 'errores' => $m['errors'] ?? null];
            $tipo = 'unsupported';
    }
    if (isset($m['referral'])) $contenido = ($contenido ?? []) + ['referido' => $m['referral']];   // clic en un anuncio «Enviar mensaje»
    if ($texto !== null) $texto = mb_substr($texto, 0, 10000);
    return [$tipo, $texto, $contenido, $medio && $medio['id'] !== '' ? $medio : null];
}

function comVentanaAbierta(array $conv): bool
{
    return !empty($conv['ultimo_entrante_at']) && (time() - strtotime($conv['ultimo_entrante_at'])) < COM_VENTANA_SEG;
}

function comResumen(?string $texto): ?string
{
    if ($texto === null) return null;
    $t = trim(preg_replace('/\s+/u', ' ', $texto) ?? $texto);
    return $t === '' ? null : mb_substr($t, 0, 200);
}

/**
 * Procesa un mensaje entrante de la cola (com_entrantes tipo mensaje): conversación (y Persona), mensaje (sin duplicados), reapertura,
 * medio a R2 y chatbot. Devuelve el id del mensaje (0 si ya existía).
 */
function comProcesarMensajeEntrante(mysqli $conn, array $linea, array $payload): int
{
    $m = $payload['message'] ?? [];
    $waId = preg_replace('/\D+/', '', (string)($m['from'] ?? '')) ?? '';
    $wamid = (string)($m['id'] ?? '');
    if ($waId === '' || $wamid === '') return 0;
    if (crmRow($conn, 'SELECT 1 AS ok FROM com_mensajes WHERE wa_message_id = ?', 's', [$wamid])) return 0;

    [$tipo, $texto, $contenido, $medio] = comParsearEntrante($m);
    $ts = isset($m['timestamp']) && (int)$m['timestamp'] > 0 ? date('Y-m-d H:i:s', min(time(), (int)$m['timestamp'])) : date('Y-m-d H:i:s');

    $conn->begin_transaction();
    $conv = comConversacionPara($conn, $linea, $waId, $payload['perfil'] ?? null);
    $json = $contenido !== null ? json_encode($contenido, JSON_UNESCAPED_UNICODE) : null;
    crmExec($conn,
        "INSERT IGNORE INTO com_mensajes (id_sede, id_conversacion, direccion, origen, tipo, texto, contenido, media_mime, media_nombre, wa_message_id, contexto_wa_id, estado, created_at)
         VALUES (?, ?, 'entrante', 'contacto', ?, ?, ?, ?, ?, ?, ?, 'recibido', ?)",
        'iissssssss', [$conv['id_sede'], $conv['id'], $tipo, $texto, $json, $medio['mime'] ?? null, $medio['nombre'] ?? null, $wamid,
            $m['context']['id'] ?? null, $ts]);
    $idMsg = (int)$conn->insert_id;
    if ($idMsg === 0) { $conn->commit(); return 0; }

    // Una reacción no mueve la conversación (no reabre ni cuenta como no leído), solo se guarda.
    if ($tipo !== 'reaction') {
        $reabrir = $conv['estado'] === 'cerrada';
        crmExec($conn,
            'UPDATE com_conversaciones SET ultimo_entrante_at = GREATEST(COALESCE(ultimo_entrante_at, ?), ?), ultimo_mensaje_at = ?, ultimo_mensaje_id = ?,
                    resumen = ?, no_leidos = no_leidos + 1' .
            ($reabrir ? ", estado = 'bot', id_asignado = NULL, asignada_at = NULL, id_flujo = NULL, nodo = NULL, variables = NULL, cerrada_at = NULL, cerrada_por = NULL" : '') .
            ' WHERE id = ?',
            'sssisi', [$ts, $ts, $ts, $idMsg, comResumen($texto), $conv['id']]);
    }
    $conn->commit();

    if ($medio) comGuardarMedioEntrante($conn, $linea, $idMsg, $conv['id_sede'], $medio);
    if ($tipo === 'reaction') return $idMsg;
    if (function_exists('comCampanaRespuesta')) comCampanaRespuesta($conn, $conv['id']);

    // «BAJA» / «STOP» (el mensaje completo): no más marketing para este número. «ALTA» lo revierte. No pasa al chatbot.
    $norm = comNormalizar((string)$texto);
    $baja = in_array($norm, COM_PALABRAS_BAJA, true);
    if ($baja || (in_array($norm, COM_PALABRAS_ALTA, true) && comEstaDeBaja($conn, $conv['id_sede'], $waId))) {
        $baja ? comRegistrarBaja($conn, $conv['id_sede'], $waId, 'palabra') : comQuitarBaja($conn, $conv['id_sede'], $waId);
        $conv = comConversacionFila($conn, $conv['id']);
        $t = $baja ? 'Listo, no te enviaremos más mensajes promocionales. Si cambias de opinión, escribe ALTA.' : 'Listo, volverás a recibir nuestras novedades.';
        comEnviar($conn, $conv, $linea, ['origen' => 'sistema', 'payload' => comPayloadTexto($t), 'texto' => $t]);
        comNotaSistema($conn, $conv, $baja ? 'El cliente pidió no recibir mensajes de marketing' : 'El cliente volvió a aceptar mensajes de marketing');
        if ($conv['estado'] === 'bot') crmExec($conn, "UPDATE com_conversaciones SET estado = 'cerrada', cerrada_at = CURRENT_TIMESTAMP, no_leidos = 0 WHERE id = ?", 'i', [$conv['id']]);
        return $idMsg;
    }

    if ($tipo !== 'reaction') {
        $conv = comConversacionFila($conn, $conv['id']);
        if (function_exists('comBotAlRecibir')) {
            comBotAlRecibir($conn, $linea, $conv, ['id' => $idMsg, 'tipo' => $tipo, 'texto' => $texto, 'contenido' => $contenido]);
        } elseif ($conv['estado'] === 'bot') {
            comPasarACola($conn, $conv, null);
        }
    }
    return $idMsg;
}

/** Descarga el medio de Meta y lo guarda en el bucket privado de R2. Si no se puede (R2 sin configurar, error de Meta) deja el motivo. */
function comGuardarMedioEntrante(mysqli $conn, array $linea, int $idMsg, int $idSede, array $medio): void
{
    $motivo = null;
    if (!getenv('R2_ENDPOINT') || !getenv('R2_BUCKET_PRIVATE')) {
        $motivo = 'Almacenamiento no configurado';
    } else {
        $f = comDescargarMedia($linea, $medio['id']);
        if (!$f) {
            $motivo = 'No se pudo descargar el archivo de WhatsApp';
        } else {
            require_once __DIR__ . '/_r2.php';
            $r = r2Upload($conn, ['tmp_name' => $f['tmp'], 'size' => $f['bytes'], 'error' => UPLOAD_ERR_OK], $idSede, 'comunicaciones', [], 100, true);
            @unlink($f['tmp']);
            if ($r['success']) {
                crmExec($conn, 'UPDATE com_mensajes SET media_key = ?, media_mime = ?, media_bytes = ? WHERE id = ?', 'ssii', [$r['key'], $r['mime'], $r['size'], $idMsg]);
                return;
            }
            $motivo = $r['error'];
        }
    }
    crmExec($conn, "UPDATE com_mensajes SET contenido = JSON_SET(COALESCE(contenido, '{}'), '$.medio_error', ?) WHERE id = ?", 'si', [$motivo, $idMsg]);
}

/**
 * Envía un mensaje por la línea de la conversación y lo registra. $o:
 *   origen (bot|asesor|campana|sistema), payload (comPayload*), texto (lo que se ve en el hilo), contenido (array|null),
 *   categoria (service por defecto; la de la plantilla si es plantilla), id_usuario, id_campana, media (key, mime, nombre, bytes).
 * Revisa línea activa, ventana de 24 h (salvo plantillas) y saldo. Devuelve ['ok', 'id' (mensaje o null), 'error', 'clase', 'codigo'].
 * clase: ok | ventana | sin_creditos | linea | permanente | limite | transitorio.
 */
function comEnviar(mysqli $conn, array $conv, array $linea, array $o): array
{
    $esPlantilla = ($o['payload']['type'] ?? '') === 'template';
    $categoria = $o['categoria'] ?? 'service';
    if ((int)$linea['activo'] !== 1 || empty($linea['token'])) {
        return ['ok' => false, 'id' => null, 'clase' => 'linea', 'codigo' => null, 'error' => empty($linea['token'])
            ? 'La línea no tiene token (o falta COM_SECRET_KEY en el servidor)' : 'La línea está inactiva'];
    }
    if (!$esPlantilla && !comVentanaAbierta($conv)) {
        return ['ok' => false, 'id' => null, 'clase' => 'ventana', 'codigo' => 131047, 'error' => COM_ERR_TEXTOS[131047]];
    }
    $saldo = comPuedeEnviar($conn, $conv['id_sede'], $categoria);
    if (!$saldo['ok']) {
        return ['ok' => false, 'id' => null, 'clase' => 'sin_creditos', 'codigo' => null,
            'error' => 'Sin créditos suficientes (saldo ' . $saldo['saldo'] . ', se necesitan ' . $saldo['necesarios'] . ')'];
    }

    $tipo = $esPlantilla ? 'template' : (string)$o['payload']['type'];
    $json = isset($o['contenido']) ? json_encode($o['contenido'], JSON_UNESCAPED_UNICODE) : null;
    $media = $o['media'] ?? [];
    crmExec($conn,
        "INSERT INTO com_mensajes (id_sede, id_conversacion, direccion, origen, tipo, texto, contenido, media_key, media_mime, media_nombre, media_bytes,
                                   estado, categoria, id_usuario, id_campana)
         VALUES (?, ?, 'saliente', ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?)",
        'iisssssssisii', [$conv['id_sede'], $conv['id'], $o['origen'], $tipo, $o['texto'] ?? null, $json, $media['key'] ?? null,
            $media['mime'] ?? null, $media['nombre'] ?? null, $media['bytes'] ?? null, $categoria, $o['id_usuario'] ?? null, $o['id_campana'] ?? null]);
    $idMsg = (int)$conn->insert_id;

    $res = comGraph('POST', '/' . $linea['phone_number_id'] . '/messages', $linea['token'], $linea['graph_version'],
        ['messaging_product' => 'whatsapp', 'recipient_type' => 'individual', 'to' => $conv['wa_id']] + $o['payload']);
    $clase = comClasificarError($res);
    $ahora = date('Y-m-d H:i:s');
    if ($clase === 'ok') {
        $wamid = (string)($res['data']['messages'][0]['id'] ?? '');
        crmExec($conn, 'UPDATE com_mensajes SET wa_message_id = ? WHERE id = ?', 'si', [$wamid !== '' ? $wamid : null, $idMsg]);
        crmExec($conn, 'UPDATE com_conversaciones SET ultimo_mensaje_at = ?, ultimo_mensaje_id = ?, resumen = ? WHERE id = ?',
            'sisi', [$ahora, $idMsg, comResumen($o['texto'] ?? null), $conv['id']]);
        return ['ok' => true, 'id' => $idMsg, 'clase' => 'ok', 'codigo' => null, 'error' => null];
    }
    [$codigo, $detalle] = comErrorDe($res);
    crmExec($conn, "UPDATE com_mensajes SET estado = 'fallido', error_codigo = ?, error_detalle = ? WHERE id = ?", 'isi', [$codigo, $detalle, $idMsg]);
    crmExec($conn, 'UPDATE com_conversaciones SET ultimo_mensaje_at = ?, ultimo_mensaje_id = ?, resumen = ? WHERE id = ?',
        'sisi', [$ahora, $idMsg, comResumen($o['texto'] ?? null), $conv['id']]);
    if ($codigo === 131050 && function_exists('comRegistrarBaja')) comRegistrarBaja($conn, $conv['id_sede'], $conv['wa_id'], 'meta_131050');
    return ['ok' => false, 'id' => $idMsg, 'clase' => $clase, 'codigo' => $codigo, 'error' => $detalle];
}

/**
 * Aplica un estado de Meta (statuses[]) a su mensaje: nunca retrocede, «fallido» es final, cobra con pricing.
 * Devuelve 'ok' | 'sin_mensaje' (aún no se guardó su wa_message_id: el worker reintenta) | 'ignorado'.
 */
function comAplicarEstado(mysqli $conn, array $st): string
{
    $nuevo = COM_ESTADO_META[$st['status'] ?? ''] ?? null;
    $wamid = (string)($st['id'] ?? '');
    if (!$nuevo || $wamid === '') return 'ignorado';
    $m = crmRow($conn, "SELECT id, id_sede, estado, id_campana, id_conversacion FROM com_mensajes WHERE wa_message_id = ? AND direccion = 'saliente'", 's', [$wamid]);
    if (!$m) return 'sin_mensaje';
    $id = (int)$m['id'];
    $ts = isset($st['timestamp']) && (int)$st['timestamp'] > 0 ? date('Y-m-d H:i:s', (int)$st['timestamp']) : date('Y-m-d H:i:s');
    $actual = $m['estado'];
    $cambio = false;

    if ($actual !== 'fallido') {
        if ($nuevo === 'fallido') {
            if ((COM_RANGO_ESTADO[$actual] ?? 0) < COM_RANGO_ESTADO['leido']) {
                $e = $st['errors'][0] ?? [];
                $codigo = isset($e['code']) ? (int)$e['code'] : null;
                $detalle = mb_substr(COM_ERR_TEXTOS[$codigo] ?? trim(($e['error_data']['details'] ?? '') ?: ($e['title'] ?? $e['message'] ?? 'Falló el envío')), 0, 500);
                crmExec($conn, "UPDATE com_mensajes SET estado = 'fallido', error_codigo = ?, error_detalle = ? WHERE id = ?", 'isi', [$codigo, $detalle, $id]);
                $cambio = true;
                if ($codigo === 131050 && function_exists('comRegistrarBaja')) {
                    $wa = crmRow($conn, 'SELECT wa_id FROM com_conversaciones WHERE id = ?', 'i', [(int)$m['id_conversacion']])['wa_id'] ?? null;
                    if ($wa) comRegistrarBaja($conn, (int)$m['id_sede'], $wa, 'meta_131050');
                }
            }
        } elseif (COM_RANGO_ESTADO[$nuevo] > (COM_RANGO_ESTADO[$actual] ?? 0)) {
            // «leído» antes que «entregado» (llegan fuera de orden): también completa las fechas anteriores.
            crmExec($conn,
                'UPDATE com_mensajes SET estado = ?, enviado_at = COALESCE(enviado_at, ?),
                        entregado_at = IF(? >= 2, COALESCE(entregado_at, ?), entregado_at), leido_at = IF(? >= 3, COALESCE(leido_at, ?), leido_at)
                  WHERE id = ?',
                'ssisisi', [$nuevo, $ts, COM_RANGO_ESTADO[$nuevo], $ts, COM_RANGO_ESTADO[$nuevo], $ts, $id]);
            $cambio = true;
        }
    }
    // Un mensaje fallido no se cobra (Meta no cobra lo que no entregó), aunque llegue después un estado con precio.
    if ($actual !== 'fallido' && isset($st['pricing']) && is_array($st['pricing'])) {
        comCobrar($conn, $id, $st['pricing']['category'] ?? null, (bool)($st['pricing']['billable'] ?? false), in_array($nuevo, ['entregado', 'leido'], true));
    }
    if ($cambio && $m['id_campana'] !== null && function_exists('comCampanaTrasEstado')) comCampanaTrasEstado($conn, $id);
    return 'ok';
}

/**
 * La conversación pasa a la cola de asesores (sin chatbot activo). $motivo queda como nota del sistema en el hilo (p. ej. «Sin créditos»).
 * Avisa a los usuarios del módulo de la sede que hay alguien esperando (una vez por entrada a la cola).
 */
function comPasarACola(mysqli $conn, array $conv, ?string $motivo): void
{
    $n = crmExec($conn, "UPDATE com_conversaciones SET estado = 'cola', id_asignado = NULL, asignada_at = NULL, id_flujo = NULL, nodo = NULL
                          WHERE id = ? AND estado IN ('bot', 'atencion')", 'i', [$conv['id']]);
    if ($motivo !== null) comNotaSistema($conn, $conv, $motivo);
    if ($n !== 1) return;
    $nombre = $conv['nombre_perfil'] ?: ('+' . $conv['wa_id']);
    if (!empty($conv['id_contacto'])) {
        $c = crmRow($conn, 'SELECT nombre_completo FROM crm_contactos WHERE id = ?', 'i', [$conv['id_contacto']]);
        if ($c) $nombre = $c['nombre_completo'];
    }
    $ids = array_column(comUsuariosModulo($conn, $conv['id_sede']), 'id');
    notifyUsers($conn, $conv['id_sede'], $ids, 'Conversación en espera', $nombre . ' espera un asesor en WhatsApp.',
        '/m/comunicaciones/bandeja?c=' . $conv['id'], 'com_cola', ['id_conversacion' => $conv['id']]);
}

/** Nota del sistema en el hilo (no se envía al cliente): cambios de estado, falta de créditos, transferencias. */
function comNotaSistema(mysqli $conn, array $conv, string $texto): int
{
    crmExec($conn, "INSERT INTO com_mensajes (id_sede, id_conversacion, direccion, origen, tipo, texto, estado) VALUES (?, ?, 'saliente', 'sistema', 'nota', ?, 'enviado')",
        'iis', [$conv['id_sede'], $conv['id'], mb_substr($texto, 0, 1000)]);
    return (int)$conn->insert_id;
}
