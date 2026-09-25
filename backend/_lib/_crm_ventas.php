<?php
// Helpers de ventas del CRM (backend/crm/*venta*, *importacion*). Diseño: docs/modulos/crm.md («Ventas importadas»).
// Reglas que viven aquí para que ningún endpoint las reimplemente:
//   - la sede y la empresa SIEMPRE salen de la sesión (crmContext); las ventas son de la SEDE, las plantillas de mapeo de la EMPRESA;
//   - un solo constructor de filtros (crmVentaFiltros) sirve al listado, los resúmenes y la exportación;
//   - un solo procesador de bloques (crmVentasProcesar) sirve a la simulación y a la importación real.

require_once __DIR__ . '/_crm.php';

const CRM_VENTAS_BLOQUE_MAX = 500;      // ventas por bloque
const CRM_VENTAS_LINEAS_MAX = 3000;     // líneas por bloque
const CRM_IMPORT_ERRORES_MAX = 200;     // errores que se guardan en el lote
const CRM_IDENTIFICAR = ['documento', 'nombre', 'campo'];

// ─── Filtros ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Condición WHERE (alias v = crm_ventas, c = crm_contactos del cliente) para listar, resumir y exportar ventas.
 * Claves: desde, hasta (fechas de venta), contacto (id del cliente), dependientes (bool: incluye las organizaciones que pertenecen al cliente),
 * q (documento o cliente, por palabras), item (id), categoria (id), importacion (id), estado (activas|inactivas|todas; por defecto activas).
 */
function crmVentaFiltros(mysqli $conn, array $ctx, array $f): array
{
    $w = ['v.id_sede = ?']; $t = 'i'; $p = [$ctx['id_sede']];
    $estado = $f['estado'] ?? 'activas';
    if ($estado === 'activas') $w[] = 'v.activo = 1';
    elseif ($estado === 'inactivas') $w[] = 'v.activo = 0';
    elseif ($estado !== 'todas') authFail(400, 'Filtro de estado inválido');

    $desde = crmFecha($f['desde'] ?? null, 'Desde');
    if ($desde !== null) { $w[] = 'v.fecha >= ?'; $t .= 's'; $p[] = $desde; }
    $hasta = crmFecha($f['hasta'] ?? null, 'Hasta');
    if ($hasta !== null) { $w[] = 'v.fecha <= ?'; $t .= 's'; $p[] = $hasta; }

    if (!empty($f['contacto'])) {
        $id = (int)$f['contacto'];
        if (!empty($f['dependientes'])) {
            $w[] = '(v.id_contacto = ? OR v.id_contacto IN (SELECT o.id FROM crm_contactos_organizaciones o WHERE o.id_padre = ?))';
            $t .= 'ii'; $p[] = $id; $p[] = $id;
        } else {
            $w[] = 'v.id_contacto = ?'; $t .= 'i'; $p[] = $id;
        }
    }
    if (!empty($f['importacion'])) { $w[] = 'v.id_importacion = ?'; $t .= 'i'; $p[] = (int)$f['importacion']; }
    if (!empty($f['item'])) {
        $w[] = 'EXISTS (SELECT 1 FROM crm_venta_lineas l WHERE l.id_venta = v.id AND l.id_item = ?)'; $t .= 'i'; $p[] = (int)$f['item'];
    }
    if (!empty($f['categoria'])) {
        $w[] = 'EXISTS (SELECT 1 FROM crm_venta_lineas l JOIN crm_catalogo_items i ON i.id = l.id_item WHERE l.id_venta = v.id AND i.id_categoria = ?)';
        $t .= 'i'; $p[] = (int)$f['categoria'];
    }
    foreach (array_slice(preg_split('/\s+/u', trim((string)($f['q'] ?? ''))) ?: [], 0, 6) as $tok) {
        if ($tok === '') continue;
        $like = '%' . addcslashes(mb_substr($tok, 0, 60), '\%_') . '%';
        $w[] = '(v.documento LIKE ? OR c.busqueda LIKE ?)'; $t .= 'ss'; array_push($p, $like, $like);
    }
    return ['sql' => implode(' AND ', $w), 'types' => $t, 'params' => $p];
}

