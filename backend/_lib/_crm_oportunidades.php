<?php
// Helpers de oportunidades del CRM (backend/crm/*oportunidad*, *embudo*, *etapa*, *motivo*, *item*). Diseño: docs/modulos/crm.md (Hoja de ruta, fase A).
// Reglas que viven aquí para que ningún endpoint las reimplemente:
//   - la sede y la empresa SIEMPRE salen de la sesión (crmContext); la configuración (embudos, etapas, motivos, catálogo) es de la EMPRESA;
//   - el estado (abierta/ganada/perdida) sale del TIPO de la etapa: solo crmOpMover lo cambia;
//   - un solo constructor de filtros (crmOpFiltros) sirve al listado, al tablero, a las acciones en lote y a las exportaciones.

require_once __DIR__ . '/_crm.php';

const CRM_OP_TABLERO_POR_COLUMNA = 25;   // tarjetas por columna del tablero (el resto se pide con «ver más»)
const CRM_OP_LINEAS_MAX = 100;
const CRM_OP_ESTADOS_PLURAL = ['abiertas' => 'abierta', 'ganadas' => 'ganada', 'perdidas' => 'perdida'];

// ─── Configuración de la empresa ─────────────────────────────────────────────────────────────────────────────────────

/** Moneda y decimales de los montos (por defecto COP, sin decimales). */
function crmConfig(mysqli $conn, int $idEmpresa): array
{
    $r = crmRow($conn, 'SELECT moneda, decimales FROM crm_config WHERE id_empresa = ?', 'i', [$idEmpresa]);
    return ['moneda' => $r['moneda'] ?? 'COP', 'decimales' => isset($r['decimales']) ? (int)$r['decimales'] : 0];
}

function crmEtapaOut(array $e): array
{
    return [
        'id' => (int)$e['id'], 'id_embudo' => (int)$e['id_embudo'], 'nombre' => $e['nombre'], 'orden' => (int)$e['orden'],
        'probabilidad' => (int)$e['probabilidad'], 'tipo' => $e['tipo'], 'color' => $e['color'], 'activo' => (int)$e['activo'] === 1,
    ];
}

/** Embudos de la empresa con sus etapas: [{id, nombre, orden, activo, etapas:[…]}]. */
function crmEmbudos(mysqli $conn, int $idEmpresa, bool $soloActivos = false): array
{
    $filtro = $soloActivos ? ' AND activo = 1' : '';
    $emb = crmRows($conn, "SELECT id, nombre, orden, activo FROM crm_embudos WHERE id_empresa = ?$filtro ORDER BY orden, id", 'i', [$idEmpresa]);
    $porEmbudo = [];
    foreach (crmRows($conn, "SELECT id, id_embudo, nombre, orden, probabilidad, tipo, color, activo FROM crm_etapas WHERE id_empresa = ?$filtro ORDER BY orden, id", 'i', [$idEmpresa]) as $e) {
        $porEmbudo[(int)$e['id_embudo']][] = crmEtapaOut($e);
    }
    foreach ($emb as &$m) {
        $m['id'] = (int)$m['id']; $m['orden'] = (int)$m['orden']; $m['activo'] = (int)$m['activo'] === 1;
        $m['etapas'] = $porEmbudo[$m['id']] ?? [];
    }
    return $emb;
}

