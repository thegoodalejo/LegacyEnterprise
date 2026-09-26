<?php
// Vocabulario personalizado de la empresa: cómo llama a Contacto, Persona y Organización en pantalla.
// Devuelve solo lo que personalizó ({clave: {singular, plural}}); lo demás usa el nombre por defecto del idioma.
require_once '../db_connection.php';
require_once '../cors.php';
require_once '../auth.php';
require_once '../_lib/_crm.php';

$ctx = crmContext(CRM_MODULOS_CONTACTOS);

$conn = conectar();
$rows = crmRows($conn, 'SELECT clave, singular, plural FROM crm_vocabulario WHERE id_empresa = ?', 'i', [$ctx['id_empresa']]);
$conn->close();

$voc = [];
foreach ($rows as $r) $voc[$r['clave']] = ['singular' => $r['singular'], 'plural' => $r['plural']];

crmOk(['vocabulario' => (object)$voc]);
