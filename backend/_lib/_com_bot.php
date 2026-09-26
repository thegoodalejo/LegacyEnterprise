<?php
// Chatbot de Comunicaciones: validación del grafo de un flujo, palabras de activación, motor y simulador.
// Diseño: docs/modulos/comunicaciones.md → «Chatbot». Reglas:
//   - El bot solo habla con una conversación en estado «bot». Sin flujo en curso, el mensaje se compara con las palabras de activación de la sede;
//     sin coincidencia hace lo que diga com_config_sede.sin_coincidencia (por defecto: no responde y la pasa a la cola).
//   - Las palabras para pedir asesor funcionan en cualquier punto. La sesión del bot vence tras sesion_minutos sin mensajes.
//   - Un paso del motor nunca envía más de COM_BOT_MAX_PASOS nodos seguidos (ciclos sin preguntas).
//   - El motor no sabe si envía de verdad o simula: recibe un «enviar» (comEnviar o el simulador) y las acciones reciben `simulacion`.

require_once __DIR__ . '/_com.php';
require_once __DIR__ . '/_com_acciones.php';

const COM_BOT_MAX_PASOS = 25;
const COM_BOT_MAX_NODOS = 200;
const COM_BOT_TIPOS = ['inicio', 'mensaje', 'botones', 'lista', 'pregunta', 'condicion', 'accion', 'asesor', 'ir_flujo', 'fin'];
const COM_BOT_VALIDACIONES = ['texto', 'numero', 'correo', 'fecha', 'telefono'];
const COM_BOT_OPERADORES = ['igual', 'distinto', 'contiene', 'empieza', 'existe', 'no_existe', 'mayor', 'menor'];
const COM_BOT_RE_ID = '/^[A-Za-z0-9_-]{1,40}$/';
const COM_BOT_RE_VAR = '/^[a-z_][a-z0-9_]{0,30}$/';
const COM_BOT_TXT_OPCION = 'Por favor elige una de las opciones.';
const COM_BOT_TXT_INVALIDO = 'La respuesta no es válida, intenta de nuevo.';

// ─── Grafo: puertos y validación ─────────────────────────────────────────────────────────────────────────────────

/** Puertos de salida de un nodo (las conexiones salen de un puerto). */
function comBotPuertos(array $n, array $acciones = []): array
{
    $d = $n['datos'] ?? [];
    return match ($n['tipo']) {
        'inicio', 'mensaje' => ['siguiente'],
        'botones' => [...array_map('strval', array_column($d['botones'] ?? [], 'id')), 'otro'],
        'lista' => [...array_map('strval', array_column($d['filas'] ?? [], 'id')), 'otro'],
        'pregunta' => ['siguiente', 'invalido'],
        'condicion' => ['si', 'no'],
        'accion' => $acciones[$d['accion'] ?? '']['puertos'] ?? ['ok', 'error'],
        default => [],
    };
}

function comBotTxt(mixed $v, int $max, string $label, string $nodo, bool $req = false): ?string
{
    $s = is_scalar($v) ? trim((string)$v) : '';
    if ($s === '') {
        if ($req) authFail(400, "Nodo «{$nodo}»: falta $label");
        return null;
    }
    if (mb_strlen($s) > $max) authFail(400, "Nodo «{$nodo}»: $label supera $max caracteres");
    return $s;
}

/** Opciones (botones o filas de lista): id único, título obligatorio y sin repetir (sin tildes ni mayúsculas). */
function comBotOpciones(mixed $items, int $min, int $maxN, int $maxTitulo, string $nodo, string $que, bool $conDescripcion): array
{
    if (!is_array($items) || count($items) < $min || count($items) > $maxN) authFail(400, "Nodo «{$nodo}»: entre $min y $maxN $que");
    $out = []; $ids = []; $titulos = [];
    foreach ($items as $it) {
        $id = (string)($it['id'] ?? '');
        if (!preg_match(COM_BOT_RE_ID, $id) || isset($ids[$id]) || in_array($id, ['otro', 'siguiente'], true)) authFail(400, "Nodo «{$nodo}»: identificador de opción inválido o repetido");
        $t = comBotTxt($it['titulo'] ?? null, $maxTitulo, "el título de una opción (máx. $maxTitulo)", $nodo, true);
        $tn = comNormalizar($t);
        if (isset($titulos[$tn])) authFail(400, "Nodo «{$nodo}»: la opción «{$t}» está repetida");
        $ids[$id] = true; $titulos[$tn] = true;
        $o = ['id' => $id, 'titulo' => $t];
        if ($conDescripcion) $o['descripcion'] = comBotTxt($it['descripcion'] ?? null, 72, 'la descripción de una opción (máx. 72)', $nodo);
        $out[] = $o;
    }
    return $out;
}

