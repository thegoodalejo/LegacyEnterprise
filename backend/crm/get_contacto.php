<?php
// Perfil de un contacto: datos, vínculos, etiquetas, campos personalizados y quién lo creó/modificó.
// POST: id.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext();
$id = (int)($_POST['id'] ?? 0);

$conn = conectar();
$c = $id > 0 ? crmContactoBase($conn, $ctx, $id) : null;
if (!$c) authFail(404, 'Contacto no encontrado');

$data = [
    'contacto' => $c,
    'vinculos' => crmVinculos($conn, $id, $c['tipo']),
    'tags'     => crmContactoTags($conn, $id),
    'campos'   => crmCamposConValor($conn, $ctx, $id, $c['tipo']),
    'hijas'    => $c['tipo'] === 'organizacion' ? crmHijas($conn, $ctx, $id) : [],
];
$conn->close();

crmOk($data);
