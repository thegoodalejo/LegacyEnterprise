<?php
// Cliente de la Graph API de Meta (WhatsApp Cloud API): llamadas, armado de mensajes y clasificación de errores.
// Reglas: el token va SIEMPRE en el encabezado Authorization (nunca en la URL ni en logs); cada llamada sabe de qué línea es.
// Fuera de producción, COM_GRAPH_FAKE=1 responde como Meta sin salir a internet (pruebas locales; ver comGraphFake()).

const COM_GRAPH_BASE = 'https://graph.facebook.com';
const COM_GRAPH_VERSION = 'v23.0';

// Errores de Meta (https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes).
const COM_ERR_PERMANENTES = [100, 131008, 131009, 131021, 131026, 131047, 131050, 131051, 131052, 131053, 132000, 132001, 132005, 132007,
    132012, 132015, 132016, 132068, 132069, 133010, 470, 368, 190, 10, 200];
const COM_ERR_LIMITE = [4, 80007, 130429, 131048, 131056];

/** Modo de prueba: solo fuera de producción y con COM_GRAPH_FAKE=1. */
function comGraphFakeActivo(): bool
{
    return getenv('COM_GRAPH_FAKE') === '1' && app_env() !== 'production';
}

/**
 * Llamada a la Graph API. $json: cuerpo JSON (POST); $multipart: campos de formulario (subir medios; CURLFile permitido).
 * Devuelve ['ok' => bool, 'http' => int, 'data' => array]. Nunca lanza.
 */
function comGraph(string $metodo, string $ruta, ?string $token, ?string $version = null, ?array $json = null, ?array $multipart = null, int $timeout = 25): array
{
    $version = $version ?: COM_GRAPH_VERSION;
    if (comGraphFakeActivo()) return comGraphFake($metodo, $ruta, $json, $multipart);
    if ($token === null || $token === '') return ['ok' => false, 'http' => 0, 'data' => ['error' => ['message' => 'La línea no tiene token (o falta COM_SECRET_KEY en el servidor)', 'code' => 190]]];

    $ch = curl_init(COM_GRAPH_BASE . '/' . $version . '/' . ltrim($ruta, '/'));
    $headers = ['Authorization: Bearer ' . $token];
    $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_CUSTOMREQUEST => $metodo];
    if ($json !== null) {
        $opts[CURLOPT_POSTFIELDS] = json_encode($json, JSON_UNESCAPED_UNICODE);
        $headers[] = 'Content-Type: application/json';
    } elseif ($multipart !== null) {
        $opts[CURLOPT_POSTFIELDS] = $multipart;
    }
    $opts[CURLOPT_HTTPHEADER] = $headers;
    curl_setopt_array($ch, $opts);
    $resp = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($resp === false) return ['ok' => false, 'http' => 0, 'data' => ['error' => ['message' => 'Sin conexión con Meta: ' . $err]]];
    $data = json_decode((string)$resp, true);
    if (!is_array($data)) $data = [];
    return ['ok' => $http >= 200 && $http < 300 && !isset($data['error']), 'http' => $http, 'data' => $data];
}

/**
 * Respuestas simuladas de Meta (solo pruebas). Un texto con «[[FALLA:<código>]]» simula ese error de Meta.
 * Deja cada llamada en <temp>/com_graph_fake.log (método, ruta y cuerpo) para que las pruebas la revisen.
 */
