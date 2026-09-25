<?php
// Guarda el vocabulario de la empresa (L4+).
// POST: vocabulario (JSON {contacto|persona|organizacion|oportunidad|item: {singular, plural}}). Singular y plural vacíos = volver al nombre
// por defecto (se borra la fila); solo uno de los dos = 400. Solo se tocan las claves que vengan en el envío.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
requireRole('L4');

$voc = crmJsonParam('vocabulario');
if ($voc === null) authFail(400, 'vocabulario requerido');

$limpiar = static function (mixed $v, string $label): ?string {
    $s = crmClean($v, 40, $label);
    // Se inserta en textos con {marcadores}: sin llaves ni HTML.
    if ($s !== null && preg_match('/[{}<>]/', $s)) authFail(400, "$label contiene caracteres no permitidos");
    return $s;
};

$conn = conectar();
$conn->begin_transaction();
foreach (CRM_VOCAB_CLAVES as $clave) {
    if (!array_key_exists($clave, $voc)) continue;
    $item = is_array($voc[$clave]) ? $voc[$clave] : [];
    $sing = $limpiar($item['singular'] ?? null, "Singular de $clave");
    $plur = $limpiar($item['plural'] ?? null, "Plural de $clave");
    if ($sing === null && $plur === null) {
        crmExec($conn, 'DELETE FROM crm_vocabulario WHERE id_empresa = ? AND clave = ?', 'is', [$ctx['id_empresa'], $clave]);
    } elseif ($sing === null || $plur === null) {
        authFail(400, "Indica el singular y el plural de $clave (o deja ambos vacíos para usar el nombre por defecto)");
    } else {
        crmExec($conn,
            'INSERT INTO crm_vocabulario (id_empresa, clave, singular, plural, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE singular = VALUES(singular), plural = VALUES(plural), updated_by = VALUES(updated_by)',
            'isssii', [$ctx['id_empresa'], $clave, $sing, $plur, $ctx['id_usuario'], $ctx['id_usuario']]);
    }
}
auditAdmin($conn, 'crm_guardar_vocabulario', ['id_empresa' => $ctx['id_empresa'], 'claves' => array_keys($voc)]);
$conn->commit();

$rows = crmRows($conn, 'SELECT clave, singular, plural FROM crm_vocabulario WHERE id_empresa = ?', 'i', [$ctx['id_empresa']]);
$conn->close();
$out = [];
foreach ($rows as $r) $out[$r['clave']] = ['singular' => $r['singular'], 'plural' => $r['plural']];

crmOk(['vocabulario' => (object)$out], 'Vocabulario guardado');
