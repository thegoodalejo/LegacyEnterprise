<?php
// Plantillas de mensaje de Meta: validación del constructor, componentes para crearlas en Meta, envío a un contacto, eventos del webhook
// (estado, reclasificación de categoría, calidad) y sincronización. Diseño: docs/modulos/comunicaciones.md → «Plantillas».

require_once __DIR__ . '/_com.php';
require_once __DIR__ . '/_com_categoria.php';

const COM_TPL_IDIOMAS = ['es', 'es_AR', 'es_CO', 'es_ES', 'es_MX', 'es_PE', 'en', 'en_US', 'en_GB', 'pt_BR'];
const COM_TPL_CATEGORIAS = ['UTILITY', 'MARKETING'];
const COM_TPL_ENCABEZADOS = ['ninguno', 'texto', 'imagen', 'video', 'documento'];
const COM_TPL_ORIGENES = ['nombre', 'primer_nombre', 'telefono', 'correo', 'fijo', 'manual'];
const COM_TPL_ESTADO_META = ['APPROVED' => 'aprobada', 'REJECTED' => 'rechazada', 'PENDING' => 'pendiente', 'IN_APPEAL' => 'pendiente',
    'PAUSED' => 'pausada', 'DISABLED' => 'deshabilitada', 'PENDING_DELETION' => 'eliminada', 'DELETED' => 'eliminada', 'REINSTATED' => 'aprobada',
    'LIMIT_EXCEEDED' => 'rechazada', 'ARCHIVED' => 'eliminada'];
const COM_TPL_MIME_ENCABEZADO = ['imagen' => ['image/jpeg', 'image/png'], 'video' => ['video/mp4'], 'documento' => ['application/pdf']];

/** URL de seguimiento de los botones de enlace (fija: la llevan las plantillas aprobadas). */
function comUrlSeguimiento(): string
{
    return comUrlApi() . '/comunicaciones/r.php?t=';
}

/** Nombre de Meta: minúsculas sin tildes, números y _ (máx. 100). */
function comNombrePlantilla(string $s): string
{
    $n = comNormalizar($s);
    $n = preg_replace('/[^a-z0-9]+/', '_', strtr($n, ['ñ' => 'n'])) ?? '';
    return substr(trim(preg_replace('/_+/', '_', $n) ?? '', '_'), 0, 100);
}

/** Números de variable {{n}} de un texto, en orden de aparición. */
function comVariablesDe(string $t): array
{
    preg_match_all('/\{\{\s*(\d+)\s*\}\}/', $t, $m);
    return array_map('intval', $m[1]);
}

/**
 * Reglas de Meta para un texto con variables: 1..n seguidas y sin repetir. En el CUERPO además: ni al inicio ni al final, no pegadas y con texto
 * suficiente (el encabezado admite una variable en cualquier lugar: «Pedido {{1}}»).
 */
function comValidarTextoVariables(string $t, string $que, int $maxVars, bool $esCuerpo = true): void
{
    $vs = comVariablesDe($t);
    if (count($vs) > $maxVars) authFail(400, "$que: máximo $maxVars variable" . ($maxVars === 1 ? '' : 's'));
    if (!$vs) return;
    if ($vs !== range(1, count($vs))) authFail(400, "$que: las variables van numeradas en orden, sin saltos ni repetidas ({{1}}, {{2}}…)");
    if (!$esCuerpo) return;
    $trim = trim($t);
    if (preg_match('/^\{\{\s*\d+\s*\}\}/', $trim) || preg_match('/\{\{\s*\d+\s*\}\}[\s.!?¡¿,:;]*$/u', $trim)) {
        authFail(400, "$que: Meta rechaza plantillas que empiezan o terminan con una variable");
    }
    if (preg_match('/\}\}\s*\{\{/', $t)) authFail(400, "$que: dos variables seguidas necesitan texto entre ellas");
    $palabras = count(preg_split('/\s+/u', trim(preg_replace('/\{\{\s*\d+\s*\}\}/', ' ', $t) ?? ''), -1, PREG_SPLIT_NO_EMPTY));
    if ($palabras < 2 * count($vs) + 1) authFail(400, "$que: demasiadas variables para lo corto del texto (Meta lo rechaza)");
}

