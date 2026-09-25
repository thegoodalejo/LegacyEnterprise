<?php
// Contactos para exportar a PDF/Excel (los arma el navegador), por páginas. Misma selección que las acciones en lote:
// POST: seleccion (JSON {ids:[…]} o {filtros:{…}, excluidos:[…], total_esperado:N}), pagina, por_pagina (máx. 1000),
//       orden (nombre|creado|tipo), dir (asc|desc), formato (pdf|xlsx, solo para la auditoría).
// Devuelve {contactos:[…], campos:[definiciones activas], total, pagina, por_pagina}. Cada contacto trae etiquetas, vínculos
// (con rol) y los valores personalizados ({id_campo: valor}). Se rechaza (409) si el total cambió desde que el usuario lo vio.
// La primera página deja una fila en le_H_admin (crm_exportar): quién exportó qué y cuántas filas (datos personales).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
$sel = crmJsonParam('seleccion') ?? [];
$pagina    = max(1, (int)($_POST['pagina'] ?? 1));
$porPagina = min(CRM_EXPORT_PAGINA_MAX, max(1, (int)($_POST['por_pagina'] ?? 500)));
$orden     = ['nombre' => 'c.nombre_completo', 'creado' => 'c.created_at', 'tipo' => 'c.tipo'][$_POST['orden'] ?? 'nombre'] ?? 'c.nombre_completo';
$dir       = strtolower((string)($_POST['dir'] ?? 'asc')) === 'desc' ? 'DESC' : 'ASC';

$conn = conectar();
$w = crmSeleccionWhere($conn, $ctx, $sel);
$total = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_contactos c WHERE ' . $w['sql'], $w['types'], $w['params'])['n'];
if (isset($sel['total_esperado']) && (int)$sel['total_esperado'] !== $total) authFail(409, 'Los resultados cambiaron desde que los seleccionaste. Vuelve a exportar.');
if ($total === 0) authFail(400, 'No hay contactos para exportar');
if ($total > CRM_EXPORT_MAX) authFail(400, 'Máximo ' . number_format(CRM_EXPORT_MAX, 0, ',', '.') . ' contactos por exportación. Afina el filtro.');

$rows = crmRows($conn,
    "SELECT c.id, c.tipo, c.nombre_completo, c.direccion, c.ciudad, c.lat, c.lng, c.telefono, c.activo, c.created_at, c.updated_at,
            COALESCE(p.documento_tipo, o.documento_tipo)     AS documento_tipo,
            COALESCE(p.documento_numero, o.documento_numero) AS documento_numero,
            COALESCE(p.correo, o.correo_facturacion)         AS correo,
            p.whatsapp_indicativo, p.whatsapp_numero, p.fecha_nacimiento,
            pd.nombre_completo AS padre_nombre,
            COALESCE(cu.nombre, cu.email) AS creado_por,
            COALESCE(uu.nombre, uu.email) AS modificado_por,
            COALESCE(ru.nombre, ru.email) AS responsable
       FROM crm_contactos c
  LEFT JOIN crm_contactos_personas p ON p.id = c.id
  LEFT JOIN crm_contactos_organizaciones o ON o.id = c.id
  LEFT JOIN crm_contactos pd ON pd.id = o.id_padre
  LEFT JOIN le_usuarios cu ON cu.id = c.created_by
  LEFT JOIN le_usuarios uu ON uu.id = c.updated_by
  LEFT JOIN le_usuarios ru ON ru.id = c.id_responsable
      WHERE {$w['sql']}
   ORDER BY $orden $dir, c.id ASC
      LIMIT ? OFFSET ?",
    $w['types'] . 'ii', [...$w['params'], $porPagina, ($pagina - 1) * $porPagina]);

$campos = array_values(array_filter(crmCampos($conn, $ctx['id_empresa']), static fn($d) => $d['activo'] && in_array($d['aplica_a'], CRM_TIPOS, true)));
$tipoCampo = [];
foreach ($campos as $d) $tipoCampo[$d['id']] = $d['tipo_dato'];