/** Etapa de la empresa por id, o null. */
function crmEtapa(mysqli $conn, array $ctx, int $id): ?array
{
    $e = crmRow($conn, 'SELECT id, id_embudo, nombre, orden, probabilidad, tipo, color, activo FROM crm_etapas WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$id, $ctx['id_empresa']]);
    return $e ? crmEtapaOut($e) : null;
}

/** Primera etapa abierta y activa (del embudo indicado, o del primer embudo activo). */
function crmEtapaInicial(mysqli $conn, array $ctx, int $idEmbudo = 0): ?array
{
    $e = crmRow($conn,
        "SELECT e.id, e.id_embudo, e.nombre, e.orden, e.probabilidad, e.tipo, e.color, e.activo
           FROM crm_etapas e JOIN crm_embudos b ON b.id = e.id_embudo
          WHERE e.id_empresa = ? AND e.activo = 1 AND b.activo = 1 AND e.tipo = 'abierta'" . ($idEmbudo > 0 ? ' AND e.id_embudo = ?' : '') . '
       ORDER BY b.orden, b.id, e.orden, e.id LIMIT 1', $idEmbudo > 0 ? 'ii' : 'i', $idEmbudo > 0 ? [$ctx['id_empresa'], $idEmbudo] : [$ctx['id_empresa']]);
    return $e ? crmEtapaOut($e) : null;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** SELECT y JOINs comunes del listado y el tablero (alias o, c, pc, e, ru). id_venta = su venta activa (registrada desde la oportunidad), o NULL. */
function crmOpSelect(): string
{
    return "SELECT o.id, o.titulo, o.id_embudo, o.id_etapa, o.id_contacto, o.id_persona_contacto, o.id_responsable, o.valor, o.fecha_cierre_estimada,
                   o.estado, o.fecha_cierre_real, o.etapa_desde, o.activo, o.created_at,
                   (SELECT MAX(v.id) FROM crm_ventas v WHERE v.id_oportunidad = o.id AND v.activo = 1) AS id_venta,
                   c.nombre_completo AS contacto_nombre, c.tipo AS contacto_tipo, pc.nombre_completo AS persona_nombre,
                   e.nombre AS etapa_nombre, e.tipo AS etapa_tipo, e.probabilidad AS etapa_probabilidad, e.color AS etapa_color,
                   COALESCE(ru.nombre, ru.email) AS responsable_nombre
              " . crmOpFrom();
}

function crmOpFrom(): string
{
    return 'FROM crm_oportunidades o
              JOIN crm_contactos c ON c.id = o.id_contacto
         LEFT JOIN crm_contactos pc ON pc.id = o.id_persona_contacto
              JOIN crm_etapas e ON e.id = o.id_etapa
         LEFT JOIN le_usuarios ru ON ru.id = o.id_responsable';
}

/** Da tipos a una fila del listado y le agrega sus etiquetas (una consulta para todas las filas). */
function crmOpFilas(mysqli $conn, array $rows): array
{
    $ids = array_map(static fn($r) => (int)$r['id'], $rows);
    $tags = [];
    if ($ids) {
        foreach (crmRows($conn,
            'SELECT ot.id_oportunidad, t.id, t.nombre, t.color FROM crm_oportunidad_tags ot JOIN crm_tags t ON t.id = ot.id_tag
              WHERE ot.id_oportunidad IN (' . crmMarks(count($ids)) . ') ORDER BY t.orden, t.nombre', str_repeat('i', count($ids)), $ids) as $r) {
            $tags[(int)$r['id_oportunidad']][] = ['id' => (int)$r['id'], 'nombre' => $r['nombre'], 'color' => $r['color']];
        }
    }
    foreach ($rows as &$r) {
        foreach (['id', 'id_embudo', 'id_etapa', 'id_contacto', 'etapa_probabilidad'] as $k) $r[$k] = (int)$r[$k];
        foreach (['id_persona_contacto', 'id_responsable', 'id_venta'] as $k) $r[$k] = $r[$k] !== null ? (int)$r[$k] : null;
        $r['valor'] = (float)$r['valor'];
        $r['activo'] = (int)$r['activo'] === 1;
        $r['tags'] = $tags[$r['id']] ?? [];
    }
    return $rows;
}

/** Oportunidad completa (con quién la creó/modificó) de la sede de la sesión, o null. */
function crmOpBase(mysqli $conn, array $ctx, int $id): ?array
{
    $r = crmRow($conn,
        'SELECT o.id, o.id_embudo, o.id_etapa, o.titulo, o.id_contacto, o.id_persona_contacto, o.id_responsable, o.valor, o.fecha_cierre_estimada,
                o.estado, o.fecha_cierre_real, o.id_motivo_cierre, o.descripcion, o.etapa_desde, o.activo,
                o.created_at, o.created_by, o.updated_at, o.updated_by,
                c.nombre_completo AS contacto_nombre, c.tipo AS contacto_tipo, c.activo AS contacto_activo, pc.nombre_completo AS persona_nombre,
                e.nombre AS etapa_nombre, e.tipo AS etapa_tipo, e.probabilidad AS etapa_probabilidad, e.color AS etapa_color,
                b.nombre AS embudo_nombre, m.nombre AS motivo_nombre,
                COALESCE(ru.nombre, ru.email) AS responsable_nombre, COALESCE(cu.nombre, cu.email) AS creado_por_nombre,
                COALESCE(uu.nombre, uu.email) AS modificado_por_nombre
           FROM crm_oportunidades o
           JOIN crm_contactos c ON c.id = o.id_contacto
      LEFT JOIN crm_contactos pc ON pc.id = o.id_persona_contacto
           JOIN crm_etapas e ON e.id = o.id_etapa
           JOIN crm_embudos b ON b.id = o.id_embudo
      LEFT JOIN crm_motivos_cierre m ON m.id = o.id_motivo_cierre
      LEFT JOIN le_usuarios ru ON ru.id = o.id_responsable
      LEFT JOIN le_usuarios cu ON cu.id = o.created_by
      LEFT JOIN le_usuarios uu ON uu.id = o.updated_by
          WHERE o.id = ? AND o.id_sede = ? LIMIT 1', 'ii', [$id, $ctx['id_sede']]);
    if (!$r) return null;
    foreach (['id', 'id_embudo', 'id_etapa', 'id_contacto', 'etapa_probabilidad'] as $k) $r[$k] = (int)$r[$k];
    foreach (['id_persona_contacto', 'id_responsable', 'id_motivo_cierre', 'created_by', 'updated_by'] as $k) $r[$k] = $r[$k] !== null ? (int)$r[$k] : null;
    $r['valor'] = (float)$r['valor'];
    $r['activo'] = (int)$r['activo'] === 1;
    $r['contacto_activo'] = (int)$r['contacto_activo'] === 1;
    return $r;
}

/**
 * La venta ACTIVA registrada desde esta oportunidad (como mucho una: regla de save_venta y anular_venta), o null.
 * Puede ser la manual o la importada que la reemplazó (el vínculo pasa a la importada).
 */
function crmOpVenta(mysqli $conn, array $ctx, int $idOp): ?array
{
    $v = crmRow($conn,
        'SELECT v.id, v.fecha, v.documento, v.total, v.id_importacion, v.created_at, COALESCE(u.nombre, u.email) AS creado_por
           FROM crm_ventas v LEFT JOIN le_usuarios u ON u.id = v.created_by
          WHERE v.id_oportunidad = ? AND v.id_sede = ? AND v.activo = 1 ORDER BY v.id DESC LIMIT 1', 'ii', [$idOp, $ctx['id_sede']]);
    if (!$v) return null;
    $v['id'] = (int)$v['id']; $v['total'] = (float)$v['total'];
    $v['id_importacion'] = $v['id_importacion'] !== null ? (int)$v['id_importacion'] : null;
    return $v;
}

function crmOpLineas(mysqli $conn, int $idOp): array
{
    $rows = crmRows($conn,
        'SELECT l.id, l.orden, l.id_item, i.codigo AS item_codigo, i.nombre AS item_nombre, i.unidad AS item_unidad, l.descripcion, l.cantidad, l.precio_unitario, l.total
           FROM crm_oportunidad_lineas l LEFT JOIN crm_catalogo_items i ON i.id = l.id_item
          WHERE l.id_oportunidad = ? ORDER BY l.orden, l.id', 'i', [$idOp]);
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id']; $r['orden'] = (int)$r['orden'];
        $r['id_item'] = $r['id_item'] !== null ? (int)$r['id_item'] : null;
        $r['cantidad'] = (float)$r['cantidad']; $r['precio_unitario'] = (float)$r['precio_unitario']; $r['total'] = (float)$r['total'];
    }
    return $rows;
}

function crmOpTags(mysqli $conn, int $idOp): array
{
    $rows = crmRows($conn,
        'SELECT t.id, t.nombre, t.color, t.id_grupo, t.activo FROM crm_oportunidad_tags ot JOIN crm_tags t ON t.id = ot.id_tag
          WHERE ot.id_oportunidad = ? ORDER BY t.orden, t.nombre', 'i', [$idOp]);
    return array_map(static fn($r) => [
        'id' => (int)$r['id'], 'nombre' => $r['nombre'], 'color' => $r['color'],
        'id_grupo' => $r['id_grupo'] !== null ? (int)$r['id_grupo'] : null, 'activo' => (int)$r['activo'] === 1,
    ], $rows);
}

// ─── Filtros (listado, tablero, lote, exportación) ───────────────────────────────────────────────────────────────────

/**
 * Condición WHERE (alias o, c, pc, e) para los filtros de oportunidades.
 * Claves: q (título, contacto o persona de contacto; sin tildes, por palabras), archivo (activas|archivadas|todas), estado (abiertas|ganadas|perdidas),
 * id_embudo, etapas[], responsable, sin_responsable, contacto (id: como cliente o como persona de contacto), creado_por, creado_desde/hasta,
 * cierre_desde/hasta (fecha de cierre estimada), valor_min/valor_max, tags[], tags_modo (cualquiera|todos), campos[{id_campo, op, valor, valor2}].
 * Devuelve ['sql' => …, 'types' => …, 'params' => […]].
 */
function crmOpFiltros(mysqli $conn, array $ctx, array $f): array
{
    $w = ['o.id_sede = ?'];
    $t = 'i';
    $p = [$ctx['id_sede']];

    $archivo = $f['archivo'] ?? 'activas';
    if ($archivo === 'activas') $w[] = 'o.activo = 1';
    elseif ($archivo === 'archivadas') $w[] = 'o.activo = 0';
    elseif ($archivo !== 'todas') authFail(400, 'Filtro de archivo inválido');

    $estado = (string)($f['estado'] ?? '');
    if ($estado !== '') {
        if (!isset(CRM_OP_ESTADOS_PLURAL[$estado])) authFail(400, 'Filtro de estado inválido');
        $w[] = 'o.estado = ?'; $t .= 's'; $p[] = CRM_OP_ESTADOS_PLURAL[$estado];
    }
    if (!empty($f['id_embudo'])) { $w[] = 'o.id_embudo = ?'; $t .= 'i'; $p[] = (int)$f['id_embudo']; }
    $etapas = crmInts($f['etapas'] ?? []);
    if ($etapas) { $w[] = 'o.id_etapa IN (' . crmMarks(count($etapas)) . ')'; $t .= str_repeat('i', count($etapas)); array_push($p, ...$etapas); }
    if (!empty($f['responsable'])) { $w[] = 'o.id_responsable = ?'; $t .= 'i'; $p[] = (int)$f['responsable']; }
    elseif (!empty($f['sin_responsable'])) $w[] = 'o.id_responsable IS NULL';
    if (!empty($f['contacto'])) { $w[] = '(o.id_contacto = ? OR o.id_persona_contacto = ?)'; $t .= 'ii'; $p[] = (int)$f['contacto']; $p[] = (int)$f['contacto']; }
    if (!empty($f['creado_por'])) { $w[] = 'o.created_by = ?'; $t .= 'i'; $p[] = (int)$f['creado_por']; }

    $desde = crmFecha($f['creado_desde'] ?? null, 'Creado desde');
    if ($desde !== null) { $w[] = 'o.created_at >= ?'; $t .= 's'; $p[] = $desde . ' 00:00:00'; }
    $hasta = crmFecha($f['creado_hasta'] ?? null, 'Creado hasta');
    if ($hasta !== null) { $w[] = 'o.created_at < ?'; $t .= 's'; $p[] = (new DateTimeImmutable($hasta))->modify('+1 day')->format('Y-m-d') . ' 00:00:00'; }
    $cd = crmFecha($f['cierre_desde'] ?? null, 'Cierre desde');
    if ($cd !== null) { $w[] = 'o.fecha_cierre_estimada >= ?'; $t .= 's'; $p[] = $cd; }
    $ch = crmFecha($f['cierre_hasta'] ?? null, 'Cierre hasta');
    if ($ch !== null) { $w[] = 'o.fecha_cierre_estimada <= ?'; $t .= 's'; $p[] = $ch; }
    $vmin = crmDecimal($f['valor_min'] ?? null, 'Valor mínimo');
    if ($vmin !== null) { $w[] = 'o.valor >= ?'; $t .= 's'; $p[] = $vmin; }
    $vmax = crmDecimal($f['valor_max'] ?? null, 'Valor máximo');
    if ($vmax !== null) { $w[] = 'o.valor <= ?'; $t .= 's'; $p[] = $vmax; }

    // Texto: cada palabra debe aparecer en el título, en el contacto o en la persona de contacto.
    $q = trim((string)($f['q'] ?? ''));
    if ($q !== '') {
        foreach (array_slice(preg_split('/\s+/u', $q) ?: [], 0, 8) as $tok) {
            $like = '%' . addcslashes(mb_substr($tok, 0, 60), '\%_') . '%';
            $w[] = '(o.titulo LIKE ? OR c.busqueda LIKE ? OR pc.busqueda LIKE ?)';
            $t .= 'sss'; array_push($p, $like, $like, $like);
        }
    }

    $tags = crmInts($f['tags'] ?? []);
    if ($tags) {
        $marks = crmMarks(count($tags));
        if (($f['tags_modo'] ?? 'cualquiera') === 'todos') {
            $w[] = "(SELECT COUNT(*) FROM crm_oportunidad_tags ot WHERE ot.id_oportunidad = o.id AND ot.id_tag IN ($marks)) = ?";
            $t .= str_repeat('i', count($tags)) . 'i'; array_push($p, ...$tags); $p[] = count($tags);
        } else {
            $w[] = "EXISTS (SELECT 1 FROM crm_oportunidad_tags ot WHERE ot.id_oportunidad = o.id AND ot.id_tag IN ($marks))";
            $t .= str_repeat('i', count($tags)); array_push($p, ...$tags);
        }
    }

    $campos = is_array($f['campos'] ?? null) ? array_slice($f['campos'], 0, 10) : [];
    if ($campos) {
        $ids = crmInts(array_column($campos, 'id_campo'));
        $defs = [];
        if ($ids) {
            foreach (crmRows($conn,
                "SELECT id, tipo_dato, etiqueta FROM crm_campos_personalizados WHERE id_empresa = ? AND aplica_a = 'oportunidad' AND id IN (" . crmMarks(count($ids)) . ')',
                'i' . str_repeat('i', count($ids)), [$ctx['id_empresa'], ...$ids]) as $d) $defs[(int)$d['id']] = $d;
        }
        foreach ($campos as $cf) {
            $def = $defs[(int)($cf['id_campo'] ?? 0)] ?? null;
            if (!$def) authFail(400, 'Filtro por un campo personalizado inexistente');
            [$cond, $ct, $cp] = crmCondicionCampo($def, (string)($cf['op'] ?? ''), $cf['valor'] ?? null, $cf['valor2'] ?? null);
            $w[] = "EXISTS (SELECT 1 FROM crm_oportunidad_valores v WHERE v.id_oportunidad = o.id AND v.id_campo = ? AND $cond)";
            $t .= 'i' . $ct; $p[] = (int)$def['id']; array_push($p, ...$cp);
        }
    }
    return ['sql' => implode(' AND ', $w), 'types' => $t, 'params' => $p];
}

/** Orden del listado: clave del cliente → expresión SQL. */
function crmOpOrden(mixed $orden, mixed $dir): string
{
    $col = ['creado' => 'o.created_at', 'titulo' => 'o.titulo', 'valor' => 'o.valor', 'etapa' => 'e.orden',
            'cierre' => 'o.fecha_cierre_estimada IS NULL, o.fecha_cierre_estimada', 'contacto' => 'c.nombre_completo',
            'cierre_real' => 'COALESCE(o.fecha_cierre_real, DATE(o.created_at))'][$orden] ?? 'o.created_at';
    return $col . ' ' . (strtolower((string)$dir) === 'asc' ? 'ASC' : 'DESC') . ', o.id DESC';
}

// ─── Validación y escritura ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Valida los datos de una oportunidad (`$src` = POST). `$actual` = crmOpBase() al editar. Devuelve los campos listos para guardar,
 * con los nombres que muestra el historial. Corta con 400 ante cualquier dato inválido.
 */
function crmOpParsear(mysqli $conn, array $ctx, array $src, ?array $actual): array
{
    $d = ['titulo' => crmClean($src['titulo'] ?? null, 190, 'Título', true)];

    $idContacto = (int)($src['id_contacto'] ?? 0);
    $c = $idContacto > 0 ? crmRow($conn, 'SELECT id, nombre_completo, activo FROM crm_contactos WHERE id = ? AND id_sede = ? LIMIT 1', 'ii', [$idContacto, $ctx['id_sede']]) : null;
    if (!$c) authFail(400, 'Elige el contacto de la oportunidad');
    if ((int)$c['activo'] !== 1 && (!$actual || (int)$actual['id_contacto'] !== $idContacto)) authFail(400, 'El contacto elegido está archivado');
    $d['id_contacto'] = $idContacto;
    $d['contacto_nombre'] = $c['nombre_completo'];

    $d['id_persona_contacto'] = null; $d['persona_nombre'] = null;
    $idPersona = (int)($src['id_persona_contacto'] ?? 0);
    if ($idPersona > 0) {
        $pc = crmRow($conn, "SELECT id, nombre_completo FROM crm_contactos WHERE id = ? AND id_sede = ? AND tipo = 'persona' LIMIT 1", 'ii', [$idPersona, $ctx['id_sede']]);
        if (!$pc) authFail(400, 'La persona de contacto no existe en esta sede');
        $d['id_persona_contacto'] = $idPersona;
        $d['persona_nombre'] = $pc['nombre_completo'];
    }

    $d['id_responsable'] = null; $d['responsable_nombre'] = null;
    $resp = (int)($src['id_responsable'] ?? 0);
    if ($resp > 0) {
        $u = crmRow($conn, 'SELECT COALESCE(u.nombre, u.email) AS nombre FROM le_usuario_sedes s JOIN le_usuarios u ON u.id = s.id_usuario WHERE s.id_sede = ? AND s.id_usuario = ? AND s.state = 1 LIMIT 1',
            'ii', [$ctx['id_sede'], $resp]);
        if (!$u) authFail(400, 'El responsable no pertenece a esta sede');
        $d['id_responsable'] = $resp;
        $d['responsable_nombre'] = $u['nombre'];
    }

    $d['fecha_cierre_estimada'] = crmFecha($src['fecha_cierre_estimada'] ?? null, 'Fecha de cierre estimada');
    $d['descripcion'] = crmClean($src['descripcion'] ?? null, 5000, 'Descripción');

    $v = (float)(crmDecimal($src['valor'] ?? null, 'Valor') ?? 0);
    if ($v < 0 || $v >= 1e15) authFail(400, 'El valor está fuera de rango');
    $d['valor'] = round($v, 2);
    return $d;
}

/**
 * Valida las líneas (ítem del catálogo o descripción libre, cantidad, precio). `$itemsPrevios`: ítems que la oportunidad ya tenía
 * (un ítem desactivado solo se acepta si ya estaba). Devuelve ['lineas' => […], 'suma' => total].
 */
function crmOpLineasParsear(mysqli $conn, array $ctx, array $items, array $itemsPrevios = []): array
{
    if (count($items) > CRM_OP_LINEAS_MAX) authFail(400, 'Demasiadas líneas (máx. ' . CRM_OP_LINEAS_MAX . ')');
    $out = []; $suma = 0.0;
    foreach (array_values($items) as $i => $it) {
        if (!is_array($it)) authFail(400, 'Línea inválida');
        $idItem = (int)($it['id_item'] ?? 0) ?: null;
        $desc = crmClean($it['descripcion'] ?? null, 255, 'Descripción de la línea');
        if ($idItem === null && $desc === null) authFail(400, 'Cada línea necesita un ítem o una descripción');
        if ($idItem !== null) {
            $item = crmRow($conn, 'SELECT nombre, activo FROM crm_catalogo_items WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$idItem, $ctx['id_empresa']]);
            if (!$item) authFail(400, 'Un ítem de las líneas no existe');
            if ((int)$item['activo'] !== 1 && !in_array($idItem, $itemsPrevios, true)) authFail(400, 'El ítem «' . $item['nombre'] . '» está desactivado');
        }
        $cant = (float)(crmDecimal($it['cantidad'] ?? 1, 'Cantidad') ?? 1);
        if ($cant <= 0 || $cant > 1e9) authFail(400, 'La cantidad debe ser mayor que cero');
        $precio = (float)(crmDecimal($it['precio_unitario'] ?? 0, 'Precio') ?? 0);
        if ($precio < 0 || $precio > 1e12) authFail(400, 'El precio está fuera de rango');
        $total = round(round($cant, 4) * round($precio, 4), 2);
        $suma += $total;
        $out[] = ['orden' => $i, 'id_item' => $idItem, 'descripcion' => $desc, 'cantidad' => round($cant, 4), 'precio_unitario' => round($precio, 4), 'total' => $total];
    }
    if ($suma >= 1e15) authFail(400, 'El total de las líneas está fuera de rango');
    return ['lineas' => $out, 'suma' => round($suma, 2)];
}

/** Reemplaza las líneas de la oportunidad. */
function crmOpGuardarLineas(mysqli $conn, array $ctx, int $idOp, array $lineas): void
{
    crmExec($conn, 'DELETE FROM crm_oportunidad_lineas WHERE id_oportunidad = ?', 'i', [$idOp]);
    foreach ($lineas as $l) {
        crmExec($conn,
            'INSERT INTO crm_oportunidad_lineas (id_oportunidad, orden, id_item, descripcion, cantidad, precio_unitario, total, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            'iiisdddii', [$idOp, $l['orden'], $l['id_item'], $l['descripcion'], $l['cantidad'], $l['precio_unitario'], $l['total'], $ctx['id_usuario'], $ctx['id_usuario']]);
    }
}

/** «3 líneas · 1200000» (para el historial). */
function crmOpResumenLineas(array $lineas): string
{
    if (!$lineas) return '';
    $suma = round(array_sum(array_map(static fn($l) => (float)$l['total'], $lineas)), 2);
    return count($lineas) . ' · ' . $suma;
}

/**
 * Cambia la oportunidad de etapa (dentro de su embudo). Fija estado, fecha de cierre y motivo según el tipo de la etapa:
 * abierta = reabre (sin cierre ni motivo); ganada/perdida = cierra (con motivo si la empresa los tiene configurados).
 * Devuelve el detalle para el historial, o null si no cambió nada.
 */
function crmOpMover(mysqli $conn, array $ctx, array $op, int $idEtapa, ?int $idMotivo, ?string $fechaCierre): ?array
{
    $e = crmEtapa($conn, $ctx, $idEtapa);
    if (!$e || $e['id_embudo'] !== (int)$op['id_embudo']) authFail(400, 'La etapa no pertenece al embudo de la oportunidad');
    if (!$e['activo'] && $idEtapa !== (int)$op['id_etapa']) authFail(400, 'La etapa «' . $e['nombre'] . '» está desactivada');

    $motivo = null;
    if ($e['tipo'] !== 'abierta') {
        if ($idMotivo) {
            $motivo = crmRow($conn, 'SELECT id, nombre, tipo, activo FROM crm_motivos_cierre WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$idMotivo, $ctx['id_empresa']]);
            if (!$motivo || $motivo['tipo'] !== $e['tipo']) authFail(400, 'El motivo no corresponde a una oportunidad ' . $e['tipo']);
            if ((int)$motivo['activo'] !== 1 && $idMotivo !== $op['id_motivo_cierre']) authFail(400, 'El motivo «' . $motivo['nombre'] . '» está desactivado');
        } elseif (crmRow($conn, 'SELECT 1 AS ok FROM crm_motivos_cierre WHERE id_empresa = ? AND tipo = ? AND activo = 1 LIMIT 1', 'is', [$ctx['id_empresa'], $e['tipo']])) {
            authFail(400, 'Indica el motivo de cierre');
        }
    }
    $mismaEtapa = $idEtapa === (int)$op['id_etapa'];
    $nuevoMotivo = $motivo ? (int)$motivo['id'] : null;
    if ($mismaEtapa && $nuevoMotivo === $op['id_motivo_cierre']) return null;

    $cierre = $e['tipo'] === 'abierta' ? null : ($fechaCierre ?? ($mismaEtapa ? ($op['fecha_cierre_real'] ?? date('Y-m-d')) : date('Y-m-d')));
    // etapa_desde va ANTES de id_etapa: en un UPDATE de MariaDB cada asignación ve el valor ya cambiado de las anteriores.
    crmExec($conn,
        'UPDATE crm_oportunidades SET etapa_desde = IF(id_etapa = ?, etapa_desde, CURRENT_TIMESTAMP), id_etapa = ?, estado = ?, fecha_cierre_real = ?,
                id_motivo_cierre = ?, updated_by = ? WHERE id = ? AND id_sede = ?',
        'iissiiii', [$idEtapa, $idEtapa, $e['tipo'], $cierre, $nuevoMotivo, $ctx['id_usuario'], $op['id'], $ctx['id_sede']]);

    return [
        'desde' => ['id' => $op['id_etapa'], 'nombre' => $op['etapa_nombre']],
        'hasta' => ['id' => $e['id'], 'nombre' => $e['nombre']],
        'estado' => $e['tipo'], 'motivo' => $motivo['nombre'] ?? null,
    ];
}

/**
 * Resuelve la selección de una acción en lote a oportunidades de la sede: [['id','activo'], …] más los ids pedidos que no existen.
 * `seleccion` = {ids:[…]} o {filtros:{…}, excluidos:[…], total_esperado:N} (409 si el total cambió; 400 sobre el tope).
 */
function crmOpResolverSeleccion(mysqli $conn, array $ctx, array $sel): array
{
    if (isset($sel['ids'])) {
        $ids = crmInts($sel['ids']);
        if (!$ids) authFail(400, 'No hay oportunidades seleccionadas');
        if (count($ids) > CRM_BULK_MAX) authFail(400, 'Máximo ' . CRM_BULK_MAX . ' oportunidades por operación. Afina el filtro.');
        $rows = [];
        foreach (array_chunk($ids, 500) as $chunk) {
            foreach (crmRows($conn, 'SELECT id, activo FROM crm_oportunidades WHERE id_sede = ? AND id IN (' . crmMarks(count($chunk)) . ')',
                'i' . str_repeat('i', count($chunk)), [$ctx['id_sede'], ...$chunk]) as $r) $rows[(int)$r['id']] = $r;
        }
        return ['oportunidades' => array_values($rows), 'no_encontrados' => array_values(array_diff($ids, array_keys($rows)))];
    }
    if (is_array($sel['filtros'] ?? null)) {
        if (!isset($sel['total_esperado'])) authFail(400, 'Falta total_esperado');
        $excluidos = crmInts($sel['excluidos'] ?? []);
        $f = crmOpFiltros($conn, $ctx, $sel['filtros']);
        $total = (int)crmRow($conn, 'SELECT COUNT(*) AS n ' . crmOpFrom() . ' WHERE ' . $f['sql'], $f['types'], $f['params'])['n'];
        if ($total !== (int)$sel['total_esperado']) authFail(409, 'Los resultados cambiaron desde que los seleccionaste. Vuelve a filtrar.');
        if ($total - count($excluidos) > CRM_BULK_MAX) authFail(400, 'Máximo ' . CRM_BULK_MAX . ' oportunidades por operación. Afina el filtro.');
        $rows = crmRows($conn, 'SELECT o.id, o.activo ' . crmOpFrom() . ' WHERE ' . $f['sql'], $f['types'], $f['params']);
        $rows = array_values(array_filter($rows, static fn($r) => !in_array((int)$r['id'], $excluidos, true)));
        if (!$rows) authFail(400, 'No hay oportunidades seleccionadas');
        return ['oportunidades' => $rows, 'no_encontrados' => []];
    }
    authFail(400, 'Selección inválida');
}

// ─── Resumen, notas y marca de modificación ──────────────────────────────────────────────────────────────────────────

/**
 * Totales de las oportunidades que cumplen los filtros, por estado: {abierta|ganada|perdida: {n, valor, ponderado}, total}.
 * ponderado = suma de valor × probabilidad de su etapa (en una ganada cuenta al 100 %, en una perdida al 0 %).
 */
function crmOpResumen(mysqli $conn, array $f): array
{
    $out = ['abierta' => ['n' => 0, 'valor' => 0.0, 'ponderado' => 0.0], 'ganada' => ['n' => 0, 'valor' => 0.0, 'ponderado' => 0.0],
            'perdida' => ['n' => 0, 'valor' => 0.0, 'ponderado' => 0.0], 'total' => 0];
    foreach (crmRows($conn,
        'SELECT o.estado, COUNT(*) AS n, COALESCE(SUM(o.valor), 0) AS valor, COALESCE(SUM(o.valor * e.probabilidad / 100), 0) AS ponderado '
        . crmOpFrom() . ' WHERE ' . $f['sql'] . ' GROUP BY o.estado', $f['types'], $f['params']) as $r) {
        $out[$r['estado']] = ['n' => (int)$r['n'], 'valor' => round((float)$r['valor'], 2), 'ponderado' => round((float)$r['ponderado'], 2)];
        $out['total'] += (int)$r['n'];
    }
    return $out;
}

/** Notas activas de una oportunidad, las más nuevas primero: [{id, nota, created_at, updated_at, id_autor, autor}] y el total. */
function crmOpNotas(mysqli $conn, int $idOp, int $pagina = 1, int $porPagina = 50): array
{
    $total = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_oportunidad_notas WHERE id_oportunidad = ? AND activo = 1', 'i', [$idOp])['n'];
    $rows = crmRows($conn,
        'SELECT n.id, n.nota, n.created_at, n.updated_at, n.created_by AS id_autor, COALESCE(u.nombre, u.email) AS autor
           FROM crm_oportunidad_notas n LEFT JOIN le_usuarios u ON u.id = n.created_by
          WHERE n.id_oportunidad = ? AND n.activo = 1 ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?', 'iii', [$idOp, $porPagina, ($pagina - 1) * $porPagina]);
    foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['id_autor'] = $r['id_autor'] !== null ? (int)$r['id_autor'] : null; }
    return ['notas' => $rows, 'total' => $total];
}

/** Marca oportunidades como modificadas por el usuario de la sesión cuando cambió algo que no vive en su fila (líneas, campos, etiquetas). */
function crmOpTocar(mysqli $conn, array $ctx, array $ids): void
{
    foreach (array_chunk(crmInts($ids), 500) as $chunk) {
        crmExec($conn, 'UPDATE crm_oportunidades SET updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id_sede = ? AND id IN (' . crmMarks(count($chunk)) . ')',
            'ii' . str_repeat('i', count($chunk)), [$ctx['id_usuario'], $ctx['id_sede'], ...$chunk]);
    }
}
