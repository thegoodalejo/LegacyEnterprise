<?php
// Importar contactos (Personas u Organizaciones) desde Excel/CSV (backend/crm/import_contactos.php). Diseño: docs/modulos/crm.md («Importar contactos»).
// El navegador lee el archivo, interpreta cada fila (fechas y números según el formato elegido) y manda bloques ya limpios. Aquí cada fila se valida
// con LAS MISMAS funciones del formulario (crmParsearContacto, crmGuardarCampos, crmSetTags, crmSincronizarVinculos…): mientras dura la fila,
// authFail() lanza AuthFailException y un SAVEPOINT deshace lo que la fila alcanzó a escribir. Una fila con error no se guarda; el resto sigue.
// Un solo procesador (crmImpcProcesar) sirve a la simulación (transacción que se revierte) y a la importación real (un lote revertible).

require_once __DIR__ . '/_crm_ventas.php';   // lotes (crmImportacion) y claves de comparación (crmVentaClavesDoc, crmVentaClaveTexto)

const CRM_IMPC_BLOQUE_MAX = 500;                                    // filas por bloque
const CRM_IMPC_IDENTIFICAR = ['documento', 'nombre', 'campo', 'ninguno'];
const CRM_IMPC_LISTA_MAX = 50;                                      // valores por lista de avisos

/**
 * Opciones validadas: tipo (persona|organizacion), identificar (documento|nombre|campo|ninguno), id_campo, existentes (omitir|actualizar),
 * indicativo (WhatsApp por defecto, solo dígitos) e id_responsable (por defecto para los contactos nuevos sin responsable en el archivo).
 */
function crmImpcOpciones(mysqli $conn, array $ctx, array $o): array
{
    $op = [
        'tipo' => (string)($o['tipo'] ?? ''),
        'identificar' => (string)($o['identificar'] ?? 'documento'),
        'id_campo' => (int)($o['id_campo'] ?? 0),
        'existentes' => ($o['existentes'] ?? 'omitir') === 'actualizar' ? 'actualizar' : 'omitir',
        'indicativo' => crmDigits($o['indicativo'] ?? '57'),
        'id_responsable' => (int)($o['id_responsable'] ?? 0) ?: null,
        'campo_tipo' => null,
    ];
    if (!in_array($op['tipo'], CRM_TIPOS, true)) authFail(400, 'Elige qué se importa: Personas u Organizaciones');
    if (!in_array($op['identificar'], CRM_IMPC_IDENTIFICAR, true)) authFail(400, 'Forma de reconocer los contactos existentes inválida');
    if ($op['indicativo'] === '' || strlen($op['indicativo']) > 6) authFail(400, 'Indicativo de WhatsApp inválido');
    if ($op['identificar'] === 'campo') {
        $c = crmRow($conn, 'SELECT tipo_dato FROM crm_campos_personalizados WHERE id = ? AND id_empresa = ? AND aplica_a = ? LIMIT 1',
            'iis', [$op['id_campo'], $ctx['id_empresa'], $op['tipo']]);
        if (!$c || !in_array($c['tipo_dato'], ['texto', 'entero'], true)) authFail(400, 'Elige un campo personalizado de texto o número entero del tipo que se importa');
        $op['campo_tipo'] = $c['tipo_dato'];
    }
    if ($op['id_responsable'] !== null
        && !crmRow($conn, 'SELECT 1 AS ok FROM le_usuario_sedes WHERE id_sede = ? AND id_usuario = ? AND state = 1 LIMIT 1', 'ii', [$ctx['id_sede'], $op['id_responsable']])) {
        authFail(400, 'El responsable por defecto no pertenece a esta sede');
    }
    return $op;
}

// ─── Catálogos de la empresa/sede para reconocer textos del archivo ─────────────────────────────────────────────────

