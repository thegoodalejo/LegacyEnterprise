<?php
// Campañas de WhatsApp: audiencia desde Contactos (filtros, etiquetas o selección), lanzamiento, envío por el worker (créditos, cupo de Meta,
// límites y reintentos), estados de los destinatarios, respuestas y clics. Diseño: docs/modulos/comunicaciones.md → «Campañas».

require_once __DIR__ . '/_com.php';
require_once __DIR__ . '/_com_plantillas.php';

const COM_CAMP_MAX = 50000;           // destinatarios por campaña
const COM_CAMP_LOTE = 100;            // envíos por vuelta del worker y campaña
const COM_CAMP_ACTIVAS = ['programada', 'enviando', 'esperando_saldo', 'esperando_cupo', 'pausada'];
const COM_CUPO_NIVEL = ['TIER_250' => 250, 'TIER_1K' => 1000, 'TIER_2K' => 2000, 'TIER_10K' => 10000, 'TIER_100K' => 100000, 'TIER_UNLIMITED' => PHP_INT_MAX];
const COM_RANGO_DEST = ['pendiente' => 0, 'enviado' => 1, 'entregado' => 2, 'leido' => 3];

/**
 * Resuelve la audiencia a destinatarios únicos por número. $aud: {ids:[…]} o {filtros:{…}, excluidos:[…]}, organizaciones (bool: incluir a la
 * persona principal de cada organización). Solo Personas activas con WhatsApp; las bajas se excluyen si la plantilla es de marketing.
 * Devuelve ['destinatarios' => [[id_contacto, nombre, wa_id]], 'seleccionados', 'sin_whatsapp', 'bajas', 'repetidos'].
 */