function comGraphFake(string $metodo, string $ruta, ?array $json, ?array $multipart): array
{
    $ruta = '/' . ltrim($ruta, '/');
    @file_put_contents(sys_get_temp_dir() . '/com_graph_fake.log',
        json_encode(['t' => date('c'), 'metodo' => $metodo, 'ruta' => $ruta, 'json' => $json, 'multipart' => $multipart ? array_keys($multipart) : null], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);
    $ok = static fn(array $d) => ['ok' => true, 'http' => 200, 'data' => $d];
    $falla = static fn(int $code, string $msg) => ['ok' => false, 'http' => 400, 'data' => ['error' => ['message' => $msg, 'code' => $code, 'error_data' => ['details' => $msg]]]];

    $blob = json_encode($json, JSON_UNESCAPED_UNICODE) ?: '';
    if (preg_match('/\[\[FALLA:(\d+)\]\]/', $blob, $m)) return $falla((int)$m[1], 'Error simulado ' . $m[1]);

    if ($metodo === 'POST' && str_ends_with($ruta, '/messages')) {
        return $ok(['messaging_product' => 'whatsapp', 'contacts' => [['input' => $json['to'] ?? '', 'wa_id' => $json['to'] ?? '']],
            'messages' => [['id' => 'wamid.FAKE' . bin2hex(random_bytes(10))]]]);
    }
    if ($metodo === 'POST' && str_ends_with($ruta, '/subscribed_apps')) return $ok(['success' => true]);
    if ($metodo === 'GET' && str_ends_with($ruta, '/subscribed_apps')) return $ok(['data' => [['whatsapp_business_api_data' => ['id' => 'fake']]]]);
    if ($metodo === 'POST' && str_ends_with($ruta, '/message_templates')) {
        return $ok(['id' => 'fake-tpl-' . bin2hex(random_bytes(6)), 'status' => 'PENDING', 'category' => $json['category'] ?? 'UTILITY']);
    }
    if ($metodo === 'DELETE' && str_contains($ruta, '/message_templates')) return $ok(['success' => true]);
    if ($metodo === 'GET' && str_contains($ruta, '/message_templates')) return $ok(['data' => []]);
    if ($metodo === 'POST' && str_ends_with($ruta, '/media')) return $ok(['id' => 'fake-media-' . bin2hex(random_bytes(6))]);
    if ($metodo === 'POST' && preg_match('#^/\d+$#', $ruta)) return $ok(['success' => true]);   // editar plantilla
    if ($metodo === 'GET' && preg_match('#^/(\d+)#', $ruta, $mm)) {
        return $ok(['id' => $mm[1], 'verified_name' => 'Línea de prueba', 'display_phone_number' => '+57 300 000 0000',
            'quality_rating' => 'GREEN', 'messaging_limit_tier' => 'TIER_1K', 'code_verification_status' => 'VERIFIED']);
    }
    return $ok(['success' => true]);
}

// ─── Mensajes (cuerpo de POST /{phone_number_id}/messages sin messaging_product ni to) ────────────────────────────

function comPayloadTexto(string $texto): array
{
    return ['type' => 'text', 'text' => ['body' => $texto, 'preview_url' => (bool)preg_match('#https?://#i', $texto)]];
}

/** Botones de respuesta (máx. 3; título ≤ 20). $botones = [['id' => …, 'titulo' => …]]. */
function comPayloadBotones(string $texto, array $botones, ?string $encabezado = null, ?string $pie = null): array
{
    $i = ['type' => 'button', 'body' => ['text' => $texto], 'action' => ['buttons' => array_map(
        static fn($b) => ['type' => 'reply', 'reply' => ['id' => (string)$b['id'], 'title' => mb_substr((string)$b['titulo'], 0, 20)]],
        array_slice($botones, 0, 3))]];
    if ($encabezado) $i['header'] = ['type' => 'text', 'text' => mb_substr($encabezado, 0, 60)];
    if ($pie) $i['footer'] = ['text' => mb_substr($pie, 0, 60)];
    return ['type' => 'interactive', 'interactive' => $i];
}

/** Lista (máx. 10 filas; título ≤ 24, descripción ≤ 72, texto del botón ≤ 20). $filas = [['id','titulo','descripcion'?]]. */
function comPayloadLista(string $texto, string $boton, array $filas, ?string $encabezado = null, ?string $pie = null): array
{
    $rows = array_map(static function ($f) {
        $r = ['id' => (string)$f['id'], 'title' => mb_substr((string)$f['titulo'], 0, 24)];
        if (!empty($f['descripcion'])) $r['description'] = mb_substr((string)$f['descripcion'], 0, 72);
        return $r;
    }, array_slice($filas, 0, 10));
    $i = ['type' => 'list', 'body' => ['text' => $texto], 'action' => ['button' => mb_substr($boton ?: 'Ver opciones', 0, 20), 'sections' => [['title' => 'Opciones', 'rows' => $rows]]]];
    if ($encabezado) $i['header'] = ['type' => 'text', 'text' => mb_substr($encabezado, 0, 60)];
    if ($pie) $i['footer'] = ['text' => mb_substr($pie, 0, 60)];
    return ['type' => 'interactive', 'interactive' => $i];
}

/** Medio ya subido a Meta (id) — image, audio, video, document, sticker. */
function comPayloadMedia(string $tipo, string $mediaId, ?string $caption = null, ?string $filename = null): array
{
    $m = ['id' => $mediaId];
    if ($caption !== null && $caption !== '' && in_array($tipo, ['image', 'video', 'document'], true)) $m['caption'] = $caption;
    if ($filename && $tipo === 'document') $m['filename'] = $filename;
    return ['type' => $tipo, $tipo => $m];
}

function comPayloadPlantilla(string $nombre, string $idioma, array $components): array
{
    $t = ['name' => $nombre, 'language' => ['code' => $idioma]];
    if ($components) $t['components'] = $components;
    return ['type' => 'template', 'template' => $t];
}

// ─── Errores ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** 'ok' | 'permanente' (no reintentar) | 'limite' (pausar y reintentar) | 'transitorio' (reintentar con espera). */
function comClasificarError(array $res): string
{
    if ($res['ok']) return 'ok';
    $code = (int)($res['data']['error']['code'] ?? 0);
    if ($res['http'] === 429 || in_array($code, COM_ERR_LIMITE, true)) return 'limite';
    if (in_array($code, COM_ERR_PERMANENTES, true)) return 'permanente';
    if ($res['http'] >= 400 && $res['http'] < 500 && $res['http'] !== 408 && $code === 0) return 'permanente';
    return 'transitorio';
}

/** [código, texto para mostrar] de una respuesta con error. */
function comErrorDe(array $res): array
{
    $e = $res['data']['error'] ?? [];
    $code = isset($e['code']) ? (int)$e['code'] : null;
    $txt = COM_ERR_TEXTOS[$code] ?? trim(($e['error_data']['details'] ?? '') ?: ($e['message'] ?? 'Error de WhatsApp'));
    return [$code, mb_substr($txt, 0, 500)];
}

const COM_ERR_TEXTOS = [
    131026 => 'El número no tiene WhatsApp o no puede recibir el mensaje',
    131047 => 'Pasaron más de 24 h desde el último mensaje del cliente: solo se puede enviar una plantilla',
    131050 => 'El cliente pidió no recibir mensajes de marketing',
    131051 => 'Tipo de mensaje no soportado',
    131048 => 'Meta limitó los envíos de esta línea por reportes de spam',
    131056 => 'Demasiados mensajes seguidos al mismo número: se reintentará',
    130429 => 'Se alcanzó el límite de envío por segundo: se reintentará',
    80007  => 'Se alcanzó el límite de uso de la cuenta de WhatsApp: se reintentará',
    132000 => 'La cantidad de variables no coincide con la plantilla',
    132001 => 'La plantilla no existe en ese idioma o no está aprobada',
    132005 => 'El texto de la plantilla con las variables es demasiado largo',
    132007 => 'La plantilla infringe las políticas de Meta',
    132015 => 'La plantilla está pausada por baja calidad',
    132016 => 'La plantilla está deshabilitada por baja calidad',
    133010 => 'El número de la línea no está registrado en WhatsApp',
    190    => 'El token de la línea venció o no es válido',
    368    => 'Meta bloqueó temporalmente la cuenta por infringir sus políticas',
    470    => 'Fuera de la ventana de 24 h: solo se puede enviar una plantilla',
];

// ─── Medios ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Descarga un medio entrante de Meta a un archivo temporal. Devuelve ['tmp', 'mime', 'bytes'] o null.
 * Máx. 100 MB (límite de WhatsApp para documentos).
 */
function comDescargarMedia(array $linea, string $mediaId): ?array
{
    if (comGraphFakeActivo()) return null;
    $info = comGraph('GET', '/' . rawurlencode($mediaId), $linea['token'], $linea['graph_version']);
    $url = $info['data']['url'] ?? null;
    if (!$info['ok'] || !$url) return null;
    $tmp = tempnam(sys_get_temp_dir(), 'wam');
    $fh = fopen($tmp, 'wb');
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_FILE => $fh, CURLOPT_TIMEOUT => 120, CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $linea['token']], CURLOPT_MAXFILESIZE => 100 * 1024 * 1024]);
    $ok = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    fclose($fh);
    if (!$ok || $http >= 300 || filesize($tmp) === 0) { @unlink($tmp); return null; }
    return ['tmp' => $tmp, 'mime' => (string)($info['data']['mime_type'] ?? ''), 'bytes' => filesize($tmp)];
}

/** Sube un archivo a Meta (POST /{phone_number_id}/media) y devuelve su id, o [null, error]. */
function comSubirMediaMeta(array $linea, string $path, string $mime, string $nombre): array
{
    $res = comGraph('POST', '/' . $linea['phone_number_id'] . '/media', $linea['token'], $linea['graph_version'], null,
        ['messaging_product' => 'whatsapp', 'type' => $mime, 'file' => new CURLFile($path, $mime, $nombre)], 120);
    if (!$res['ok'] || empty($res['data']['id'])) return [null, comErrorDe($res)[1]];
    return [(string)$res['data']['id'], null];
}

/** Tipo de mensaje de WhatsApp para un MIME (lo que acepta Meta en cada tipo). */
function comTipoPorMime(string $mime): ?string
{
    if (in_array($mime, ['image/jpeg', 'image/png'], true)) return 'image';
    if (in_array($mime, ['video/mp4', 'video/3gpp'], true)) return 'video';
    if (in_array($mime, ['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg'], true)) return 'audio';
    if (in_array($mime, ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/csv'], true)) return 'document';
    return null;
}