function crmVentaFrom(): string
{
    return 'FROM crm_ventas v JOIN crm_contactos c ON c.id = v.id_contacto';
}

/** Totales con los filtros: {ventas, total, unidades, clientes, ticket_promedio, desde, hasta}. */
function crmVentaResumen(mysqli $conn, array $w): array
{
    $r = crmRow($conn,
        'SELECT COUNT(*) AS ventas, COALESCE(SUM(v.total), 0) AS total, COALESCE(SUM(v.unidades), 0) AS unidades, COUNT(DISTINCT v.id_contacto) AS clientes,
                MIN(v.fecha) AS desde, MAX(v.fecha) AS hasta ' . crmVentaFrom() . ' WHERE ' . $w['sql'], $w['types'], $w['params']);
    $n = (int)$r['ventas'];
    return [
        'ventas' => $n, 'total' => round((float)$r['total'], 2), 'unidades' => round((float)$r['unidades'], 4), 'clientes' => (int)$r['clientes'],
        'ticket_promedio' => $n ? round((float)$r['total'] / $n, 2) : 0, 'desde' => $r['desde'], 'hasta' => $r['hasta'],
    ];
}

// ─── Importación ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Solo dígitos. Con guion, también la parte antes del guion (NIT sin dígito de verificación): «901.142.687-7» → [9011426877, 901142687]. */
function crmVentaClavesDoc(string $v): array
{
    $k = [crmDigits($v)];
    if (str_contains($v, '-')) $k[] = crmDigits(strstr($v, '-', true));
    return array_values(array_unique(array_filter($k, static fn($x) => strlen($x) >= 3)));
}

/** Clave de comparación de textos: minúsculas, sin tildes y con espacios normalizados (lo mismo que hace la colación unicode_ci). */
function crmVentaClaveTexto(string $v): string
{
    $s = mb_strtolower(trim(preg_replace('/\s+/u', ' ', $v) ?? $v));
    return strtr($s, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n', 'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u']);
}

/**
 * Reconoce los clientes del archivo. `$valores` = textos tal como vienen (NIT, código o nombre). Devuelve valor => ['id', 'nombre'] o ['error' => motivo].
 * Por documento: compara solo dígitos, con y sin dígito de verificación. Por nombre: nombre completo exacto (sin tildes ni mayúsculas).
 * Por campo: valor exacto de un campo personalizado de texto o entero de Personas u Organizaciones (p. ej. «Código de cliente»).
 */
function crmVentaResolverClientes(mysqli $conn, array $ctx, array $valores, array $op): array
{
    $out = [];
    $valores = array_values(array_unique(array_filter(array_map('strval', $valores), static fn($v) => trim($v) !== '')));
    if (!$valores) return $out;
    $candidatos = [];   // clave => [[id, nombre, activo], …]
    $agregar = static function (string $k, array $r) use (&$candidatos): void {
        $candidatos[$k][(int)$r['id']] = ['id' => (int)$r['id'], 'nombre' => $r['nombre_completo'], 'activo' => (int)$r['activo'] === 1];
    };

    if ($op['identificar'] === 'documento') {
        $claves = [];
        foreach ($valores as $v) foreach (crmVentaClavesDoc($v) as $k) $claves[$k] = true;
        $claves = array_keys($claves);
        foreach (array_chunk($claves, 400) as $chunk) {
            $m = crmMarks(count($chunk));
            $rows = crmRows($conn,
                "SELECT c.id, c.nombre_completo, c.activo, COALESCE(p.documento_numero, o.documento_numero) AS doc
                   FROM crm_contactos c LEFT JOIN crm_contactos_personas p ON p.id = c.id LEFT JOIN crm_contactos_organizaciones o ON o.id = c.id
                  WHERE c.id_sede = ? AND (REGEXP_REPLACE(COALESCE(p.documento_numero, o.documento_numero), '[^0-9]', '') IN ($m)
                     OR REGEXP_REPLACE(SUBSTRING_INDEX(COALESCE(p.documento_numero, o.documento_numero), '-', 1), '[^0-9]', '') IN ($m))",
                'i' . str_repeat('s', count($chunk) * 2), [$ctx['id_sede'], ...$chunk, ...$chunk]);
            foreach ($rows as $r) foreach (crmVentaClavesDoc((string)$r['doc']) as $k) $agregar($k, $r);
        }
        foreach ($valores as $v) {
            $hit = [];
            foreach (crmVentaClavesDoc($v) as $k) foreach ($candidatos[$k] ?? [] as $id => $c) $hit[$id] = $c;
            $out[$v] = crmVentaElegir($hit, $v);
        }
        return $out;
    }

    if ($op['identificar'] === 'nombre') {
        foreach (array_chunk($valores, 400) as $chunk) {
            foreach (crmRows($conn, 'SELECT id, nombre_completo, activo FROM crm_contactos WHERE id_sede = ? AND nombre_completo IN (' . crmMarks(count($chunk)) . ')',
                'i' . str_repeat('s', count($chunk)), [$ctx['id_sede'], ...array_map('trim', $chunk)]) as $r) $agregar(crmVentaClaveTexto($r['nombre_completo']), $r);
        }
        foreach ($valores as $v) $out[$v] = crmVentaElegir($candidatos[crmVentaClaveTexto($v)] ?? [], $v);
        return $out;
    }

    // Por campo personalizado
    $campo = crmRow($conn, "SELECT id, tipo_dato FROM crm_campos_personalizados WHERE id = ? AND id_empresa = ? AND aplica_a IN ('persona','organizacion') LIMIT 1",
        'ii', [(int)($op['id_campo'] ?? 0), $ctx['id_empresa']]);
    if (!$campo || !in_array($campo['tipo_dato'], ['texto', 'entero'], true)) authFail(400, 'Elige un campo personalizado de texto o número entero para reconocer al cliente');
    $col = $campo['tipo_dato'] === 'entero' ? 'cv.valor_entero' : 'cv.valor_texto';
    foreach (array_chunk($valores, 400) as $chunk) {
        $vals = $campo['tipo_dato'] === 'entero' ? array_values(array_filter(array_map(static fn($x) => preg_match('/^-?\d{1,18}$/', trim($x)) ? (int)trim($x) : null, $chunk), static fn($x) => $x !== null)) : array_map('trim', $chunk);
        if (!$vals) continue;
        foreach (crmRows($conn,
            "SELECT c.id, c.nombre_completo, c.activo, $col AS val FROM crm_campos_valores cv JOIN crm_contactos c ON c.id = cv.id_contacto
              WHERE c.id_sede = ? AND cv.id_campo = ? AND $col IN (" . crmMarks(count($vals)) . ')',
            'ii' . str_repeat($campo['tipo_dato'] === 'entero' ? 'i' : 's', count($vals)), [$ctx['id_sede'], (int)$campo['id'], ...$vals]) as $r) {
            $agregar(crmVentaClaveTexto((string)$r['val']), $r);
        }
    }
    foreach ($valores as $v) $out[$v] = crmVentaElegir($candidatos[crmVentaClaveTexto($v)] ?? [], $v);
    return $out;
}

/** Un solo candidato (o uno solo activo entre varios) = reconocido; ninguno o varios = error. */
function crmVentaElegir(array $hit, string $v): array
{
    if (!$hit) return ['error' => 'Cliente no encontrado: «' . mb_substr($v, 0, 60) . '»'];
    if (count($hit) > 1) {
        $activos = array_values(array_filter($hit, static fn($c) => $c['activo']));
        if (count($activos) === 1) return $activos[0];
        return ['error' => 'Más de un contacto coincide con «' . mb_substr($v, 0, 60) . '»'];
    }
    return array_values($hit)[0];
}

/** Opciones de la importación, validadas: identificar, id_campo, items_nuevos (crear|sin_item), duplicados (omitir|reemplazar). */
function crmVentaOpciones(array $o): array
{
    $op = [
        'identificar' => (string)($o['identificar'] ?? 'documento'),
        'id_campo' => (int)($o['id_campo'] ?? 0),
        'items_nuevos' => ($o['items_nuevos'] ?? 'sin_item') === 'crear' ? 'crear' : 'sin_item',
        'duplicados' => ($o['duplicados'] ?? 'omitir') === 'reemplazar' ? 'reemplazar' : 'omitir',
    ];
    if (!in_array($op['identificar'], CRM_IDENTIFICAR, true)) authFail(400, 'Forma de reconocer al cliente inválida');
    return $op;
}

/** Número del archivo (el navegador ya lo convirtió): null si viene vacío; false si no es un número. */
function crmVentaNum(mixed $v): float|false|null
{
    if ($v === null || $v === '') return null;
    if (is_int($v) || is_float($v)) return is_finite((float)$v) ? (float)$v : false;
    $s = str_replace(',', '.', trim((string)$v));
    return is_numeric($s) ? (float)$s : false;
}

/**
 * Procesa un bloque de ventas ya agrupadas por el navegador: [{fila, fecha, cliente, documento, lineas:[{fila, codigo, descripcion, cantidad, precio, total}]}].
 * Valida, reconoce clientes e ítems, aplica la regla de duplicados e inserta (en la transacción de quien llama). `$idImportacion` null = simulación
 * (quien llama revierte la transacción). Una venta con error no se guarda; el resto del bloque sigue.
 * Devuelve {filas_ok, filas_error, ventas_nuevas, ventas_reemplazadas, ventas_omitidas, items_creados, total_valor, fecha_desde, fecha_hasta, errores, clientes_no_encontrados}.
 */
function crmVentasProcesar(mysqli $conn, array $ctx, array $ventas, array $op, ?int $idImportacion): array
{
    if (count($ventas) > CRM_VENTAS_BLOQUE_MAX) authFail(400, 'Demasiadas ventas en un bloque (máx. ' . CRM_VENTAS_BLOQUE_MAX . ')');
    $nLineas = array_sum(array_map(static fn($v) => is_array($v['lineas'] ?? null) ? count($v['lineas']) : 0, $ventas));
    if ($nLineas > CRM_VENTAS_LINEAS_MAX) authFail(400, 'Demasiadas líneas en un bloque (máx. ' . CRM_VENTAS_LINEAS_MAX . ')');

    $res = ['filas_ok' => 0, 'filas_error' => 0, 'ventas_nuevas' => 0, 'ventas_reemplazadas' => 0, 'ventas_omitidas' => 0, 'items_creados' => 0,
            'total_valor' => 0.0, 'fecha_desde' => null, 'fecha_hasta' => null, 'errores' => [], 'clientes_no_encontrados' => []];
    $error = static function (array $filas, string $motivo) use (&$res): void {
        $res['filas_error'] += count($filas);
        foreach ($filas as $f) if (count($res['errores']) < CRM_IMPORT_ERRORES_MAX) $res['errores'][] = ['fila' => (int)$f, 'motivo' => $motivo];
    };

    // 1. Validación de forma
    $validas = [];
    foreach ($ventas as $v) {
        if (!is_array($v) || !is_array($v['lineas'] ?? null) || !$v['lineas']) { $error([(int)($v['fila'] ?? 0)], 'Venta sin líneas'); continue; }
        $filas = array_map(static fn($l) => (int)($l['fila'] ?? 0), $v['lineas']);
        $fecha = is_string($v['fecha'] ?? null) ? trim($v['fecha']) : '';
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $fecha);
        if (!$d || $d->format('Y-m-d') !== $fecha || $fecha < '1990-01-01' || $fecha > date('Y-m-d', strtotime('+1 day'))) { $error($filas, 'Fecha inválida o futura'); continue; }
        $cliente = trim((string)($v['cliente'] ?? ''));
        if ($cliente === '') { $error($filas, 'Falta el cliente'); continue; }
        $documento = mb_substr(trim((string)($v['documento'] ?? '')), 0, 60) ?: null;
        $lineas = []; $motivo = null;
        foreach ($v['lineas'] as $l) {
            $cant = crmVentaNum($l['cantidad'] ?? null);
            $precio = crmVentaNum($l['precio'] ?? null);
            $total = crmVentaNum($l['total'] ?? null);
            if ($cant === false || $precio === false || $total === false) { $motivo = 'Un número de la línea no es válido'; break; }
            if ($cant === null) $cant = 1.0;
            if ($total === null && $precio === null) { $motivo = 'Falta el precio o el total de la línea'; break; }
            if ($total === null) $total = round($cant * $precio, 2);
            if ($precio === null) $precio = $cant != 0.0 ? round($total / $cant, 4) : 0.0;
            if (abs($cant) >= 1e9 || abs($precio) >= 1e13 || abs($total) >= 1e15) { $motivo = 'Un valor de la línea está fuera de rango'; break; }
            $codigo = mb_substr(trim((string)($l['codigo'] ?? '')), 0, 40) ?: null;
            $desc = mb_substr(trim((string)($l['descripcion'] ?? '')), 0, 255) ?: null;
            $lineas[] = ['fila' => (int)($l['fila'] ?? 0), 'codigo' => $codigo, 'descripcion' => $desc, 'cantidad' => round($cant, 4), 'precio' => round($precio, 4), 'total' => round($total, 2)];
        }
        if ($motivo) { $error($filas, $motivo); continue; }
        $validas[] = ['filas' => $filas, 'fecha' => $fecha, 'cliente' => $cliente, 'documento' => $documento, 'lineas' => $lineas];
    }

    // 2. Clientes
    $clientes = crmVentaResolverClientes($conn, $ctx, array_column($validas, 'cliente'), $op);
    // 3. Ítems por código
    $codigos = [];
    foreach ($validas as $v) foreach ($v['lineas'] as $l) if ($l['codigo'] !== null) $codigos[$l['codigo']] = $l;
    $items = [];   // clave del código (sin mayúsculas) => id
    foreach (array_chunk(array_keys($codigos), 400) as $chunk) {
        foreach (crmRows($conn, 'SELECT id, codigo FROM crm_catalogo_items WHERE id_empresa = ? AND codigo IN (' . crmMarks(count($chunk)) . ')',
            'i' . str_repeat('s', count($chunk)), [$ctx['id_empresa'], ...array_map('strval', $chunk)]) as $r) $items[crmVentaClaveTexto($r['codigo'])] = (int)$r['id'];
    }
    // 4. Duplicados por número de documento (entre las ventas activas de la sede)
    $existentes = [];
    $docs = array_values(array_unique(array_filter(array_column($validas, 'documento'))));
    foreach (array_chunk($docs, 400) as $chunk) {
        foreach (crmRows($conn, 'SELECT id, documento FROM crm_ventas WHERE id_sede = ? AND activo = 1 AND documento IN (' . crmMarks(count($chunk)) . ')',
            'i' . str_repeat('s', count($chunk)), [$ctx['id_sede'], ...$chunk]) as $r) $existentes[crmVentaClaveTexto($r['documento'])][] = (int)$r['id'];
    }

    // 5. Guardar
    $noEncontrados = [];
    foreach ($validas as $v) {
        $c = $clientes[$v['cliente']] ?? ['error' => 'Cliente no encontrado'];
        if (isset($c['error'])) {
            $error($v['filas'], $c['error']);
            if (str_starts_with($c['error'], 'Cliente no encontrado')) $noEncontrados[$v['cliente']] = true;
            continue;
        }
        $dup = $v['documento'] !== null ? ($existentes[crmVentaClaveTexto($v['documento'])] ?? []) : [];
        if ($dup && $op['duplicados'] === 'omitir') { $res['ventas_omitidas']++; $res['filas_ok'] += count($v['filas']); continue; }
        if ($dup) {
            crmExec($conn, 'UPDATE crm_ventas SET activo = 0, updated_by = ? WHERE id_sede = ? AND id IN (' . crmMarks(count($dup)) . ')',
                'ii' . str_repeat('i', count($dup)), [$ctx['id_usuario'], $ctx['id_sede'], ...$dup]);
            $res['ventas_reemplazadas']++;
            unset($existentes[crmVentaClaveTexto($v['documento'])]);
        } else {
            $res['ventas_nuevas']++;
        }
        $lineas = [];
        foreach ($v['lineas'] as $l) {
            $idItem = null;
            if ($l['codigo'] !== null) {
                $k = crmVentaClaveTexto($l['codigo']);
                $idItem = $items[$k] ?? null;
                if ($idItem === null && $op['items_nuevos'] === 'crear') {
                    crmExec($conn, 'INSERT INTO crm_catalogo_items (id_empresa, codigo, nombre, precio_ref, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
                        'issdii', [$ctx['id_empresa'], $l['codigo'], $l['descripcion'] ?? $l['codigo'], $l['precio'], $ctx['id_usuario'], $ctx['id_usuario']]);
                    $idItem = $items[$k] = (int)$conn->insert_id;
                    $res['items_creados']++;
                }
            }
            $lineas[] = $l + ['id_item' => $idItem];
        }
        $total = round(array_sum(array_column($lineas, 'total')), 2);
        $unidades = round(array_sum(array_column($lineas, 'cantidad')), 4);
        crmExec($conn, 'INSERT INTO crm_ventas (id_sede, id_contacto, fecha, documento, total, unidades, id_importacion, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            'iissddiii', [$ctx['id_sede'], $c['id'], $v['fecha'], $v['documento'], $total, $unidades, $idImportacion, $ctx['id_usuario'], $ctx['id_usuario']]);
        $idVenta = (int)$conn->insert_id;
        foreach (array_chunk($lineas, 200) as $chunk) {
            $vals = []; $params = [];
            foreach ($chunk as $l) {
                $vals[] = '(?, ?, ?, ?, ?, ?, ?, ?, ?)';
                array_push($params, $idVenta, $l['id_item'], $l['codigo'], $l['descripcion'], $l['cantidad'], $l['precio'], $l['total'], $ctx['id_usuario'], $ctx['id_usuario']);
            }
            crmExec($conn, 'INSERT INTO crm_venta_lineas (id_venta, id_item, codigo, descripcion, cantidad, precio_unitario, total, created_by, updated_by) VALUES ' . implode(',', $vals),
                str_repeat('iissdddii', count($chunk)), $params);
        }
        $res['filas_ok'] += count($v['filas']);
        $res['total_valor'] += $total;
        if ($res['fecha_desde'] === null || $v['fecha'] < $res['fecha_desde']) $res['fecha_desde'] = $v['fecha'];
        if ($res['fecha_hasta'] === null || $v['fecha'] > $res['fecha_hasta']) $res['fecha_hasta'] = $v['fecha'];
    }
    $res['total_valor'] = round($res['total_valor'], 2);
    $res['clientes_no_encontrados'] = array_map('strval', array_slice(array_keys($noEncontrados), 0, 50));   // PHP vuelve número las claves numéricas
    return $res;
}

/** Lote de la sede de la sesión, o null. */
function crmImportacion(mysqli $conn, array $ctx, int $id): ?array
{
    $r = crmRow($conn, 'SELECT * FROM crm_importaciones WHERE id = ? AND id_sede = ? LIMIT 1', 'ii', [$id, $ctx['id_sede']]);
    return $r ?: null;
}