function comCampanaAudiencia(mysqli $conn, array $ctx, array $aud, bool $marketing): array
{
    $sel = isset($aud['ids']) ? ['ids' => $aud['ids']] : ['filtros' => is_array($aud['filtros'] ?? null) ? $aud['filtros'] : [], 'excluidos' => $aud['excluidos'] ?? []];
    $w = crmSeleccionWhere($conn, $ctx, $sel);
    $sel = crmRows($conn, "SELECT c.id, c.tipo, c.nombre_completo, c.activo, p.whatsapp_e164 FROM crm_contactos c LEFT JOIN crm_contactos_personas p ON p.id = c.id
                            WHERE {$w['sql']} LIMIT " . (COM_CAMP_MAX * 2), $w['types'], $w['params']);
    $personas = [];
    $orgs = [];
    foreach ($sel as $r) {
        if ((int)$r['activo'] !== 1) continue;
        if ($r['tipo'] === 'persona') $personas[] = ['id' => (int)$r['id'], 'nombre' => $r['nombre_completo'], 'wa' => $r['whatsapp_e164']];
        else $orgs[] = (int)$r['id'];
    }
    if ($orgs && !empty($aud['organizaciones'])) {
        foreach (array_chunk($orgs, 500) as $ch) {
            foreach (crmRows($conn, 'SELECT c.id, c.nombre_completo, p.whatsapp_e164 FROM crm_contacto_vinculos v JOIN crm_contactos c ON c.id = v.id_persona AND c.activo = 1
                                      JOIN crm_contactos_personas p ON p.id = c.id WHERE v.principal = 1 AND v.id_organizacion IN (' . crmMarks(count($ch)) . ')',
                str_repeat('i', count($ch)), $ch) as $r) $personas[] = ['id' => (int)$r['id'], 'nombre' => $r['nombre_completo'], 'wa' => $r['whatsapp_e164']];
        }
    }
    $bajas = [];
    if ($marketing) foreach (crmRows($conn, 'SELECT wa_id FROM com_bajas WHERE id_sede = ?', 'i', [$ctx['id_sede']]) as $b) $bajas[$b['wa_id']] = true;
    $out = []; $sinWa = 0; $nBajas = 0; $rep = 0;
    foreach ($personas as $p) {
        if (!$p['wa']) { $sinWa++; continue; }
        if (isset($bajas[$p['wa']])) { $nBajas++; continue; }
        if (isset($out[$p['wa']])) { $rep++; continue; }
        $out[$p['wa']] = ['id_contacto' => $p['id'], 'nombre' => $p['nombre'], 'wa_id' => $p['wa']];
    }
    return ['destinatarios' => array_values($out), 'seleccionados' => count($sel), 'organizaciones' => count($orgs), 'sin_whatsapp' => $sinWa,
        'bajas' => $nBajas, 'repetidos' => $rep];
}

function comCampana(mysqli $conn, int $idSede, int $id): ?array
{
    return crmRow($conn, 'SELECT c.*, p.nombre AS plantilla_nombre, p.idioma AS plantilla_idioma, COALESCE(p.categoria, p.categoria_solicitada) AS plantilla_categoria,
                                 l.nombre AS linea_nombre, COALESCE(u.nombre, u.email) AS creada_por
                            FROM com_campanas c JOIN com_plantillas p ON p.id = c.id_plantilla JOIN com_lineas l ON l.id = c.id_linea
                       LEFT JOIN le_usuarios u ON u.id = c.created_by WHERE c.id = ? AND c.id_sede = ?', 'ii', [$id, $idSede]);
}

/** Contadores de una campaña a partir de sus destinatarios. */
function comCampanaConteos(mysqli $conn, int $id): array
{
    $r = crmRow($conn,
        "SELECT COUNT(*) AS total, SUM(estado = 'pendiente') AS pendientes, SUM(estado IN ('enviado','entregado','leido')) AS enviados,
                SUM(estado IN ('entregado','leido')) AS entregados, SUM(estado = 'leido') AS leidos, SUM(estado = 'fallido') AS fallidos,
                SUM(estado = 'omitido') AS omitidos, SUM(respondio_at IS NOT NULL) AS respuestas, SUM(clic_at IS NOT NULL) AS clics
           FROM com_campana_destinatarios WHERE id_campana = ?", 'i', [$id]);
    $out = array_map('intval', $r ?? []);
    $out['creditos'] = (int)(crmRow($conn, 'SELECT COALESCE(SUM(creditos), 0) AS n FROM com_mensajes WHERE id_campana = ?', 'i', [$id])['n'] ?? 0);
    return $out;
}

/** Campaña para el frontend. */
function comCampanaPublica(mysqli $conn, array $c): array
{
    $out = $c;
    foreach (['audiencia', 'valores'] as $k) $out[$k] = $c[$k] ? json_decode($c[$k], true) : null;
    foreach (['id', 'id_sede', 'id_linea', 'id_plantilla', 'total', 'creditos_estimados', 'created_by', 'updated_by'] as $k) if (isset($out[$k])) $out[$k] = (int)$out[$k];
    unset($out['media_key']);
    $out['tiene_media'] = $c['media_id'] !== null;
    $out['conteos'] = comCampanaConteos($conn, (int)$c['id']);
    return $out;
}

/** Valida lo necesario para lanzar o probar: plantilla enviable de la misma WABA, enlace, medio del encabezado y variables «a mano». */
function comCampanaValidar(mysqli $conn, array $ctx, array $c, array $tpl, array $linea): void
{
    if ($motivo = comPlantillaNoEnviable($tpl)) authFail(409, $motivo);
    if ($tpl['waba_id'] !== $linea['waba_id']) authFail(409, 'La plantilla es de otra cuenta de WhatsApp que la línea elegida');
    if (comPlantillaTieneEnlace($tpl)) comValidarDestino($c['enlace_destino'] ?? null);
    $enc = $tpl['encabezado'] ? json_decode($tpl['encabezado'], true) : null;
    if ($enc && $enc['tipo'] !== 'texto') {
        if (!$c['media_id']) authFail(409, 'Sube el ' . $enc['tipo'] . ' del encabezado');
        if ($c['media_subida_at'] && strtotime($c['media_subida_at']) < time() - 29 * 86400) authFail(409, 'El archivo del encabezado venció en Meta (30 días): vuelve a subirlo');
    }
    $valores = $c['valores'] ? (json_decode($c['valores'], true) ?: []) : [];
    $vars = json_decode($tpl['variables'] ?? '[]', true) ?: [];
    foreach ($vars as $v) if ($v['origen'] === 'manual' && trim((string)($valores[$v['n']] ?? '')) === '' && !$v['defecto']) authFail(409, "Escribe el valor de {{{$v['n']}}}");
    if ($enc && !empty($enc['variable']) && $enc['variable']['origen'] === 'manual' && trim((string)($valores['h1'] ?? '')) === '' && !$enc['variable']['defecto']) {
        authFail(409, 'Escribe el valor de la variable del encabezado');
    }
}

/** Envía la plantilla de la campaña a un número. Devuelve el resultado de comEnviar (+ 'omitido' si faltan datos). */
function comCampanaEnviarUno(mysqli $conn, array $c, array $tpl, array $linea, array $dest, bool $prueba = false): array
{
    $conv = comConversacionPara($conn, $linea, $dest['wa_id'], null);
    if (!empty($dest['id_contacto']) && $conv['id_contacto'] !== (int)$dest['id_contacto']) {
        crmExec($conn, 'UPDATE com_conversaciones SET id_contacto = ? WHERE id = ?', 'ii', [(int)$dest['id_contacto'], $conv['id']]);
        $conv['id_contacto'] = (int)$dest['id_contacto'];
    }
    // Una conversación nueva abierta por una campaña queda cerrada: se abre cuando el cliente responde.
    if ($conv['ultimo_mensaje_id'] === null && $conv['estado'] === 'bot') {
        crmExec($conn, "UPDATE com_conversaciones SET estado = 'cerrada', cerrada_at = CURRENT_TIMESTAMP WHERE id = ?", 'i', [$conv['id']]);
        $conv['estado'] = 'cerrada';
    }
    $valores = comPlantillaValores($conn, $tpl, $conv['id_contacto'], $dest['wa_id'], $c['valores'] ? (json_decode($c['valores'], true) ?: []) : []);
    if ($valores['faltan']) {
        return ['ok' => false, 'id' => null, 'clase' => 'omitido', 'codigo' => null,
            'error' => 'Faltan datos del contacto para ' . implode(', ', array_map(static fn($n) => $n === 'h1' ? 'el encabezado' : '{{' . $n . '}}', $valores['faltan']))];
    }
    $token = null;
    if (comPlantillaTieneEnlace($tpl)) $token = $dest['link_token'] ?? comCrearEnlace($conn, $c['id_sede'], (string)$c['enlace_destino'], $prueba ? null : (int)$c['id']);
    $enc = $tpl['encabezado'] ? json_decode($tpl['encabezado'], true) : null;
    $cat = strtolower((string)($tpl['categoria'] ?? $tpl['categoria_solicitada']));
    $r = comEnviar($conn, $conv, $linea, [
        'origen' => 'campana', 'id_campana' => $prueba ? null : (int)$c['id'], 'categoria' => $cat,
        'media' => $c['media_id'] ? ['key' => $c['media_key'], 'mime' => $c['media_mime'], 'nombre' => $c['media_nombre']] : [],
        'payload' => comPlantillaPayload($tpl, $valores, $c['media_id'], $c['media_nombre'], $token),
        'texto' => comPlantillaTexto($tpl, $valores),
        'contenido' => ['plantilla' => ['id' => (int)$tpl['id'], 'nombre' => $tpl['nombre'], 'idioma' => $tpl['idioma'], 'categoria' => $cat,
            'encabezado' => $enc ? ['tipo' => $enc['tipo']] : null, 'botones' => json_decode($tpl['botones'] ?? '[]', true) ?: []],
            'campana' => ['id' => (int)$c['id'], 'nombre' => $c['nombre'], 'prueba' => $prueba]],
    ]);
    if ($token && $r['id']) crmExec($conn, 'UPDATE com_enlaces SET id_mensaje = ? WHERE token = ?', 'is', [$r['id'], $token]);
    return $r;
}

/** Destinatarios de la campaña a partir de su audiencia (al lanzar). Devuelve cuántos quedaron. */
function comCampanaMaterializar(mysqli $conn, array $ctx, array $c, array $tpl): int
{
    $aud = comCampanaAudiencia($conn, $ctx, json_decode($c['audiencia'] ?? '{}', true) ?: [], strtolower((string)($tpl['categoria'] ?? $tpl['categoria_solicitada'])) === 'marketing');
    $dest = $aud['destinatarios'];
    if (!$dest) authFail(409, 'La audiencia no tiene contactos con WhatsApp');
    if (count($dest) > COM_CAMP_MAX) authFail(409, 'Máximo ' . COM_CAMP_MAX . ' destinatarios por campaña');
    $conTracking = comPlantillaTieneEnlace($tpl);
    $stmt = db_prepare_or_fail($conn, 'INSERT IGNORE INTO com_campana_destinatarios (id_campana, id_contacto, wa_id, nombre, link_token) VALUES (?, ?, ?, ?, ?)');
    $stmtE = $conTracking ? db_prepare_or_fail($conn, 'INSERT INTO com_enlaces (token, id_sede, destino, id_campana) VALUES (?, ?, ?, ?)') : null;
    $idC = (int)$c['id'];
    foreach ($dest as $d) {
        $tok = null;
        if ($stmtE) {
            $tok = bin2hex(random_bytes(12));
            $stmtE->bind_param('sisi', $tok, $ctx['id_sede'], $c['enlace_destino'], $idC);
            db_execute_or_fail($stmtE);
        }
        $nombre = mb_substr((string)$d['nombre'], 0, 190);
        $stmt->bind_param('iisss', $idC, $d['id_contacto'], $d['wa_id'], $nombre, $tok);
        db_execute_or_fail($stmt);
    }
    $stmt->close();
    if ($stmtE) $stmtE->close();
    return (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM com_campana_destinatarios WHERE id_campana = ?', 'i', [$idC])['n'];
}

/** Cupo de envíos iniciados por la empresa que le queda a la línea en 24 h (nivel de mensajes de Meta). */
function comCupoLinea(mysqli $conn, array $linea): int
{
    $limite = COM_CUPO_NIVEL[$linea['nivel_mensajes'] ?? ''] ?? 250;
    if ($limite === PHP_INT_MAX) return PHP_INT_MAX;
    $usados = (int)crmRow($conn,
        "SELECT COUNT(DISTINCT v.wa_id) AS n FROM com_mensajes m JOIN com_conversaciones v ON v.id = m.id_conversacion
          WHERE v.id_linea = ? AND m.tipo = 'template' AND m.direccion = 'saliente' AND m.estado <> 'fallido' AND m.created_at >= NOW() - INTERVAL 1 DAY",
        'i', [$linea['id']])['n'];
    return max(0, $limite - $usados);
}

/**
 * Worker: avanza las campañas. Programadas que ya tocan → enviando; esperando saldo/cupo → reintenta; enviando → un lote por campaña.
 * Devuelve cuántos destinatarios procesó (0 = nada que hacer).
 */
function comCampanasProcesar(mysqli $conn, int $limite): int
{
    crmExec($conn, "UPDATE com_campanas SET estado = 'enviando', iniciada_at = COALESCE(iniciada_at, CURRENT_TIMESTAMP)
                     WHERE estado = 'programada' AND programada_para <= NOW()");
    crmExec($conn, "UPDATE com_campanas SET estado = 'enviando', motivo_pausa = NULL
                     WHERE estado IN ('esperando_saldo', 'esperando_cupo') AND (reintentar_desde IS NULL OR reintentar_desde <= NOW())");
    $hechos = 0;
    foreach (crmRows($conn, "SELECT * FROM com_campanas WHERE estado = 'enviando' AND (reintentar_desde IS NULL OR reintentar_desde <= NOW()) ORDER BY iniciada_at, id") as $c) {
        if (time() >= $limite) break;
        $hechos += comCampanaLote($conn, $c, $limite);
    }
    return $hechos;
}

/** Envía un lote de una campaña. Devuelve cuántos destinatarios procesó. */
function comCampanaLote(mysqli $conn, array $c, int $limite): int
{
    $id = (int)$c['id'];
    $pausar = static function (string $estado, string $motivo, ?int $segundos = null) use ($conn, $id) {
        crmExec($conn, 'UPDATE com_campanas SET estado = ?, motivo_pausa = ?, reintentar_desde = ' . ($segundos ? 'NOW() + INTERVAL ? SECOND' : 'NULL') . ' WHERE id = ?',
            $segundos ? 'ssii' : 'ssi', $segundos ? [$estado, $motivo, $segundos, $id] : [$estado, $motivo, $id]);
    };
    $tpl = crmRow($conn, 'SELECT * FROM com_plantillas WHERE id = ?', 'i', [(int)$c['id_plantilla']]);
    $linea = comLinea($conn, (int)$c['id_linea'], (int)$c['id_sede']);
    if (!$linea || !$linea['token']) { $pausar('pausada', 'La línea está inactiva o sin token'); comCampanaAvisar($conn, $c, 'Campaña pausada', 'La línea está inactiva.'); return 0; }
    if (!$tpl || ($m = comPlantillaNoEnviable($tpl))) { $pausar('pausada', $m ?? 'Plantilla inexistente'); comCampanaAvisar($conn, $c, 'Campaña pausada', $m ?? 'La plantilla ya no existe.'); return 0; }
    $cat = strtolower((string)($tpl['categoria'] ?? $tpl['categoria_solicitada']));
    $cupo = comCupoLinea($conn, $linea);
    if ($cupo <= 0) { $pausar('esperando_cupo', 'Se alcanzó el límite de mensajes de 24 h de la línea en Meta', 1800); return 0; }

    $n = 0;
    $dests = crmRows($conn, "SELECT * FROM com_campana_destinatarios WHERE id_campana = ? AND estado = 'pendiente' ORDER BY id LIMIT ?", 'ii', [$id, min(COM_CAMP_LOTE, $cupo)]);
    foreach ($dests as $d) {
        if (time() >= $limite) break;
        if ($cat === 'marketing' && comEstaDeBaja($conn, (int)$c['id_sede'], $d['wa_id'])) {
            crmExec($conn, "UPDATE com_campana_destinatarios SET estado = 'omitido', error = 'Pidió no recibir marketing' WHERE id = ?", 'i', [(int)$d['id']]);
            $n++; continue;
        }
        $saldo = comPuedeEnviar($conn, (int)$c['id_sede'], $cat);
        if (!$saldo['ok']) {
            $pausar('esperando_saldo', 'Sin créditos: se reanuda sola al recargar', 300);
            if ($c['estado'] !== 'esperando_saldo') comCampanaAvisar($conn, $c, 'Campaña detenida: sin créditos', "La campaña «{$c['nombre']}» se detuvo por falta de créditos. Se reanuda sola al recargar.");
            return $n;
        }
        $r = comCampanaEnviarUno($conn, $c, $tpl, $linea, ['id_contacto' => $d['id_contacto'] !== null ? (int)$d['id_contacto'] : null, 'wa_id' => $d['wa_id'], 'link_token' => $d['link_token']]);
        $n++;
        if ($r['ok']) {
            crmExec($conn, "UPDATE com_campana_destinatarios SET estado = 'enviado', id_mensaje = ?, enviado_at = CURRENT_TIMESTAMP, error = NULL WHERE id = ?", 'ii', [$r['id'], (int)$d['id']]);
            continue;
        }
        switch ($r['clase']) {
            case 'limite':
                // Meta frenó los envíos: se reintenta este destinatario más tarde (el mensaje fallido queda en el hilo).
                crmExec($conn, 'UPDATE com_campana_destinatarios SET intentos = intentos + 1, error = ? WHERE id = ?', 'si', [mb_substr((string)$r['error'], 0, 255), (int)$d['id']]);
                $pausar('enviando', 'Meta pidió bajar la velocidad: se reintenta en un minuto', 60);
                return $n;
            case 'transitorio':
                if ((int)$d['intentos'] < 2) {
                    crmExec($conn, 'UPDATE com_campana_destinatarios SET intentos = intentos + 1, error = ? WHERE id = ?', 'si', [mb_substr((string)$r['error'], 0, 255), (int)$d['id']]);
                    continue 2;
                }
                // tercer intento: se da por fallido
            default:
                $estado = $r['clase'] === 'omitido' ? 'omitido' : 'fallido';
                crmExec($conn, 'UPDATE com_campana_destinatarios SET estado = ?, id_mensaje = ?, error = ? WHERE id = ?', 'sisi',
                    [$estado, $r['id'], mb_substr((string)$r['error'], 0, 255), (int)$d['id']]);
        }
    }
    $pend = (int)crmRow($conn, "SELECT COUNT(*) AS n FROM com_campana_destinatarios WHERE id_campana = ? AND estado = 'pendiente'", 'i', [$id])['n'];
    if ($pend === 0) {
        crmExec($conn, "UPDATE com_campanas SET estado = 'completada', completada_at = CURRENT_TIMESTAMP, motivo_pausa = NULL, reintentar_desde = NULL WHERE id = ? AND estado = 'enviando'", 'i', [$id]);
        $k = comCampanaConteos($conn, $id);
        comCampanaAvisar($conn, $c, 'Campaña enviada', "«{$c['nombre']}»: {$k['enviados']} enviados, {$k['fallidos']} fallidos, {$k['omitidos']} omitidos.");
    } elseif ($c['reintentar_desde'] !== null) {
        crmExec($conn, 'UPDATE com_campanas SET reintentar_desde = NULL, motivo_pausa = NULL WHERE id = ?', 'i', [$id]);
    }
    return $n;
}

function comCampanaAvisar(mysqli $conn, array $c, string $titulo, string $cuerpo): void
{
    $ids = $c['created_by'] ? [(int)$c['created_by']] : [];
    notifyUsers($conn, (int)$c['id_sede'], $ids, $titulo, $cuerpo, '/m/comunicaciones/campanas?c=' . $c['id'], 'com_campana', ['id_campana' => (int)$c['id']]);
}

/** Hook de comAplicarEstado: el estado del mensaje pasa al destinatario (nunca retrocede; fallido con su motivo). */
function comCampanaTrasEstado(mysqli $conn, int $idMensaje): void
{
    $m = crmRow($conn, 'SELECT estado, error_detalle FROM com_mensajes WHERE id = ?', 'i', [$idMensaje]);
    $d = crmRow($conn, 'SELECT id, estado FROM com_campana_destinatarios WHERE id_mensaje = ?', 'i', [$idMensaje]);
    if (!$m || !$d || in_array($d['estado'], ['fallido', 'omitido'], true)) return;
    if ($m['estado'] === 'fallido') {
        crmExec($conn, "UPDATE com_campana_destinatarios SET estado = 'fallido', error = ? WHERE id = ?", 'si', [mb_substr((string)$m['error_detalle'], 0, 255), (int)$d['id']]);
    } elseif (isset(COM_RANGO_DEST[$m['estado']]) && COM_RANGO_DEST[$m['estado']] > (COM_RANGO_DEST[$d['estado']] ?? 0)) {
        crmExec($conn, 'UPDATE com_campana_destinatarios SET estado = ? WHERE id = ?', 'si', [$m['estado'], (int)$d['id']]);
    }
}

/** Hook de un mensaje entrante: marca «respondió» en las campañas recientes (7 días) que le llegaron a esa conversación. */
function comCampanaRespuesta(mysqli $conn, int $idConversacion): void
{
    crmExec($conn,
        "UPDATE com_campana_destinatarios d JOIN com_mensajes m ON m.id = d.id_mensaje SET d.respondio_at = CURRENT_TIMESTAMP
          WHERE m.id_conversacion = ? AND d.respondio_at IS NULL AND d.estado IN ('enviado','entregado','leido') AND d.enviado_at >= NOW() - INTERVAL 7 DAY",
        'i', [$idConversacion]);
}