/** Usuarios de la sede por nombre y por correo; roles de vínculo activos; etiquetas por nombre; campos personalizados activos del tipo. */
function crmImpcCatalogos(mysqli $conn, array $ctx, string $tipo): array
{
    $usuarios = [];
    foreach (crmRows($conn, 'SELECT u.id, u.nombre, u.email FROM le_usuario_sedes s JOIN le_usuarios u ON u.id = s.id_usuario WHERE s.id_sede = ? AND s.state = 1',
        'i', [$ctx['id_sede']]) as $u) {
        if ($u['nombre']) $usuarios[crmVentaClaveTexto($u['nombre'])] = (int)$u['id'];
        if ($u['email']) $usuarios[mb_strtolower(trim($u['email']))] = (int)$u['id'];
    }
    $roles = [];
    foreach (crmRows($conn, 'SELECT id, nombre FROM crm_roles_vinculo WHERE id_empresa = ? AND activo = 1', 'i', [$ctx['id_empresa']]) as $r) {
        $roles[crmVentaClaveTexto($r['nombre'])] = (int)$r['id'];
    }
    $tags = [];
    foreach (crmRows($conn, 'SELECT id, nombre, aplica_a, activo FROM crm_tags WHERE id_empresa = ?', 'i', [$ctx['id_empresa']]) as $t) {
        $tags[crmVentaClaveTexto($t['nombre'])] = ['id' => (int)$t['id'], 'nombre' => $t['nombre'], 'aplica_a' => $t['aplica_a'], 'activo' => (int)$t['activo'] === 1];
    }
    $campos = [];
    foreach (crmCampos($conn, $ctx['id_empresa'], $tipo, true) as $c) $campos[$c['id']] = $c;
    return ['usuarios' => $usuarios, 'roles' => $roles, 'tags' => $tags, 'campos' => $campos];
}

/** Candidatos por clave → id si hay uno (o uno solo activo), 'varios' si hay más de uno, null si ninguno. */
function crmImpcElegir(array $hits): int|string|null
{
    if (!$hits) return null;
    return count($hits) === 1 ? (int)array_key_first($hits) : 'varios';
}

/**
 * Contactos ACTIVOS del tipo que ya existen, para los valores del archivo según `identificar`. Devuelve valor => id | 'varios' | null.
 * Documento: solo dígitos, con y sin dígito de verificación (como la importación de ventas). Nombre: nombre completo exacto sin tildes ni mayúsculas.
 * Campo: valor exacto del campo personalizado elegido (p. ej. «Código de cliente» del ERP).
 */
