<?php
// Sesión, sede activa, roles y privilegios. Un solo lugar; ningún endpoint reimplementa esto.
//
// Uso en un endpoint:
//   requireAuth();                  // 401 sin token válido
//   $idSede = requireSede();        // 403 si el usuario no tiene sede activa con acceso
//   requireRole('L2');              // 403 si su rol en esta sede es menor
//   requirePrivilege('archivos');   // 403 si no tiene el privilegio en esta sede
//   $u = $GLOBALS['authUser'];      // id, email, nombre, rol, privilegios, id_sede, is_platform_admin

require_once __DIR__ . '/db_connection.php';

// Jerarquía de roles. L5 = plataforma (is_platform_admin), nunca se guarda en usuario_sedes.
const ROLE_RANK = ['Nuevo' => 0, 'L0' => 1, 'L1' => 2, 'L2' => 3, 'L3' => 4, 'L4' => 5, 'L5' => 9];

// Módulos de la suite (catálogo le_modulos). Mantener igual a ModuleCode en app-modules.ts.
const MODULES = ['crm', 'comunicaciones', 'agenda', 'servicios', 'pedidos', 'integraciones', 'gerencia'];

// Lista cerrada de privilegios. Mantener igual a PRIVILEGES en session.service.ts.
// Los códigos de módulo son también privilegios: dan acceso a ese módulo a L0–L3 (L4+ los ve todos).
const PRIVILEGES = ['usuarios', 'archivos', ...MODULES];

/** Error de validación lanzado en lugar de responder, solo mientras `$GLOBALS['authFailLanza']` está activo (importaciones fila por fila). */
class AuthFailException extends RuntimeException {}

function authFail(int $code, string $mensaje): void
{
    // Una importación valida cada fila con las mismas funciones del formulario: el error se vuelve el motivo de esa fila y el bloque sigue.
    if (!empty($GLOBALS['authFailLanza'])) throw new AuthFailException($mensaje, $code);
    http_response_code($code);
    echo json_encode(['action' => false, 'mensaje' => $mensaje]);
    exit;
}

function getAuthToken(): ?string
{
    $headers = function_exists('getallheaders') ? array_change_key_case(getallheaders(), CASE_LOWER) : [];
    $token = $headers['x-auth-token'] ?? ($_SERVER['HTTP_X_AUTH_TOKEN'] ?? null);
    return ($token !== null && $token !== '') ? $token : null;
}

function requireAuth(): array
{
    if (isset($GLOBALS['authUser'])) return $GLOBALS['authUser'];

    $token = getAuthToken();
    if (!$token) authFail(401, 'Token no proporcionado');
    return loadSession($token);
}