$ids = array_map(static fn($r) => (int)$r['id'], $rows);
$tags = []; $vinculos = []; $valores = [];
if ($ids) {
    $m = crmMarks(count($ids));
    $ti = str_repeat('i', count($ids));
    foreach (crmRows($conn,
        "SELECT ct.id_contacto, t.nombre FROM crm_contacto_tags ct JOIN crm_tags t ON t.id = ct.id_tag
          WHERE ct.id_contacto IN ($m) ORDER BY t.orden, t.nombre", $ti, $ids) as $r) {
        $tags[(int)$r['id_contacto']][] = $r['nombre'];
    }
    // Organización → sus personas (principal primero); Persona → sus organizaciones. Con el rol del vínculo.
    foreach (crmRows($conn,
        "SELECT v.id_organizacion AS id_contacto, c.nombre_completo AS nombre, ro.nombre AS rol, v.principal
           FROM crm_contacto_vinculos v JOIN crm_contactos c ON c.id = v.id_persona LEFT JOIN crm_roles_vinculo ro ON ro.id = v.id_rol
          WHERE v.id_organizacion IN ($m) ORDER BY v.principal DESC, c.nombre_completo", $ti, $ids) as $r) {
        $vinculos[(int)$r['id_contacto']][] = ['nombre' => $r['nombre'], 'rol' => $r['rol'], 'principal' => (int)$r['principal'] === 1];
    }
    foreach (crmRows($conn,
        "SELECT v.id_persona AS id_contacto, c.nombre_completo AS nombre, ro.nombre AS rol, v.principal
           FROM crm_contacto_vinculos v JOIN crm_contactos c ON c.id = v.id_organizacion LEFT JOIN crm_roles_vinculo ro ON ro.id = v.id_rol
          WHERE v.id_persona IN ($m) ORDER BY c.nombre_completo", $ti, $ids) as $r) {
        $vinculos[(int)$r['id_contacto']][] = ['nombre' => $r['nombre'], 'rol' => $r['rol'], 'principal' => (int)$r['principal'] === 1];
    }
    foreach (crmRows($conn,
        "SELECT id_contacto, id_campo, valor_entero, valor_decimal, valor_texto, valor_booleano, valor_fecha
           FROM crm_campos_valores WHERE id_contacto IN ($m)", $ti, $ids) as $r) {
        $tipo = $tipoCampo[(int)$r['id_campo']] ?? null;
        if ($tipo === null) continue;   // campo desactivado: no se exporta como columna
        $valores[(int)$r['id_contacto']][(int)$r['id_campo']] = crmValorDeFila($r, $tipo);
    }
}

if ($pagina === 1) {
    $fmt = in_array($_POST['formato'] ?? '', ['pdf', 'xlsx'], true) ? $_POST['formato'] : null;
    auditAdmin($conn, 'crm_exportar', [
        'reporte' => 'contactos', 'formato' => $fmt, 'filas' => $total,
        'seleccion' => isset($sel['ids']) ? ['ids' => count(crmInts($sel['ids']))] : ['filtros' => $sel['filtros'], 'excluidos' => count(crmInts($sel['excluidos'] ?? []))],
    ]);
}
$conn->close();

foreach ($rows as &$r) {
    $r['id'] = (int)$r['id'];
    $r['activo'] = (int)$r['activo'] === 1;
    foreach (['lat', 'lng'] as $k) if ($r[$k] !== null) $r[$k] = (float)$r[$k];
    $r['etiquetas'] = $tags[$r['id']] ?? [];
    $r['vinculos'] = $vinculos[$r['id']] ?? [];
    $r['campos'] = (object)($valores[$r['id']] ?? []);
}
unset($r);

crmOk([
    'contactos' => $rows, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina,
    'campos' => array_map(static fn($d) => ['id' => $d['id'], 'aplica_a' => $d['aplica_a'], 'etiqueta' => $d['etiqueta'], 'tipo_dato' => $d['tipo_dato']], $campos),
]);
