<?php
// Créditos de Comunicaciones: bolsas (empresa o sede), tarifas por categoría de Meta, cobro idempotente y alertas de saldo.
// Diseño: docs/modulos/comunicaciones.md → «Créditos y precios de Meta».
//   - Antes de enviar: comPuedeEnviar() (la bolsa que usa la sede debe cubrir la tarifa).
//   - Cuando Meta confirma la entrega de un mensaje cobrable (pricing.billable), comCobrar() lo descuenta UNA sola vez (cobrado_at).
//   - El saldo puede quedar negativo por mensajes en vuelo: el bloqueo es antes de enviar, no al cobrar.

require_once __DIR__ . '/_notify.php';

const COM_RECARGA_MIN = 1000;
const COM_CATEGORIAS_ENVIO = ['marketing', 'utility', 'authentication', 'service'];

/** Ajustes de la sede con sus valores por defecto si aún no los guardó. */
function comConfigSede(mysqli $conn, int $idSede): array
{
    $r = crmRow($conn, 'SELECT * FROM com_config_sede WHERE id_sede = ?', 'i', [$idSede]);
    $def = [
        'id_sede' => $idSede, 'fuente_creditos' => 'sede', 'palabras_asesor' => 'asesor, agente, humano', 'sesion_minutos' => 30,
        'sin_coincidencia' => 'bandeja', 'texto_sin_coincidencia' => null, 'id_flujo_respaldo' => null,
        'texto_transferencia' => null, 'texto_cierre' => null, 'enviar_texto_cierre' => 0,
    ];
    if (!$r) return $def;
    $r['sesion_minutos'] = (int)$r['sesion_minutos'];
    $r['enviar_texto_cierre'] = (int)$r['enviar_texto_cierre'];
    $r['id_flujo_respaldo'] = $r['id_flujo_respaldo'] !== null ? (int)$r['id_flujo_respaldo'] : null;
    return $r;
}

/** Tarifa en créditos de una categoría de Meta (la exacta, si no la de '*'; mínimo 1). */
function comTarifa(mysqli $conn, ?string $categoria): int
{
    static $cache = null;
    if ($cache === null) {
        $cache = [];
        foreach (crmRows($conn, 'SELECT categoria, creditos FROM com_tarifas') as $r) $cache[$r['categoria']] = (int)$r['creditos'];
    }
    $c = strtolower((string)$categoria);
    return max(0, $cache[$c] ?? ($cache['*'] ?? 1));
}

/** Bolsa de un ámbito; la crea en cero si no existe. */
function comBilletera(mysqli $conn, string $ambito, int $idEmpresa, ?int $idSede): array
{
    $ref = $ambito === 'empresa' ? 'e' . $idEmpresa : 's' . $idSede;
    $b = crmRow($conn, 'SELECT * FROM com_billeteras WHERE ambito_ref = ?', 's', [$ref]);
    if (!$b) {
        crmExec($conn, 'INSERT IGNORE INTO com_billeteras (ambito, id_empresa, id_sede) VALUES (?, ?, ?)', 'sii',
            [$ambito, $idEmpresa, $ambito === 'empresa' ? null : $idSede]);
        $b = crmRow($conn, 'SELECT * FROM com_billeteras WHERE ambito_ref = ?', 's', [$ref]);
    }
    foreach (['id', 'id_empresa', 'id_sede', 'saldo', 'base_alerta', 'alerta_nivel'] as $k) if ($b[$k] !== null) $b[$k] = (int)$b[$k];
    return $b;
}

/** La bolsa que consume la sede según su fuente de créditos (empresa o sede). */
function comBilleteraDeSede(mysqli $conn, int $idSede): array
{
    $cfg = comConfigSede($conn, $idSede);
    $idEmpresa = (int)crmRow($conn, 'SELECT id_empresa FROM le_sedes WHERE id = ?', 'i', [$idSede])['id_empresa'];
    return $cfg['fuente_creditos'] === 'empresa'
        ? comBilletera($conn, 'empresa', $idEmpresa, null)
        : comBilletera($conn, 'sede', $idEmpresa, $idSede);
}

/**
 * ¿Alcanza el saldo DISPONIBLE para $n mensajes de esta categoría? Disponible = saldo − lo reservado por mensajes ya enviados que Meta aún no
 * cobra (cobra al entregar): así una campaña no gasta más de lo que hay. ['ok', 'saldo' (disponible), 'reservado', 'necesarios', 'id_billetera', 'ambito'].
 */
