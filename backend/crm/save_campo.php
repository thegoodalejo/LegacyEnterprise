<?php
// Crea o edita la definición de un campo personalizado de la empresa (L4+). No se borran: se desactivan.
// POST: id (0 = nuevo), aplica_a, clave (opcional: se genera de la etiqueta), etiqueta, tipo_dato, obligatorio, orden, activo.
// clave y aplica_a son fijos tras crear; tipo_dato solo cambia mientras no haya valores guardados.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
requireRole('L4');

$id = (int)($_POST['id'] ?? 0);
$etiqueta = crmClean($_POST['etiqueta'] ?? null, 100, 'Etiqueta', true);
$tipoDato = (string)($_POST['tipo_dato'] ?? '');
if (!in_array($tipoDato, CRM_TIPOS_DATO, true)) authFail(400, 'Tipo de dato inválido');
$obligatorio = ($_POST['obligatorio'] ?? '0') === '1' ? 1 : 0;
$orden = max(-32000, min(32000, (int)($_POST['orden'] ?? 0)));
$activo = isset($_POST['activo']) ? (($_POST['activo'] === '1') ? 1 : 0) : 1;

$conn = conectar();
$conn->begin_transaction();

if ($id === 0) {
    $aplicaA = (string)($_POST['aplica_a'] ?? '');
    if (!in_array($aplicaA, CRM_TIPOS, true)) authFail(400, 'aplica_a inválido');
    $clave = crmClean($_POST['clave'] ?? null, 50, 'Clave') ?? $etiqueta;
    $clave = trim(preg_replace('/[^a-z0-9]+/', '_', strtr(mb_strtolower($clave), ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n'])), '_');
    $clave = mb_substr($clave, 0, 50);
    if ($clave === '') authFail(400, 'La clave no puede quedar vacía');
    if (crmRow($conn, 'SELECT 1 AS ok FROM crm_campos_personalizados WHERE id_empresa = ? AND aplica_a = ? AND clave = ? LIMIT 1', 'iss', [$ctx['id_empresa'], $aplicaA, $clave])) {
        authFail(409, 'Ya existe un campo con esa clave para ese tipo de contacto');
    }
    crmExec($conn,
        'INSERT INTO crm_campos_personalizados (id_empresa, aplica_a, clave, etiqueta, tipo_dato, obligatorio, orden, activo, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        'issssiiiii', [$ctx['id_empresa'], $aplicaA, $clave, $etiqueta, $tipoDato, $obligatorio, $orden, $activo, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
    auditAdmin($conn, 'crm_crear_campo', ['id_campo' => $id, 'clave' => $clave, 'aplica_a' => $aplicaA, 'tipo_dato' => $tipoDato]);
} else {
    $c = crmRow($conn, 'SELECT id, clave, tipo_dato FROM crm_campos_personalizados WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$id, $ctx['id_empresa']]);
    if (!$c) authFail(404, 'Campo no encontrado');
    if ($c['tipo_dato'] !== $tipoDato && crmRow($conn, 'SELECT 1 AS ok FROM crm_campos_valores WHERE id_campo = ? LIMIT 1', 'i', [$id])) {
        authFail(409, 'El tipo no se puede cambiar porque ya hay valores guardados. Desactiva este campo y crea otro.');
    }
    crmExec($conn,
        'UPDATE crm_campos_personalizados SET etiqueta = ?, tipo_dato = ?, obligatorio = ?, orden = ?, activo = ?, updated_by = ? WHERE id = ? AND id_empresa = ?',
        'ssiiiiii', [$etiqueta, $tipoDato, $obligatorio, $orden, $activo, $ctx['id_usuario'], $id, $ctx['id_empresa']]);
    auditAdmin($conn, 'crm_editar_campo', ['id_campo' => $id, 'clave' => $c['clave'], 'tipo_dato' => $tipoDato, 'activo' => $activo]);
}

$conn->commit();
$campo = crmRow($conn, 'SELECT id, aplica_a, clave, etiqueta, tipo_dato, obligatorio, orden, activo FROM crm_campos_personalizados WHERE id = ?', 'i', [$id]);
$conn->close();
$campo['id'] = (int)$campo['id'];
$campo['obligatorio'] = (int)$campo['obligatorio'] === 1;
$campo['orden'] = (int)$campo['orden'];
$campo['activo'] = (int)$campo['activo'] === 1;

crmOk($campo, 'Campo guardado');
