<?php
// Metas con su avance para exportar a PDF/Excel (los arma el navegador). Todas de una vez: el avance se calcula para el conjunto (tope CRM_METAS_CALC_MAX).
// POST: filtros (JSON, ver crmMetaFiltros; lo normal es fecha = vigentes ese día), corte (opcional; por defecto filtros.fecha o hoy), formato (pdf|xlsx, auditoría).
// Devuelve {metas:[…] ordenadas por ámbito (empresa, sede, organizaciones), métrica, período y nombre, con cobertura en las de empresa y sede;
//           conteo, total, corte, config}. Audita crm_exportar.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm_metas.php';
require_once '../_lib/_crm_oportunidades.php';

$ctx = crmContext();
$filtros = crmJsonParam('filtros') ?? [];
$corte = crmMetaCorte(crmFecha($_POST['corte'] ?? null, 'Corte') ?? crmFecha($filtros['fecha'] ?? null, 'Fecha'));

$conn = conectar();
$metas = crmMetasConAvance($conn, $ctx, $filtros, $corte);
if (!$metas) authFail(400, 'No hay metas para exportar');
$rango = ['empresa' => 0, 'sede' => 1, 'organizacion' => 2];
usort($metas, static fn($a, $b) => [$rango[$a['ambito']], mb_strtolower($a['metrica_nombre']), $a['fecha_inicio'], $a['fecha_fin'], $a['porcentaje'], mb_strtolower((string)$a['contacto_nombre'])]
    <=> [$rango[$b['ambito']], mb_strtolower($b['metrica_nombre']), $b['fecha_inicio'], $b['fecha_fin'], $b['porcentaje'], mb_strtolower((string)$b['contacto_nombre'])]);
$metas = crmMetaCobertura($conn, $ctx, $metas);
$fmt = in_array($_POST['formato'] ?? '', ['pdf', 'xlsx'], true) ? $_POST['formato'] : null;
auditAdmin($conn, 'crm_exportar', ['reporte' => 'metas', 'formato' => $fmt, 'filas' => count($metas), 'filtros' => $filtros]);
$cfg = crmConfig($conn, $ctx['id_empresa']);
$conn->close();

crmOk(['metas' => $metas, 'total' => count($metas), 'conteo' => crmMetaConteo($metas), 'corte' => $corte, 'config' => $cfg]);