function comPuedeEnviar(mysqli $conn, int $idSede, string $categoria, int $n = 1): array
{
    $b = comBilleteraDeSede($conn, $idSede);
    $reservado = comReservado($conn, $b);
    $necesarios = comTarifa($conn, $categoria) * max(1, $n);
    $disp = $b['saldo'] - $reservado;
    return ['ok' => $disp >= $necesarios, 'saldo' => $disp, 'reservado' => $reservado, 'necesarios' => $necesarios, 'id_billetera' => $b['id'], 'ambito' => $b['ambito']];
}

/** Créditos de mensajes enviados en las últimas 24 h que Meta todavía no confirmó ni cobró (y que podrían cobrarse). */
function comReservado(mysqli $conn, array $b): int
{
    $sedes = comSedesDeBilletera($conn, $b);
    if (!$sedes) return 0;
    $total = 0;
    foreach (crmRows($conn,
        "SELECT categoria, COUNT(*) AS n FROM com_mensajes
          WHERE id_sede IN (" . crmMarks(count($sedes)) . ") AND direccion = 'saliente' AND categoria IS NOT NULL AND cobrado_at IS NULL
            AND estado IN ('pendiente', 'enviado') AND (cobrable IS NULL OR cobrable = 1) AND created_at >= NOW() - INTERVAL 1 DAY
          GROUP BY categoria", str_repeat('i', count($sedes)), $sedes) as $r) {
        $total += comTarifa($conn, $r['categoria']) * (int)$r['n'];
    }
    return $total;
}

/**
 * Registra el precio que Meta reporta en un estado y, si es cobrable y el mensaje ya se entregó, descuenta los créditos UNA sola vez.
 * $cobrar: true solo con estados delivered/read (Meta cobra por mensaje entregado). Devuelve los créditos descontados (0 si nada).
 */
function comCobrar(mysqli $conn, int $idMensaje, ?string $categoria, bool $billable, bool $cobrar): int
{
    $categoria = $categoria !== null ? mb_substr(strtolower($categoria), 0, 30) : null;
    // La categoría y el «cobrable» se guardan con el primer estado que los trae (sent), aunque el cobro espere a la entrega.
    crmExec($conn, 'UPDATE com_mensajes SET categoria = COALESCE(?, categoria), cobrable = ? WHERE id = ? AND cobrado_at IS NULL',
        'sii', [$categoria, $billable ? 1 : 0, $idMensaje]);
    if (!$billable || !$cobrar) return 0;

    $m = crmRow($conn, 'SELECT id_sede, categoria, cobrado_at FROM com_mensajes WHERE id = ?', 'i', [$idMensaje]);
    if (!$m || $m['cobrado_at'] !== null) return 0;
    $idSede = (int)$m['id_sede'];
    $cat = $m['categoria'] ?? $categoria ?? '*';
    $creditos = comTarifa($conn, $cat);

    $conn->begin_transaction();
    $b = comBilleteraDeSede($conn, $idSede);
    // Marca de idempotencia: si otro proceso ya lo cobró, affected_rows = 0 y no se descuenta.
    $n = crmExec($conn, 'UPDATE com_mensajes SET cobrado_at = CURRENT_TIMESTAMP, creditos = ?, id_billetera = ? WHERE id = ? AND cobrado_at IS NULL',
        'iii', [$creditos, $b['id'], $idMensaje]);
    if ($n !== 1) { $conn->rollback(); return 0; }
    crmExec($conn, 'UPDATE com_billeteras SET saldo = saldo - ? WHERE id = ?', 'ii', [$creditos, $b['id']]);
    $saldo = (int)crmRow($conn, 'SELECT saldo FROM com_billeteras WHERE id = ?', 'i', [$b['id']])['saldo'];
    crmExec($conn,
        "INSERT INTO com_movimientos (id_billetera, tipo, id_sede, fecha, categoria, cantidad, creditos, saldo_despues, descripcion)
         VALUES (?, 'consumo', ?, CURDATE(), ?, 1, ?, ?, 'Mensajes cobrados por Meta')
         ON DUPLICATE KEY UPDATE cantidad = cantidad + 1, creditos = creditos + VALUES(creditos), saldo_despues = VALUES(saldo_despues)",
        'iisii', [$b['id'], $idSede, $cat, -$creditos, $saldo]);
    $conn->commit();

    comRevisarAlertas($conn, $b['id']);
    return $creditos;
}

/** Suma créditos a una bolsa (recarga, ajuste o transferencia) y deja el movimiento. Reinicia las alertas si queda por encima. Devuelve el saldo. */
function comMover(mysqli $conn, int $idBilletera, string $tipo, int $creditos, ?int $idSede, ?string $descripcion, ?string $referencia,
                  ?int $idUsuario, ?int $idContraparte = null): int
{
    crmExec($conn, 'UPDATE com_billeteras SET saldo = saldo + ? WHERE id = ?', 'ii', [$creditos, $idBilletera]);
    $saldo = (int)crmRow($conn, 'SELECT saldo FROM com_billeteras WHERE id = ?', 'i', [$idBilletera])['saldo'];
    if ($creditos > 0 && $tipo !== 'ajuste') {
        // La base del porcentaje es el saldo tras la recarga: «queda el 20 %» se mide contra lo que había al recargar.
        crmExec($conn, 'UPDATE com_billeteras SET base_alerta = ?, alerta_nivel = 0 WHERE id = ?', 'ii', [max($saldo, 1), $idBilletera]);
    } elseif ($creditos > 0) {
        crmExec($conn, 'UPDATE com_billeteras SET alerta_nivel = 0 WHERE id = ? AND saldo > 0', 'i', [$idBilletera]);
    }
    crmExec($conn,
        'INSERT INTO com_movimientos (id_billetera, tipo, id_sede, fecha, creditos, saldo_despues, descripcion, referencia, id_billetera_contraparte, created_by)
         VALUES (?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?)',
        'isiiissii', [$idBilletera, $tipo, $idSede, $creditos, $saldo, $descripcion, $referencia, $idContraparte, $idUsuario]);
    return $saldo;
}

/**
 * Alertas de saldo bajo: al pasar del 20 % y del 5 % de la última recarga, y al llegar a cero. Avisa (campanita + push) a los L4 de las sedes
 * que consumen la bolsa. Cada nivel se avisa una vez hasta la siguiente recarga.
 */
function comRevisarAlertas(mysqli $conn, int $idBilletera): void
{
    $b = crmRow($conn, 'SELECT * FROM com_billeteras WHERE id = ?', 'i', [$idBilletera]);
    if (!$b) return;
    $saldo = (int)$b['saldo'];
    $base = max(1, (int)$b['base_alerta']);
    $nivel = $saldo <= 0 ? 3 : ($saldo * 100 <= $base * 5 ? 2 : ($saldo * 100 <= $base * 20 ? 1 : 0));
    if ($nivel <= (int)$b['alerta_nivel']) return;
    if (crmExec($conn, 'UPDATE com_billeteras SET alerta_nivel = ? WHERE id = ? AND alerta_nivel < ?', 'iii', [$nivel, $idBilletera, $nivel]) !== 1) return;

    $sedes = comSedesDeBilletera($conn, $b);
    if (!$sedes) return;
    $titulo = $nivel === 3 ? 'Sin créditos de WhatsApp' : 'Quedan pocos créditos de WhatsApp';
    $cuerpo = $nivel === 3
        ? 'Los envíos de WhatsApp están detenidos hasta recargar créditos.'
        : 'Saldo: ' . number_format($saldo, 0, ',', '.') . ' créditos (' . ($nivel === 2 ? 'menos del 5 %' : 'menos del 20 %') . ' de la última recarga).';
    foreach ($sedes as $idSede) {
        $ids = array_column(crmRows($conn, "SELECT id_usuario FROM le_usuario_sedes WHERE id_sede = ? AND rol = 'L4' AND state = 1", 'i', [$idSede]), 'id_usuario');
        notifyUsers($conn, $idSede, $ids, $titulo, $cuerpo, '/m/comunicaciones/creditos', 'com_creditos', ['nivel' => $nivel]);
    }
}

/** Sedes que consumen de una bolsa: la propia (ámbito sede) o las de la empresa que eligieron la bolsa de la empresa. */
function comSedesDeBilletera(mysqli $conn, array $b): array
{
    if ($b['ambito'] === 'sede') {
        $cfg = comConfigSede($conn, (int)$b['id_sede']);
        return $cfg['fuente_creditos'] === 'sede' ? [(int)$b['id_sede']] : [];
    }
    return array_map('intval', array_column(crmRows($conn,
        "SELECT s.id FROM le_sedes s JOIN com_config_sede c ON c.id_sede = s.id AND c.fuente_creditos = 'empresa' WHERE s.id_empresa = ?",
        'i', [(int)$b['id_empresa']]), 'id'));
}