function crmImpcExistentes(mysqli $conn, array $ctx, array $op, array $valores): array
{
    $out = [];
    $valores = array_values(array_unique(array_filter(array_map(static fn($v) => trim((string)$v), $valores), static fn($v) => $v !== '')));
    if (!$valores || $op['identificar'] === 'ninguno') return $out;
    $cand = [];   // clave => [id => true]
    $ext = $op['tipo'] === 'persona' ? 'crm_contactos_personas' : 'crm_contactos_organizaciones';

    if ($op['identificar'] === 'documento') {
        $claves = [];
        foreach ($valores as $v) foreach (crmVentaClavesDoc($v) as $k) $claves[$k] = true;
        foreach (array_chunk(array_keys($claves), 400) as $chunk) {
            $m = crmMarks(count($chunk));
            foreach (crmRows($conn,
                "SELECT c.id, x.documento_numero AS doc FROM crm_contactos c JOIN $ext x ON x.id = c.id
                  WHERE c.id_sede = ? AND c.tipo = ? AND c.activo = 1
                    AND (REGEXP_REPLACE(x.documento_numero, '[^0-9]', '') IN ($m) OR REGEXP_REPLACE(SUBSTRING_INDEX(x.documento_numero, '-', 1), '[^0-9]', '') IN ($m))",
                'is' . str_repeat('s', count($chunk) * 2), [$ctx['id_sede'], $op['tipo'], ...array_map('strval', $chunk), ...array_map('strval', $chunk)]) as $r) {
                foreach (crmVentaClavesDoc((string)$r['doc']) as $k) $cand[$k][(int)$r['id']] = true;
            }
        }
        foreach ($valores as $v) {
            $hits = [];
            foreach (crmVentaClavesDoc($v) as $k) $hits += $cand[$k] ?? [];
            $out[$v] = crmImpcElegir($hits);
        }
        return $out;
    }
    if ($op['identificar'] === 'nombre') {
        foreach (array_chunk($valores, 400) as $chunk) {
            foreach (crmRows($conn, 'SELECT id, nombre_completo FROM crm_contactos WHERE id_sede = ? AND tipo = ? AND activo = 1 AND nombre_completo IN (' . crmMarks(count($chunk)) . ')',
                'is' . str_repeat('s', count($chunk)), [$ctx['id_sede'], $op['tipo'], ...$chunk]) as $r) $cand[crmVentaClaveTexto($r['nombre_completo'])][(int)$r['id']] = true;
        }
        foreach ($valores as $v) $out[$v] = crmImpcElegir($cand[crmVentaClaveTexto($v)] ?? []);
        return $out;
    }
    // Campo personalizado
    $entero = $op['campo_tipo'] === 'entero';
    $col = $entero ? 'cv.valor_entero' : 'cv.valor_texto';
    foreach (array_chunk($valores, 400) as $chunk) {
        $vals = $entero ? array_values(array_filter(array_map(static fn($x) => preg_match('/^-?\d{1,18}$/', $x) ? (int)$x : null, $chunk), static fn($x) => $x !== null)) : $chunk;
        if (!$vals) continue;
        foreach (crmRows($conn,
            "SELECT c.id, $col AS val FROM crm_campos_valores cv JOIN crm_contactos c ON c.id = cv.id_contacto
              WHERE c.id_sede = ? AND c.tipo = ? AND c.activo = 1 AND cv.id_campo = ? AND $col IN (" . crmMarks(count($vals)) . ')',
            'isi' . str_repeat($entero ? 'i' : 's', count($vals)), [$ctx['id_sede'], $op['tipo'], $op['id_campo'], ...$vals]) as $r) {
            $cand[crmVentaClaveTexto((string)$r['val'])][(int)$r['id']] = true;
        }
    }
    foreach ($valores as $v) $out[$v] = crmImpcElegir($cand[crmVentaClaveTexto($v)] ?? []);
    return $out;
}

/**
 * Organizaciones ACTIVAS de la sede por NIT/documento (solo dígitos, con y sin DV) o, si no, por nombre exacto (sin tildes ni mayúsculas).
 * Sirve a «Pertenece a» (organizaciones) y a «Organización» (personas). Devuelve valor => ['id', 'nombre'] | 'varios' | null.
 */
function crmImpcOrganizaciones(mysqli $conn, array $ctx, array $valores): array
{
    $out = [];
    $valores = array_values(array_unique(array_filter(array_map(static fn($v) => trim((string)$v), $valores), static fn($v) => $v !== '')));
    if (!$valores) return $out;
    $porDoc = []; $porNombre = []; $nombres = [];
    $claves = [];
    foreach ($valores as $v) foreach (crmVentaClavesDoc($v) as $k) $claves[$k] = true;
    foreach (array_chunk(array_keys($claves), 400) as $chunk) {
        $m = crmMarks(count($chunk));
        foreach (crmRows($conn,
            "SELECT c.id, c.nombre_completo, o.documento_numero AS doc FROM crm_contactos c JOIN crm_contactos_organizaciones o ON o.id = c.id
              WHERE c.id_sede = ? AND c.tipo = 'organizacion' AND c.activo = 1
                AND (REGEXP_REPLACE(o.documento_numero, '[^0-9]', '') IN ($m) OR REGEXP_REPLACE(SUBSTRING_INDEX(o.documento_numero, '-', 1), '[^0-9]', '') IN ($m))",
            'i' . str_repeat('s', count($chunk) * 2), [$ctx['id_sede'], ...array_map('strval', $chunk), ...array_map('strval', $chunk)]) as $r) {
            $nombres[(int)$r['id']] = $r['nombre_completo'];
            foreach (crmVentaClavesDoc((string)$r['doc']) as $k) $porDoc[$k][(int)$r['id']] = true;
        }
    }
    foreach (array_chunk($valores, 400) as $chunk) {
        foreach (crmRows($conn, "SELECT id, nombre_completo FROM crm_contactos WHERE id_sede = ? AND tipo = 'organizacion' AND activo = 1 AND nombre_completo IN (" . crmMarks(count($chunk)) . ')',
            'i' . str_repeat('s', count($chunk)), [$ctx['id_sede'], ...$chunk]) as $r) {
            $nombres[(int)$r['id']] = $r['nombre_completo'];
            $porNombre[crmVentaClaveTexto($r['nombre_completo'])][(int)$r['id']] = true;
        }
    }
    foreach ($valores as $v) {
        $hits = [];
        foreach (crmVentaClavesDoc($v) as $k) $hits += $porDoc[$k] ?? [];
        if (!$hits) $hits = $porNombre[crmVentaClaveTexto($v)] ?? [];
        $e = crmImpcElegir($hits);
        $out[$v] = is_int($e) ? ['id' => $e, 'nombre' => $nombres[$e]] : $e;
    }
    return $out;
}

/** Clave con que el navegador marca las organizaciones del archivo (para «Pertenece a» en la simulación): la primera clave de documento o el nombre. */
function crmImpcClaveOrg(string $v): string
{
    $doc = crmVentaClavesDoc($v);
    return $doc ? 'd:' . $doc[count($doc) - 1] : 'n:' . crmVentaClaveTexto($v);
}

// ─── Una fila ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** WhatsApp de una celda: solo dígitos; si empieza con el indicativo y es más largo que un número local (10), se separa. */
function crmImpcWhatsapp(?string $raw, string $indicativo): array
{
    $d = crmDigits($raw ?? '');
    if ($d === '') return [null, null];
    if (strlen($d) > 10 && str_starts_with($d, $indicativo)) $d = substr($d, strlen($indicativo));
    return [$indicativo, $d];
}

/** Texto de la fila (o null si viene vacío). */
function crmImpcTxt(array $d, string $k): ?string
{
    $v = $d[$k] ?? null;
    if ($v === null) return null;
    $s = trim(is_scalar($v) ? (string)$v : '');
    return $s === '' ? null : $s;
}

/** Id del responsable por nombre o correo; desconocido → aviso y null. */
function crmImpcResponsable(array &$aux, ?string $valor): ?int
{
    if ($valor === null) return null;
    $id = $aux['cat']['usuarios'][crmVentaClaveTexto($valor)] ?? $aux['cat']['usuarios'][mb_strtolower($valor)] ?? null;
    if ($id === null) crmImpcAviso($aux, 'responsables_desconocidos', $valor);
    return $id;
}

function crmImpcAviso(array &$aux, string $lista, string $valor): void
{
    $valor = mb_substr($valor, 0, 80);
    if (!in_array($valor, $aux['res'][$lista], true) && count($aux['res'][$lista]) < CRM_IMPC_LISTA_MAX) $aux['res'][$lista][] = $valor;
}

/** Id del rol de vínculo por nombre (roles activos de la empresa); desconocido → aviso y null (el vínculo queda sin rol). */
function crmImpcRol(array &$aux, ?string $valor): ?int
{
    if ($valor === null) return null;
    $id = $aux['cat']['roles'][crmVentaClaveTexto($valor)] ?? null;
    if ($id === null) crmImpcAviso($aux, 'roles_desconocidos', $valor);
    return $id;
}

/** Ids de las etiquetas de la celda («A, B; C»): activas y que aplican al tipo; las demás se avisan y se ignoran. */
function crmImpcTags(array &$aux, ?string $valor, string $tipo): array
{
    if ($valor === null) return [];
    $ids = [];
    foreach (preg_split('/[,;|]/u', $valor) ?: [] as $nombre) {
        $nombre = trim($nombre);
        if ($nombre === '') continue;
        $t = $aux['cat']['tags'][crmVentaClaveTexto($nombre)] ?? null;
        if (!$t || !$t['activo'] || ($t['aplica_a'] !== null && $t['aplica_a'] !== $tipo)) { crmImpcAviso($aux, 'etiquetas_desconocidas', $nombre); continue; }
        $ids[$t['id']] = true;
    }
    return array_keys($ids);
}

/** Valores de campos personalizados de la fila: solo campos activos del tipo (el navegador ya convirtió fechas y números). */
function crmImpcCampos(array &$aux, array $fila, bool $soloConValor): array
{
    $out = [];
    foreach ((array)($fila['campos'] ?? []) as $id => $v) {
        $id = (int)$id;
        if (!isset($aux['cat']['campos'][$id])) continue;
        if ($soloConValor && ($v === null || trim((string)$v) === '')) continue;
        $out[$id] = $v;
    }
    return $out;
}

/**
 * Vincula una persona a una organización SIN tocar sus otros vínculos (a diferencia de crmSincronizarVinculos, que deja la lista igual a la dada).
 * Si la organización no tenía personas, esta queda como principal. Devuelve true si el vínculo es nuevo.
 */
function crmImpcAgregarVinculo(mysqli $conn, array $ctx, int $idOrg, string $nombreOrg, int $idPersona, string $nombrePersona, ?int $idRol): bool
{
    if (crmRow($conn, 'SELECT 1 AS ok FROM crm_contacto_vinculos WHERE id_organizacion = ? AND id_persona = ? LIMIT 1', 'ii', [$idOrg, $idPersona])) return false;
    $principal = crmRow($conn, 'SELECT 1 AS ok FROM crm_contacto_vinculos WHERE id_organizacion = ? LIMIT 1', 'i', [$idOrg]) ? 0 : 1;
    crmExec($conn, 'INSERT INTO crm_contacto_vinculos (id_organizacion, id_persona, id_rol, principal, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
        'iiiiii', [$idOrg, $idPersona, $idRol, $principal, $ctx['id_usuario'], $ctx['id_usuario']]);
    $rol = $idRol !== null ? (crmRol($conn, $ctx, $idRol)['nombre'] ?? null) : null;
    crmLogVinculo($conn, $ctx, 'vinculo_agregado', $idOrg, $nombreOrg, $idPersona, $nombrePersona, $rol);
    return true;
}

/**
 * Persona de referencia de una organización (columnas «Contacto: …»): si ya existe una persona ACTIVA de la sede con ese documento, ese correo o
 * ese mismo nombre + teléfono, se usa; si no, se crea (queda en el lote, como la organización). Devuelve [id, nombre, creada].
 */
function crmImpcPersonaRef(mysqli $conn, array $ctx, array $op, array $d, ?int $idImportacion, array $meta): array
{
    $nombres = crmImpcTxt($d, 'ref_nombres');
    if ($nombres === null) authFail(400, 'Falta la persona de referencia (columna «Contacto: nombres»): toda organización necesita al menos una');
    $doc = crmImpcTxt($d, 'ref_documento');
    $correo = crmImpcTxt($d, 'ref_correo');
    $tel = crmImpcTxt($d, 'ref_telefono');
    $nombre = trim($nombres . ' ' . (crmImpcTxt($d, 'ref_apellidos') ?? ''));
    $buscar = static fn(string $where, string $t, array $p) => crmRow($conn,
        "SELECT c.id, c.nombre_completo FROM crm_contactos c JOIN crm_contactos_personas p ON p.id = c.id WHERE c.id_sede = ? AND c.tipo = 'persona' AND c.activo = 1 AND $where LIMIT 1",
        'i' . $t, [$ctx['id_sede'], ...$p]);
    $hit = null;
    if ($doc !== null && strlen(crmDigits($doc)) >= 3) $hit = $buscar("REGEXP_REPLACE(p.documento_numero, '[^0-9]', '') = ?", 's', [crmDigits($doc)]);
    if (!$hit && $correo !== null) $hit = $buscar('p.correo = ?', 's', [$correo]);
    if (!$hit && $tel !== null) $hit = $buscar('c.nombre_completo = ? AND c.telefono = ?', 'ss', [$nombre, $tel]);
    if ($hit) return [(int)$hit['id'], $hit['nombre_completo'], false];

    [$ind, $num] = crmImpcWhatsapp(crmImpcTxt($d, 'ref_whatsapp'), $op['indicativo']);
    $pd = crmParsearContacto($conn, $ctx, 'persona', [
        'nombres' => $nombres, 'apellidos' => crmImpcTxt($d, 'ref_apellidos'), 'documento_numero' => $doc, 'correo' => $correo, 'telefono' => $tel,
        'whatsapp_indicativo' => $ind, 'whatsapp_numero' => $num, 'id_responsable' => $meta['id_responsable'],
    ]);
    $id = crmInsertarContacto($conn, $ctx, 'persona', $pd, $idImportacion);
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $id, 'creado',
        ['tipo' => 'persona', 'nombre' => $pd['nombre_completo'], 'origen' => 'referencia_de_organizacion', 'id_importacion' => $idImportacion, 'archivo' => $meta['archivo']]);
    return [$id, $pd['nombre_completo'], true];
}

