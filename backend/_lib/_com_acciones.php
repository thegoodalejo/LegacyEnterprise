<?php
// Registro de ACCIONES del chatbot: el punto de extensión para que otros módulos hagan cosas desde un flujo (agendar una cita, pedir un pedido…).
// Cada módulo aporta las suyas en backend/<modulo>/_acciones_bot.php llamando a comRegistrarAccion(). El editor solo ofrece las acciones de
// módulos CONTRATADOS por la sede, y el motor solo ejecuta esas. Contrato completo: docs/modulos/comunicaciones.md → «Acciones».
//
//   comRegistrarAccion([
//     'codigo'   => '<modulo>.<accion>',           // único
//     'modulo'   => '<modulo>',                     // se ofrece si la sede lo tiene contratado
//     'nombre'   => 'Texto para el editor', 'descripcion' => '…',
//     'config'   => [['clave', 'tipo', 'etiqueta', 'requerida' => bool, 'opciones' => [...]]],   // se elige en el editor
//     'entradas' => [['clave', 'tipo', 'requerida']],   // variables que el flujo debe haber capturado antes (documentación y validación)
//     'salidas'  => ['variable', …],                    // variables que deja en la conversación
//     'puertos'  => ['ok', 'error', …],                 // salidas del nodo; 'ok' y 'error' siempre existen
//     'ejecutar' => fn(array $ctx, array $vars, array $config): array => ['puerto' => 'ok', 'variables' => [...]],
//   ]);
//
// Tipos de config que entiende el editor: texto (admite {{variables}}), texto_largo, entero, variable (nombre de variable), etiqueta, usuario,
// campo_contacto (nombre | correo | documento | campo:<id>), embudo_etapa (CRM), opcion (con 'opciones' => [['valor','etiqueta']]).
// $ctx: conn, id_sede, id_empresa, id_contacto, id_conversacion, simulacion (true en «Probar flujo»: no escribir nada).
// Una acción NO envía mensajes: devuelve variables y el flujo decide qué decir. Una excepción sale por el puerto 'error'.

$GLOBALS['comAcciones'] = $GLOBALS['comAcciones'] ?? [];

function comRegistrarAccion(array $a): void
{
    foreach (['codigo', 'modulo', 'nombre', 'ejecutar'] as $k) if (empty($a[$k])) throw new InvalidArgumentException("Acción sin $k");
    $a['config'] = $a['config'] ?? [];
    $a['entradas'] = $a['entradas'] ?? [];
    $a['salidas'] = $a['salidas'] ?? [];
    $a['puertos'] = array_values(array_unique(array_merge(['ok'], $a['puertos'] ?? [], ['error'])));
    $a['descripcion'] = $a['descripcion'] ?? '';
    $GLOBALS['comAcciones'][$a['codigo']] = $a;
}

/** Carga (una vez) las acciones de todos los módulos presentes en el código. */
function comCargarAcciones(): array
{
    static $cargadas = false;
    if (!$cargadas) {
        $cargadas = true;
        foreach (glob(__DIR__ . '/../*/_acciones_bot.php') ?: [] as $f) require_once $f;
    }
    return $GLOBALS['comAcciones'];
}

/** Acciones que la sede puede usar: las de los módulos contratados (Comunicaciones siempre). */
function comAccionesDeSede(mysqli $conn, int $idSede): array
{
    $mods = modulosSede($conn, $idSede);
    $mods[] = 'comunicaciones';
    return array_filter(comCargarAcciones(), static fn($a) => in_array($a['modulo'], $mods, true));
}

/** Definición pública de una acción (sin el callable) para el editor. */
function comAccionPublica(array $a): array
{
    unset($a['ejecutar']);
    return $a;
}

/** Valida la config de un nodo acción contra su esquema. Devuelve la config limpia o lanza authFail(400). */
function comValidarConfigAccion(mysqli $conn, array $sede, array $accion, array $config, string $nodo): array
{
    $out = [];
    foreach ($accion['config'] as $c) {
        $k = $c['clave'];
        $v = $config[$k] ?? null;
        $vacio = $v === null || $v === '' || $v === [];
        if ($vacio) {
            if (!empty($c['requerida'])) authFail(400, "Nodo $nodo: falta «{$c['etiqueta']}» en la acción «{$accion['nombre']}»");
            continue;
        }
        switch ($c['tipo']) {
            case 'entero': case 'etiqueta': case 'usuario':
                if (!is_numeric($v) || (int)$v <= 0) authFail(400, "Nodo $nodo: «{$c['etiqueta']}» inválido");
                $v = (int)$v;
                break;
            case 'variable':
                if (!preg_match('/^[a-z_][a-z0-9_]{0,30}$/', (string)$v)) authFail(400, "Nodo $nodo: nombre de variable inválido en «{$c['etiqueta']}»");
                break;
            case 'campo_contacto':
                if (!preg_match('/^(nombre|correo|documento|campo:\d+)$/', (string)$v)) authFail(400, "Nodo $nodo: campo del contacto inválido");
                break;
            case 'embudo_etapa':
                if (!is_numeric($v) || (int)$v <= 0) authFail(400, "Nodo $nodo: etapa inválida");
                $v = (int)$v;
                break;
            case 'opcion':
                if (!in_array($v, array_column($c['opciones'] ?? [], 'valor'), true)) authFail(400, "Nodo $nodo: opción inválida en «{$c['etiqueta']}»");
                break;
            default:   // texto, texto_largo
                $v = mb_substr(trim((string)$v), 0, $c['tipo'] === 'texto_largo' ? 1000 : 255);
        }
        $out[$k] = $v;
    }
    return $out;
}

/** Ejecuta una acción. Nunca lanza: una excepción o un resultado inválido salen por 'error' (con el motivo en _error). */
function comEjecutarAccion(array $ctx, array $accion, array $vars, array $config): array
{
    try {
        $prevLanza = $GLOBALS['authFailLanza'] ?? false;
        $GLOBALS['authFailLanza'] = true;
        $r = ($accion['ejecutar'])($ctx, $vars, $config);
        $GLOBALS['authFailLanza'] = $prevLanza;
        $puerto = is_array($r) && in_array($r['puerto'] ?? '', $accion['puertos'], true) ? $r['puerto'] : 'error';
        return ['puerto' => $puerto, 'variables' => is_array($r['variables'] ?? null) ? $r['variables'] : []];
    } catch (Throwable $e) {
        $GLOBALS['authFailLanza'] = $prevLanza ?? false;
        error_log('[com_accion] ' . $accion['codigo'] . ': ' . $e->getMessage());
        return ['puerto' => 'error', 'variables' => ['_error' => mb_substr($e->getMessage(), 0, 200)]];
    }
}