/** Datos de un nodo validados y limpios según su tipo. */
function comBotValidarDatos(mysqli $conn, array $sede, array $n, array $acciones, int $idFlujo): array
{
    $d = is_array($n['datos'] ?? null) ? $n['datos'] : [];
    $id = $n['id'];
    switch ($n['tipo']) {
        case 'inicio':
            return [];
        case 'mensaje':
            return ['texto' => comBotTxt($d['texto'] ?? null, 4096, 'el texto', $id, true)];
        case 'botones':
            return ['texto' => comBotTxt($d['texto'] ?? null, 1024, 'el texto', $id, true), 'encabezado' => comBotTxt($d['encabezado'] ?? null, 60, 'el encabezado', $id),
                'pie' => comBotTxt($d['pie'] ?? null, 60, 'el pie', $id), 'botones' => comBotOpciones($d['botones'] ?? null, 1, 3, 20, $id, 'botones', false)];
        case 'lista':
            return ['texto' => comBotTxt($d['texto'] ?? null, 1024, 'el texto', $id, true), 'boton' => comBotTxt($d['boton'] ?? null, 20, 'el texto del botón', $id) ?? 'Ver opciones',
                'encabezado' => comBotTxt($d['encabezado'] ?? null, 60, 'el encabezado', $id), 'pie' => comBotTxt($d['pie'] ?? null, 60, 'el pie', $id),
                'filas' => comBotOpciones($d['filas'] ?? null, 1, 10, 24, $id, 'opciones', true)];
        case 'pregunta':
            $var = (string)($d['variable'] ?? '');
            if (!preg_match(COM_BOT_RE_VAR, $var)) authFail(400, "Nodo «{$id}»: nombre de variable inválido (minúsculas, números y _)");
            $val = (string)($d['validacion'] ?? 'texto');
            if (!in_array($val, COM_BOT_VALIDACIONES, true)) authFail(400, "Nodo «{$id}»: validación inválida");
            $g = $d['guardar_en'] ?? null;
            if ($g !== null && $g !== '') {
                if (!preg_match('/^(nombre|correo|documento|campo:(\d+))$/', (string)$g, $m)) authFail(400, "Nodo «{$id}»: campo del contacto inválido");
                if (!empty($m[2]) && !crmRow($conn, "SELECT 1 AS ok FROM crm_campos_personalizados WHERE id = ? AND id_empresa = ? AND aplica_a = 'persona'", 'ii', [(int)$m[2], $sede['id_empresa']])) {
                    authFail(400, "Nodo «{$id}»: el campo personalizado no existe");
                }
            } else {
                $g = null;
            }
            $re = (int)($d['reintentos'] ?? 2);
            return ['texto' => comBotTxt($d['texto'] ?? null, 1024, 'la pregunta', $id, true), 'variable' => $var, 'validacion' => $val, 'guardar_en' => $g,
                'texto_invalido' => comBotTxt($d['texto_invalido'] ?? null, 500, 'el texto de respuesta inválida', $id), 'reintentos' => max(0, min(5, $re))];
        case 'condicion':
            $var = (string)($d['variable'] ?? '');
            if (!preg_match('/^(_respuesta|contacto\.(nombre|primer_nombre|correo|telefono)|[a-z_][a-z0-9_]{0,30})$/', $var)) authFail(400, "Nodo «{$id}»: variable inválida");
            $op = (string)($d['operador'] ?? 'igual');
            if (!in_array($op, COM_BOT_OPERADORES, true)) authFail(400, "Nodo «{$id}»: operador inválido");
            $valor = comBotTxt($d['valor'] ?? null, 100, 'el valor', $id, !in_array($op, ['existe', 'no_existe'], true));
            if (in_array($op, ['mayor', 'menor'], true) && !is_numeric(str_replace(',', '.', (string)$valor))) authFail(400, "Nodo «{$id}»: el valor debe ser un número");
            return ['variable' => $var, 'operador' => $op, 'valor' => $valor];
        case 'accion':
            $cod = (string)($d['accion'] ?? '');
            if (!isset($acciones[$cod])) authFail(400, "Nodo «{$id}»: la acción no está disponible en esta sede");
            return ['accion' => $cod, 'config' => comValidarConfigAccion($conn, $sede, $acciones[$cod], is_array($d['config'] ?? null) ? $d['config'] : [], $id)];
        case 'asesor':
            return ['texto' => comBotTxt($d['texto'] ?? null, 1024, 'el texto', $id)];
        case 'ir_flujo':
            $f = (int)($d['id_flujo'] ?? 0);
            if ($f <= 0 || !crmRow($conn, 'SELECT 1 AS ok FROM com_flujos WHERE id = ? AND id_sede = ? AND borrado = 0', 'ii', [$f, $sede['id_sede']])) {
                authFail(400, "Nodo «{$id}»: elige el flujo al que salta");
            }
            return ['id_flujo' => $f];
        case 'fin':
            return ['texto' => comBotTxt($d['texto'] ?? null, 4096, 'el texto', $id)];
    }
    return [];
}

/**
 * Valida el grafo completo (nodos, datos, conexiones por puerto). Devuelve [grafo limpio, avisos] o corta con 400.
 * Avisos (no bloquean): nodos a los que no se llega, opciones sin destino.
 */
