<?php
// Acciones del chatbot que aporta Comunicaciones (siempre disponibles en una sede con el módulo). Contrato: _lib/_com_acciones.php.

comRegistrarAccion([
    'codigo' => 'comunicaciones.etiquetar',
    'modulo' => 'comunicaciones',
    'nombre' => 'Etiquetar el contacto',
    'descripcion' => 'Agrega o quita una etiqueta (las mismas de Contactos).',
    'config' => [
        ['clave' => 'id_tag', 'tipo' => 'etiqueta', 'etiqueta' => 'Etiqueta', 'requerida' => true],
        ['clave' => 'modo', 'tipo' => 'opcion', 'etiqueta' => 'Qué hacer', 'requerida' => true,
            'opciones' => [['valor' => 'agregar', 'etiqueta' => 'Agregar'], ['valor' => 'quitar', 'etiqueta' => 'Quitar']]],
    ],
    'ejecutar' => static function (array $ctx, array $vars, array $cfg): array {
        if (!$ctx['id_contacto'] && !$ctx['simulacion']) return ['puerto' => 'error'];
        $conn = $ctx['conn'];
        $t = crmRow($conn, 'SELECT id, nombre, aplica_a, activo FROM crm_tags WHERE id = ? AND id_empresa = ?', 'ii', [(int)$cfg['id_tag'], $ctx['id_empresa']]);
        if (!$t || (int)$t['activo'] !== 1 || ($t['aplica_a'] !== null && $t['aplica_a'] !== 'persona')) return ['puerto' => 'error', 'variables' => ['_error' => 'Etiqueta no disponible']];
        if ($ctx['simulacion']) return ['puerto' => 'ok'];
        if (($cfg['modo'] ?? 'agregar') === 'quitar') {
            $n = crmExec($conn, 'DELETE FROM crm_contacto_tags WHERE id_contacto = ? AND id_tag = ?', 'ii', [$ctx['id_contacto'], (int)$t['id']]);
            $det = ['agregados' => [], 'quitados' => $n ? [$t['nombre']] : []];
        } else {
            $n = crmExec($conn, 'INSERT IGNORE INTO crm_contacto_tags (id_contacto, id_tag) VALUES (?, ?)', 'ii', [$ctx['id_contacto'], (int)$t['id']]);
            $det = ['agregados' => $n ? [$t['nombre']] : [], 'quitados' => []];
        }
        if ($n) auditRegistroSistema($conn, $ctx['id_sede'], 'crm', 'crm_contactos', $ctx['id_contacto'], 'actualizado', ['tags' => $det, 'origen' => 'chatbot']);
        return ['puerto' => 'ok'];
    },
]);

comRegistrarAccion([
    'codigo' => 'comunicaciones.guardar_dato',
    'modulo' => 'comunicaciones',
    'nombre' => 'Guardar un dato en el contacto',
    'descripcion' => 'Copia una variable del flujo (lo que respondió el cliente) a un campo del contacto.',
    'config' => [
        ['clave' => 'variable', 'tipo' => 'variable', 'etiqueta' => 'Variable', 'requerida' => true],
        ['clave' => 'campo', 'tipo' => 'campo_contacto', 'etiqueta' => 'Campo del contacto', 'requerida' => true],
    ],
    'entradas' => [['clave' => '{variable}', 'tipo' => 'texto', 'requerida' => true]],
    'puertos' => ['ok', 'invalido'],
    'ejecutar' => static function (array $ctx, array $vars, array $cfg): array {
        $valor = trim((string)($vars[$cfg['variable']] ?? ''));
        if ($valor === '' || (!$ctx['id_contacto'] && !$ctx['simulacion'])) return ['puerto' => 'invalido'];
        [$ok, $err] = comGuardarDatoContacto($ctx, $cfg['campo'], $valor);
        return $ok ? ['puerto' => 'ok'] : ['puerto' => 'invalido', 'variables' => ['_error' => $err]];
    },
]);

comRegistrarAccion([
    'codigo' => 'comunicaciones.notificar',
    'modulo' => 'comunicaciones',
    'nombre' => 'Avisar a una persona del equipo',
    'descripcion' => 'Notificación en la campanita y push (por ejemplo: «Nuevo pedido de {{contacto.nombre}}»).',
    'config' => [
        ['clave' => 'destino', 'tipo' => 'opcion', 'etiqueta' => 'A quién', 'requerida' => true,
            'opciones' => [['valor' => 'usuario', 'etiqueta' => 'Una persona'], ['valor' => 'equipo', 'etiqueta' => 'Todo el equipo de Comunicaciones'],
                ['valor' => 'l4', 'etiqueta' => 'Administradores (L4) de la sede']]],
        ['clave' => 'id_usuario', 'tipo' => 'usuario', 'etiqueta' => 'Persona'],
        ['clave' => 'texto', 'tipo' => 'texto', 'etiqueta' => 'Mensaje', 'requerida' => true],
    ],
    'ejecutar' => static function (array $ctx, array $vars, array $cfg): array {
        $conn = $ctx['conn'];
        $ids = match ($cfg['destino'] ?? 'usuario') {
            'equipo' => array_column(comUsuariosModulo($conn, $ctx['id_sede']), 'id'),
            'l4' => array_column(crmRows($conn, "SELECT id_usuario FROM le_usuario_sedes WHERE id_sede = ? AND rol = 'L4' AND state = 1", 'i', [$ctx['id_sede']]), 'id_usuario'),
            default => !empty($cfg['id_usuario']) && comUsuarioTieneModulo($conn, $ctx['id_sede'], (int)$cfg['id_usuario']) ? [(int)$cfg['id_usuario']] : [],
        };
        if (!$ids) return ['puerto' => 'error', 'variables' => ['_error' => 'Sin destinatarios']];
        if ($ctx['simulacion']) return ['puerto' => 'ok'];
        $texto = comBotRender((string)$cfg['texto'], $ctx, $vars);
        notifyUsers($conn, $ctx['id_sede'], $ids, 'Chatbot de WhatsApp', mb_substr($texto, 0, 250),
            $ctx['id_conversacion'] ? '/m/comunicaciones/bandeja?c=' . $ctx['id_conversacion'] : '/m/comunicaciones/bandeja', 'com_chatbot',
            ['id_conversacion' => $ctx['id_conversacion']]);
        return ['puerto' => 'ok'];
    },
]);
