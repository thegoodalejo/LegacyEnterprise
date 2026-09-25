<?php
// Plantillas de arranque del CRM por nicho. Una empresa nueva no debería empezar en blanco: al aplicar una plantilla se
// AGREGA lo que falta (vocabulario, roles de vínculo, campos personalizados y etiquetas) y nunca se pisa ni se borra
// nada de lo que la empresa ya tenga. Es código (no datos) a propósito: cambiar una plantilla no toca a las empresas que
// ya la aplicaron. Los textos van en español: son datos de la empresa, que los ajusta después en Configuración.
//
// Forma:
//   vocabulario: clave => [singular, plural]        (claves: contacto, persona, organizacion)
//   roles:       [nombre, …]
//   campos:      [aplica_a, clave, etiqueta, tipo_dato, obligatorio]
//   grupos:      nombre del grupo => [[nombre, color, aplica_a|null], …]
//   tags:        [[nombre, color, aplica_a|null], …]   (sin grupo)

function crmPlantillas(): array
{
    return [
        'pinturas_b2b' => [
            'vocabulario' => ['organizacion' => ['Negocio', 'Negocios']],
            'roles' => ['Dueño', 'Compras', 'Administrador del punto', 'Contabilidad'],
            'campos' => [
                ['persona', 'cargo', 'Cargo', 'texto', 0],
                ['organizacion', 'zona_comercial', 'Zona comercial', 'texto', 0],
                ['organizacion', 'es_franquicia', 'Es franquicia', 'booleano', 0],
                ['organizacion', 'fecha_apertura', 'Fecha de apertura', 'fecha', 0],
                ['organizacion', 'cupo_credito', 'Cupo de crédito', 'decimal', 0],
                ['organizacion', 'puntos_de_venta', 'Puntos de venta', 'entero', 0],
            ],
            'grupos' => [
                'Zona' => [['Norte', '#1E88E5', 'organizacion'], ['Sur', '#43A047', 'organizacion'], ['Centro', '#FB8C00', 'organizacion'],
                           ['Oriente', '#8E24AA', 'organizacion'], ['Occidente', '#00897B', 'organizacion']],
                'Categoría' => [['Distribuidor', '#3949AB', 'organizacion'], ['Franquicia', '#D81B60', 'organizacion'], ['Ferretería', '#6D4C41', 'organizacion']],
                'Prioridad' => [['Alta', '#E53935', null], ['Media', '#FDD835', null], ['Baja', '#90A4AE', null]],
            ],
            'tags' => [['Moroso', '#B71C1C', 'organizacion']],
        ],
        'plantas_agua' => [
            'vocabulario' => ['organizacion' => ['Planta', 'Plantas']],
            'roles' => ['Propietario', 'Administrador', 'Operario', 'Contabilidad'],
            'campos' => [
                ['persona', 'cargo', 'Cargo', 'texto', 0],
                ['organizacion', 'capacidad_lps', 'Capacidad (L/s)', 'decimal', 0],
                ['organizacion', 'area_m2', 'Área (m²)', 'decimal', 0],
                ['organizacion', 'tipo_tratamiento', 'Tipo de tratamiento', 'texto', 0],
                ['organizacion', 'frecuencia_mantenimiento_dias', 'Frecuencia de mantenimiento (días)', 'entero', 0],
                ['organizacion', 'ultimo_mantenimiento', 'Último mantenimiento', 'fecha', 0],
                ['organizacion', 'requiere_visita_mensual', 'Requiere visita mensual', 'booleano', 0],
            ],
            'grupos' => [
                'Tipo de agua' => [['Potable', '#1E88E5', 'organizacion'], ['Residual', '#6D4C41', 'organizacion'], ['Industrial', '#546E7A', 'organizacion']],
                'Riesgo' => [['Riesgo alto', '#E53935', 'organizacion'], ['Riesgo medio', '#FDD835', 'organizacion'], ['Riesgo bajo', '#43A047', 'organizacion']],
            ],
            'tags' => [],
        ],
        'clinica_estetica' => [
            'vocabulario' => ['contacto' => ['Cliente', 'Clientes'], 'persona' => ['Paciente', 'Pacientes'], 'organizacion' => ['Convenio', 'Convenios']],
            'roles' => ['Acudiente', 'Contacto de emergencia', 'Responsable del convenio'],
            'campos' => [
                ['persona', 'peso_kg', 'Peso (kg)', 'decimal', 0],
                ['persona', 'talla', 'Talla', 'texto', 0],
                ['persona', 'ultima_visita', 'Última visita', 'fecha', 0],
                ['persona', 'acepta_marketing', 'Acepta marketing', 'booleano', 0],
                ['persona', 'como_nos_conocio', 'Cómo nos conoció', 'texto', 0],
                ['persona', 'alergias', 'Alergias', 'texto', 0],
                ['organizacion', 'descuento_pct', 'Descuento (%)', 'decimal', 0],
            ],
            'grupos' => [
                'Interés' => [['Facial', '#EC407A', 'persona'], ['Corporal', '#26A69A', 'persona'], ['Capilar', '#8D6E63', 'persona']],
                'Etapa' => [['Nuevo', '#42A5F5', 'persona'], ['Recurrente', '#66BB6A', 'persona'], ['En pausa', '#BDBDBD', 'persona']],
            ],
            'tags' => [['VIP', '#8E24AA', null], ['Alérgico', '#D81B60', 'persona']],
        ],
    ];
}
