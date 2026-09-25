<?php
// Plantillas de arranque por nicho (ver _lib/_crm_plantillas.php) con su contenido, para previsualizar antes de aplicar (L4+).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';
require_once '../_lib/_crm_plantillas.php';

crmContext();
requireRole('L4');

$out = [];
foreach (crmPlantillas() as $id => $t) {
    $out[] = [
        'id' => $id,
        'vocabulario' => (object)array_map(static fn($v) => ['singular' => $v[0], 'plural' => $v[1]], $t['vocabulario']),
        'roles' => $t['roles'],
        'campos' => array_map(static fn($c) => ['aplica_a' => $c[0], 'etiqueta' => $c[2], 'tipo_dato' => $c[3]], $t['campos']),
        'grupos' => array_map(static fn($nombre, $tags) => ['nombre' => $nombre, 'tags' => array_column($tags, 0)], array_keys($t['grupos']), array_values($t['grupos'])),
        'tags' => array_column($t['tags'], 0),
    ];
}

crmOk(['plantillas' => $out]);
