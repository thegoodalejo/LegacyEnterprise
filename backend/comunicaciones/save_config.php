<?php
// Guarda los ajustes de Comunicaciones de la sede (L4).
// POST: fuente_creditos (sede|empresa), palabras_asesor (separadas por coma), sesion_minutos (5–1440),
//       sin_coincidencia (bandeja|mensaje|flujo), texto_sin_coincidencia, id_flujo_respaldo, texto_transferencia, texto_cierre, enviar_texto_cierre (0|1).
// Un campo que no viene en el POST conserva su valor actual (así una pantalla puede guardar solo lo suyo).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com.php';

$ctx = comContext();
requireRole('L4');
$conn = conectar();
$antes = comConfigSede($conn, $ctx['id_sede']);
foreach (['fuente_creditos', 'palabras_asesor', 'sesion_minutos', 'sin_coincidencia', 'texto_sin_coincidencia', 'id_flujo_respaldo', 'texto_transferencia',
          'texto_cierre', 'enviar_texto_cierre'] as $k) {
    if (!array_key_exists($k, $_POST)) $_POST[$k] = $antes[$k] === null ? '' : (string)$antes[$k];
}

$fuente = (string)($_POST['fuente_creditos'] ?? 'sede');
if (!in_array($fuente, ['sede', 'empresa'], true)) authFail(400, 'Fuente de créditos inválida');
$palabras = array_values(array_unique(array_filter(array_map(static fn($p) => mb_substr(trim($p), 0, 40), explode(',', (string)($_POST['palabras_asesor'] ?? ''))),
    static fn($p) => $p !== '')));
if (count($palabras) > 20) authFail(400, 'Máximo 20 palabras para pedir asesor');
$sesion = (int)($_POST['sesion_minutos'] ?? 30);
if ($sesion < 5 || $sesion > 1440) authFail(400, 'La sesión del chatbot debe durar entre 5 y 1440 minutos');
$sin = (string)($_POST['sin_coincidencia'] ?? 'bandeja');
if (!in_array($sin, ['bandeja', 'mensaje', 'flujo'], true)) authFail(400, 'Opción inválida para «sin coincidencia»');
$textoSin = crmClean($_POST['texto_sin_coincidencia'] ?? null, 1000, 'Mensaje sin coincidencia');
$idFlujo = (int)($_POST['id_flujo_respaldo'] ?? 0) ?: null;
$textoTransf = crmClean($_POST['texto_transferencia'] ?? null, 1000, 'Mensaje al pasar a un asesor');
$textoCierre = crmClean($_POST['texto_cierre'] ?? null, 1000, 'Mensaje de cierre');
$enviarCierre = ($_POST['enviar_texto_cierre'] ?? '0') === '1' ? 1 : 0;
if ($sin === 'mensaje' && $textoSin === null) authFail(400, 'Escribe el mensaje que se envía cuando ninguna palabra coincide');
if ($enviarCierre && $textoCierre === null) authFail(400, 'Escribe el mensaje de cierre o desactiva su envío');

if ($sin === 'flujo') {
    if (!$idFlujo || !crmRow($conn, 'SELECT 1 AS ok FROM com_flujos WHERE id = ? AND id_sede = ? AND activo = 1 AND borrado = 0', 'ii', [$idFlujo, $ctx['id_sede']])) {
        authFail(400, 'Elige un flujo activo de respaldo');
    }
} else {
    $idFlujo = null;
}
crmExec($conn,
    'INSERT INTO com_config_sede (id_sede, fuente_creditos, palabras_asesor, sesion_minutos, sin_coincidencia, texto_sin_coincidencia, id_flujo_respaldo,
                                  texto_transferencia, texto_cierre, enviar_texto_cierre, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE fuente_creditos = VALUES(fuente_creditos), palabras_asesor = VALUES(palabras_asesor), sesion_minutos = VALUES(sesion_minutos),
        sin_coincidencia = VALUES(sin_coincidencia), texto_sin_coincidencia = VALUES(texto_sin_coincidencia), id_flujo_respaldo = VALUES(id_flujo_respaldo),
        texto_transferencia = VALUES(texto_transferencia), texto_cierre = VALUES(texto_cierre), enviar_texto_cierre = VALUES(enviar_texto_cierre),
        updated_by = VALUES(updated_by)',
    'issississiii',
    [$ctx['id_sede'], $fuente, implode(', ', $palabras), $sesion, $sin, $textoSin, $idFlujo, $textoTransf, $textoCierre, $enviarCierre, $ctx['id_usuario'], $ctx['id_usuario']]);
if ($antes['fuente_creditos'] !== $fuente) {
    auditAdmin($conn, 'com_fuente_creditos', ['antes' => $antes['fuente_creditos'], 'despues' => $fuente]);
}
$conn->close();
crmOk([], 'Ajustes guardados');