/**
 * Datos de la fila con el formato de crmParsearContacto. En una actualización parte de lo que el contacto ya tiene y solo reemplaza lo que el
 * archivo trae con valor (una celda vacía NO borra). Resuelve responsable y, en organizaciones, «Pertenece a».
 */
function crmImpcSrc(mysqli $conn, array $ctx, array $op, array $d, array &$aux, ?array $actual): array
{
    $src = [];
    if ($actual) {
        foreach (['direccion', 'ciudad', 'telefono', 'lat', 'lng', 'id_responsable', 'documento_tipo', 'documento_numero',
                  'nombres', 'apellidos', 'correo', 'whatsapp_indicativo', 'whatsapp_numero', 'fecha_nacimiento',
                  'razon_social', 'correo_facturacion', 'id_padre'] as $k) $src[$k] = $actual[$k] ?? null;
    }
    $campos = $op['tipo'] === 'persona'
        ? ['nombres', 'apellidos', 'documento_tipo', 'documento_numero', 'correo', 'fecha_nacimiento', 'telefono', 'direccion', 'ciudad']
        : ['razon_social', 'documento_tipo', 'documento_numero', 'correo_facturacion', 'telefono', 'direccion', 'ciudad'];
    foreach ($campos as $k) if (($v = crmImpcTxt($d, $k)) !== null) $src[$k] = $v;
    // Ubicación: las dos o ninguna (si el archivo trae solo una, crmParsearContacto responde con el error de siempre).
    $lat = $d['lat'] ?? null; $lng = $d['lng'] ?? null;
    if (($lat !== null && $lat !== '') || ($lng !== null && $lng !== '')) { $src['lat'] = $lat === '' ? null : $lat; $src['lng'] = $lng === '' ? null : $lng; }
    if ($op['tipo'] === 'persona' && ($w = crmImpcTxt($d, 'whatsapp')) !== null) {
        [$src['whatsapp_indicativo'], $src['whatsapp_numero']] = crmImpcWhatsapp($w, $op['indicativo']);
    }
    $resp = crmImpcResponsable($aux, crmImpcTxt($d, 'responsable'));
    if ($resp !== null) $src['id_responsable'] = $resp;
    elseif (!$actual && $op['id_responsable'] !== null) $src['id_responsable'] = $op['id_responsable'];   // por defecto: solo a los nuevos

    if ($op['tipo'] === 'organizacion' && ($padre = crmImpcTxt($d, 'pertenece_a')) !== null) {
        $o = crmImpcOrganizaciones($conn, $ctx, [$padre])[$padre] ?? null;
        if ($o === 'varios') authFail(400, 'Más de una organización coincide con «Pertenece a»');
        if (is_array($o)) $src['id_padre'] = $o['id'];
        elseif (!isset($aux['padres_archivo'][crmImpcClaveOrg($padre)])) {
            crmImpcAviso($aux, 'organizaciones_no_encontradas', $padre);
            authFail(400, 'No se encontró la organización a la que pertenece (columna «Pertenece a»)');
        }
        // En la simulación, la matriz puede venir en un bloque anterior del mismo archivo (ya revertido): se acepta sin asignarla.
    }
    return $src;
}

