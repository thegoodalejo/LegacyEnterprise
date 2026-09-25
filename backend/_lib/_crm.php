<?php
// Helpers del módulo CRM (backend/crm/*). Diseño y decisiones: docs/modulos/crm.md.
// Reglas que viven aquí para que ningún endpoint las reimplemente:
//   - la sede y la empresa SIEMPRE salen de la sesión (crmContext), nunca del POST;
//   - un solo constructor de filtros (crmFiltros) sirve al listado y a las acciones en lote;
//   - toda validación falla con authFail(400|409, …) → JSON, nunca HTML.

require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/_historial.php';

const CRM_TIPOS = ['persona', 'organizacion'];
const CRM_TIPOS_DATO = ['entero', 'decimal', 'texto', 'booleano', 'fecha'];
const CRM_BULK_MAX = 5000;          // contactos por operación en lote
const CRM_EXPORT_MAX = 20000;       // filas por exportación (el PDF se limita más en el navegador)
const CRM_EXPORT_PAGINA_MAX = 1000; // filas por página al exportar
const CRM_POR_PAGINA_MAX = 100;
const CRM_TAGS_LOTE_MAX = 20;

// ─── Respuesta, contexto e inputs ────────────────────────────────────────────────────────────────────────────────

function crmOk(array $data = [], string $mensaje = 'OK'): void
{
    echo json_encode(['action' => true, 'mensaje' => $mensaje, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

/** Sesión del CRM: exige módulo contratado y con acceso. id_sede e id_empresa son los de la sesión. */
function crmContext(): array
{
    $idSede = requireModulo('crm');
    $u = $GLOBALS['authUser'];
    return ['id_sede' => $idSede, 'id_empresa' => (int)$u['id_empresa'], 'id_usuario' => (int)$u['id'], 'rol' => $u['rol']];
}

/** Texto recortado; null si viene vacío. Corta con 400 si excede el máximo o si es obligatorio y falta. */
function crmClean(mixed $v, int $max, string $label, bool $required = false): ?string
{
    $s = is_scalar($v) ? trim((string)$v) : '';
    if ($s === '') {
        if ($required) authFail(400, "$label es obligatorio");
        return null;
    }
    if (mb_strlen($s) > $max) authFail(400, "$label es demasiado largo (máx. $max)");
    return $s;
}

function crmEmail(mixed $v, string $label): ?string
{
    $s = crmClean($v, 190, $label);
    if ($s !== null && !filter_var($s, FILTER_VALIDATE_EMAIL)) authFail(400, "$label no es un correo válido");
    return $s;
}

/** Fecha estricta AAAA-MM-DD (el formato dd-mm-aaaa es solo de presentación en el frontend). */
function crmFecha(mixed $v, string $label): ?string
{
    $s = is_scalar($v) ? trim((string)$v) : '';
    if ($s === '') return null;
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $s);
    if (!$d || $d->format('Y-m-d') !== $s) authFail(400, "$label: fecha inválida (usa AAAA-MM-DD)");
    return $s;
}

function crmCoord(mixed $v, float $min, float $max, string $label): ?float
{
    if ($v === null || $v === '') return null;
    if (!is_numeric($v) || (float)$v < $min || (float)$v > $max) authFail(400, "$label fuera de rango");
    return round((float)$v, 6);   // la BD guarda 6 decimales: así un guardado sin cambios no parece un cambio
}

function crmDigits(mixed $v): string
{
    return preg_replace('/\D+/', '', (string)$v) ?? '';
}

/** Parámetro POST JSON (arrays/objetos los manda ApiService como JSON string). null si no viene. */
function crmJsonParam(string $key): ?array
{
    if (!isset($_POST[$key]) || $_POST[$key] === '') return null;
    $v = json_decode((string)$_POST[$key], true);
    if (!is_array($v)) authFail(400, "$key inválido");
    return $v;
}

/** Lista de enteros positivos únicos. */
function crmInts(mixed $v): array
{
    if (!is_array($v)) return [];
    return array_values(array_unique(array_filter(array_map('intval', $v), static fn($n) => $n > 0)));
}

// ─── Acceso a BD (siempre por statements preparados; fallo → JSON 500 vía db_*_or_fail) ─────────────────────────

function crmQuery(mysqli $conn, string $sql, string $types = '', array $params = []): mysqli_stmt
{
    $stmt = db_prepare_or_fail($conn, $sql);
    if ($types !== '') $stmt->bind_param($types, ...$params);
    return db_execute_or_fail($stmt);
}

function crmRows(mysqli $conn, string $sql, string $types = '', array $params = []): array
{
    $stmt = crmQuery($conn, $sql, $types, $params);
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
}

function crmRow(mysqli $conn, string $sql, string $types = '', array $params = []): ?array
{
    return crmRows($conn, $sql, $types, $params)[0] ?? null;
}

/** INSERT/UPDATE/DELETE: devuelve las filas afectadas. */
function crmExec(mysqli $conn, string $sql, string $types = '', array $params = []): int
{
    $stmt = crmQuery($conn, $sql, $types, $params);
    $n = $stmt->affected_rows;
    $stmt->close();
    return (int)$n;
}

function crmMarks(int $n): string
{
    return implode(',', array_fill(0, max(1, $n), '?'));
}

// ─── Búsqueda de texto ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Texto de búsqueda de un contacto: nombre, documento, correo y teléfonos. Los campos numéricos (teléfono, documento,
 * WhatsApp) llevan además su variante solo dígitos, para que "3001234567" encuentre "(300) 123-4567".
 * La comparación ignora tildes y mayúsculas porque la columna es utf8mb4_unicode_ci.
 */
function crmBuildBusqueda(array $textos, array $numeros): string
{
    $out = [];
    foreach ($textos as $t) {
        $t = trim((string)$t);
        if ($t !== '') $out[] = $t;
    }
    foreach ($numeros as $n) {
        $n = trim((string)$n);
        if ($n === '') continue;
        $out[] = $n;
        $d = crmDigits($n);
        if (strlen($d) >= 3 && $d !== $n) $out[] = $d;
    }
    return mb_substr(implode(' ', $out), 0, 1000);
}

// ─── Filtros del listado (los usan list_contactos y bulk_contactos) ──────────────────────────────────────────────

/**
 * Condición WHERE (alias `c` = crm_contactos) para los filtros del listado.
 * Claves: q, relacionados (bool, por defecto true: `q` también busca en las personas de una organización y en las
 * organizaciones de una persona), tipo, estado (activos|archivados|todos), responsable, creado_por, creado_desde,
 * creado_hasta, padre (id de la organización a la que pertenecen), tags[], tags_modo (cualquiera|todos),
 * campos[{id_campo, op, valor, valor2}].
 * Devuelve ['sql' => ..., 'types' => ..., 'params' => [...]].
 */
function crmFiltros(mysqli $conn, array $ctx, array $f): array
{
    $w = ['c.id_sede = ?'];
    $t = 'i';
    $p = [$ctx['id_sede']];

    $estado = $f['estado'] ?? 'activos';
    if ($estado === 'activos') $w[] = 'c.activo = 1';
    elseif ($estado === 'archivados') $w[] = 'c.activo = 0';
    elseif ($estado !== 'todos') authFail(400, 'Filtro de estado inválido');

    $tipo = $f['tipo'] ?? '';
    if ($tipo !== '' && $tipo !== null) {
        if (!in_array($tipo, CRM_TIPOS, true)) authFail(400, 'Filtro de tipo inválido');
        $w[] = 'c.tipo = ?'; $t .= 's'; $p[] = $tipo;
    }
    if (!empty($f['responsable'])) { $w[] = 'c.id_responsable = ?'; $t .= 'i'; $p[] = (int)$f['responsable']; }
    if (!empty($f['creado_por']))  { $w[] = 'c.created_by = ?';     $t .= 'i'; $p[] = (int)$f['creado_por']; }

    $desde = crmFecha($f['creado_desde'] ?? null, 'Creado desde');
    if ($desde !== null) { $w[] = 'c.created_at >= ?'; $t .= 's'; $p[] = $desde . ' 00:00:00'; }
    $hasta = crmFecha($f['creado_hasta'] ?? null, 'Creado hasta');
    if ($hasta !== null) {
        $w[] = 'c.created_at < ?'; $t .= 's';
        $p[] = (new DateTimeImmutable($hasta))->modify('+1 day')->format('Y-m-d') . ' 00:00:00';
    }

    // Organización padre: solo las que pertenecen directamente a esa organización.
    if (!empty($f['padre'])) {
        $w[] = 'EXISTS (SELECT 1 FROM crm_contactos_organizaciones op WHERE op.id = c.id AND op.id_padre = ?)';
        $t .= 'i'; $p[] = (int)$f['padre'];
    }

    // Texto: cada palabra debe aparecer (AND). Una palabra con formato numérico también se prueba sin formato.
    // Con `relacionados` (por defecto), cada palabra puede coincidir en el propio contacto o en los que tiene vinculados:
    // así se encuentra un negocio por el nombre o teléfono de su persona de referencia (y una persona por su negocio).
    $relacionados = ($f['relacionados'] ?? true) !== false;
    $q = trim((string)($f['q'] ?? ''));
    if ($q !== '') {
        $tokens = array_slice(preg_split('/\s+/u', $q) ?: [], 0, 8);
        foreach ($tokens as $tok) {
            $tok = mb_substr($tok, 0, 60);
            $likes = ['%' . addcslashes($tok, '\%_') . '%'];
            $digits = crmDigits($tok);
            if (strlen($digits) >= 3 && $digits !== $tok) $likes[] = '%' . $digits . '%';
            $frag = static fn(string $a) => count($likes) > 1 ? "($a.busqueda LIKE ? OR $a.busqueda LIKE ?)" : "$a.busqueda LIKE ?";
            $marks = str_repeat('s', count($likes));

            $or = [$frag('c')];
            $t2 = $marks; $p2 = $likes;
            if ($relacionados) {
                $or[] = 'EXISTS (SELECT 1 FROM crm_contacto_vinculos v JOIN crm_contactos r ON r.id = v.id_persona WHERE v.id_organizacion = c.id AND ' . $frag('r') . ')';
                $or[] = 'EXISTS (SELECT 1 FROM crm_contacto_vinculos v JOIN crm_contactos r ON r.id = v.id_organizacion WHERE v.id_persona = c.id AND ' . $frag('r') . ')';
                $t2 .= $marks . $marks; array_push($p2, ...$likes, ...$likes);
            }
            $w[] = '(' . implode(' OR ', $or) . ')';
            $t .= $t2; array_push($p, ...$p2);
        }
    }

    // Etiquetas: cualquiera de / todas las seleccionadas (PK e índice inverso de crm_contacto_tags).
    $tags = crmInts($f['tags'] ?? []);
    if ($tags) {
        $marks = crmMarks(count($tags));
        if (($f['tags_modo'] ?? 'cualquiera') === 'todos') {
            $w[] = "(SELECT COUNT(*) FROM crm_contacto_tags ct WHERE ct.id_contacto = c.id AND ct.id_tag IN ($marks)) = ?";
            $t .= str_repeat('i', count($tags)) . 'i';
            array_push($p, ...$tags); $p[] = count($tags);
        } else {
            $w[] = "EXISTS (SELECT 1 FROM crm_contacto_tags ct WHERE ct.id_contacto = c.id AND ct.id_tag IN ($marks))";
            $t .= str_repeat('i', count($tags));
            array_push($p, ...$tags);
        }
    }

    // Campos personalizados: un EXISTS por filtro, con el operador y la columna del tipo del campo.
    $campos = is_array($f['campos'] ?? null) ? array_slice($f['campos'], 0, 10) : [];
    if ($campos) {
        $ids = crmInts(array_column($campos, 'id_campo'));
        $defs = [];
        if ($ids) {
            foreach (crmRows($conn,
                'SELECT id, tipo_dato, etiqueta FROM crm_campos_personalizados WHERE id_empresa = ? AND id IN (' . crmMarks(count($ids)) . ')',
                'i' . str_repeat('i', count($ids)), [$ctx['id_empresa'], ...$ids]) as $d) $defs[(int)$d['id']] = $d;
        }
        foreach ($campos as $cf) {
            $def = $defs[(int)($cf['id_campo'] ?? 0)] ?? null;
            if (!$def) authFail(400, 'Filtro por un campo personalizado inexistente');
            [$cond, $ct, $cp] = crmCondicionCampo($def, (string)($cf['op'] ?? ''), $cf['valor'] ?? null, $cf['valor2'] ?? null);
            $w[] = "EXISTS (SELECT 1 FROM crm_campos_valores v WHERE v.id_contacto = c.id AND v.id_campo = ? AND $cond)";
            $t .= 'i' . $ct;
            $p[] = (int)$def['id'];
            array_push($p, ...$cp);
        }
    }

    return ['sql' => implode(' AND ', $w), 'types' => $t, 'params' => $p];
}

/** Condición sobre crm_campos_valores (alias v) según el tipo del campo. Devuelve [sql, types, params]. */
function crmCondicionCampo(array $def, string $op, mixed $valor, mixed $valor2): array
{
    $etq = $def['etiqueta'];
    switch ($def['tipo_dato']) {
        case 'texto':
            $s = crmClean($valor, 255, $etq, true);
            if ($op === 'contiene') return ['v.valor_texto LIKE ?', 's', ['%' . addcslashes($s, '\\%_') . '%']];
            if ($op === 'igual')    return ['v.valor_texto = ?', 's', [$s]];
            break;
        case 'booleano':
            if ($op === 'es') return ['v.valor_booleano = ?', 'i', [crmBool($valor, $etq) ? 1 : 0]];
            break;
        case 'entero':
        case 'decimal':
        case 'fecha':
            $col = 'v.valor_' . $def['tipo_dato'];
            $conv = static function ($x) use ($def, $etq) {
                return $def['tipo_dato'] === 'entero' ? crmEntero($x, $etq)
                    : ($def['tipo_dato'] === 'decimal' ? crmDecimal($x, $etq) : crmFecha($x, $etq));
            };
            $ty = $def['tipo_dato'] === 'entero' ? 'i' : 's';
            $cmp = ['=' => '=', '>' => '>', '<' => '<', '>=' => '>=', '<=' => '<='];
            if (isset($cmp[$op])) {
                $x = $conv($valor);
                if ($x === null) authFail(400, "$etq: falta el valor del filtro");
                return ["$col {$cmp[$op]} ?", $ty, [$x]];
            }
            if ($op === 'entre') {
                $a = $conv($valor); $b = $conv($valor2);
                if ($a === null || $b === null) authFail(400, "$etq: el rango necesita dos valores");
                return ["$col BETWEEN ? AND ?", $ty . $ty, [$a, $b]];
            }
            break;
    }
    authFail(400, "Operador de filtro inválido para $etq");
}

// ─── Campos personalizados ───────────────────────────────────────────────────────────────────────────────────────

function crmEntero(mixed $v, string $label): ?int
{
    if ($v === null || (is_string($v) && trim($v) === '')) return null;
    if (is_int($v)) return $v;
    if (is_float($v) && floor($v) === $v) return (int)$v;
    if (is_string($v) && preg_match('/^-?\d{1,18}$/', trim($v))) return (int)trim($v);
    authFail(400, "$label debe ser un número entero");
}

/** Decimal como texto normalizado (sin ceros finales), hasta 4 decimales. Acepta coma decimal. */
function crmDecimal(mixed $v, string $label): ?string
{
    if ($v === null || (is_string($v) && trim($v) === '')) return null;
    $s = str_replace(',', '.', trim((string)$v));
    if (!preg_match('/^-?\d{1,14}(\.\d{1,4})?$/', $s)) authFail(400, "$label debe ser un número decimal (hasta 4 decimales)");
    return crmDecimalNorm($s);
}

function crmDecimalNorm(string $s): string
{
    if (str_contains($s, '.')) $s = rtrim(rtrim($s, '0'), '.');
    return $s === '' || $s === '-' ? '0' : $s;
}

function crmBool(mixed $v, string $label): bool
{
    if (in_array($v, [true, 1, '1', 'true', 'si', 'sí'], true)) return true;
    if (in_array($v, [false, 0, '0', 'false', 'no'], true)) return false;
    authFail(400, "$label debe ser sí o no");
}

/** Campos personalizados de la empresa, opcionalmente solo de un tipo de contacto y/o solo activos. */
function crmCampos(mysqli $conn, int $idEmpresa, ?string $aplicaA = null, bool $soloActivos = false): array
{
    $sql = 'SELECT id, aplica_a, clave, etiqueta, tipo_dato, obligatorio, orden, activo FROM crm_campos_personalizados WHERE id_empresa = ?';
    $t = 'i'; $p = [$idEmpresa];
    if ($aplicaA !== null) { $sql .= ' AND aplica_a = ?'; $t .= 's'; $p[] = $aplicaA; }
    if ($soloActivos) $sql .= ' AND activo = 1';
    $rows = crmRows($conn, $sql . ' ORDER BY orden, id', $t, $p);
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['obligatorio'] = (int)$r['obligatorio'] === 1;
        $r['orden'] = (int)$r['orden'];
        $r['activo'] = (int)$r['activo'] === 1;
    }
    return $rows;
}

