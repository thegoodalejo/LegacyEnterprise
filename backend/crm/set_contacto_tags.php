<?php
// Reemplaza el conjunto de etiquetas de un contacto (edición rápida desde el perfil).
// POST: id_contacto, tag_ids (JSON). Devuelve las etiquetas resultantes.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext(CRM_MODULOS_CONTACTOS);
$id = (int)($_POST['id_contacto'] ?? 0);
$tagIds = crmJsonParam('tag_ids');
if ($tagIds === null) authFail(400, 'tag_ids requerido');

$conn = conectar();
$conn->begin_transaction();

$c = crmRow($conn, 'SELECT id, tipo FROM crm_contactos WHERE id = ? AND id_sede = ? LIMIT 1', 'ii', [$id, $ctx['id_sede']]);
if (!$c) authFail(404, 'Contacto no encontrado');

$r = crmSetTags($conn, $ctx, $id, $c['tipo'], $tagIds);
if ($r['agregados'] || $r['quitados']) {
    crmTocar($conn, $ctx, [$id]);
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $id, 'actualizado', ['tags' => $r]);
}

$conn->commit();
$tags = crmContactoTags($conn, $id);
$conn->close();

crmOk(['tags' => $tags]);