/**
 * Procesa una fila (dentro de un SAVEPOINT de quien llama). Devuelve ['accion' => nuevo|actualizado|omitido, 'personas' => n, 'vinculos' => n].
 * Lanza AuthFailException con el motivo si algo no es válido.
 */
function crmImpcFila(mysqli $conn, array $ctx, array $op, array $fila, array &$aux, ?int $idImportacion, array $meta): array
{
    $tipo = $op['tipo'];
    $d = is_array($fila['d'] ?? null) ? $fila['d'] : [];
    $res = ['accion' => 'nuevo', 'personas' => 0, 'vinculos' => 0];
    $origen = ['origen' => 'importacion', 'id_importacion' => $idImportacion, 'archivo' => $meta['archivo']];

    // ¿Ya existe?
    $clave = crmImpcTxt($fila, 'clave');
    $existe = $clave !== null ? ($aux['existentes'][$clave] ?? null) : null;
    if ($existe === 'varios') authFail(409, 'Más de un contacto activo coincide: no se sabe cuál actualizar');
    if (is_int($existe) && $op['existentes'] === 'omitir') return ['accion' => 'omitido', 'personas' => 0, 'vinculos' => 0];

    if (is_int($existe)) {
        // ─ Actualizar: solo lo que el archivo trae con valor; etiquetas y vínculos se AGREGAN (no se quita nada).
        $actual = crmContactoBase($conn, $ctx, $existe);
        $src = crmImpcSrc($conn, $ctx, $op, $d, $aux, $actual);
        $pd = crmParsearContacto($conn, $ctx, $tipo, $src, $existe);
        $cambios = crmActualizarContacto($conn, $ctx, $tipo, $actual, $pd);
        $detalle = [];
        if ($campos = crmImpcCampos($aux, $fila, true)) $cambios = array_merge($cambios, crmGuardarCampos($conn, $ctx, $existe, $tipo, $campos));
        if ($tags = crmImpcTags($aux, crmImpcTxt($d, 'etiquetas'), $tipo)) {
            $ya = array_map(static fn($t) => (int)$t['id'], crmContactoTags($conn, $existe));
            $t = crmSetTags($conn, $ctx, $existe, $tipo, array_values(array_unique([...$ya, ...$tags])));
            if ($t['agregados']) $detalle['tags'] = $t;
        }
        $res['vinculos'] = crmImpcVinculos($conn, $ctx, $op, $d, $aux, $existe, $pd['nombre_completo'], $idImportacion, $meta, $res);
        if ($cambios) $detalle['cambios'] = $cambios;
        if ($detalle) {
            auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $existe, 'actualizado', $detalle + $origen);
            crmTocar($conn, $ctx, [$existe]);
        }
        $res['accion'] = ($detalle || $res['vinculos']) ? 'actualizado' : 'omitido';
        return $res;
    }

    // ─ Crear
    $src = crmImpcSrc($conn, $ctx, $op, $d, $aux, null);
    $pd = crmParsearContacto($conn, $ctx, $tipo, $src);
    if ($tipo === 'organizacion' && crmImpcTxt($d, 'ref_nombres') === null) {
        authFail(400, 'Falta la persona de referencia (columna «Contacto: nombres»): toda organización necesita al menos una');
    }
    $id = crmInsertarContacto($conn, $ctx, $tipo, $pd, $idImportacion);
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $id, 'creado', ['tipo' => $tipo, 'nombre' => $pd['nombre_completo']] + $origen);
    $res['vinculos'] = crmImpcVinculos($conn, $ctx, $op, $d, $aux, $id, $pd['nombre_completo'], $idImportacion, $meta + ['id_responsable' => $pd['id_responsable']], $res);
    crmGuardarCampos($conn, $ctx, $id, $tipo, crmImpcCampos($aux, $fila, false));   // valida los obligatorios aunque la fila no los traiga
    if ($tags = crmImpcTags($aux, crmImpcTxt($d, 'etiquetas'), $tipo)) crmSetTags($conn, $ctx, $id, $tipo, $tags);
    return $res;
}

