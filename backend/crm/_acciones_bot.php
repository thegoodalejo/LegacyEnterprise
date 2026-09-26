<?php
// Acciones del chatbot que aporta el CRM (solo en sedes con el CRM contratado). Contrato: _lib/_com_acciones.php.
// Módulos futuros (Agenda, Servicios, Pedidos) siguen este mismo patrón en backend/<modulo>/_acciones_bot.php.

comRegistrarAccion([
    'codigo' => 'crm.crear_oportunidad',
    'modulo' => 'crm',
    'nombre' => 'Crear una oportunidad',
    'descripcion' => 'Abre una oportunidad en el embudo para este contacto (p. ej. al pedir una cotización por WhatsApp).',
    'config' => [
        ['clave' => 'id_etapa', 'tipo' => 'embudo_etapa', 'etiqueta' => 'Embudo y etapa', 'requerida' => true],
        ['clave' => 'titulo', 'tipo' => 'texto', 'etiqueta' => 'Título', 'requerida' => true],
        ['clave' => 'variable_valor', 'tipo' => 'variable', 'etiqueta' => 'Variable con el valor (opcional)'],
    ],
    'salidas' => ['id_oportunidad'],
    'ejecutar' => static function (array $ctx, array $vars, array $cfg): array {
        require_once __DIR__ . '/../_lib/_crm_oportunidades.php';
        $conn = $ctx['conn'];
        if (!$ctx['id_contacto'] && !$ctx['simulacion']) return ['puerto' => 'error'];
        $etapa = crmEtapa($conn, ['id_empresa' => $ctx['id_empresa']], (int)$cfg['id_etapa']);
        if (!$etapa || $etapa['tipo'] !== 'abierta' || !$etapa['activo']) return ['puerto' => 'error', 'variables' => ['_error' => 'Etapa no disponible']];
        $titulo = mb_substr(trim(comBotRender((string)$cfg['titulo'], $ctx, $vars)), 0, 150) ?: 'Oportunidad desde WhatsApp';
        $valor = 0.0;
        if (!empty($cfg['variable_valor'])) {
            $raw = str_replace([' ', '$'], '', (string)($vars[$cfg['variable_valor']] ?? ''));
            $raw = preg_replace('/[.,](?=\d{3}(\D|$))/', '', $raw) ?? $raw;   // 1.500.000 → 1500000
            if (is_numeric(str_replace(',', '.', $raw))) $valor = max(0, (float)str_replace(',', '.', $raw));
        }
        if ($ctx['simulacion']) return ['puerto' => 'ok', 'variables' => ['id_oportunidad' => '0']];
        crmExec($conn,
            'INSERT INTO crm_oportunidades (id_sede, id_embudo, id_etapa, titulo, id_contacto, valor, descripcion) VALUES (?, ?, ?, ?, ?, ?, ?)',
            'iiisiss', [$ctx['id_sede'], $etapa['id_embudo'], $etapa['id'], $titulo, $ctx['id_contacto'], number_format($valor, 2, '.', ''),
                'Creada por el chatbot de WhatsApp']);
        $id = (int)$conn->insert_id;
        $nombre = crmRow($conn, 'SELECT nombre_completo FROM crm_contactos WHERE id = ?', 'i', [$ctx['id_contacto']])['nombre_completo'] ?? null;
        auditRegistroSistema($conn, $ctx['id_sede'], 'crm', 'crm_oportunidades', $id, 'creado',
            ['titulo' => $titulo, 'contacto' => ['id' => $ctx['id_contacto'], 'nombre' => $nombre], 'etapa' => $etapa['nombre'], 'valor' => $valor, 'origen' => 'chatbot']);
        return ['puerto' => 'ok', 'variables' => ['id_oportunidad' => (string)$id]];
    },
]);