/** Valor listo para guardar: [columna => valor] con solo la columna del tipo, o null si viene vacío (= borrar). */
function crmValorCampo(array $campo, mixed $raw): ?array
{
    $etq = $campo['etiqueta'];
    switch ($campo['tipo_dato']) {
        case 'entero':
            $v = crmEntero($raw, $etq);
            return $v === null ? null : ['valor_entero' => $v];
        case 'decimal':
            $v = crmDecimal($raw, $etq);
            return $v === null ? null : ['valor_decimal' => $v];
        case 'texto':
            $v = crmClean($raw, 255, $etq);
            return $v === null ? null : ['valor_texto' => $v];
        case 'booleano':
            if ($raw === null || $raw === '') return null;
            return ['valor_booleano' => crmBool($raw, $etq) ? 1 : 0];
        case 'fecha':
            $v = crmFecha($raw, $etq);
            return $v === null ? null : ['valor_fecha' => $v];
    }
    authFail(400, 'Tipo de campo inválido');
}

/** Valor tipado de una fila de crm_campos_valores (o de un LEFT JOIN de ella), listo para el JSON. */
function crmValorDeFila(array $row, string $tipo): int|string|bool|null
{
    return match ($tipo) {
        'entero'   => $row['valor_entero'] !== null ? (int)$row['valor_entero'] : null,
        'decimal'  => $row['valor_decimal'] !== null ? crmDecimalNorm((string)$row['valor_decimal']) : null,
        'texto'    => $row['valor_texto'],
        'booleano' => $row['valor_booleano'] !== null ? (int)$row['valor_booleano'] === 1 : null,
        'fecha'    => $row['valor_fecha'],
        default    => null,
    };
}