function comBotValidarGrafo(mysqli $conn, array $sede, mixed $g, int $idFlujo): array
{
    if (!is_array($g) || !is_array($g['nodos'] ?? null) || !$g['nodos']) authFail(400, 'El flujo no tiene pasos');
    if (count($g['nodos']) > COM_BOT_MAX_NODOS) authFail(400, 'Máximo ' . COM_BOT_MAX_NODOS . ' pasos por flujo');
    $acciones = comAccionesDeSede($conn, $sede['id_sede']);
    $nodos = []; $inicio = null;
    foreach ($g['nodos'] as $n) {
        $id = (string)($n['id'] ?? '');
        $tipo = (string)($n['tipo'] ?? '');
        if (!preg_match(COM_BOT_RE_ID, $id) || isset($nodos[$id])) authFail(400, 'Identificador de paso inválido o repetido');
        if (!in_array($tipo, COM_BOT_TIPOS, true)) authFail(400, "Paso «{$id}»: tipo inválido");
        if ($tipo === 'inicio') {
            if ($inicio !== null) authFail(400, 'El flujo tiene más de un inicio');
            $inicio = $id;
        }
        $limpio = ['id' => $id, 'tipo' => $tipo, 'x' => max(0, min(20000, (int)round((float)($n['x'] ?? 0)))), 'y' => max(0, min(20000, (int)round((float)($n['y'] ?? 0))))];
        $limpio['datos'] = comBotValidarDatos($conn, $sede, ['id' => $id, 'tipo' => $tipo, 'datos' => $n['datos'] ?? []], $acciones, $idFlujo);
        $nodos[$id] = $limpio;
    }
    if ($inicio === null) authFail(400, 'El flujo necesita un paso de inicio');

    $cons = []; $usado = [];
    foreach (is_array($g['conexiones'] ?? null) ? $g['conexiones'] : [] as $c) {
        $de = (string)($c['de'] ?? ''); $a = (string)($c['a'] ?? ''); $p = (string)($c['puerto'] ?? '');
        if (!isset($nodos[$de], $nodos[$a])) authFail(400, 'Una conexión apunta a un paso que no existe');
        if (!in_array($p, comBotPuertos($nodos[$de], $acciones), true)) authFail(400, "Paso «{$de}»: salida «{$p}» inválida");
        if ($a === $inicio) authFail(400, 'Ninguna conexión puede volver al inicio (usa «Ir a otro flujo» para repetir un menú)');
        if (isset($usado["$de|$p"])) authFail(400, "Paso «{$de}»: la salida «{$p}» tiene más de una conexión");
        $usado["$de|$p"] = true;
        $cons[] = ['de' => $de, 'puerto' => $p, 'a' => $a];
    }

    // Avisos: pasos inalcanzables y opciones sin destino.
    $avisos = [];
    $sal = [];
    foreach ($cons as $c) $sal[$c['de']][] = $c['a'];
    $vistos = [$inicio => true]; $pila = [$inicio];
    while ($pila) { $x = array_pop($pila); foreach ($sal[$x] ?? [] as $y) if (!isset($vistos[$y])) { $vistos[$y] = true; $pila[] = $y; } }
    foreach ($nodos as $id => $n) {
        if (!isset($vistos[$id])) $avisos[] = ['nodo' => $id, 'aviso' => 'inalcanzable'];
        if (in_array($n['tipo'], ['botones', 'lista'], true)) {
            foreach (comBotPuertos($n, $acciones) as $p) if ($p !== 'otro' && !isset($usado["$id|$p"])) $avisos[] = ['nodo' => $id, 'aviso' => 'opcion_sin_destino', 'puerto' => $p];
        }
    }
    return [['nodos' => array_values($nodos), 'conexiones' => $cons], $avisos];
}

/** Grafo listo para el motor: nodos por id, salidas por puerto y el inicio. */
function comBotCompilar(int $id, string $nombre, array $g): array
{
    $f = ['id' => $id, 'nombre' => $nombre, 'nodos' => [], 'sal' => [], 'inicio' => null];
    foreach ($g['nodos'] ?? [] as $n) {
        $f['nodos'][$n['id']] = $n;
        if ($n['tipo'] === 'inicio') $f['inicio'] = $n['id'];
    }
    foreach ($g['conexiones'] ?? [] as $c) $f['sal'][$c['de']][$c['puerto']] = $c['a'];
    return $f;
}

/** Flujo activo (o cualquiera no borrado con $soloActivo = false) de la sede, compilado. Cacheado por request. */
function comBotFlujo(mysqli $conn, int $idSede, int $idFlujo, bool $soloActivo = true): ?array
{
    static $cache = [];
    $k = "$idSede|$idFlujo|" . ($soloActivo ? 1 : 0);
    if (array_key_exists($k, $cache)) return $cache[$k];
    $r = crmRow($conn, 'SELECT id, nombre, grafo, activo FROM com_flujos WHERE id = ? AND id_sede = ? AND borrado = 0', 'ii', [$idFlujo, $idSede]);
    if (!$r || ($soloActivo && (int)$r['activo'] !== 1)) return $cache[$k] = null;
    return $cache[$k] = comBotCompilar((int)$r['id'], $r['nombre'], json_decode($r['grafo'], true) ?: []);
}

// ─── Disparadores ────────────────────────────────────────────────────────────────────────────────────────────────

/** ¿El texto normalizado activa el disparador? exacta = todo el mensaje; empieza/contiene = palabras completas. */
function comBotCoincide(string $tipo, string $norm, string $t): bool
{
    if ($norm === '' || $t === '') return false;
    return match ($tipo) {
        'exacta' => $norm === $t,
        'empieza' => $norm === $t || str_starts_with($norm, $t . ' '),
        'contiene' => str_contains(' ' . $norm . ' ', ' ' . $t . ' '),
        default => false,
    };
}

/**
 * Flujo activo que activa el texto (normalizado), o null. $extra: disparadores sin guardar (simulador) [{tipo, texto_norm, prioridad, id_linea, id_flujo}].
 * Orden: prioridad, específico de la línea, exacta > empieza > contiene, texto más largo, el más antiguo.
 */