/**
 * Vínculos de la fila. Organización: su persona de referencia (existente o nueva) con el rol «Contacto: cargo»; al crear se usa
 * crmSincronizarVinculos (queda principal). Persona: la organización de la columna «Organización» con el rol «Cargo». Devuelve cuántos son nuevos.
 */
function crmImpcVinculos(mysqli $conn, array $ctx, array $op, array $d, array &$aux, int $id, string $nombre, ?int $idImportacion, array $meta, array &$res): int
{
    if ($op['tipo'] === 'organizacion') {
        if (crmImpcTxt($d, 'ref_nombres') === null) return 0;   // al crear ya se exigió; al actualizar es opcional
        [$idPersona, $nombrePersona, $creada] = crmImpcPersonaRef($conn, $ctx, $op, $d, $idImportacion, $meta + ['id_responsable' => $meta['id_responsable'] ?? null]);
        if ($creada) $res['personas']++;
        $idRol = crmImpcRol($aux, crmImpcTxt($d, 'ref_rol'));
        $tiene = crmRow($conn, 'SELECT 1 AS ok FROM crm_contacto_vinculos WHERE id_organizacion = ? LIMIT 1', 'i', [$id]);
        if (!$tiene) {
            crmSincronizarVinculos($conn, $ctx, $id, $nombre, [['id_persona' => $idPersona, 'id_rol' => $idRol, 'principal' => true]]);
            return 1;
        }
        return crmImpcAgregarVinculo($conn, $ctx, $id, $nombre, $idPersona, $nombrePersona, $idRol) ? 1 : 0;
    }
    $org = crmImpcTxt($d, 'organizacion');
    if ($org === null) return 0;
    $o = crmImpcOrganizaciones($conn, $ctx, [$org])[$org] ?? null;
    if ($o === 'varios') authFail(400, 'Más de una organización coincide con la columna «Organización»');
    if (!is_array($o)) { crmImpcAviso($aux, 'organizaciones_no_encontradas', $org); authFail(400, 'No se encontró la organización (columna «Organización»)'); }
    return crmImpcAgregarVinculo($conn, $ctx, $o['id'], $o['nombre'], $id, $nombre, crmImpcRol($aux, crmImpcTxt($d, 'rol'))) ? 1 : 0;
}