/** Campos aplicables a un contacto con su valor actual: los activos y los inactivos que aún tienen valor. */
function crmCamposConValor(mysqli $conn, array $ctx, int $idContacto, string $tipo): array
{
    $rows = crmRows($conn,
        'SELECT d.id, d.clave, d.etiqueta, d.tipo_dato, d.obligatorio, d.orden, d.activo,
                v.valor_entero, v.valor_decimal, v.valor_texto, v.valor_booleano, v.valor_fecha
           FROM crm_campos_personalizados d
      LEFT JOIN crm_campos_valores v ON v.id_campo = d.id AND v.id_contacto = ?
          WHERE d.id_empresa = ? AND d.aplica_a = ? AND (d.activo = 1 OR v.id_contacto IS NOT NULL)
       ORDER BY d.orden, d.id', 'iis', [$idContacto, $ctx['id_empresa'], $tipo]);
    return array_map(static fn($r) => [
        'id' => (int)$r['id'], 'clave' => $r['clave'], 'etiqueta' => $r['etiqueta'], 'tipo_dato' => $r['tipo_dato'],
        'obligatorio' => (int)$r['obligatorio'] === 1, 'activo' => (int)$r['activo'] === 1,
        'valor' => crmValorDeFila($r, $r['tipo_dato']),
    ], $rows);
}

/**
 * Guarda los valores personalizados de un contacto ($valores: id_campo => valor crudo; ausente = no se toca,
 * vacío = se borra). Valida tipo, pertenencia a la empresa/tipo de contacto y obligatoriedad del resultado final.
 * Devuelve las diferencias para el historial ([{campo:'campo:<clave>', etiqueta, antes, despues}]).
 */
function crmGuardarCampos(mysqli $conn, array $ctx, int $idContacto, string $tipo, array $valores): array
{
    $defs = [];
    foreach (crmCampos($conn, $ctx['id_empresa'], $tipo, true) as $d) $defs[$d['id']] = $d;

    $actuales = [];   // id_campo => valor actual (tipado)
    foreach (crmCamposConValor($conn, $ctx, $idContacto, $tipo) as $c) $actuales[$c['id']] = $c;

    $antes = []; $despues = []; $etiquetas = [];
    $final = [];      // id_campo => tiene valor tras el guardado
    foreach ($actuales as $id => $c) $final[$id] = $c['valor'] !== null;

    foreach ($valores as $idCampo => $raw) {
        $idCampo = (int)$idCampo;
        if (!isset($defs[$idCampo])) authFail(400, 'Campo personalizado inválido o desactivado');
        $def = $defs[$idCampo];
        $col = crmValorCampo($def, $raw);
        $key = 'campo:' . $def['clave'];
        $etiquetas[$key] = $def['etiqueta'];
        $antes[$key] = $actuales[$idCampo]['valor'] ?? null;

        if ($col === null) {
            crmExec($conn, 'DELETE FROM crm_campos_valores WHERE id_contacto = ? AND id_campo = ?', 'ii', [$idContacto, $idCampo]);
            $despues[$key] = null;
            $final[$idCampo] = false;
            continue;
        }
        $vals = ['valor_entero' => null, 'valor_decimal' => null, 'valor_texto' => null, 'valor_booleano' => null, 'valor_fecha' => null];
        $vals = array_merge($vals, $col);
        crmExec($conn,
            'INSERT INTO crm_campos_valores (id_contacto, id_campo, valor_entero, valor_decimal, valor_texto, valor_booleano, valor_fecha, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE valor_entero = VALUES(valor_entero), valor_decimal = VALUES(valor_decimal),
                                     valor_texto = VALUES(valor_texto), valor_booleano = VALUES(valor_booleano),
                                     valor_fecha = VALUES(valor_fecha), updated_by = VALUES(updated_by)',
            'iiissisii', [$idContacto, $idCampo, $vals['valor_entero'], $vals['valor_decimal'], $vals['valor_texto'],
                $vals['valor_booleano'], $vals['valor_fecha'], $ctx['id_usuario'], $ctx['id_usuario']]);
        $despues[$key] = crmValorDeFila($vals, $def['tipo_dato']);
        $final[$idCampo] = true;
    }

    foreach ($defs as $id => $d) {
        if ($d['obligatorio'] && empty($final[$id])) authFail(400, $d['etiqueta'] . ' es obligatorio');
    }
    return historialDiff($antes, $despues, $etiquetas);
}

// ─── Etiquetas ───────────────────────────────────────────────────────────────────────────────────────────────────

function crmContactoTags(mysqli $conn, int $idContacto): array
{
    $rows = crmRows($conn,
        'SELECT t.id, t.nombre, t.color, t.id_grupo, t.aplica_a, t.activo
           FROM crm_contacto_tags ct JOIN crm_tags t ON t.id = ct.id_tag
          WHERE ct.id_contacto = ? ORDER BY t.orden, t.nombre', 'i', [$idContacto]);
    return array_map(static fn($r) => [
        'id' => (int)$r['id'], 'nombre' => $r['nombre'], 'color' => $r['color'],
        'id_grupo' => $r['id_grupo'] !== null ? (int)$r['id_grupo'] : null, 'activo' => (int)$r['activo'] === 1,
    ], $rows);
}

/** Etiquetas de la empresa por id (id => fila). */
function crmTagsPorIds(mysqli $conn, int $idEmpresa, array $ids): array
{
    $out = [];
    if (!$ids) return $out;
    foreach (crmRows($conn,
        'SELECT id, nombre, aplica_a, activo FROM crm_tags WHERE id_empresa = ? AND id IN (' . crmMarks(count($ids)) . ')',
        'i' . str_repeat('i', count($ids)), [$idEmpresa, ...$ids]) as $r) $out[(int)$r['id']] = $r;
    return $out;
}

/**
 * Deja el conjunto de etiquetas de un contacto igual a $tagIds. Valida empresa, estado activo y `aplica_a`
 * de las que se agregan. Devuelve ['agregados' => [nombres], 'quitados' => [nombres]].
 */
function crmSetTags(mysqli $conn, array $ctx, int $idContacto, string $tipo, array $tagIds): array
{
    $tagIds = crmInts($tagIds);
    if (count($tagIds) > 50) authFail(400, 'Demasiadas etiquetas');

    $actuales = [];
    foreach (crmRows($conn,
        'SELECT ct.id_tag, t.nombre FROM crm_contacto_tags ct JOIN crm_tags t ON t.id = ct.id_tag WHERE ct.id_contacto = ?',
        'i', [$idContacto]) as $r) $actuales[(int)$r['id_tag']] = $r['nombre'];

    $agregar = array_values(array_diff($tagIds, array_keys($actuales)));
    $quitar  = array_values(array_diff(array_keys($actuales), $tagIds));
    $agregados = []; $quitados = [];

    if ($agregar) {
        $defs = crmTagsPorIds($conn, $ctx['id_empresa'], $agregar);
        foreach ($agregar as $id) {
            $d = $defs[$id] ?? null;
            if (!$d) authFail(400, 'Etiqueta inexistente');
            if ((int)$d['activo'] !== 1) authFail(400, 'La etiqueta «' . $d['nombre'] . '» está desactivada');
            if ($d['aplica_a'] !== null && $d['aplica_a'] !== $tipo) authFail(400, 'La etiqueta «' . $d['nombre'] . '» no aplica a este tipo de contacto');
            crmExec($conn, 'INSERT INTO crm_contacto_tags (id_contacto, id_tag, created_by) VALUES (?, ?, ?)', 'iii', [$idContacto, $id, $ctx['id_usuario']]);
            $agregados[] = $d['nombre'];
        }
    }
    foreach ($quitar as $id) {
        crmExec($conn, 'DELETE FROM crm_contacto_tags WHERE id_contacto = ? AND id_tag = ?', 'ii', [$idContacto, $id]);
        $quitados[] = $actuales[$id];
    }
    return ['agregados' => $agregados, 'quitados' => $quitados];
}

// ─── Contactos: lectura ──────────────────────────────────────────────────────────────────────────────────────────

/** Contacto (base + extensión + quién lo creó/modificó) de la sede de la sesión, o null. */
function crmContactoBase(mysqli $conn, array $ctx, int $id): ?array
{
    $r = crmRow($conn,
        'SELECT c.id, c.tipo, c.nombre_completo, c.direccion, c.ciudad, c.lat, c.lng, c.telefono, c.id_responsable, c.activo,
                c.created_at, c.created_by, c.updated_at, c.updated_by,
                p.nombres, p.apellidos, p.correo, p.whatsapp_indicativo, p.whatsapp_numero, p.fecha_nacimiento,
                o.razon_social, o.correo_facturacion, o.id_padre, pd.nombre_completo AS padre_nombre,
                COALESCE(p.documento_tipo, o.documento_tipo)     AS documento_tipo,
                COALESCE(p.documento_numero, o.documento_numero) AS documento_numero,
                COALESCE(cu.nombre, cu.email) AS creado_por_nombre,
                COALESCE(uu.nombre, uu.email) AS modificado_por_nombre,
                COALESCE(ru.nombre, ru.email) AS responsable_nombre
           FROM crm_contactos c
      LEFT JOIN crm_contactos_personas p ON p.id = c.id
      LEFT JOIN crm_contactos_organizaciones o ON o.id = c.id
      LEFT JOIN crm_contactos pd ON pd.id = o.id_padre
      LEFT JOIN le_usuarios cu ON cu.id = c.created_by
      LEFT JOIN le_usuarios uu ON uu.id = c.updated_by
      LEFT JOIN le_usuarios ru ON ru.id = c.id_responsable
          WHERE c.id = ? AND c.id_sede = ? LIMIT 1', 'ii', [$id, $ctx['id_sede']]);
    if (!$r) return null;
    foreach (['id', 'created_by', 'updated_by', 'id_responsable', 'id_padre'] as $k) if ($r[$k] !== null) $r[$k] = (int)$r[$k];
    $r['activo'] = (int)$r['activo'] === 1;
    foreach (['lat', 'lng'] as $k) if ($r[$k] !== null) $r[$k] = (float)$r[$k];
    return $r;
}

/** Vínculos del contacto: si es organización, sus personas; si es persona, sus organizaciones. Con el rol (id y nombre). */
function crmVinculos(mysqli $conn, int $idContacto, string $tipo): array
{
    $sql = $tipo === 'organizacion'
        ? 'SELECT v.id_persona AS id, c.nombre_completo, c.activo, c.telefono, p.correo, v.id_rol, ro.nombre AS rol, v.principal
             FROM crm_contacto_vinculos v
             JOIN crm_contactos c ON c.id = v.id_persona
        LEFT JOIN crm_contactos_personas p ON p.id = c.id
        LEFT JOIN crm_roles_vinculo ro ON ro.id = v.id_rol
            WHERE v.id_organizacion = ? ORDER BY v.principal DESC, c.nombre_completo'
        : 'SELECT v.id_organizacion AS id, c.nombre_completo, c.activo, c.telefono, NULL AS correo, v.id_rol, ro.nombre AS rol, v.principal
             FROM crm_contacto_vinculos v
             JOIN crm_contactos c ON c.id = v.id_organizacion
        LEFT JOIN crm_roles_vinculo ro ON ro.id = v.id_rol
            WHERE v.id_persona = ? ORDER BY c.nombre_completo';
    return array_map(static fn($r) => [
        'id' => (int)$r['id'], 'nombre_completo' => $r['nombre_completo'], 'activo' => (int)$r['activo'] === 1,
        'telefono' => $r['telefono'], 'correo' => $r['correo'], 'id_rol' => $r['id_rol'] !== null ? (int)$r['id_rol'] : null,
        'rol' => $r['rol'], 'principal' => (int)$r['principal'] === 1,
    ], crmRows($conn, $sql, 'i', [$idContacto]));
}

/** Organizaciones que pertenecen directamente a esta (para el perfil). Máximo 100. */
function crmHijas(mysqli $conn, array $ctx, int $idOrg): array
{
    $rows = crmRows($conn,
        'SELECT c.id, c.nombre_completo, c.activo
           FROM crm_contactos_organizaciones o JOIN crm_contactos c ON c.id = o.id
          WHERE o.id_padre = ? AND c.id_sede = ? ORDER BY c.activo DESC, c.nombre_completo LIMIT 100', 'ii', [$idOrg, $ctx['id_sede']]);
    return array_map(static fn($r) => ['id' => (int)$r['id'], 'nombre_completo' => $r['nombre_completo'], 'activo' => (int)$r['activo'] === 1], $rows);
}

/**
 * Valida la organización padre: existe en la sede, es una Organización, no es la propia y no crea un ciclo
 * (ninguno de sus ancestros es el contacto que se está editando). Devuelve [id, nombre].
 */
function crmValidarPadre(mysqli $conn, array $ctx, int $idPadre, int $idActual): array
{
    if ($idActual > 0 && $idPadre === $idActual) authFail(400, 'Una organización no puede pertenecer a sí misma');
    $p = crmRow($conn, "SELECT id, nombre_completo FROM crm_contactos WHERE id = ? AND id_sede = ? AND tipo = 'organizacion' LIMIT 1", 'ii', [$idPadre, $ctx['id_sede']]);
    if (!$p) authFail(400, 'La organización a la que pertenece no existe en esta sede');
    if ($idActual > 0) {
        $cur = $idPadre;
        for ($i = 0; $i < 50 && $cur; $i++) {
            $up = crmRow($conn, 'SELECT id_padre FROM crm_contactos_organizaciones WHERE id = ?', 'i', [$cur]);
            $cur = $up && $up['id_padre'] !== null ? (int)$up['id_padre'] : 0;
            if ($cur === $idActual) authFail(400, 'Eso crearía un ciclo: la organización elegida ya depende de esta');
        }
    }
    return ['id' => (int)$p['id'], 'nombre' => $p['nombre_completo']];
}

/** Rol de vínculo de la empresa por id (o null si no existe). */
function crmRol(mysqli $conn, array $ctx, int $idRol): ?array
{
    $r = crmRow($conn, 'SELECT id, nombre, activo FROM crm_roles_vinculo WHERE id = ? AND id_empresa = ? LIMIT 1', 'ii', [$idRol, $ctx['id_empresa']]);
    return $r ? ['id' => (int)$r['id'], 'nombre' => $r['nombre'], 'activo' => (int)$r['activo'] === 1] : null;
}

// ─── Contactos: escritura ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Valida y normaliza los datos de un contacto ($src = POST o el ítem de una persona nueva; $idActual = el que se edita,
 * para validar la jerarquía). Devuelve base + extensión + nombre_completo + busqueda. Corta con 400 ante cualquier dato inválido.
 */
function crmParsearContacto(mysqli $conn, array $ctx, string $tipo, array $src, int $idActual = 0): array
{
    $c = static fn(string $k, int $max, string $label, bool $req = false) => crmClean($src[$k] ?? null, $max, $label, $req);
    $d = [
        'direccion' => $c('direccion', 255, 'Dirección'),
        'ciudad'    => $c('ciudad', 100, 'Ciudad'),
        'telefono'  => $c('telefono', 30, 'Teléfono'),
        'lat'       => crmCoord($src['lat'] ?? null, -90, 90, 'Latitud'),
        'lng'       => crmCoord($src['lng'] ?? null, -180, 180, 'Longitud'),
        'id_responsable' => null,
    ];
    // Ubicación del mapa: latitud y longitud van juntas (o ninguna).
    if (($d['lat'] === null) !== ($d['lng'] === null)) authFail(400, 'La ubicación necesita latitud y longitud (o ninguna de las dos)');
    $resp = $src['id_responsable'] ?? null;
    if ($resp !== null && $resp !== '' && (int)$resp > 0) {
        $ok = crmRow($conn, 'SELECT 1 AS ok FROM le_usuario_sedes WHERE id_sede = ? AND id_usuario = ? AND state = 1 LIMIT 1',
            'ii', [$ctx['id_sede'], (int)$resp]);
        if (!$ok) authFail(400, 'El responsable no pertenece a esta sede');
        $d['id_responsable'] = (int)$resp;
    }

    if ($tipo === 'persona') {
        $d['nombres']          = $c('nombres', 100, 'Nombres', true);
        $d['apellidos']        = $c('apellidos', 100, 'Apellidos');
        $d['documento_tipo']   = $c('documento_tipo', 20, 'Tipo de documento');
        $d['documento_numero'] = $c('documento_numero', 40, 'Documento');
        $d['correo']           = crmEmail($src['correo'] ?? null, 'Correo');
        $ind = crmDigits($src['whatsapp_indicativo'] ?? '');
        $num = crmDigits($src['whatsapp_numero'] ?? '');
        if (strlen($ind) > 6 || strlen($num) > 20) authFail(400, 'WhatsApp inválido');
        if ($num !== '' && $ind === '') authFail(400, 'Indica el indicativo del WhatsApp');
        $d['whatsapp_indicativo'] = $ind !== '' ? $ind : null;
        $d['whatsapp_numero']     = $num !== '' ? $num : null;
        $d['fecha_nacimiento']    = crmFecha($src['fecha_nacimiento'] ?? null, 'Fecha de nacimiento');
        $d['nombre_completo']     = trim($d['nombres'] . ' ' . ($d['apellidos'] ?? ''));
        $d['busqueda'] = crmBuildBusqueda([$d['nombre_completo'], $d['correo']],
            [$d['telefono'], $d['documento_numero'], $num, $ind . $num]);
    } else {
        $d['razon_social']       = $c('razon_social', 190, 'Razón social', true);
        $d['documento_tipo']     = $c('documento_tipo', 20, 'Tipo de documento');
        $d['documento_numero']   = $c('documento_numero', 40, 'Documento');
        $d['correo_facturacion'] = crmEmail($src['correo_facturacion'] ?? null, 'Correo de facturación');
        $d['id_padre'] = null; $d['padre_nombre'] = null;
        if (!empty($src['id_padre'])) {
            $pd = crmValidarPadre($conn, $ctx, (int)$src['id_padre'], $idActual);
            $d['id_padre'] = $pd['id']; $d['padre_nombre'] = $pd['nombre'];
        }
        $d['nombre_completo']    = $d['razon_social'];
        $d['busqueda'] = crmBuildBusqueda([$d['razon_social'], $d['correo_facturacion']], [$d['telefono'], $d['documento_numero']]);
    }
    return $d;
}

/** Inserta el contacto (base + extensión) y devuelve su id. No escribe historial (lo hace quien llama). */
function crmInsertarContacto(mysqli $conn, array $ctx, string $tipo, array $d): int
{
    crmExec($conn,
        'INSERT INTO crm_contactos (id_sede, tipo, nombre_completo, direccion, ciudad, lat, lng, telefono, id_responsable, busqueda, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        'issssddsisii', [$ctx['id_sede'], $tipo, $d['nombre_completo'], $d['direccion'], $d['ciudad'], $d['lat'], $d['lng'],
            $d['telefono'], $d['id_responsable'], $d['busqueda'], $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;

    if ($tipo === 'persona') {
        crmExec($conn,
            'INSERT INTO crm_contactos_personas (id, nombres, apellidos, documento_tipo, documento_numero, correo, whatsapp_indicativo, whatsapp_numero, fecha_nacimiento, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            'issssssssii', [$id, $d['nombres'], $d['apellidos'], $d['documento_tipo'], $d['documento_numero'], $d['correo'],
                $d['whatsapp_indicativo'], $d['whatsapp_numero'], $d['fecha_nacimiento'], $ctx['id_usuario'], $ctx['id_usuario']]);
    } else {
        crmExec($conn,
            'INSERT INTO crm_contactos_organizaciones (id, razon_social, documento_tipo, documento_numero, correo_facturacion, id_padre, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            'issssiii', [$id, $d['razon_social'], $d['documento_tipo'], $d['documento_numero'], $d['correo_facturacion'],
                $d['id_padre'], $ctx['id_usuario'], $ctx['id_usuario']]);
    }
    return $id;
}

/** Columnas de base y extensión que se comparan/guardan, por tipo (clave del historial => columna). */
function crmColumnasContacto(string $tipo): array
{
    $base = ['direccion', 'ciudad', 'telefono', 'lat', 'lng', 'id_responsable'];
    return $tipo === 'persona'
        ? array_merge($base, ['nombres', 'apellidos', 'documento_tipo', 'documento_numero', 'correo', 'whatsapp_indicativo', 'whatsapp_numero', 'fecha_nacimiento'])
        : array_merge($base, ['razon_social', 'documento_tipo', 'documento_numero', 'correo_facturacion', 'id_padre']);
}

/**
 * Actualiza base + extensión SOLO si algo cambió (así updated_at/updated_by no se mueven por un guardado idéntico).
 * $actual = crmContactoBase(). Devuelve las diferencias para el historial.
 */
function crmActualizarContacto(mysqli $conn, array $ctx, string $tipo, array $actual, array $d): array
{
    $antes = []; $despues = [];
    foreach (crmColumnasContacto($tipo) as $col) {
        $antes[$col] = $actual[$col] ?? null;
        $despues[$col] = $d[$col] ?? null;
    }
    $cambios = historialDiff($antes, $despues);
    if (!$cambios) return [];
    // El historial muestra el nombre de la organización padre (no su id) y la ubicación como un solo cambio (no dos).
    foreach ($cambios as &$c) {
        if ($c['campo'] === 'id_padre') { $c['campo'] = 'padre'; $c['antes'] = $actual['padre_nombre'] ?? null; $c['despues'] = $d['padre_nombre'] ?? null; }
    }
    unset($c);
    if (array_filter($cambios, static fn($c) => in_array($c['campo'], ['lat', 'lng'], true))) {
        $cambios = array_values(array_filter($cambios, static fn($c) => !in_array($c['campo'], ['lat', 'lng'], true)));
        $fmt = static fn($la, $ln) => $la === null || $ln === null ? null : number_format((float)$la, 6, '.', '') . ', ' . number_format((float)$ln, 6, '.', '');
        $cambios[] = ['campo' => 'ubicacion', 'antes' => $fmt($actual['lat'] ?? null, $actual['lng'] ?? null), 'despues' => $fmt($d['lat'], $d['lng'])];
    }

    $id = $actual['id'];
    crmExec($conn,
        'UPDATE crm_contactos SET nombre_completo = ?, direccion = ?, ciudad = ?, lat = ?, lng = ?, telefono = ?, id_responsable = ?, busqueda = ?, updated_by = ?
          WHERE id = ? AND id_sede = ?',
        'sssddsisiii', [$d['nombre_completo'], $d['direccion'], $d['ciudad'], $d['lat'], $d['lng'], $d['telefono'],
            $d['id_responsable'], $d['busqueda'], $ctx['id_usuario'], $id, $ctx['id_sede']]);

    if ($tipo === 'persona') {
        crmExec($conn,
            'UPDATE crm_contactos_personas SET nombres = ?, apellidos = ?, documento_tipo = ?, documento_numero = ?, correo = ?,
                    whatsapp_indicativo = ?, whatsapp_numero = ?, fecha_nacimiento = ?, updated_by = ? WHERE id = ?',
            'ssssssssii', [$d['nombres'], $d['apellidos'], $d['documento_tipo'], $d['documento_numero'], $d['correo'],
                $d['whatsapp_indicativo'], $d['whatsapp_numero'], $d['fecha_nacimiento'], $ctx['id_usuario'], $id]);
    } else {
        crmExec($conn,
            'UPDATE crm_contactos_organizaciones SET razon_social = ?, documento_tipo = ?, documento_numero = ?, correo_facturacion = ?, id_padre = ?, updated_by = ?
              WHERE id = ?',
            'ssssiii', [$d['razon_social'], $d['documento_tipo'], $d['documento_numero'], $d['correo_facturacion'], $d['id_padre'], $ctx['id_usuario'], $id]);
    }
    return $cambios;
}

/**
 * Marca uno o varios contactos como modificados por el usuario de la sesión cuando cambió algo que no vive en
 * crm_contactos (etiquetas, vínculos, campos personalizados). updated_at se asigna a mano: ON UPDATE no se dispara si
 * la fila queda con los mismos valores (mismo usuario guardando dos veces).
 */
function crmTocar(mysqli $conn, array $ctx, array $ids): void
{
    foreach (array_chunk(crmInts($ids), 500) as $chunk) {
        crmExec($conn,
            'UPDATE crm_contactos SET updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id_sede = ? AND id IN (' . crmMarks(count($chunk)) . ')',
            'ii' . str_repeat('i', count($chunk)), [$ctx['id_usuario'], $ctx['id_sede'], ...$chunk]);
    }
}

/** Contactos de la misma sede y tipo con el mismo número de documento (para avisar, no para bloquear). */
function crmDuplicados(mysqli $conn, array $ctx, string $tipo, ?string $documento, int $exceptoId = 0): array
{
    if ($documento === null || $documento === '') return [];
    $ext = $tipo === 'persona' ? 'crm_contactos_personas' : 'crm_contactos_organizaciones';
    $rows = crmRows($conn,
        "SELECT c.id, c.nombre_completo FROM crm_contactos c JOIN $ext x ON x.id = c.id
          WHERE c.id_sede = ? AND c.tipo = ? AND x.documento_numero = ? AND c.id <> ? LIMIT 5",
        'issi', [$ctx['id_sede'], $tipo, $documento, $exceptoId]);
    return array_map(static fn($r) => ['id' => (int)$r['id'], 'nombre_completo' => $r['nombre_completo']], $rows);
}

// ─── Vínculos organización ↔ persona ─────────────────────────────────────────────────────────────────────────────

/** Historial del vínculo en ambos contactos (org y persona), para que se vea desde cualquiera de los dos perfiles. */
function crmLogVinculo(mysqli $conn, array $ctx, string $accion, int $idOrg, string $nombreOrg, int $idPersona, string $nombrePersona, ?string $rol): void
{
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $idOrg, $accion,
        ['persona' => ['id' => $idPersona, 'nombre' => $nombrePersona], 'rol' => $rol]);
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $idPersona, $accion,
        ['organizacion' => ['id' => $idOrg, 'nombre' => $nombreOrg], 'rol' => $rol]);
}