/** Carga la sesión de un token (lo usa requireAuth y el handshake justo después de guardar el hash). */
function loadSession(string $token): array
{
    $hash = hash('sha256', $token);

    $conn = conectar();
    $stmt = db_prepare_or_fail($conn,
        'SELECT u.id, u.email, u.nombre, u.foto_url, u.idioma, u.is_platform_admin, u.id_sede_activa, u.state,
                us.rol, us.privilegios, s.nombre AS sede_nombre, s.activo AS sede_activa_ok, s.id_empresa
           FROM le_usuarios u
      LEFT JOIN le_usuario_sedes us ON us.id_usuario = u.id AND us.id_sede = u.id_sede_activa AND us.state = 1
      LEFT JOIN le_sedes s ON s.id = u.id_sede_activa
          WHERE u.auth_token_hash = ? LIMIT 1');
    $stmt->bind_param('s', $hash);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $conn->close();

    if (!$row) authFail(401, 'Token inválido');
    if ((int)$row['state'] !== 1) authFail(403, 'Usuario inactivo');

    $isL5   = (int)$row['is_platform_admin'] === 1;
    $idSede = $row['id_sede_activa'] !== null ? (int)$row['id_sede_activa'] : null;

    // Sede activa válida: L5 en cualquier sede existente; el resto necesita fila activa en usuario_sedes.
    $tieneAcceso = $idSede !== null && $row['sede_nombre'] !== null && ($isL5 || $row['rol'] !== null);
    if ($tieneAcceso && !$isL5 && (int)$row['sede_activa_ok'] !== 1) $tieneAcceso = false;

    $privs = $row['privilegios'] ? (json_decode($row['privilegios'], true) ?: []) : [];

    $GLOBALS['authUser'] = [
        'id'                => (int)$row['id'],
        'email'             => $row['email'],
        'nombre'            => $row['nombre'],
        'foto_url'          => $row['foto_url'],
        'idioma'            => $row['idioma'],
        'is_platform_admin' => $isL5,
        'id_sede'           => $tieneAcceso ? $idSede : null,
        'sede_nombre'       => $tieneAcceso ? $row['sede_nombre'] : null,
        'id_empresa'        => $tieneAcceso ? (int)$row['id_empresa'] : null,
        'rol'               => $isL5 ? 'L5' : ($tieneAcceso ? $row['rol'] : null),
        'privilegios'       => $isL5 ? PRIVILEGES : ($tieneAcceso ? array_values(array_intersect($privs, PRIVILEGES)) : []),
    ];
    return $GLOBALS['authUser'];
}

/** Devuelve el id de la sede activa de la sesión. Usar SIEMPRE este valor, nunca un id_sede del POST. */
function requireSede(): int
{
    $u = requireAuth();
    if ($u['id_sede'] === null) authFail(403, 'Sin sede activa');
    return $u['id_sede'];
}

function roleRank(?string $rol): int
{
    return $rol !== null && isset(ROLE_RANK[$rol]) ? ROLE_RANK[$rol] : -1;
}

function requireRole(string $minRol): void
{
    $u = requireAuth();
    if (roleRank($u['rol']) < roleRank($minRol)) authFail(403, 'Rol insuficiente');
}

function requirePlatformAdmin(): void
{
    $u = requireAuth();
    if (!$u['is_platform_admin']) authFail(403, 'Solo administradores de plataforma');
}

function hasPrivilege(string $privilegio): bool
{
    $u = requireAuth();
    return $u['is_platform_admin'] || in_array($privilegio, $u['privilegios'], true);
}

function requirePrivilege(string $privilegio): void
{
    requireSede();
    if (!hasPrivilege($privilegio)) authFail(403, 'Sin privilegio: ' . $privilegio);
}

/** Códigos de módulo contratados y vigentes hoy en una sede (y activos en el catálogo). */
function modulosSede(mysqli $conn, int $idSede): array
{
    $stmt = db_prepare_or_fail($conn,
        'SELECT m.codigo
           FROM le_sede_modulos sm
           JOIN le_modulos m ON m.codigo = sm.codigo_modulo AND m.activo = 1
          WHERE sm.id_sede = ? AND sm.activo = 1
            AND (sm.fecha_inicio IS NULL OR sm.fecha_inicio <= CURDATE())
            AND (sm.fecha_fin IS NULL OR sm.fecha_fin >= CURDATE())
       ORDER BY m.orden');
    $stmt->bind_param('i', $idSede);
    db_execute_or_fail($stmt);
    $codes = array_column($stmt->get_result()->fetch_all(MYSQLI_ASSOC), 'codigo');
    $stmt->close();
    return $codes;
}

/** Módulos que el usuario de la sesión puede abrir: contratados en la sede ∩ su acceso (L4+ todos; L0–L3 por privilegio). */
function modulosUsuario(array $u, array $habilitados): array
{
    if ($u['id_sede'] === null || roleRank($u['rol']) < roleRank('L0')) return [];
    if (roleRank($u['rol']) >= roleRank('L4')) return $habilitados;
    return array_values(array_intersect($habilitados, $u['privilegios']));
}

/** 403 si el módulo no está contratado en la sede activa o el usuario no tiene acceso. Devuelve la sede. */
function requireModulo(string $codigo): int
{
    $idSede = requireSede();
    $conn = conectar();
    $habilitados = modulosSede($conn, $idSede);
    $conn->close();
    if (!in_array($codigo, $habilitados, true)) authFail(403, 'Módulo no habilitado en esta sede: ' . $codigo);
    if (!in_array($codigo, modulosUsuario($GLOBALS['authUser'], $habilitados), true)) authFail(403, 'Sin acceso al módulo: ' . $codigo);
    return $idSede;
}

/**
 * Como requireModulo, pero basta con UNO de los módulos (contratado en la sede y con acceso del usuario).
 * Lo usan los datos compartidos entre módulos: los contactos y las etiquetas son del CRM y de Comunicaciones.
 * Devuelve la sede.
 */
function requireModuloAlguno(array $codigos): int
{
    if (count($codigos) === 1) return requireModulo($codigos[0]);
    $idSede = requireSede();
    $conn = conectar();
    $habilitados = modulosSede($conn, $idSede);
    $conn->close();
    $contratados = array_values(array_intersect($codigos, $habilitados));
    if (!$contratados) authFail(403, 'Módulo no habilitado en esta sede: ' . implode(' o ', $codigos));
    if (!array_intersect($contratados, modulosUsuario($GLOBALS['authUser'], $habilitados))) {
        authFail(403, 'Sin acceso al módulo: ' . implode(' o ', $contratados));
    }
    return $idSede;
}

/**
 * Sesión completa para el frontend (handshake, me, switch_sede, join_sede): usuario + sede + rol +
 * privilegios + marca blanca de la empresa + módulos (los que puede abrir y los contratados en la sede).
 */
function sessionPayload(): array
{
    $u = requireAuth();
    $u['empresa'] = null;
    $u['modulos'] = [];
    $u['modulos_sede'] = [];
    if ($u['id_sede'] === null) return $u;

    $conn = conectar();
    $stmt = db_prepare_or_fail($conn,
        'SELECT id, nombre, logo_url, color_primario, color_secundario, color_terciario FROM le_empresas WHERE id = ?');
    $stmt->bind_param('i', $u['id_empresa']);
    $stmt->execute();
    $e = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $habilitados = modulosSede($conn, $u['id_sede']);
    $conn->close();

    if ($e) {
        $u['empresa'] = [
            'id'       => (int)$e['id'],
            'nombre'   => $e['nombre'],
            'logo_url' => $e['logo_url'],
            'colores'  => $e['color_primario'] && $e['color_secundario'] && $e['color_terciario']
                ? ['primary' => $e['color_primario'], 'secondary' => $e['color_secundario'], 'tertiary' => $e['color_terciario']]
                : null,
        ];
    }
    $u['modulos_sede'] = $habilitados;
    $u['modulos'] = modulosUsuario($u, $habilitados);
    return $u;
}

/** Hex #RRGGBB normalizado a mayúsculas, o null si viene vacío. Corta con 400 si es inválido. */
function hexColorOrNull(?string $v): ?string
{
    $v = trim((string)$v);
    if ($v === '') return null;
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $v)) authFail(400, 'Color inválido (usa #RRGGBB)');
    return strtoupper($v);
}

/** Auditoría de operaciones sensibles. Nunca corta el flujo si falla. */
function auditAdmin(mysqli $conn, string $accion, array $detalle = [], ?int $idSede = null): void
{
    $u = $GLOBALS['authUser'] ?? null;
    if (!$u) return;
    $idSede = $idSede ?? $u['id_sede'];
    $json = json_encode($detalle, JSON_UNESCAPED_UNICODE);
    $stmt = $conn->prepare('INSERT INTO le_H_admin (id_sede, id_usuario, accion, detalle) VALUES (?, ?, ?, ?)');
    if (!$stmt) { error_log('[audit] ' . $conn->error); return; }
    $stmt->bind_param('iiss', $idSede, $u['id'], $accion, $json);
    $stmt->execute();
    $stmt->close();
}