// ─── Bloque ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Procesa un bloque de filas ya interpretadas por el navegador: [{fila, clave (valor con que se reconoce), d: {campo: valor}, campos: {id: valor}}].
 * `$idImportacion` null = simulación (quien llama revierte la transacción). `$padresArchivo`: claves (crmImpcClaveOrg) de las organizaciones del
 * archivo que vienen en bloques anteriores (solo para aceptar «Pertenece a» en la simulación). Devuelve contadores, errores y avisos.
 */
function crmImpcProcesar(mysqli $conn, array $ctx, array $filas, array $op, ?int $idImportacion, string $archivo, array $padresArchivo = []): array
{
    if (count($filas) > CRM_IMPC_BLOQUE_MAX) authFail(400, 'Demasiadas filas en un bloque (máx. ' . CRM_IMPC_BLOQUE_MAX . ')');
    $aux = [
        'cat' => crmImpcCatalogos($conn, $ctx, $op['tipo']),
        'padres_archivo' => array_fill_keys(array_map('strval', $padresArchivo), true),
        'res' => ['organizaciones_no_encontradas' => [], 'etiquetas_desconocidas' => [], 'roles_desconocidos' => [], 'responsables_desconocidos' => []],
    ];
    $aux['existentes'] = crmImpcExistentes($conn, $ctx, $op, array_map(static fn($f) => is_array($f) ? (string)($f['clave'] ?? '') : '', $filas));
    $res = ['filas_ok' => 0, 'filas_error' => 0, 'contactos_nuevos' => 0, 'contactos_actualizados' => 0, 'contactos_omitidos' => 0,
            'personas_creadas' => 0, 'vinculos_creados' => 0, 'errores' => []];
    $meta = ['archivo' => $archivo, 'id_responsable' => null];

    foreach ($filas as $f) {
        $n = is_array($f) ? (int)($f['fila'] ?? 0) : 0;
        if (!is_array($f)) { $res['filas_error']++; $res['errores'][] = ['fila' => $n, 'motivo' => 'Fila inválida']; continue; }
        $conn->query('SAVEPOINT fila');
        $GLOBALS['authFailLanza'] = true;
        try {
            $r = crmImpcFila($conn, $ctx, $op, $f, $aux, $idImportacion, $meta);
            $GLOBALS['authFailLanza'] = false;
            $conn->query('RELEASE SAVEPOINT fila');
            $res['filas_ok']++;
            $res['contactos_' . ($r['accion'] === 'nuevo' ? 'nuevos' : ($r['accion'] === 'actualizado' ? 'actualizados' : 'omitidos'))]++;
            $res['personas_creadas'] += $r['personas'];
            $res['vinculos_creados'] += $r['vinculos'];
        } catch (AuthFailException $e) {
            $GLOBALS['authFailLanza'] = false;
            $conn->query('ROLLBACK TO SAVEPOINT fila');
            $res['filas_error']++;
            if (count($res['errores']) < CRM_IMPORT_ERRORES_MAX) $res['errores'][] = ['fila' => $n, 'motivo' => $e->getMessage()];
        }
    }
    $GLOBALS['authFailLanza'] = false;
    return $res + $aux['res'];
}