/**
 * Rol elegido para un vínculo: null si no hay; si hay, debe ser de la empresa y estar activo (un rol desactivado solo
 * se acepta si es el que el vínculo ya tenía). Devuelve [id, nombre] o [null, null].
 */
function crmRolDeVinculo(mysqli $conn, array $ctx, mixed $idRol, ?int $idRolActual = null): array
{
    $id = (int)$idRol;
    if ($id <= 0) return [null, null];
    $r = crmRol($conn, $ctx, $id);
    if (!$r) authFail(400, 'Rol de vínculo inexistente');
    if (!$r['activo'] && $id !== $idRolActual) authFail(400, 'El rol «' . $r['nombre'] . '» está desactivado');
    return [$r['id'], $r['nombre']];
}

/**
 * Deja los vínculos de una organización iguales a $items: cada ítem trae `id_persona` (existente) o `nuevo` (datos de
 * una persona a crear en el momento), más `id_rol` (de crm_roles_vinculo) y `principal`. Mínimo una persona; exactamente
 * una principal. Escribe historial de los vínculos y de las personas creadas.
 */
function crmSincronizarVinculos(mysqli $conn, array $ctx, int $idOrg, string $nombreOrg, array $items): void
{
    if (!$items) authFail(400, 'Una organización necesita al menos una persona de referencia');
    if (count($items) > 50) authFail(400, 'Demasiadas personas de referencia');

    $actuales = [];   // id_persona => fila actual (con id_rol y nombre del rol)
    foreach (crmRows($conn,
        'SELECT v.id_persona, v.id_rol, ro.nombre AS rol, v.principal, c.nombre_completo
           FROM crm_contacto_vinculos v JOIN crm_contactos c ON c.id = v.id_persona LEFT JOIN crm_roles_vinculo ro ON ro.id = v.id_rol
          WHERE v.id_organizacion = ?', 'i', [$idOrg]) as $r) $actuales[(int)$r['id_persona']] = $r;

    $finales = [];   // id_persona => [id_rol, rol, principal, nombre]
    foreach ($items as $it) {
        if (!is_array($it)) authFail(400, 'Persona de referencia inválida');
        if (!empty($it['id_persona'])) {
            $idPersona = (int)$it['id_persona'];
            $p = crmRow($conn, "SELECT id, nombre_completo FROM crm_contactos WHERE id = ? AND id_sede = ? AND tipo = 'persona' LIMIT 1",
                'ii', [$idPersona, $ctx['id_sede']]);
            if (!$p) authFail(400, 'Una persona de referencia no existe en esta sede');
            $nombre = $p['nombre_completo'];
        } elseif (is_array($it['nuevo'] ?? null)) {
            $d = crmParsearContacto($conn, $ctx, 'persona', $it['nuevo']);
            $idPersona = crmInsertarContacto($conn, $ctx, 'persona', $d);
            $nombre = $d['nombre_completo'];
            auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $idPersona, 'creado',
                ['tipo' => 'persona', 'nombre' => $nombre, 'origen' => 'referencia_de_organizacion']);
        } else {
            authFail(400, 'Cada persona de referencia necesita id_persona o datos nuevos');
        }
        if (isset($finales[$idPersona])) authFail(400, 'Una persona de referencia está repetida');
        $actualRol = isset($actuales[$idPersona]) && $actuales[$idPersona]['id_rol'] !== null ? (int)$actuales[$idPersona]['id_rol'] : null;
        [$idRol, $rolNombre] = crmRolDeVinculo($conn, $ctx, $it['id_rol'] ?? null, $actualRol);
        $finales[$idPersona] = ['id_rol' => $idRol, 'rol' => $rolNombre, 'principal' => !empty($it['principal']), 'nombre' => $nombre];
    }

    // Exactamente una principal: la primera marcada, o la primera de la lista si ninguna lo está.
    $principal = null;
    foreach ($finales as $id => $f) if ($f['principal']) { $principal = $id; break; }
    $principal ??= array_key_first($finales);
    foreach ($finales as $id => &$f) $f['principal'] = ($id === $principal);
    unset($f);

    foreach ($actuales as $idPersona => $a) {
        if (isset($finales[$idPersona])) continue;
        crmExec($conn, 'DELETE FROM crm_contacto_vinculos WHERE id_organizacion = ? AND id_persona = ?', 'ii', [$idOrg, $idPersona]);
        crmLogVinculo($conn, $ctx, 'vinculo_quitado', $idOrg, $nombreOrg, $idPersona, $a['nombre_completo'], $a['rol']);
    }
    foreach ($finales as $idPersona => $f) {
        $a = $actuales[$idPersona] ?? null;
        $idRolActual = $a && $a['id_rol'] !== null ? (int)$a['id_rol'] : null;
        if (!$a) {
            crmExec($conn, 'INSERT INTO crm_contacto_vinculos (id_organizacion, id_persona, id_rol, principal, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
                'iiiiii', [$idOrg, $idPersona, $f['id_rol'], $f['principal'] ? 1 : 0, $ctx['id_usuario'], $ctx['id_usuario']]);
            crmLogVinculo($conn, $ctx, 'vinculo_agregado', $idOrg, $nombreOrg, $idPersona, $f['nombre'], $f['rol']);
        } elseif ($idRolActual !== $f['id_rol'] || ((int)$a['principal'] === 1) !== $f['principal']) {
            crmExec($conn, 'UPDATE crm_contacto_vinculos SET id_rol = ?, principal = ?, updated_by = ? WHERE id_organizacion = ? AND id_persona = ?',
                'iiiii', [$f['id_rol'], $f['principal'] ? 1 : 0, $ctx['id_usuario'], $idOrg, $idPersona]);
            crmLogVinculo($conn, $ctx, 'vinculo_actualizado', $idOrg, $nombreOrg, $idPersona, $f['nombre'], $f['rol']);
        }
    }
}

/**
 * WHERE (alias `c` = crm_contactos) de una selección, sin materializar los ids: {ids:[…]} o {filtros:{…}, excluidos:[…]}.
 * Lo usa la exportación por páginas. Devuelve ['sql' => …, 'types' => …, 'params' => […]].
 */
function crmSeleccionWhere(mysqli $conn, array $ctx, array $sel): array
{
    if (isset($sel['ids'])) {
        $ids = crmInts($sel['ids']);
        if (!$ids) authFail(400, 'No hay contactos seleccionados');
        if (count($ids) > CRM_BULK_MAX) authFail(400, 'Máximo ' . CRM_BULK_MAX . ' contactos seleccionados. Usa los resultados del filtro.');
        return ['sql' => 'c.id_sede = ? AND c.id IN (' . crmMarks(count($ids)) . ')', 'types' => 'i' . str_repeat('i', count($ids)), 'params' => [$ctx['id_sede'], ...$ids]];
    }
    if (is_array($sel['filtros'] ?? null)) {
        $f = crmFiltros($conn, $ctx, $sel['filtros']);
        $excluidos = crmInts($sel['excluidos'] ?? []);
        if ($excluidos) {
            $f['sql'] .= ' AND c.id NOT IN (' . crmMarks(count($excluidos)) . ')';
            $f['types'] .= str_repeat('i', count($excluidos));
            array_push($f['params'], ...$excluidos);
        }
        return $f;
    }
    authFail(400, 'Selección inválida');
}

// ─── Selección en lote ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resuelve la selección a contactos de la sede de la sesión: [['id','tipo','activo'], …] más los ids pedidos que no
 * existen en la sede. `seleccion` = {ids:[…]} o {filtros:{…}, excluidos:[…], total_esperado:N}.
 * En modo filtro se rechaza (409) si el total actual difiere del que vio el usuario, y (400) si supera el tope.
 */
function crmResolverSeleccion(mysqli $conn, array $ctx, array $sel): array
{
    if (isset($sel['ids'])) {
        $ids = crmInts($sel['ids']);
        if (!$ids) authFail(400, 'No hay contactos seleccionados');
        if (count($ids) > CRM_BULK_MAX) authFail(400, 'Máximo ' . CRM_BULK_MAX . ' contactos por operación. Afina el filtro.');
        $rows = [];
        foreach (array_chunk($ids, 500) as $chunk) {
            foreach (crmRows($conn,
                'SELECT id, tipo, activo FROM crm_contactos WHERE id_sede = ? AND id IN (' . crmMarks(count($chunk)) . ')',
                'i' . str_repeat('i', count($chunk)), [$ctx['id_sede'], ...$chunk]) as $r) $rows[(int)$r['id']] = $r;
        }
        return ['contactos' => array_values($rows), 'no_encontrados' => array_values(array_diff($ids, array_keys($rows)))];
    }

    if (is_array($sel['filtros'] ?? null)) {
        if (!isset($sel['total_esperado'])) authFail(400, 'Falta total_esperado');
        $excluidos = crmInts($sel['excluidos'] ?? []);
        $f = crmFiltros($conn, $ctx, $sel['filtros']);
        $total = (int)crmRow($conn, 'SELECT COUNT(*) AS n FROM crm_contactos c WHERE ' . $f['sql'], $f['types'], $f['params'])['n'];
        if ($total !== (int)$sel['total_esperado']) authFail(409, 'Los resultados cambiaron desde que los seleccionaste. Vuelve a filtrar.');
        if ($total - count($excluidos) > CRM_BULK_MAX) authFail(400, 'Máximo ' . CRM_BULK_MAX . ' contactos por operación. Afina el filtro.');
        $rows = crmRows($conn, 'SELECT c.id, c.tipo, c.activo FROM crm_contactos c WHERE ' . $f['sql'], $f['types'], $f['params']);
        $rows = array_values(array_filter($rows, static fn($r) => !in_array((int)$r['id'], $excluidos, true)));
        if (!$rows) authFail(400, 'No hay contactos seleccionados');
        return ['contactos' => $rows, 'no_encontrados' => []];
    }

    authFail(400, 'Selección inválida');
}
