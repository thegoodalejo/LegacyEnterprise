<?php
// Crea o edita una campaña en BORRADOR (L2+). POST: id (0 = nueva), nombre, id_linea, id_plantilla (aprobada, de la misma cuenta de WhatsApp),
// audiencia (JSON {ids:[…]} | {filtros:{…}, excluidos:[…]}, + organizaciones: bool), valores (JSON {n: texto, h1: texto}), enlace_destino,
// programada_para (AAAA-MM-DD HH:MM, opcional). También elimina un borrador: eliminar=1.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_com_campanas.php';

$ctx = comContext();
requireRole('L2');
$id = (int)($_POST['id'] ?? 0);
$conn = conectar();
$actual = $id > 0 ? comCampana($conn, $ctx['id_sede'], $id) : null;
if ($id > 0 && !$actual) authFail(404, 'Campaña no encontrada');
if ($actual && $actual['estado'] !== 'borrador') authFail(409, 'Solo se editan campañas en borrador');
if ($actual && ($_POST['eliminar'] ?? '0') === '1') {
    crmExec($conn, 'DELETE FROM com_campanas WHERE id = ? AND estado = \'borrador\'', 'i', [$id]);
    $conn->close();
    crmOk([], 'Borrador eliminado');
}

$nombre = crmClean($_POST['nombre'] ?? null, 150, 'Nombre', true);
$linea = comLineaDeSede($conn, $ctx, (int)($_POST['id_linea'] ?? 0));
$tpl = comPlantilla($conn, $ctx['id_sede'], (int)($_POST['id_plantilla'] ?? 0));
if (!$tpl) authFail(400, 'Elige una plantilla');
if ($tpl['waba_id'] !== $linea['waba_id']) authFail(400, 'La plantilla es de otra cuenta de WhatsApp que la línea');
$aud = crmJsonParam('audiencia') ?? [];
if (!isset($aud['ids']) && !is_array($aud['filtros'] ?? null)) authFail(400, 'Elige a quién enviar la campaña');
if (isset($aud['ids'])) $aud = ['ids' => crmInts($aud['ids']), 'organizaciones' => !empty($aud['organizaciones'])];
else $aud = ['filtros' => $aud['filtros'], 'excluidos' => crmInts($aud['excluidos'] ?? []), 'organizaciones' => !empty($aud['organizaciones'])];
crmSeleccionWhere($conn, $ctx, $aud);   // valida los filtros ahora (no al lanzar)
$valores = [];
foreach (crmJsonParam('valores') ?? [] as $k => $v) {
    if (!preg_match('/^(\d{1,2}|h1)$/', (string)$k)) continue;
    $v = trim(preg_replace('/\s+/u', ' ', (string)$v) ?? '');
    if ($v !== '') $valores[(string)$k] = mb_substr($v, 0, 500);
}
$enlace = trim((string)($_POST['enlace_destino'] ?? ''));
$enlace = $enlace !== '' ? comValidarDestino($enlace) : null;
$prog = trim((string)($_POST['programada_para'] ?? ''));
if ($prog !== '') {
    $d = DateTimeImmutable::createFromFormat('Y-m-d H:i', substr($prog, 0, 16));
    if (!$d) authFail(400, 'Fecha de programación inválida');
    $prog = $d->format('Y-m-d H:i:00');
} else {
    $prog = null;
}
$j = static fn($x) => json_encode($x, JSON_UNESCAPED_UNICODE);
if ($actual) {
    // Cambiar la plantilla invalida el medio del encabezado subido para la anterior.
    $mismo = (int)$actual['id_plantilla'] === (int)$tpl['id'];
    crmExec($conn, 'UPDATE com_campanas SET nombre = ?, id_linea = ?, id_plantilla = ?, audiencia = ?, valores = ?, enlace_destino = ?, programada_para = ?, updated_by = ?' .
        ($mismo ? '' : ', media_id = NULL, media_key = NULL, media_nombre = NULL, media_mime = NULL, media_subida_at = NULL') . ' WHERE id = ?',
        'siissssii', [$nombre, $linea['id'], (int)$tpl['id'], $j($aud), $j((object)$valores), $enlace, $prog, $ctx['id_usuario'], $id]);
} else {
    crmExec($conn, 'INSERT INTO com_campanas (id_sede, id_linea, id_plantilla, nombre, audiencia, valores, enlace_destino, programada_para, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        'iiisssssii', [$ctx['id_sede'], $linea['id'], (int)$tpl['id'], $nombre, $j($aud), $j((object)$valores), $enlace, $prog, $ctx['id_usuario'], $ctx['id_usuario']]);
    $id = (int)$conn->insert_id;
}
$conn->close();
crmOk(['id' => $id], 'Borrador guardado');
