<?php
// Helpers del módulo Comunicaciones (backend/comunicaciones/*). Diseño y decisiones: docs/modulos/comunicaciones.md.
// Reglas que viven aquí para que ningún endpoint las reimplemente:
//   - la sede y la empresa SIEMPRE salen de la sesión (comContext), nunca del POST (salvo los endpoints de plataforma, L5);
//   - los contactos y las etiquetas son los del CRM (crm_contactos, crm_tags): se reutilizan sus helpers (_crm.php);
//   - los secretos de Meta se guardan cifrados (_com_crypto.php) y nunca se devuelven al frontend.

require_once __DIR__ . '/_crm.php';
require_once __DIR__ . '/_com_crypto.php';
require_once __DIR__ . '/_com_whatsapp.php';
require_once __DIR__ . '/_com_creditos.php';
require_once __DIR__ . '/_com_conversaciones.php';

const COM_MODULO = 'comunicaciones';
const COM_ESTADOS_CONV = ['bot', 'cola', 'atencion', 'cerrada'];

/** Sesión de Comunicaciones: exige el módulo contratado y con acceso. Mismo formato que crmContext (sirve a los helpers del CRM). */
function comContext(): array
{
    $idSede = requireModulo(COM_MODULO);
    $u = $GLOBALS['authUser'];
    return ['id_sede' => $idSede, 'id_empresa' => (int)$u['id_empresa'], 'id_usuario' => (int)$u['id'], 'rol' => $u['rol']];
}

function comEsRol(array $ctx, string $minRol): bool
{
    return roleRank($ctx['rol']) >= roleRank($minRol);
}

function comSedeTieneModulo(mysqli $conn, int $idSede, string $codigo): bool
{
    return in_array($codigo, modulosSede($conn, $idSede), true);
}

/** Usuarios de la sede que pueden abrir Comunicaciones (L4 o privilegio `comunicaciones`), para asignar y avisar. */
function comUsuariosModulo(mysqli $conn, int $idSede): array
{
    $rows = crmRows($conn,
        "SELECT u.id, COALESCE(u.nombre, u.email) AS nombre, u.email, us.rol, us.privilegios
           FROM le_usuario_sedes us JOIN le_usuarios u ON u.id = us.id_usuario AND u.state = 1
          WHERE us.id_sede = ? AND us.state = 1 AND us.rol <> 'Nuevo' ORDER BY nombre", 'i', [$idSede]);
    $out = [];
    foreach ($rows as $r) {
        $privs = $r['privilegios'] ? (json_decode($r['privilegios'], true) ?: []) : [];
        if ($r['rol'] === 'L4' || in_array(COM_MODULO, $privs, true)) {
            $out[] = ['id' => (int)$r['id'], 'nombre' => $r['nombre'], 'email' => $r['email'], 'rol' => $r['rol']];
        }
    }
    return $out;
}

/** ¿El usuario puede abrir Comunicaciones en la sede? (destino de una transferencia o de un aviso del chatbot). */
function comUsuarioTieneModulo(mysqli $conn, int $idSede, int $idUsuario): bool
{
    return in_array($idUsuario, array_column(comUsuariosModulo($conn, $idSede), 'id'), true);
}

/** Línea de la sede (sin secretos) o 404. */
function comLineaDeSede(mysqli $conn, array $ctx, int $idLinea, bool $soloActiva = true): array
{
    $l = comLinea($conn, $idLinea, $ctx['id_sede'], $soloActiva);
    if (!$l) authFail(404, 'Línea no encontrada');
    return $l;
}

/**
 * Línea con su app (versión de Graph) y el token DESCIFRADO en ['token'] (solo para llamar a Meta; nunca devolverlo).
 * $idSede: si viene, la línea debe ser de esa sede.
 */
function comLinea(mysqli $conn, int $idLinea, ?int $idSede = null, bool $soloActiva = true): ?array
{
    $l = crmRow($conn,
        'SELECT l.*, a.graph_version, a.app_id AS meta_app_id, a.activo AS app_activa
           FROM com_lineas l JOIN com_meta_apps a ON a.id = l.id_app WHERE l.id = ?', 'i', [$idLinea]);
    if (!$l) return null;
    if ($idSede !== null && (int)$l['id_sede'] !== $idSede) return null;
    if ($soloActiva && ((int)$l['activo'] !== 1 || (int)$l['app_activa'] !== 1)) return null;
    foreach (['id', 'id_sede', 'id_app', 'activo'] as $k) $l[$k] = (int)$l[$k];
    $l['token'] = comDescifrar($l['access_token_enc']);
    unset($l['access_token_enc']);
    return $l;
}

/** Datos públicos de una línea para el frontend. */
function comLineaPublica(array $l): array
{
    return [
        'id' => (int)$l['id'], 'id_sede' => (int)$l['id_sede'], 'nombre' => $l['nombre'], 'telefono_visible' => $l['telefono_visible'],
        'nombre_verificado' => $l['nombre_verificado'], 'calidad' => $l['calidad'], 'nivel_mensajes' => $l['nivel_mensajes'],
        'activo' => (int)$l['activo'] === 1,
    ];
}

/** Despierta al worker en segundo plano (no espera). En Windows (desarrollo) no hace nada: el worker se corre a mano. */
function comDespertarWorker(): void
{
    if (PHP_OS_FAMILY === 'Windows' || !function_exists('exec')) return;
    $php = PHP_BINDIR . '/php';
    $job = realpath(__DIR__ . '/../cron/jobs/com_worker.php');
    if (!$job || !is_executable($php)) return;
    // El archivo lo puede haber creado el cron (otro usuario): si la redirección falla, sh ni siquiera lanza el worker.
    $f = '/var/log/app/com_worker.log';
    $log = (is_file($f) ? is_writable($f) : is_dir('/var/log/app') && is_writable('/var/log/app')) ? $f : '/dev/null';
    @exec('setsid ' . escapeshellarg($php) . ' ' . escapeshellarg($job) . ' >> ' . escapeshellarg($log) . ' 2>&1 &');
}

/** Normaliza un texto para comparar palabras: minúsculas, sin tildes ni signos, espacios simples. */
function comNormalizar(string $s): string
{
    $s = mb_strtolower(trim($s), 'UTF-8');
    $s = strtr($s, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o',
        'ù' => 'u', 'â' => 'a', 'ê' => 'e', 'î' => 'i', 'ô' => 'o', 'û' => 'u', 'ä' => 'a', 'ë' => 'e', 'ï' => 'i', 'ö' => 'o', 'ç' => 'c', 'ã' => 'a', 'õ' => 'o']);
    // ñ se conserva (año ≠ ano); se quitan signos y emojis, se dejan letras, números y espacios.
    $s = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $s) ?? $s;
    return trim(preg_replace('/\s+/u', ' ', $s) ?? $s);
}

