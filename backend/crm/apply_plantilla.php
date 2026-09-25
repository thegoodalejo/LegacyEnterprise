<?php
// Aplica una plantilla de nicho a la empresa de la sesión (L4+; L5 la aplica a la empresa de la sede en la que está parado).
// Solo AGREGA lo que falta: no pisa vocabulario ya personalizado ni toca roles, campos o etiquetas existentes (por nombre/clave).
// POST: plantilla (id). Devuelve {agregados, existentes} por categoría.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';
require_once '../_lib/_crm_plantillas.php';

$ctx = crmContext();
requireRole('L4');

$id = (string)($_POST['plantilla'] ?? '');
$tpl = crmPlantillas()[$id] ?? null;
if (!$tpl) authFail(404, 'Plantilla no encontrada');

$res = [];
foreach (['vocabulario', 'roles', 'campos', 'grupos', 'tags'] as $cat) $res[$cat] = ['agregados' => 0, 'existentes' => 0];
$cuenta = static function (string $cat, bool $nuevo) use (&$res): void {
    $res[$cat][$nuevo ? 'agregados' : 'existentes']++;
};

$u = $ctx['id_usuario'];
$e = $ctx['id_empresa'];
$conn = conectar();
$conn->begin_transaction();

foreach ($tpl['vocabulario'] as $clave => [$sing, $plur]) {
    $n = crmExec($conn, 'INSERT IGNORE INTO crm_vocabulario (id_empresa, clave, singular, plural, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
        'isssii', [$e, $clave, $sing, $plur, $u, $u]);
    $cuenta('vocabulario', $n > 0);
}
foreach ($tpl['roles'] as $i => $nombre) {
    $n = crmExec($conn, 'INSERT IGNORE INTO crm_roles_vinculo (id_empresa, nombre, orden, created_by, updated_by) VALUES (?, ?, ?, ?, ?)',
        'isiii', [$e, $nombre, $i + 1, $u, $u]);
    $cuenta('roles', $n > 0);
}
foreach ($tpl['campos'] as $i => [$aplicaA, $clave, $etiqueta, $tipoDato, $obligatorio]) {
    $n = crmExec($conn,
        'INSERT IGNORE INTO crm_campos_personalizados (id_empresa, aplica_a, clave, etiqueta, tipo_dato, obligatorio, orden, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 'issssiiii', [$e, $aplicaA, $clave, $etiqueta, $tipoDato, $obligatorio, $i + 1, $u, $u]);
    $cuenta('campos', $n > 0);
}
$nuevaTag = static function (?int $idGrupo, array $t, int $orden) use ($conn, $e, $u, $cuenta): void {
    $n = crmExec($conn, 'INSERT IGNORE INTO crm_tags (id_empresa, id_grupo, nombre, color, aplica_a, orden, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'iisssiii', [$e, $idGrupo, $t[0], $t[1], $t[2], $orden, $u, $u]);
    $cuenta('tags', $n > 0);
};
$orden = 0;
foreach ($tpl['grupos'] as $nombreGrupo => $tags) {
    $n = crmExec($conn, 'INSERT IGNORE INTO crm_tags_grupos (id_empresa, nombre, orden, created_by, updated_by) VALUES (?, ?, ?, ?, ?)',
        'isiii', [$e, $nombreGrupo, ++$orden, $u, $u]);
    $cuenta('grupos', $n > 0);
    $idGrupo = (int)crmRow($conn, 'SELECT id FROM crm_tags_grupos WHERE id_empresa = ? AND nombre = ?', 'is', [$e, $nombreGrupo])['id'];
    foreach ($tags as $i => $t) $nuevaTag($idGrupo, $t, $i + 1);
}
foreach ($tpl['tags'] as $i => $t) $nuevaTag(null, $t, $i + 1);

auditAdmin($conn, 'crm_aplicar_plantilla', ['plantilla' => $id, 'id_empresa' => $e, 'resultado' => $res]);
$conn->commit();
$conn->close();

crmOk($res, 'Plantilla aplicada');