/** Valida una definición de variable (origen del valor al enviar). */
function comVariableDef(mysqli $conn, array $ctx, array $v, int $n, string $que): array
{
    $ej = trim((string)($v['ejemplo'] ?? ''));
    if ($ej === '' || mb_strlen($ej) > 100) authFail(400, "$que: la variable {{{$n}}} necesita un ejemplo (máx. 100)");
    $origen = (string)($v['origen'] ?? 'manual');
    if (!in_array($origen, COM_TPL_ORIGENES, true) && !preg_match('/^campo:\d+$/', $origen)) authFail(400, "$que: origen inválido para {{{$n}}}");
    if (str_starts_with($origen, 'campo:') && !crmRow($conn, "SELECT 1 AS ok FROM crm_campos_personalizados WHERE id = ? AND id_empresa = ? AND aplica_a = 'persona'",
        'ii', [(int)substr($origen, 6), $ctx['id_empresa']])) authFail(400, "$que: el campo de {{{$n}}} no existe");
    $valor = mb_substr(trim((string)($v['valor'] ?? '')), 0, 200);
    if ($origen === 'fijo' && $valor === '') authFail(400, "$que: escribe el texto fijo de {{{$n}}}");
    return ['n' => $n, 'ejemplo' => $ej, 'origen' => $origen, 'valor' => $valor !== '' ? $valor : null,
        'defecto' => ($d = mb_substr(trim((string)($v['defecto'] ?? '')), 0, 100)) !== '' ? $d : null];
}

/**
 * Valida y normaliza una plantilla del constructor. $src: id_linea, nombre, idioma, categoria, encabezado (JSON), cuerpo, pie,
 * botones (JSON), variables (JSON). Devuelve la fila lista para guardar.
 */
function comPlantillaParsear(mysqli $conn, array $ctx, array $src): array
{
    $linea = comLineaDeSede($conn, $ctx, (int)($src['id_linea'] ?? 0));
    $nombre = comNombrePlantilla((string)($src['nombre'] ?? ''));
    if ($nombre === '') authFail(400, 'El nombre es obligatorio (letras y números)');
    $idioma = (string)($src['idioma'] ?? 'es');
    if (!in_array($idioma, COM_TPL_IDIOMAS, true)) authFail(400, 'Idioma no soportado');
    $cat = strtoupper((string)($src['categoria'] ?? 'UTILITY'));
    if (!in_array($cat, COM_TPL_CATEGORIAS, true)) authFail(400, 'Categoría inválida (utilidad o marketing)');

    $enc = is_array($src['encabezado'] ?? null) ? $src['encabezado'] : [];
    $encTipo = (string)($enc['tipo'] ?? 'ninguno');
    if (!in_array($encTipo, COM_TPL_ENCABEZADOS, true)) authFail(400, 'Tipo de encabezado inválido');
    $encabezado = null;
    if ($encTipo === 'texto') {
        $t = trim((string)($enc['texto'] ?? ''));
        if ($t === '' || mb_strlen($t) > 60) authFail(400, 'El encabezado de texto lleva entre 1 y 60 caracteres');
        comValidarTextoVariables($t, 'Encabezado', 1, false);
        $encabezado = ['tipo' => 'texto', 'texto' => $t];
        if (comVariablesDe($t)) $encabezado['variable'] = comVariableDef($conn, $ctx, is_array($enc['variable'] ?? null) ? $enc['variable'] : [], 1, 'Encabezado');
    } elseif ($encTipo !== 'ninguno') {
        $encabezado = ['tipo' => $encTipo];
    }

    $cuerpo = trim((string)($src['cuerpo'] ?? ''));
    if ($cuerpo === '') authFail(400, 'El cuerpo del mensaje es obligatorio');
    if (mb_strlen($cuerpo) > 1024) authFail(400, 'El cuerpo supera los 1024 caracteres de Meta');
    comValidarTextoVariables($cuerpo, 'Cuerpo', 20);
    $defs = [];
    foreach (is_array($src['variables'] ?? null) ? $src['variables'] : [] as $v) $defs[(int)($v['n'] ?? 0)] = $v;
    $variables = [];
    foreach (comVariablesDe($cuerpo) as $n) $variables[] = comVariableDef($conn, $ctx, $defs[$n] ?? [], $n, 'Cuerpo');

    $pie = trim((string)($src['pie'] ?? ''));
    if (mb_strlen($pie) > 60) authFail(400, 'El pie lleva máximo 60 caracteres');
    if (comVariablesDe($pie)) authFail(400, 'El pie no admite variables');

    $botones = [];
    $resp = 0; $enl = 0;
    foreach (is_array($src['botones'] ?? null) ? $src['botones'] : [] as $b) {
        $tipo = (string)($b['tipo'] ?? '');
        $txt = trim((string)($b['texto'] ?? ''));
        if ($txt === '' || mb_strlen($txt) > 25) authFail(400, 'El texto de cada botón lleva entre 1 y 25 caracteres');
        if ($tipo === 'respuesta') $resp++;
        elseif ($tipo === 'enlace') $enl++;
        else authFail(400, 'Tipo de botón inválido');
        $botones[] = ['tipo' => $tipo, 'texto' => $txt];
    }
    if ($resp > 3 || $enl > 1) authFail(400, 'Máximo 3 botones de respuesta y 1 de enlace');
    // Meta exige agrupar: primero las respuestas rápidas, luego el enlace.
    usort($botones, static fn($a, $b) => ($a['tipo'] === 'enlace') <=> ($b['tipo'] === 'enlace'));
    if (count(array_unique(array_map(static fn($b) => comNormalizar($b['texto']), $botones))) !== count($botones)) authFail(400, 'Hay botones con el mismo texto');

    return ['linea' => $linea, 'nombre' => $nombre, 'idioma' => $idioma, 'categoria_solicitada' => $cat, 'encabezado' => $encabezado,
        'cuerpo' => $cuerpo, 'pie' => $pie !== '' ? $pie : null, 'botones' => $botones, 'variables' => $variables];
}