/**
 * URL pública de la API (webhook y enlaces de seguimiento). Debe ser ESTABLE: los botones de las plantillas aprobadas la llevan fija.
 * COM_API_URL si está en el entorno; si no, la del entorno conocido; en desarrollo, la del request.
 */
function comUrlApi(): string
{
    $env = getenv('COM_API_URL');
    if ($env) return rtrim($env, '/');
    $conocidas = ['production' => 'https://api.legacyenterprise.legacysoftware.cloud', 'qa' => 'https://qa.legacyenterprise.legacysoftware.cloud'];
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    if (isset($conocidas[app_env()]) && !str_starts_with($host, 'localhost') && !str_starts_with($host, '127.')) return $conocidas[app_env()];
    $https = ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    return ($https ? 'https' : 'http') . '://' . ($host ?: 'localhost');
}

function comUrlWebhook(int $idApp): string
{
    return comUrlApi() . '/comunicaciones/webhook.php?app=' . $idApp;
}

/**
 * Lee en Meta a dónde van hoy los eventos de un número (webhook alterno del número → de la WABA → de la app) y lo guarda en la línea.
 * $l: línea de comLinea() (con token). Devuelve numero, waba, aplicacion, efectiva, nuestra, aqui y aviso (si Meta no dejó leerlo).
 */
function comLeerWebhookLinea(mysqli $conn, array $l): array
{
    $nuestra = comUrlWebhook((int)$l['id_app']);
    $v = comGraph('GET', '/' . $l['phone_number_id'] . '?fields=webhook_configuration', $l['token'], $l['graph_version']);
    if (!$v['ok']) {
        return ['numero' => null, 'waba' => null, 'aplicacion' => null, 'efectiva' => null, 'nuestra' => $nuestra, 'aqui' => false,
                'aviso' => 'Meta no dejó leer la configuración del webhook: ' . comErrorDe($v)[1]];
    }
    $cfg = $v['data']['webhook_configuration'] ?? [];
    $numero = ($cfg['phone_number'] ?? '') ?: null;
    $waba = ($cfg['whatsapp_business_account'] ?? '') ?: null;
    $aplicacion = ($cfg['application'] ?? '') ?: null;
    $efectiva = $numero ?? $waba ?? $aplicacion;
    crmExec($conn, 'UPDATE com_lineas SET webhook_numero = ?, webhook_efectivo = ?, webhook_revisado_at = CURRENT_TIMESTAMP WHERE id = ?',
        'ssi', [$numero, $efectiva, (int)$l['id']]);
    return ['numero' => $numero, 'waba' => $waba, 'aplicacion' => $aplicacion, 'efectiva' => $efectiva, 'nuestra' => $nuestra,
            'aqui' => $efectiva !== null && $efectiva === $nuestra, 'aviso' => null];
}

// ─── Bajas de marketing (opt-out): el cliente pidió no recibir promociones. Las campañas y plantillas de marketing no le llegan. ───────────

const COM_PALABRAS_BAJA = ['baja', 'stop', 'detener', 'darme de baja', 'no mas mensajes', 'no quiero mas mensajes', 'unsubscribe'];
const COM_PALABRAS_ALTA = ['alta', 'start', 'reanudar'];

function comEstaDeBaja(mysqli $conn, int $idSede, string $waId): bool
{
    return (bool)crmRow($conn, 'SELECT 1 AS ok FROM com_bajas WHERE id_sede = ? AND wa_id = ?', 'is', [$idSede, $waId]);
}

/** Registra la baja de marketing de un número (idempotente). $motivo: palabra | meta_131050 | manual. */
function comRegistrarBaja(mysqli $conn, int $idSede, string $waId, string $motivo): void
{
    crmExec($conn, 'INSERT IGNORE INTO com_bajas (id_sede, wa_id, motivo) VALUES (?, ?, ?)', 'iss', [$idSede, $waId, mb_substr($motivo, 0, 30)]);
}

function comQuitarBaja(mysqli $conn, int $idSede, string $waId): void
{
    crmExec($conn, 'DELETE FROM com_bajas WHERE id_sede = ? AND wa_id = ?', 'is', [$idSede, $waId]);
}
