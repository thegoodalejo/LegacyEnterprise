<?php
// Guarda la configuración general del CRM de la empresa (L4+).
// POST: moneda (código ISO de 3 letras, p. ej. COP, USD), decimales (0–4). No hay conversión entre monedas: solo cómo se muestran los montos.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
requireRole('L4');

$moneda = strtoupper((string)crmClean($_POST['moneda'] ?? null, 3, 'Moneda', true));
if (!preg_match('/^[A-Z]{3}$/', $moneda)) authFail(400, 'La moneda es un código de 3 letras (p. ej. COP, USD)');
$decimales = (int)($_POST['decimales'] ?? 0);
if ($decimales < 0 || $decimales > 4) authFail(400, 'Los decimales van de 0 a 4');

$conn = conectar();
$conn->begin_transaction();
crmExec($conn,
    'INSERT INTO crm_config (id_empresa, moneda, decimales, created_by, updated_by) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE moneda = VALUES(moneda), decimales = VALUES(decimales), updated_by = VALUES(updated_by)',
    'isiii', [$ctx['id_empresa'], $moneda, $decimales, $ctx['id_usuario'], $ctx['id_usuario']]);
auditAdmin($conn, 'crm_guardar_config', ['id_empresa' => $ctx['id_empresa'], 'moneda' => $moneda, 'decimales' => $decimales]);
$conn->commit();
$conn->close();

crmOk(['moneda' => $moneda, 'decimales' => $decimales], 'Configuración guardada');