/** Revisión de categoría de una plantilla parseada o guardada. */
function comPlantillaRevision(array $t): array
{
    $enc = is_string($t['encabezado'] ?? null) ? json_decode($t['encabezado'], true) : ($t['encabezado'] ?? null);
    $bot = is_string($t['botones'] ?? null) ? json_decode($t['botones'], true) : ($t['botones'] ?? []);
    return comRevisarCategoria(['encabezado' => $enc['texto'] ?? null, 'cuerpo' => $t['cuerpo'], 'pie' => $t['pie'] ?? null,
        'botones' => array_column($bot ?: [], 'texto')]);
}

/** Fila de com_plantillas para el frontend (JSON decodificados). */
function comPlantillaPublica(array $r): array
{
    foreach (['encabezado', 'botones', 'variables', 'revision'] as $k) $r[$k] = $r[$k] ? json_decode($r[$k], true) : null;
    foreach (['id', 'id_sede', 'id_linea', 'created_by', 'updated_by'] as $k) if (isset($r[$k])) $r[$k] = (int)$r[$k];
    $r['botones'] = $r['botones'] ?? [];
    $r['variables'] = $r['variables'] ?? [];
    $r['reclasificada'] = $r['reclasificada_at'] !== null;
    $r['url_seguimiento'] = comUrlSeguimiento();
    return $r;
}

function comPlantilla(mysqli $conn, int $idSede, int $id): ?array
{
    return crmRow($conn, 'SELECT p.*, l.nombre AS linea_nombre, COALESCE(u.nombre, u.email) AS creada_por FROM com_plantillas p
                            JOIN com_lineas l ON l.id = p.id_linea LEFT JOIN le_usuarios u ON u.id = p.created_by WHERE p.id = ? AND p.id_sede = ?', 'ii', [$id, $idSede]);
}

/** Componentes para crear/editar la plantilla en Meta. $handle: el del ejemplo del encabezado multimedia (subida reanudable). */
function comPlantillaComponentesMeta(array $t, ?string $handle): array
{
    $enc = is_string($t['encabezado']) ? json_decode($t['encabezado'], true) : $t['encabezado'];
    $vars = is_string($t['variables']) ? json_decode($t['variables'], true) : $t['variables'];
    $bots = is_string($t['botones']) ? json_decode($t['botones'], true) : $t['botones'];
    $c = [];
    if ($enc && $enc['tipo'] === 'texto') {
        $h = ['type' => 'HEADER', 'format' => 'TEXT', 'text' => $enc['texto']];
        if (!empty($enc['variable'])) $h['example'] = ['header_text' => [$enc['variable']['ejemplo']]];
        $c[] = $h;
    } elseif ($enc) {
        $c[] = ['type' => 'HEADER', 'format' => ['imagen' => 'IMAGE', 'video' => 'VIDEO', 'documento' => 'DOCUMENT'][$enc['tipo']], 'example' => ['header_handle' => [$handle]]];
    }
    $b = ['type' => 'BODY', 'text' => $t['cuerpo']];
    if ($vars) $b['example'] = ['body_text' => [array_column($vars, 'ejemplo')]];
    $c[] = $b;
    if (!empty($t['pie'])) $c[] = ['type' => 'FOOTER', 'text' => $t['pie']];
    if ($bots) {
        $c[] = ['type' => 'BUTTONS', 'buttons' => array_map(static fn($x) => $x['tipo'] === 'enlace'
            ? ['type' => 'URL', 'text' => $x['texto'], 'url' => comUrlSeguimiento() . '{{1}}', 'example' => [comUrlSeguimiento() . 'ejemplo0123456789abcdef']]
            : ['type' => 'QUICK_REPLY', 'text' => $x['texto']], $bots)];
    }
    return $c;
}

/** Subida reanudable de Meta (ejemplo del encabezado multimedia al crear la plantilla). Devuelve [handle, error]. */
function comSubirEjemploPlantilla(array $linea, string $path, string $mime, string $nombre): array
{
    if (comGraphFakeActivo()) return ['fake-handle-' . bin2hex(random_bytes(4)), null];
    $appId = $linea['meta_app_id'] ?? '';
    if (!$appId || !$linea['token']) return [null, 'La línea no tiene app o token'];
    $ses = comGraph('POST', '/' . $appId . '/uploads?' . http_build_query(['file_name' => $nombre, 'file_length' => filesize($path), 'file_type' => $mime]),
        $linea['token'], $linea['graph_version'], []);
    $idSesion = $ses['data']['id'] ?? null;
    if (!$ses['ok'] || !$idSesion) return [null, comErrorDe($ses)[1]];
    $ch = curl_init(COM_GRAPH_BASE . '/' . $linea['graph_version'] . '/' . $idSesion);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 120, CURLOPT_POSTFIELDS => file_get_contents($path),
        CURLOPT_HTTPHEADER => ['Authorization: OAuth ' . $linea['token'], 'file_offset: 0', 'Content-Type: application/octet-stream']]);
    $resp = json_decode((string)curl_exec($ch), true);
    curl_close($ch);
    return !empty($resp['h']) ? [(string)$resp['h'], null] : [null, $resp['error']['message'] ?? 'No se pudo subir el ejemplo a Meta'];
}

