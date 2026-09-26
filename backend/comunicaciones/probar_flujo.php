<?php
// «Probar» del editor (L2+): simula el chatbot sin enviar nada por WhatsApp ni escribir datos (las acciones corren en modo simulación).
// POST: grafo (JSON, el del editor aunque no esté guardado), id_flujo (el que se edita; 0 si es nuevo), disparadores (JSON, los del editor),
//       estado (JSON {id_flujo, nodo, vars} que devolvió la llamada anterior; vacío = conversación nueva), texto, respuesta_id (botón o fila elegida),
//       iniciar (1 = arrancar este flujo desde el inicio sin palabra), id_contacto (opcional: para {{contacto.*}}).
// Devuelve {salidas: [texto|botones|lista…], resultado (esperando|fin|asesor|sin_coincidencia|error), estado, flujo (nombre del que respondió), nota}.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_bot.php';

$ctx = comContext();
requireRole('L2');
$conn = conectar();
$sede = ['id_sede' => $ctx['id_sede'], 'id_empresa' => $ctx['id_empresa']];
$idEditado = (int)($_POST['id_flujo'] ?? 0);
[$grafo] = comBotValidarGrafo($conn, $sede, crmJsonParam('grafo'), $idEditado);
$editado = comBotCompilar($idEditado ?: -1, (string)($_POST['nombre'] ?? 'Este flujo'), $grafo);
$idContacto = (int)($_POST['id_contacto'] ?? 0) ?: null;
if ($idContacto && !crmRow($conn, 'SELECT 1 AS ok FROM crm_contactos WHERE id = ? AND id_sede = ?', 'ii', [$idContacto, $ctx['id_sede']])) $idContacto = null;
$cfg = comConfigSede($conn, $ctx['id_sede']);
$salidas = [];
$sim = [
    'conn' => $conn, 'id_sede' => $ctx['id_sede'], 'id_empresa' => $ctx['id_empresa'], 'id_contacto' => $idContacto, 'id_conversacion' => null,
    'simulacion' => true, 'cfg' => $cfg, 'sede_nombre' => crmRow($conn, 'SELECT nombre FROM le_sedes WHERE id = ?', 'i', [$ctx['id_sede']])['nombre'],
    'contacto' => comBotContactoVars($conn, $idContacto, '573000000000'),
    'flujo' => static fn(int $id) => $id === $editado['id'] ? $editado : comBotFlujo($conn, $ctx['id_sede'], $id),
    'enviar' => static function (array $s) use (&$salidas) { $salidas[] = $s; return ['ok' => true, 'clase' => 'ok', 'error' => null]; },
];

$estado = crmJsonParam('estado') ?? [];
$estado = ['id_flujo' => isset($estado['id_flujo']) ? (int)$estado['id_flujo'] : null, 'nodo' => $estado['nodo'] ?? null,
    'vars' => is_array($estado['vars'] ?? null) ? $estado['vars'] : []];
$texto = (string)($_POST['texto'] ?? '');
$norm = comNormalizar($texto);
$flujoNombre = null;
$res = null;

if (($_POST['iniciar'] ?? '0') === '1') {
    $res = comBotCorrer($sim, $editado, $editado['inicio'], []);
    $flujoNombre = $editado['nombre'];
} else {
    foreach (explode(',', (string)$cfg['palabras_asesor']) as $p) {
        $p = comNormalizar($p);
        if ($p !== '' && $norm !== '' && str_contains(' ' . $norm . ' ', ' ' . $p . ' ')) {
            if ($cfg['texto_transferencia']) $salidas[] = ['tipo' => 'texto', 'texto' => $cfg['texto_transferencia']];
            $res = comBotRes('asesor', null, null, $estado['vars']);
            break;
        }
    }
    if (!$res && $estado['id_flujo'] && $estado['nodo']) {
        $f = ($sim['flujo'])($estado['id_flujo']);
        if ($f && isset($f['nodos'][$estado['nodo']])) {
            $res = comBotResponder($sim, $f, $estado, ['texto' => $texto, 'respuesta_id' => $_POST['respuesta_id'] ?? null]);
            $flujoNombre = $f['nombre'];
        }
    }
    if (!$res) {
        // Palabras de activación: las guardadas de los otros flujos + las del editor (como si este flujo estuviera encendido).
        $extra = [];
        foreach (crmJsonParam('disparadores') ?? [] as $d) {
            $n = comNormalizar((string)($d['texto'] ?? ''));
            if ($n !== '') $extra[] = ['tipo' => in_array($d['tipo'] ?? '', ['exacta', 'empieza', 'contiene'], true) ? $d['tipo'] : 'exacta', 'texto' => $d['texto'],
                'texto_norm' => $n, 'prioridad' => (int)($d['prioridad'] ?? 0), 'id_linea' => null, 'id_flujo' => $editado['id'], 'nombre' => $editado['nombre']];
        }
        $hit = comBotBuscarDisparador($conn, $ctx['id_sede'], null, $norm, $extra, $idEditado ?: null);
        $f = $hit ? ($sim['flujo'])($hit['id_flujo']) : null;
        if (!$f && $cfg['sin_coincidencia'] === 'flujo' && $cfg['id_flujo_respaldo']) $f = ($sim['flujo'])($cfg['id_flujo_respaldo']);
        if ($f) {
            $res = comBotCorrer($sim, $f, $f['inicio'], ['_disparador' => $texto, '_respuesta' => $texto]);
            $flujoNombre = $f['nombre'];
        } else {
            if ($cfg['sin_coincidencia'] === 'mensaje' && $cfg['texto_sin_coincidencia']) $salidas[] = ['tipo' => 'texto', 'texto' => $cfg['texto_sin_coincidencia']];
            $res = comBotRes('sin_coincidencia', null, null, []);
        }
    }
}
$conn->close();
$res['estado']['vars'] = array_filter($res['estado']['vars'] ?? [], static fn($k) => $k !== '_reintentos' || $res['resultado'] === 'esperando', ARRAY_FILTER_USE_KEY);
crmOk(['salidas' => $salidas, 'resultado' => $res['resultado'], 'estado' => $res['estado'], 'flujo' => $flujoNombre, 'nota' => $res['nota'],
    'sin_coincidencia' => $cfg['sin_coincidencia']]);