function comBotBuscarDisparador(mysqli $conn, int $idSede, ?int $idLinea, string $norm, array $extra = [], ?int $excluirFlujo = null): ?array
{
    $rows = crmRows($conn,
        'SELECT d.id, d.id_flujo, d.tipo, d.texto, d.texto_norm, d.prioridad, d.id_linea, f.nombre
           FROM com_flujo_disparadores d JOIN com_flujos f ON f.id = d.id_flujo AND f.activo = 1 AND f.borrado = 0
          WHERE d.id_sede = ?', 'i', [$idSede]);
    if ($excluirFlujo !== null) $rows = array_values(array_filter($rows, static fn($r) => (int)$r['id_flujo'] !== $excluirFlujo));
    foreach ($extra as $e) $rows[] = $e + ['id' => PHP_INT_MAX];
    $rango = ['exacta' => 3, 'empieza' => 2, 'contiene' => 1];
    $hits = array_values(array_filter($rows, static fn($r) => ($r['id_linea'] === null || $idLinea === null || (int)$r['id_linea'] === $idLinea)
        && comBotCoincide($r['tipo'], $norm, $r['texto_norm'])));
    if (!$hits) return null;
    usort($hits, static fn($a, $b) => [(int)$b['prioridad'], $b['id_linea'] !== null, $rango[$b['tipo']], mb_strlen($b['texto_norm']), -(int)$b['id']]
        <=> [(int)$a['prioridad'], $a['id_linea'] !== null, $rango[$a['tipo']], mb_strlen($a['texto_norm']), -(int)$a['id']]);
    return ['id_flujo' => (int)$hits[0]['id_flujo'], 'texto' => $hits[0]['texto'], 'tipo' => $hits[0]['tipo'], 'nombre' => $hits[0]['nombre'] ?? null];
}

// ─── Motor ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Datos del contacto para {{contacto.*}}. */
function comBotContactoVars(mysqli $conn, ?int $idContacto, string $waId = ''): array
{
    $v = ['nombre' => '', 'primer_nombre' => '', 'correo' => '', 'telefono' => $waId !== '' ? '+' . $waId : ''];
    if (!$idContacto) return $v;
    $r = crmRow($conn, 'SELECT c.nombre_completo, p.nombres, p.correo FROM crm_contactos c LEFT JOIN crm_contactos_personas p ON p.id = c.id WHERE c.id = ?', 'i', [$idContacto]);
    if (!$r) return $v;
    $v['nombre'] = (string)$r['nombre_completo'];
    $v['primer_nombre'] = (string)(preg_split('/\s+/u', trim((string)($r['nombres'] ?? $r['nombre_completo'])))[0] ?? '');
    $v['correo'] = (string)($r['correo'] ?? '');
    return $v;
}

/** Reemplaza {{contacto.nombre}}, {{sede.nombre}} y {{variable}} (desconocidas → vacío). */
function comBotRender(string $t, array $ctx, array $vars): string
{
    return preg_replace_callback('/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/', static function ($m) use ($ctx, $vars) {
        $k = $m[1];
        if (str_starts_with($k, 'contacto.')) return (string)($ctx['contacto'][substr($k, 9)] ?? '');
        if ($k === 'sede.nombre') return (string)($ctx['sede_nombre'] ?? '');
        return isset($vars[$k]) && !str_starts_with($k, '_') ? (string)$vars[$k] : '';
    }, $t) ?? $t;
}

function comBotSig(array $flujo, string $nodo, string $puerto): ?string
{
    return $flujo['sal'][$nodo][$puerto] ?? null;
}

function comBotEvaluar(array $d, array $ctx, array $vars): bool
{
    $var = $d['variable'];
    $v = $var === '_respuesta' ? ($vars['_respuesta'] ?? '') : (str_starts_with($var, 'contacto.') ? ($ctx['contacto'][substr($var, 9)] ?? '') : ($vars[$var] ?? ''));
    $a = comNormalizar((string)$v);
    $b = comNormalizar((string)($d['valor'] ?? ''));
    $num = static fn($x) => is_numeric($x = str_replace(',', '.', preg_replace('/[^\d,.\-]/', '', (string)$x) ?? '')) ? (float)$x : null;
    return match ($d['operador']) {
        'igual' => $a === $b,
        'distinto' => $a !== $b,
        'contiene' => $b !== '' && str_contains($a, $b),
        'empieza' => $b !== '' && str_starts_with($a, $b),
        'existe' => trim((string)$v) !== '',
        'no_existe' => trim((string)$v) === '',
        'mayor' => $num($v) !== null && $num($v) > (float)str_replace(',', '.', (string)$d['valor']),
        'menor' => $num($v) !== null && $num($v) < (float)str_replace(',', '.', (string)$d['valor']),
        default => false,
    };
}

/** Valida y normaliza la respuesta a una pregunta; null si no es válida. */
function comBotValidarRespuesta(string $validacion, string $v): ?string
{
    $v = trim($v);
    if ($v === '') return null;
    switch ($validacion) {
        case 'numero':
            $n = str_replace([' ', '$'], '', $v);
            $n = preg_replace('/[.,](?=\d{3}(\D|$))/', '', $n) ?? $n;
            return is_numeric(str_replace(',', '.', $n)) ? str_replace(',', '.', $n) : null;
        case 'correo':
            return filter_var($v, FILTER_VALIDATE_EMAIL) ? mb_strtolower($v) : null;
        case 'fecha':
            foreach (['!d/m/Y', '!d-m-Y', '!Y-m-d', '!d/m/y'] as $fmt) {
                $d = DateTimeImmutable::createFromFormat($fmt, $v);
                if ($d && $d->format(ltrim($fmt, '!')) === $v) return $d->format('Y-m-d');
            }
            return null;
        case 'telefono':
            $d = preg_replace('/\D+/', '', $v) ?? '';
            return strlen($d) >= 7 && strlen($d) <= 15 ? $d : null;
        default:
            return mb_substr($v, 0, 500);
    }
}

/** Guarda un valor en un campo del contacto (lo usan el nodo pregunta y la acción guardar_dato). [ok, error]. Sin usuario: historial «Sistema». */
function comGuardarDatoContacto(array $ctx, string $campo, string $valor): array
{
    $conn = $ctx['conn'];
    $id = (int)$ctx['id_contacto'];
    if ($id <= 0) return $ctx['simulacion'] ? [true, null] : [false, 'Sin contacto'];   // «Probar» sin contacto de ejemplo
    $p = crmRow($conn, "SELECT c.id, c.nombre_completo, c.telefono, p.nombres, p.apellidos, p.correo, p.documento_numero, p.whatsapp_indicativo, p.whatsapp_numero
                          FROM crm_contactos c JOIN crm_contactos_personas p ON p.id = c.id WHERE c.id = ? AND c.id_sede = ? AND c.tipo = 'persona'",
        'ii', [$id, $ctx['id_sede']]);
    if (!$p) return [false, 'El contacto no es una persona'];
    $cambio = null;
    if ($campo === 'nombre') {
        $v = mb_substr(trim($valor), 0, 100);
        if ($v === '') return [false, 'Nombre vacío'];
        $cambio = ['campo' => 'nombres', 'antes' => $p['nombre_completo'], 'despues' => $v];
        if (!$ctx['simulacion']) {
            crmExec($conn, 'UPDATE crm_contactos_personas SET nombres = ?, apellidos = NULL WHERE id = ?', 'si', [$v, $id]);
            crmExec($conn, 'UPDATE crm_contactos SET nombre_completo = ? WHERE id = ?', 'si', [$v, $id]);
            $p['nombre_completo'] = $v;
        }
    } elseif ($campo === 'correo') {
        if (!filter_var($valor, FILTER_VALIDATE_EMAIL) || mb_strlen($valor) > 190) return [false, 'Correo inválido'];
        $cambio = ['campo' => 'correo', 'antes' => $p['correo'], 'despues' => $valor];
        if (!$ctx['simulacion']) crmExec($conn, 'UPDATE crm_contactos_personas SET correo = ? WHERE id = ?', 'si', [$valor, $id]);
        $p['correo'] = $valor;
    } elseif ($campo === 'documento') {
        $v = mb_substr(trim($valor), 0, 40);
        if ($v === '') return [false, 'Documento vacío'];
        $cambio = ['campo' => 'documento_numero', 'antes' => $p['documento_numero'], 'despues' => $v];
        if (!$ctx['simulacion']) crmExec($conn, 'UPDATE crm_contactos_personas SET documento_numero = ? WHERE id = ?', 'si', [$v, $id]);
        $p['documento_numero'] = $v;
    } elseif (preg_match('/^campo:(\d+)$/', $campo, $m)) {
        $def = null;
        foreach (crmCampos($conn, $ctx['id_empresa'], 'persona', true) as $d) if ((int)$d['id'] === (int)$m[1]) $def = $d;
        if (!$def) return [false, 'Campo inexistente'];
        $prev = $GLOBALS['authFailLanza'] ?? false;
        $GLOBALS['authFailLanza'] = true;
        try { $col = crmValorCampo($def, $valor); } catch (AuthFailException $e) { $GLOBALS['authFailLanza'] = $prev; return [false, $e->getMessage()]; }
        $GLOBALS['authFailLanza'] = $prev;
        if ($col === null) return [false, 'Valor vacío'];
        $vals = array_merge(['valor_entero' => null, 'valor_decimal' => null, 'valor_texto' => null, 'valor_booleano' => null, 'valor_fecha' => null], $col);
        $cambio = ['campo' => 'campo:' . $def['clave'], 'etiqueta' => $def['etiqueta'], 'antes' => null, 'despues' => crmValorDeFila($vals, $def['tipo_dato'])];
        if (!$ctx['simulacion']) {
            crmExec($conn,
                'INSERT INTO crm_campos_valores (id_contacto, id_campo, valor_entero, valor_decimal, valor_texto, valor_booleano, valor_fecha) VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE valor_entero = VALUES(valor_entero), valor_decimal = VALUES(valor_decimal), valor_texto = VALUES(valor_texto),
                                         valor_booleano = VALUES(valor_booleano), valor_fecha = VALUES(valor_fecha)',
                'iiissis', [$id, (int)$def['id'], $vals['valor_entero'], $vals['valor_decimal'], $vals['valor_texto'], $vals['valor_booleano'], $vals['valor_fecha']]);
        }
    } else {
        return [false, 'Campo inválido'];
    }
    if (!$ctx['simulacion']) {
        $num = (string)$p['whatsapp_numero'];
        crmExec($conn, 'UPDATE crm_contactos SET busqueda = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 'si',
            [crmBuildBusqueda([$p['nombre_completo'], $p['correo']], [$p['telefono'], $p['documento_numero'], $num, $p['whatsapp_indicativo'] . $num]), $id]);
        if ($cambio && (string)$cambio['antes'] !== (string)$cambio['despues']) {
            auditRegistroSistema($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $id, 'actualizado', ['cambios' => [$cambio], 'origen' => 'chatbot']);
        }
    }
    return [true, null];
}

/** Resultado del motor. */
function comBotRes(string $resultado, ?int $idFlujo, ?string $nodo, array $vars, ?string $nota = null): array
{
    return ['resultado' => $resultado, 'estado' => ['id_flujo' => $idFlujo, 'nodo' => $nodo, 'vars' => $vars], 'nota' => $nota];
}

/** Envía una salida del bot; devuelve null si salió bien o el resultado de corte (sin_creditos | error). */
function comBotEnviar(array $ctx, array $salida, ?int $idFlujo, array $vars): ?array
{
    $r = ($ctx['enviar'])($salida);
    if ($r['ok']) return null;
    return comBotRes($r['clase'] === 'sin_creditos' ? 'sin_creditos' : 'error', $idFlujo, null, $vars, $r['error'] ?? 'No se pudo enviar');
}

/** Salida de un nodo que espera respuesta (botones o lista), con ids «nodo|opción» para reconocer la respuesta. */
function comBotSalidaEspera(array $n, array $ctx, array $vars): array
{
    $d = $n['datos'];
    $r = fn($t) => $t !== null ? comBotRender($t, $ctx, $vars) : null;
    if ($n['tipo'] === 'botones') {
        return ['tipo' => 'botones', 'texto' => $r($d['texto']), 'encabezado' => $r($d['encabezado'] ?? null), 'pie' => $r($d['pie'] ?? null),
            'botones' => array_map(static fn($b) => ['id' => $n['id'] . '|' . $b['id'], 'titulo' => $b['titulo']], $d['botones'])];
    }
    return ['tipo' => 'lista', 'texto' => $r($d['texto']), 'boton' => $d['boton'] ?? 'Ver opciones', 'encabezado' => $r($d['encabezado'] ?? null), 'pie' => $r($d['pie'] ?? null),
        'filas' => array_map(static fn($f) => ['id' => $n['id'] . '|' . $f['id'], 'titulo' => $f['titulo'], 'descripcion' => $f['descripcion'] ?? null], $d['filas'])];
}

/**
 * Corre el flujo desde $nodoId hasta que un nodo espere respuesta, termine o pase a un asesor.
 * $ctx: conn, id_sede, id_empresa, id_contacto, id_conversacion, simulacion, cfg, contacto, sede_nombre, enviar (callable), flujo (callable id → flujo|null).
 */
function comBotCorrer(array $ctx, array $flujo, ?string $nodoId, array $vars): array
{
    $acciones = comAccionesDeSede($ctx['conn'], $ctx['id_sede']);
    $pasos = 0;
    $vars['_reintentos'] = '0';
    while ($nodoId !== null) {
        if (++$pasos > COM_BOT_MAX_PASOS) return comBotRes('error', null, null, $vars, 'El flujo se detuvo: demasiados pasos seguidos sin esperar una respuesta');
        $n = $flujo['nodos'][$nodoId] ?? null;
        if (!$n) break;
        $d = $n['datos'] ?? [];
        switch ($n['tipo']) {
            case 'inicio':
                $nodoId = comBotSig($flujo, $nodoId, 'siguiente');
                break;
            case 'mensaje':
                if ($x = comBotEnviar($ctx, ['tipo' => 'texto', 'texto' => comBotRender($d['texto'], $ctx, $vars)], $flujo['id'], $vars)) return $x;
                $nodoId = comBotSig($flujo, $nodoId, 'siguiente');
                break;
            case 'botones': case 'lista':
                if ($x = comBotEnviar($ctx, comBotSalidaEspera($n, $ctx, $vars), $flujo['id'], $vars)) return $x;
                return comBotRes('esperando', $flujo['id'], $nodoId, $vars);
            case 'pregunta':
                if ($x = comBotEnviar($ctx, ['tipo' => 'texto', 'texto' => comBotRender($d['texto'], $ctx, $vars)], $flujo['id'], $vars)) return $x;
                return comBotRes('esperando', $flujo['id'], $nodoId, $vars);
            case 'condicion':
                $nodoId = comBotSig($flujo, $nodoId, comBotEvaluar($d, $ctx, $vars) ? 'si' : 'no');
                break;
            case 'accion':
                $acc = $acciones[$d['accion']] ?? null;
                $r = $acc ? comEjecutarAccion($ctx, $acc, $vars, $d['config'] ?? []) : ['puerto' => 'error', 'variables' => ['_error' => 'Acción no disponible']];
                foreach ($r['variables'] as $k => $v) if (is_scalar($v)) $vars[(string)$k] = mb_substr((string)$v, 0, 500);
                $nodoId = comBotSig($flujo, $nodoId, $r['puerto']);
                break;
            case 'asesor':
                $t = $d['texto'] ?? ($ctx['cfg']['texto_transferencia'] ?? null);
                if ($t) comBotEnviar($ctx, ['tipo' => 'texto', 'texto' => comBotRender($t, $ctx, $vars)], $flujo['id'], $vars);   // si falla, igual pasa a la cola
                return comBotRes('asesor', null, null, $vars);
            case 'ir_flujo':
                $f2 = ($ctx['flujo'])((int)$d['id_flujo']);
                if (!$f2 || $f2['inicio'] === null) return comBotRes('error', null, null, $vars, 'El flujo al que salta no está activo');
                $flujo = $f2;
                $nodoId = $f2['inicio'];
                break;
            case 'fin':
                if (!empty($d['texto']) && ($x = comBotEnviar($ctx, ['tipo' => 'texto', 'texto' => comBotRender($d['texto'], $ctx, $vars)], $flujo['id'], $vars))) return $x;
                return comBotRes('fin', null, null, $vars);
        }
    }
    return comBotRes('fin', null, null, $vars);
}

/** Respuesta del cliente a un nodo que espera (botones, lista, pregunta). */
function comBotResponder(array $ctx, array $flujo, array $estado, array $entrada): array
{
    $n = $flujo['nodos'][$estado['nodo']];
    $vars = $estado['vars'];
    $texto = trim((string)($entrada['texto'] ?? ''));
    $vars['_respuesta'] = mb_substr($texto, 0, 500);
    $reint = (int)($vars['_reintentos'] ?? 0);
    $d = $n['datos'];

    if ($n['tipo'] === 'pregunta') {
        $v = comBotValidarRespuesta($d['validacion'], $texto);
        if ($v !== null && !empty($d['guardar_en'])) {
            [$ok] = comGuardarDatoContacto($ctx, $d['guardar_en'], $v);
            if (!$ok) $v = null;
        }
        if ($v !== null) {
            $vars[$d['variable']] = $v;
            return comBotCorrer($ctx, $flujo, comBotSig($flujo, $n['id'], 'siguiente'), $vars);
        }
        if ($reint < (int)$d['reintentos']) {
            $vars['_reintentos'] = (string)($reint + 1);
            if ($x = comBotEnviar($ctx, ['tipo' => 'texto', 'texto' => comBotRender($d['texto_invalido'] ?? COM_BOT_TXT_INVALIDO, $ctx, $vars)], $flujo['id'], $vars)) return $x;
            return comBotRes('esperando', $flujo['id'], $n['id'], $vars);
        }
        $sig = comBotSig($flujo, $n['id'], 'invalido');
        return $sig ? comBotCorrer($ctx, $flujo, $sig, $vars) : comBotRes('asesor', null, null, $vars);
    }

    // botones / lista: por id de la respuesta interactiva, por el título escrito o por su número (1, 2, 3…).
    $opciones = $n['tipo'] === 'botones' ? $d['botones'] : $d['filas'];
    $elegida = null;
    $rid = (string)($entrada['respuesta_id'] ?? '');
    if (str_starts_with($rid, $n['id'] . '|')) {
        $sub = substr($rid, strlen($n['id']) + 1);
        foreach ($opciones as $o) if ($o['id'] === $sub) $elegida = $o;
    }
    if (!$elegida && $texto !== '') {
        $tn = comNormalizar($texto);
        foreach ($opciones as $i => $o) if (comNormalizar($o['titulo']) === $tn || $tn === (string)($i + 1)) { $elegida = $o; break; }
    }
    if ($elegida) {
        $vars['_respuesta'] = $elegida['titulo'];
        return comBotCorrer($ctx, $flujo, comBotSig($flujo, $n['id'], $elegida['id']), $vars);
    }
    $otro = comBotSig($flujo, $n['id'], 'otro');
    if ($otro) return comBotCorrer($ctx, $flujo, $otro, $vars);
    if ($reint < 2) {
        $vars['_reintentos'] = (string)($reint + 1);
        if ($x = comBotEnviar($ctx, ['tipo' => 'texto', 'texto' => COM_BOT_TXT_OPCION], $flujo['id'], $vars)) return $x;
        if ($x = comBotEnviar($ctx, comBotSalidaEspera($n, $ctx, $vars), $flujo['id'], $vars)) return $x;
        return comBotRes('esperando', $flujo['id'], $n['id'], $vars);
    }
    return comBotRes('asesor', null, null, $vars);
}

/** Salida del bot → payload de WhatsApp + lo que se ve en el hilo. */
function comBotPayload(array $s): array
{
    return match ($s['tipo']) {
        'botones' => [comPayloadBotones($s['texto'], $s['botones'], $s['encabezado'] ?? null, $s['pie'] ?? null), $s['texto'], ['botones' => $s['botones'], 'encabezado' => $s['encabezado'] ?? null, 'pie' => $s['pie'] ?? null]],
        'lista' => [comPayloadLista($s['texto'], $s['boton'], $s['filas'], $s['encabezado'] ?? null, $s['pie'] ?? null), $s['texto'], ['lista' => ['boton' => $s['boton'], 'filas' => $s['filas']], 'encabezado' => $s['encabezado'] ?? null, 'pie' => $s['pie'] ?? null]],
        default => [comPayloadTexto($s['texto']), $s['texto'], null],
    };
}

/** Contexto del motor para una conversación real (envía por WhatsApp). */
function comBotContextoReal(mysqli $conn, array $linea, array $conv, array $cfg): array
{
    $sede = crmRow($conn, 'SELECT nombre, id_empresa FROM le_sedes WHERE id = ?', 'i', [$conv['id_sede']]);
    return [
        'conn' => $conn, 'id_sede' => $conv['id_sede'], 'id_empresa' => (int)$sede['id_empresa'], 'id_contacto' => $conv['id_contacto'],
        'id_conversacion' => $conv['id'], 'simulacion' => false, 'cfg' => $cfg, 'sede_nombre' => $sede['nombre'],
        'contacto' => comBotContactoVars($conn, $conv['id_contacto'], $conv['wa_id']),
        'flujo' => static fn(int $id) => comBotFlujo($conn, $conv['id_sede'], $id),
        'enviar' => static function (array $s) use ($conn, $linea, $conv) {
            [$payload, $texto, $contenido] = comBotPayload($s);
            return comEnviar($conn, $conv, $linea, ['origen' => 'bot', 'payload' => $payload, 'texto' => $texto, 'contenido' => $contenido]);
        },
    ];
}

/**
 * Entrada del chatbot para un mensaje entrante (lo llama el worker). Solo actúa con la conversación en estado «bot».
 */
function comBotAlRecibir(mysqli $conn, array $linea, array $conv, array $msg): void
{
    if ($conv['estado'] !== 'bot') return;
    $cfg = comConfigSede($conn, $conv['id_sede']);
    $texto = (string)($msg['texto'] ?? '');
    $norm = comNormalizar($texto);
    $ctx = comBotContextoReal($conn, $linea, $conv, $cfg);

    // Palabras para pedir asesor: en cualquier punto.
    foreach (explode(',', (string)$cfg['palabras_asesor']) as $p) {
        $p = comNormalizar($p);
        if ($p !== '' && $norm !== '' && str_contains(' ' . $norm . ' ', ' ' . $p . ' ')) {
            if ($cfg['texto_transferencia']) comBotEnviar($ctx, ['tipo' => 'texto', 'texto' => comBotRender($cfg['texto_transferencia'], $ctx, $conv['variables'])], null, []);
            comBotAplicar($conn, $conv, comBotRes('asesor', null, null, $conv['variables']));
            return;
        }
    }

    $estado = ['id_flujo' => $conv['id_flujo'], 'nodo' => $conv['nodo'], 'vars' => $conv['variables']];
    // Sesión vencida: el flujo en curso se olvida.
    if ($estado['id_flujo'] && $conv['bot_actividad_at'] && strtotime($conv['bot_actividad_at']) < time() - $cfg['sesion_minutos'] * 60) {
        $estado = ['id_flujo' => null, 'nodo' => null, 'vars' => []];
    }
    $res = null;
    if ($estado['id_flujo'] && $estado['nodo']) {
        $flujo = comBotFlujo($conn, $conv['id_sede'], (int)$estado['id_flujo']);
        if ($flujo && isset($flujo['nodos'][$estado['nodo']])) {
            $res = comBotResponder($ctx, $flujo, $estado, ['texto' => $texto, 'respuesta_id' => $msg['contenido']['respuesta']['id'] ?? null]);
        }
    }
    if ($res === null) {
        $hit = comBotBuscarDisparador($conn, $conv['id_sede'], $linea['id'], $norm);
        $idFlujo = $hit['id_flujo'] ?? null;
        if (!$idFlujo) {
            if ($cfg['sin_coincidencia'] === 'mensaje' && $cfg['texto_sin_coincidencia']) {
                $x = comBotEnviar($ctx, ['tipo' => 'texto', 'texto' => comBotRender($cfg['texto_sin_coincidencia'], $ctx, [])], null, []);
                comBotAplicar($conn, $conv, $x ?? comBotRes('fin', null, null, []));
                return;
            }
            if ($cfg['sin_coincidencia'] === 'flujo' && $cfg['id_flujo_respaldo']) $idFlujo = $cfg['id_flujo_respaldo'];
        }
        $flujo = $idFlujo ? comBotFlujo($conn, $conv['id_sede'], (int)$idFlujo) : null;
        $res = $flujo ? comBotCorrer($ctx, $flujo, $flujo['inicio'], ['_disparador' => mb_substr($texto, 0, 200), '_respuesta' => mb_substr($texto, 0, 500)])
                      : comBotRes('asesor', null, null, $estado['vars']);
    }
    comBotAplicar($conn, $conv, $res);
}

/** Persiste el resultado del motor en la conversación (y la pasa a la cola si toca). */
function comBotAplicar(mysqli $conn, array $conv, array $res): void
{
    $e = $res['estado'];
    $vars = array_filter($e['vars'] ?? [], static fn($k) => !in_array($k, ['_reintentos'], true), ARRAY_FILTER_USE_KEY);
    $json = $vars ? json_encode($vars, JSON_UNESCAPED_UNICODE) : null;
    crmExec($conn, 'UPDATE com_conversaciones SET id_flujo = ?, nodo = ?, variables = ?, bot_actividad_at = CURRENT_TIMESTAMP WHERE id = ? AND estado = \'bot\'',
        'issi', [$res['resultado'] === 'esperando' ? $e['id_flujo'] : null, $res['resultado'] === 'esperando' ? $e['nodo'] : null,
            $res['resultado'] === 'esperando' ? json_encode($e['vars'], JSON_UNESCAPED_UNICODE) : $json, $conv['id']]);
    $nota = match ($res['resultado']) {
        'sin_creditos' => 'Sin créditos: el chatbot se detuvo. Recarga para que siga respondiendo.',
        'error' => 'El chatbot se detuvo: ' . ($res['nota'] ?? 'error'),
        default => null,
    };
    if (in_array($res['resultado'], ['asesor', 'sin_creditos', 'error'], true)) comPasarACola($conn, $conv, $nota);
}
