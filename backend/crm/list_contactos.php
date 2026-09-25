<?php
// Listado de contactos de la sede activa: filtros combinables (ver crmFiltros), orden y paginación en servidor.
// POST: filtros (JSON), pagina, por_pagina, orden (nombre|creado|tipo), dir (asc|desc).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
$filtros   = crmJsonParam('filtros') ?? [];
$pagina    = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(CRM_POR_PAGINA_MAX, max(1, (int)($_POST['por_pagina'] ?? 25)));
$orden     = ['nombre' => 'c.nombre_completo', 'creado' => 'c.created_at', 'tipo' => 'c.tipo'][$_POST['orden'] ?? 'nombre'] ?? 'c.nombre_completo';
$dir       = strtolower((string)($_POST['dir'] ?? 'asc')) === 'desc' ? 'DESC' : 'ASC';

$conn = conectar();
$f = crmFiltros($conn, $ctx, $filtros);
$total = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_contactos c WHERE ' . $f['sql'], $f['types'], $f['params'])['n'];

$rows = crmRows($conn,
    "SELECT c.id, c.tipo, c.nombre_completo, c.telefono, c.ciudad, c.activo, c.created_at,
            COALESCE(p.correo, o.correo_facturacion)         AS correo,
            COALESCE(p.documento_numero, o.documento_numero) AS documento_numero,
            COALESCE(cu.nombre, cu.email) AS creado_por_nombre,
            COALESCE(ru.nombre, ru.email) AS responsable_nombre,
            pd.nombre_completo AS padre_nombre
       FROM crm_contactos c
  LEFT JOIN crm_contactos_personas p ON p.id = c.id
  LEFT JOIN crm_contactos_organizaciones o ON o.id = c.id
  LEFT JOIN crm_contactos pd ON pd.id = o.id_padre
  LEFT JOIN le_usuarios cu ON cu.id = c.created_by
  LEFT JOIN le_usuarios ru ON ru.id = c.id_responsable
      WHERE {$f['sql']}
   ORDER BY $orden $dir, c.id ASC
      LIMIT ? OFFSET ?",
    $f['types'] . 'ii', [...$f['params'], $porPagina, ($pagina - 1) * $porPagina]);

// Etiquetas y relaciones de la página en dos consultas (sin N+1).
$ids = array_map(static fn($r) => (int)$r['id'], $rows);
$tags = []; $rel = [];
if ($ids) {
    $m = crmMarks(count($ids));
    $ti = str_repeat('i', count($ids));
    foreach (crmRows($conn,
        "SELECT ct.id_contacto, t.id, t.nombre, t.color FROM crm_contacto_tags ct JOIN crm_tags t ON t.id = ct.id_tag
          WHERE ct.id_contacto IN ($m) ORDER BY t.orden, t.nombre", $ti, $ids) as $r) {
        $tags[(int)$r['id_contacto']][] = ['id' => (int)$r['id'], 'nombre' => $r['nombre'], 'color' => $r['color']];
    }
    // Organización → sus personas (principal primero); Persona → sus organizaciones.
    foreach (crmRows($conn,
        "SELECT v.id_organizacion AS id_contacto, c.nombre_completo AS nombre, v.principal
           FROM crm_contacto_vinculos v JOIN crm_contactos c ON c.id = v.id_persona
          WHERE v.id_organizacion IN ($m) ORDER BY v.principal DESC, c.nombre_completo", $ti, $ids) as $r) {
        $rel[(int)$r['id_contacto']][] = $r['nombre'];
    }
    foreach (crmRows($conn,
        "SELECT v.id_persona AS id_contacto, c.nombre_completo AS nombre
           FROM crm_contacto_vinculos v JOIN crm_contactos c ON c.id = v.id_organizacion
          WHERE v.id_persona IN ($m) ORDER BY c.nombre_completo", $ti, $ids) as $r) {
        $rel[(int)$r['id_contacto']][] = $r['nombre'];
    }
}
$conn->close();

foreach ($rows as &$r) {
    $r['id'] = (int)$r['id'];
    $r['activo'] = (int)$r['activo'] === 1;
    $r['tags'] = $tags[$r['id']] ?? [];
    $nombres = $rel[$r['id']] ?? [];
    $r['relacion'] = ['total' => count($nombres), 'nombres' => array_slice($nombres, 0, 2)];
}

crmOk(['contactos' => $rows, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina]);