/**
 * Valores de las variables de una plantilla para un contacto. $manual: [n => valor] (y 'h1' para el encabezado) escritos a mano.
 * Devuelve ['cuerpo' => [n => valor], 'encabezado' => ?valor, 'faltan' => [n…]] (faltan: vacías sin valor por defecto).
 */
function comPlantillaValores(mysqli $conn, array $tpl, ?int $idContacto, string $waId, array $manual = []): array
{
    static $cache = [];
    $c = $cache[$idContacto ?? 0] ??= ($idContacto ? crmRow($conn,
        'SELECT c.nombre_completo, p.nombres, p.correo FROM crm_contactos c LEFT JOIN crm_contactos_personas p ON p.id = c.id WHERE c.id = ?', 'i', [$idContacto]) : null);
    $resolver = static function (array $def, string $clave) use ($conn, $c, $idContacto, $waId, $manual) {
        $o = $def['origen'];
        $v = match (true) {
            $o === 'nombre' => $c['nombre_completo'] ?? '',
            $o === 'primer_nombre' => preg_split('/\s+/u', trim((string)($c['nombres'] ?? $c['nombre_completo'] ?? '')))[0] ?? '',
            $o === 'telefono' => $waId !== '' ? '+' . $waId : '',
            $o === 'correo' => $c['correo'] ?? '',
            $o === 'fijo' => $def['valor'] ?? '',
            str_starts_with($o, 'campo:') => $idContacto ? (string)(crmRow($conn,
                'SELECT COALESCE(valor_texto, CAST(valor_entero AS CHAR), CAST(valor_decimal AS CHAR), DATE_FORMAT(valor_fecha, \'%d/%m/%Y\'),
                        IF(valor_booleano IS NULL, NULL, IF(valor_booleano = 1, \'Sí\', \'No\'))) AS v
                   FROM crm_campos_valores WHERE id_contacto = ? AND id_campo = ?', 'ii', [$idContacto, (int)substr($o, 6)])['v'] ?? '') : '',
            default => (string)($manual[$clave] ?? ''),
        };
        $v = trim(preg_replace('/\s+/u', ' ', (string)$v) ?? '');   // Meta rechaza saltos de línea y tabs en los parámetros
        return $v !== '' ? mb_substr($v, 0, 1000) : ($def['defecto'] ?? '');
    };
    $vars = is_string($tpl['variables']) ? (json_decode($tpl['variables'], true) ?: []) : ($tpl['variables'] ?? []);
    $enc = is_string($tpl['encabezado']) ? json_decode($tpl['encabezado'], true) : $tpl['encabezado'];
    $out = ['cuerpo' => [], 'encabezado' => null, 'faltan' => []];
    foreach ($vars as $d) {
        $out['cuerpo'][$d['n']] = $resolver($d, (string)$d['n']);
        if ($out['cuerpo'][$d['n']] === '') $out['faltan'][] = (string)$d['n'];
    }
    if (!empty($enc['variable'])) {
        $out['encabezado'] = $resolver($enc['variable'], 'h1');
        if ($out['encabezado'] === '') $out['faltan'][] = 'h1';
    }
    return $out;
}

/** Texto como lo verá el cliente (para el hilo y la vista previa). */
function comPlantillaTexto(array $tpl, array $valores): string
{
    $enc = is_string($tpl['encabezado']) ? json_decode($tpl['encabezado'], true) : $tpl['encabezado'];
    $cuerpo = preg_replace_callback('/\{\{\s*(\d+)\s*\}\}/', static fn($m) => $valores['cuerpo'][(int)$m[1]] ?? '', $tpl['cuerpo']) ?? $tpl['cuerpo'];
    $partes = [];
    if ($enc && $enc['tipo'] === 'texto') $partes[] = '*' . (preg_replace('/\{\{\s*1\s*\}\}/', (string)($valores['encabezado'] ?? ''), $enc['texto']) ?? $enc['texto']) . '*';
    $partes[] = $cuerpo;
    if (!empty($tpl['pie'])) $partes[] = '_' . $tpl['pie'] . '_';
    return implode("\n\n", $partes);
}

/**
 * Payload de envío (type template). $mediaId: medio del encabezado ya subido a Meta; $token: el del enlace de seguimiento.
 */
function comPlantillaPayload(array $tpl, array $valores, ?string $mediaId, ?string $mediaNombre, ?string $token): array
{
    $enc = is_string($tpl['encabezado']) ? json_decode($tpl['encabezado'], true) : $tpl['encabezado'];
    $bots = is_string($tpl['botones']) ? (json_decode($tpl['botones'], true) ?: []) : ($tpl['botones'] ?? []);
    $c = [];
    if ($enc && $enc['tipo'] === 'texto' && !empty($enc['variable'])) {
        $c[] = ['type' => 'header', 'parameters' => [['type' => 'text', 'text' => (string)$valores['encabezado']]]];
    } elseif ($enc && $enc['tipo'] !== 'texto') {
        $t = ['imagen' => 'image', 'video' => 'video', 'documento' => 'document'][$enc['tipo']];
        $m = ['id' => (string)$mediaId];
        if ($t === 'document' && $mediaNombre) $m['filename'] = $mediaNombre;
        $c[] = ['type' => 'header', 'parameters' => [['type' => $t, $t => $m]]];
    }
    if ($valores['cuerpo']) $c[] = ['type' => 'body', 'parameters' => array_map(static fn($v) => ['type' => 'text', 'text' => (string)$v], array_values($valores['cuerpo']))];
    foreach ($bots as $i => $b) {
        if ($b['tipo'] === 'enlace' && empty($b['externa'])) {
            $c[] = ['type' => 'button', 'sub_type' => 'url', 'index' => (string)$i, 'parameters' => [['type' => 'text', 'text' => (string)$token]]];
        } elseif ($b['tipo'] === 'respuesta') {
            $c[] = ['type' => 'button', 'sub_type' => 'quick_reply', 'index' => (string)$i, 'parameters' => [['type' => 'payload', 'payload' => 'tpl:' . $tpl['id'] . ':' . $i]]];
        }
        // Enlace fijo de una plantilla importada o botón de llamada: no llevan parámetros.
    }
    return comPayloadPlantilla($tpl['nombre'], $tpl['idioma'], $c);
}

/** ¿Lleva el botón de enlace de seguimiento del sistema? (entonces cada envío necesita un destino). */
function comPlantillaTieneEnlace(array $tpl): bool
{
    $bots = is_string($tpl['botones']) ? (json_decode($tpl['botones'], true) ?: []) : ($tpl['botones'] ?? []);
    foreach ($bots as $b) if ($b['tipo'] === 'enlace' && empty($b['externa'])) return true;
    return false;
}

/** null si la plantilla se puede enviar desde el sistema; si no, el motivo. */
function comPlantillaNoEnviable(array $tpl): ?string
{
    if ($tpl['estado'] !== 'aprobada') return 'La plantilla no está aprobada por Meta';
    if (($tpl['categoria'] ?? $tpl['categoria_solicitada']) === 'AUTHENTICATION') return 'Las plantillas de autenticación no se envían desde aquí';
    $bots = is_string($tpl['botones']) ? (json_decode($tpl['botones'], true) ?: []) : ($tpl['botones'] ?? []);
    foreach ($bots as $b) {
        if ($b['tipo'] === 'enlace' && !empty($b['externa']) && str_contains((string)($b['url'] ?? ''), '{{')) return 'Su botón de enlace tiene una variable que no es la de seguimiento del sistema';
        if ($b['tipo'] === 'otro' && ($b['subtipo'] ?? '') !== 'PHONE_NUMBER') return 'Tiene un tipo de botón que el sistema no envía (' . ($b['subtipo'] ?? 'otro') . ')';
    }
    return null;
}

/** Crea el token del enlace de seguimiento de un envío. */
function comCrearEnlace(mysqli $conn, int $idSede, string $destino, ?int $idCampana = null): string
{
    $token = bin2hex(random_bytes(12));
    crmExec($conn, 'INSERT INTO com_enlaces (token, id_sede, destino, id_campana) VALUES (?, ?, ?, ?)', 'sisi', [$token, $idSede, $destino, $idCampana]);
    return $token;
}

/** URL de destino válida (http/https) o corta con 400. */
function comValidarDestino(?string $url): string
{
    $u = trim((string)$url);
    if ($u === '' || mb_strlen($u) > 1000 || !filter_var($u, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $u)) {
        authFail(400, 'El enlace de destino debe ser una URL completa (https://…)');
    }
    return $u;
}

// ─── Eventos del webhook ────────────────────────────────────────────────────────────────────────────────────────

function comPlantillaDeEvento(mysqli $conn, string $wabaId, array $v): ?array
{
    $id = (string)($v['message_template_id'] ?? '');
    $t = $id !== '' ? crmRow($conn, 'SELECT * FROM com_plantillas WHERE meta_id = ?', 's', [$id]) : null;
    if (!$t && !empty($v['message_template_name'])) {
        $t = crmRow($conn, 'SELECT * FROM com_plantillas WHERE waba_id = ? AND nombre = ? AND idioma = ?', 'sss',
            [$wabaId, (string)$v['message_template_name'], (string)($v['message_template_language'] ?? '')]);
    }
    return $t;
}

/** Avisa al creador de la plantilla y a los L4 de la sede. */
function comPlantillaAvisar(mysqli $conn, array $t, string $titulo, string $cuerpo): void
{
    $ids = array_column(crmRows($conn, "SELECT id_usuario FROM le_usuario_sedes WHERE id_sede = ? AND rol = 'L4' AND state = 1", 'i', [(int)$t['id_sede']]), 'id_usuario');
    if ($t['created_by']) $ids[] = (int)$t['created_by'];
    notifyUsers($conn, (int)$t['id_sede'], $ids, $titulo, $cuerpo, '/m/comunicaciones/plantillas?p=' . $t['id'], 'com_plantilla', ['id_plantilla' => (int)$t['id']]);
}

/** Registra la categoría que Meta le dio; si es distinta a la pedida, la marca reclasificada y avisa (una vez por cambio). */
function comPlantillaCategoria(mysqli $conn, array $t, ?string $nueva, ?string $anterior = null): void
{
    $nueva = $nueva ? strtoupper($nueva) : null;
    if (!$nueva || $nueva === $t['categoria']) return;
    $reclasificada = $nueva !== $t['categoria_solicitada'];
    crmExec($conn, 'UPDATE com_plantillas SET categoria_anterior = ?, categoria = ?, reclasificada_at = IF(?, CURRENT_TIMESTAMP, NULL) WHERE id = ?',
        'ssii', [$anterior ?? ($t['categoria'] ?? $t['categoria_solicitada']), $nueva, $reclasificada ? 1 : 0, (int)$t['id']]);
    if ($reclasificada && $nueva === 'MARKETING') {
        comPlantillaAvisar($conn, $t, 'Meta reclasificó una plantilla',
            "Meta clasificó «{$t['nombre']}» como Marketing (se pidió como Utilidad): cada envío cuesta " . comTarifa($conn, 'marketing') . ' créditos en vez de ' . comTarifa($conn, 'utility') . '. Revisa el texto o crea una versión transaccional.');
    } elseif ($reclasificada) {
        comPlantillaAvisar($conn, $t, 'Meta cambió la categoría de una plantilla', "«{$t['nombre']}» quedó como " . $nueva . '.');
    }
}

function comPlantillaEventoEstado(mysqli $conn, string $wabaId, array $v): void
{
    $t = comPlantillaDeEvento($conn, $wabaId, $v);
    if (!$t) return;
    $evento = strtoupper((string)($v['event'] ?? ''));
    $estado = COM_TPL_ESTADO_META[$evento] ?? null;
    if ($evento === 'FLAGGED') {
        crmExec($conn, "UPDATE com_plantillas SET calidad = 'RED' WHERE id = ?", 'i', [(int)$t['id']]);
        comPlantillaAvisar($conn, $t, 'Plantilla marcada por Meta', "Meta marcó «{$t['nombre']}» por baja calidad: si sigue así la pausará.");
        return;
    }
    if (!$estado) return;
    $motivo = isset($v['reason']) && $v['reason'] !== 'NONE' ? mb_substr((string)$v['reason'], 0, 500) : null;
    crmExec($conn, 'UPDATE com_plantillas SET estado = ?, motivo_rechazo = ?, aprobada_at = IF(? = \'aprobada\', COALESCE(aprobada_at, CURRENT_TIMESTAMP), aprobada_at) WHERE id = ?',
        'sssi', [$estado, $estado === 'rechazada' ? $motivo : null, $estado, (int)$t['id']]);
    if (!empty($v['new_category']) || !empty($v['category'])) comPlantillaCategoria($conn, $t, $v['new_category'] ?? $v['category']);
    $txt = ['aprobada' => ['Plantilla aprobada', "Meta aprobó «{$t['nombre']}»: ya se puede usar."],
        'rechazada' => ['Plantilla rechazada', "Meta rechazó «{$t['nombre']}»" . ($motivo ? ": $motivo" : '.')],
        'pausada' => ['Plantilla pausada', "Meta pausó «{$t['nombre']}» por baja calidad."],
        'deshabilitada' => ['Plantilla deshabilitada', "Meta deshabilitó «{$t['nombre']}»."]][$estado] ?? null;
    if ($txt) comPlantillaAvisar($conn, $t, $txt[0], $txt[1]);
}

function comPlantillaEventoCategoria(mysqli $conn, string $wabaId, array $v): void
{
    $t = comPlantillaDeEvento($conn, $wabaId, $v);
    if ($t) comPlantillaCategoria($conn, $t, $v['new_category'] ?? $v['correct_category'] ?? null, $v['previous_category'] ?? null);
}

function comPlantillaEventoCalidad(mysqli $conn, string $wabaId, array $v): void
{
    $t = comPlantillaDeEvento($conn, $wabaId, $v);
    if (!$t) return;
    $nueva = strtoupper((string)($v['new_quality_score'] ?? ''));
    crmExec($conn, 'UPDATE com_plantillas SET calidad = ? WHERE id = ?', 'si', [$nueva ?: null, (int)$t['id']]);
    if ($nueva === 'RED') comPlantillaAvisar($conn, $t, 'Calidad baja de una plantilla', "La calidad de «{$t['nombre']}» bajó a roja: los clientes la están bloqueando o reportando.");
}

// ─── Sincronización con Meta ────────────────────────────────────────────────────────────────────────────────────

/** Trae las plantillas de la WABA de una línea: actualiza las conocidas, importa las creadas fuera y marca las borradas en Meta. */
function comPlantillasSincronizar(mysqli $conn, array $ctx, array $linea): array
{
    $vistas = []; $nuevas = 0; $actualizadas = 0;
    $url = '/' . $linea['waba_id'] . '/message_templates?fields=id,name,language,status,category,components,rejected_reason,quality_score&limit=100';
    for ($pag = 0; $url && $pag < 20; $pag++) {
        $r = comGraph('GET', $url, $linea['token'], $linea['graph_version']);
        if (!$r['ok']) return ['error' => comErrorDe($r)[1]];
        foreach ($r['data']['data'] ?? [] as $m) {
            $vistas[] = (string)$m['id'];
            $estado = COM_TPL_ESTADO_META[strtoupper((string)($m['status'] ?? ''))] ?? 'pendiente';
            $t = crmRow($conn, 'SELECT * FROM com_plantillas WHERE meta_id = ? OR (waba_id = ? AND nombre = ? AND idioma = ?) LIMIT 1', 'ssss',
                [(string)$m['id'], $linea['waba_id'], (string)$m['name'], (string)$m['language']]);
            if ($t) {
                crmExec($conn, 'UPDATE com_plantillas SET meta_id = ?, estado = ?, motivo_rechazo = ?, calidad = ? WHERE id = ?', 'ssssi',
                    [(string)$m['id'], $estado, ($m['rejected_reason'] ?? 'NONE') !== 'NONE' ? mb_substr((string)$m['rejected_reason'], 0, 500) : null,
                        $m['quality_score']['score'] ?? null, (int)$t['id']]);
                comPlantillaCategoria($conn, $t, $m['category'] ?? null);
                $actualizadas++;
                continue;
            }
            $imp = comPlantillaDesdeMeta($m);
            if (!$imp) continue;
            crmExec($conn,
                "INSERT INTO com_plantillas (id_sede, id_linea, waba_id, nombre, idioma, categoria_solicitada, categoria, estado, meta_id, encabezado, cuerpo, pie, botones,
                                             variables, origen, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'meta', ?, ?)",
                'iissssssssssssii', [$ctx['id_sede'], $linea['id'], $linea['waba_id'], (string)$m['name'], (string)$m['language'], $imp['categoria'], $imp['categoria'],
                    $estado, (string)$m['id'], $imp['encabezado'], $imp['cuerpo'], $imp['pie'], $imp['botones'], $imp['variables'], $ctx['id_usuario'], $ctx['id_usuario']]);
            $nuevas++;
        }
        $next = $r['data']['paging']['next'] ?? null;
        $url = $next ? preg_replace('#^https://graph\.facebook\.com/v[\d.]+#', '', $next) : null;
    }
    $borradas = 0;
    foreach (crmRows($conn, "SELECT id, meta_id FROM com_plantillas WHERE id_linea = ? AND meta_id IS NOT NULL AND estado <> 'eliminada'", 'i', [$linea['id']]) as $t) {
        if (!in_array($t['meta_id'], $vistas, true)) { crmExec($conn, "UPDATE com_plantillas SET estado = 'eliminada' WHERE id = ?", 'i', [(int)$t['id']]); $borradas++; }
    }
    return ['nuevas' => $nuevas, 'actualizadas' => $actualizadas, 'eliminadas' => $borradas];
}

/** Plantilla creada fuera del sistema → columnas locales (variables «a mano», ejemplos de Meta). null si no se puede usar (p. ej. autenticación). */
function comPlantillaDesdeMeta(array $m): ?array
{
    $cat = strtoupper((string)($m['category'] ?? 'UTILITY'));
    if (!in_array($cat, ['UTILITY', 'MARKETING', 'AUTHENTICATION'], true)) return null;
    $enc = null; $cuerpo = ''; $pie = null; $bots = []; $vars = [];
    foreach ($m['components'] ?? [] as $c) {
        switch (strtoupper((string)$c['type'])) {
            case 'HEADER':
                $f = strtoupper((string)($c['format'] ?? 'TEXT'));
                $enc = $f === 'TEXT' ? ['tipo' => 'texto', 'texto' => (string)($c['text'] ?? '')] : ['tipo' => ['IMAGE' => 'imagen', 'VIDEO' => 'video', 'DOCUMENT' => 'documento'][$f] ?? 'imagen'];
                if ($f === 'TEXT' && comVariablesDe($enc['texto'])) $enc['variable'] = ['n' => 1, 'ejemplo' => (string)($c['example']['header_text'][0] ?? 'ejemplo'), 'origen' => 'manual', 'valor' => null, 'defecto' => null];
                break;
            case 'BODY':
                $cuerpo = (string)($c['text'] ?? '');
                $ej = $c['example']['body_text'][0] ?? [];
                foreach (comVariablesDe($cuerpo) as $i => $n) $vars[] = ['n' => $n, 'ejemplo' => (string)($ej[$i] ?? 'ejemplo'), 'origen' => 'manual', 'valor' => null, 'defecto' => null];
                break;
            case 'FOOTER':
                $pie = (string)($c['text'] ?? '');
                break;
            case 'BUTTONS':
                foreach ($c['buttons'] ?? [] as $b) {
                    $tb = strtoupper((string)($b['type'] ?? ''));
                    if ($tb === 'QUICK_REPLY') $bots[] = ['tipo' => 'respuesta', 'texto' => (string)$b['text']];
                    elseif ($tb === 'URL') $bots[] = ['tipo' => 'enlace', 'texto' => (string)$b['text'], 'url' => (string)($b['url'] ?? ''), 'externa' => !str_starts_with((string)($b['url'] ?? ''), comUrlSeguimiento())];
                    else $bots[] = ['tipo' => 'otro', 'subtipo' => $tb, 'texto' => (string)($b['text'] ?? '')];
                }
                break;
        }
    }
    if ($cuerpo === '') return null;
    $j = static fn($x) => $x === null ? null : json_encode($x, JSON_UNESCAPED_UNICODE);
    return ['categoria' => $cat, 'encabezado' => $j($enc), 'cuerpo' => $cuerpo, 'pie' => $pie, 'botones' => $j($bots), 'variables' => $j($vars)];
}
