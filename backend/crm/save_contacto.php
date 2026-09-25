<?php
// Crea o edita una Persona u Organización (todo en una transacción). El formulario manda el registro completo.
// POST: id (0 = nuevo), tipo (solo al crear), campos del contacto (ver crmParsearContacto),
//       id_padre (solo Organización: a qué organización pertenece; vacío = ninguna),
//       personas (JSON, solo Organización: [{id_persona|nuevo, id_rol, principal}], obligatorio al crear),
//       campos (JSON {id_campo: valor}), tag_ids (JSON). En edición, lo que no se manda no se toca.
// Devuelve {id, advertencias} (documento repetido en la sede: avisa, no bloquea).
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
$id = (int)($_POST['id'] ?? 0);

$conn = conectar();
$conn->begin_transaction();   // cualquier authFail/exit posterior deja la transacción sin confirmar: se revierte sola

if ($id === 0) {
    $tipo = (string)($_POST['tipo'] ?? '');
    if (!in_array($tipo, CRM_TIPOS, true)) authFail(400, 'Tipo de contacto inválido');
    $d = crmParsearContacto($conn, $ctx, $tipo, $_POST);

    $personas = crmJsonParam('personas') ?? [];
    if ($tipo === 'organizacion' && !$personas) authFail(400, 'Una organización necesita al menos una persona de referencia');

    $id = crmInsertarContacto($conn, $ctx, $tipo, $d);
    auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $id, 'creado', ['tipo' => $tipo, 'nombre' => $d['nombre_completo']]);

    if ($tipo === 'organizacion') crmSincronizarVinculos($conn, $ctx, $id, $d['nombre_completo'], $personas);
    crmGuardarCampos($conn, $ctx, $id, $tipo, crmJsonParam('campos') ?? []);   // valida obligatorios aunque no manden nada
    if (($tags = crmJsonParam('tag_ids')) !== null) crmSetTags($conn, $ctx, $id, $tipo, $tags);
} else {
    $actual = crmContactoBase($conn, $ctx, $id);
    if (!$actual) authFail(404, 'Contacto no encontrado');
    $tipo = $actual['tipo'];
    $d = crmParsearContacto($conn, $ctx, $tipo, $_POST, $id);

    $cambios = crmActualizarContacto($conn, $ctx, $tipo, $actual, $d);
    $tocar = false;
    $detalle = [];

    if ($tipo === 'organizacion' && ($personas = crmJsonParam('personas')) !== null) {
        crmSincronizarVinculos($conn, $ctx, $id, $d['nombre_completo'], $personas);
        $tocar = true;   // los vínculos se registran solos en el historial de ambos lados
    }
    if (($campos = crmJsonParam('campos')) !== null) {
        $c = crmGuardarCampos($conn, $ctx, $id, $tipo, $campos);
        if ($c) { $cambios = array_merge($cambios, $c); $tocar = true; }
    }
    if (($tags = crmJsonParam('tag_ids')) !== null) {
        $t = crmSetTags($conn, $ctx, $id, $tipo, $tags);
        if ($t['agregados'] || $t['quitados']) { $detalle['tags'] = $t; $tocar = true; }
    }

    if ($cambios) $detalle['cambios'] = $cambios;
    if ($detalle) auditRegistro($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $id, 'actualizado', $detalle);
    if ($tocar) crmTocar($conn, $ctx, [$id]);   // etiquetas, vínculos o campos cambiaron: cuenta como modificación del contacto
}

$advertencias = [];
if (($dup = crmDuplicados($conn, $ctx, $tipo, $d['documento_numero'], $id))) $advertencias[] = ['tipo' => 'documento_duplicado', 'contactos' => $dup];

$conn->commit();
$conn->close();

crmOk(['id' => $id, 'advertencias' => $advertencias], 'Contacto guardado');
