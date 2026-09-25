<?php
// Historial genérico de registros de negocio (tabla le_H_registros, migración 003).
// Lo usa cualquier módulo: auditRegistro($conn, $idSede, 'crm', 'crm_contactos', $id, 'actualizado', ['cambios' => [...]]).
// A diferencia de auditAdmin (acciones sensibles de plataforma), esto es "quién cambió qué y cuándo" de UN registro,
// para mostrarlo en su perfil. Nunca corta el flujo si falla (como auditAdmin en auth.php).

/** UUID v4 para agrupar las filas de una acción masiva (detalle.lote). */
function historialLote(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    $h = bin2hex($b);
    return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20, 12);
}

/**
 * Diferencias entre dos mapas campo => valor: solo las claves de $despues cuyo valor cambió.
 * Compara como texto (null y '' son lo mismo). Devuelve [{campo, antes, despues}] y añade 'etiqueta' si viene en $etiquetas.
 */
function historialDiff(array $antes, array $despues, array $etiquetas = []): array
{
    $norm = static fn($v) => $v === null ? '' : (is_bool($v) ? ($v ? '1' : '0') : (string)$v);
    $cambios = [];
    foreach ($despues as $campo => $nuevo) {
        $viejo = $antes[$campo] ?? null;
        if ($norm($viejo) === $norm($nuevo)) continue;
        $c = ['campo' => $campo, 'antes' => $viejo === '' ? null : $viejo, 'despues' => $nuevo === '' ? null : $nuevo];
        if (isset($etiquetas[$campo])) $c['etiqueta'] = $etiquetas[$campo];
        $cambios[] = $c;
    }
    return $cambios;
}

/** Una fila de historial para un registro. Sin usuario en sesión no hace nada. */
function auditRegistro(mysqli $conn, int $idSede, string $modulo, string $tabla, int $idRegistro, string $accion, array $detalle = []): void
{
    auditRegistroVarios($conn, $idSede, $modulo, $tabla, [$idRegistro], $accion, $detalle);
}

/**
 * La misma acción sobre varios registros (acciones masivas): una fila por registro, mismo detalle (y mismo lote).
 * Reutiliza un solo statement preparado.
 */
function auditRegistroVarios(mysqli $conn, int $idSede, string $modulo, string $tabla, array $idsRegistro, string $accion, array $detalle = []): void
{
    $u = $GLOBALS['authUser'] ?? null;
    if (!$u || !$idsRegistro) return;
    $json = $detalle ? json_encode($detalle, JSON_UNESCAPED_UNICODE) : null;
    $stmt = $conn->prepare(
        'INSERT INTO le_H_registros (id_sede, modulo, tabla, id_registro, id_usuario, accion, detalle) VALUES (?, ?, ?, ?, ?, ?, ?)');
    if (!$stmt) { error_log('[historial] ' . $conn->error); return; }
    foreach ($idsRegistro as $idRegistro) {
        $id = (int)$idRegistro;
        $stmt->bind_param('issiiss', $idSede, $modulo, $tabla, $id, $u['id'], $accion, $json);
        if (!$stmt->execute()) error_log('[historial] ' . $stmt->error);
    }
    $stmt->close();
}
