<?php
// Plantillas de arranque del CRM por nicho. Una empresa nueva no debería empezar en blanco: al aplicar una plantilla se
// AGREGA lo que falta (vocabulario, roles de vínculo, campos personalizados, etiquetas, embudo con sus etapas, motivos de cierre y
// catálogo de ejemplo) y nunca se pisa ni se borra nada de lo que la empresa ya tenga. Es código (no datos) a propósito: cambiar una
// plantilla no toca a las empresas que ya la aplicaron. Los textos van en español: son datos de la empresa, que los ajusta después en Configuración.
//
// Forma:
//   vocabulario: clave => [singular, plural]        (claves: contacto, persona, organizacion, oportunidad, item)
//   roles:       [nombre, …]
//   campos:      [aplica_a (persona|organizacion|oportunidad), clave, etiqueta, tipo_dato, obligatorio]
//   grupos:      nombre del grupo => [[nombre, color, aplica_a|null], …]
//   tags:        [[nombre, color, aplica_a|null], …]   (sin grupo)
//   embudo:      ['nombre' => …, 'etapas' => [[nombre, probabilidad, tipo (abierta|ganada|perdida), color], …]]
//   motivos:     [[tipo (ganada|perdida), nombre], …]
//   catalogo:    ['categorias' => [nombre, …], 'items' => [[codigo, nombre, categoria|null, unidad, precio de referencia], …]]

function crmPlantillas(): array
{
    return [
        'pinturas_b2b' => [
            'vocabulario' => ['organizacion' => ['Negocio', 'Negocios'], 'item' => ['Producto', 'Productos']],
            'roles' => ['Dueño', 'Compras', 'Administrador del punto', 'Contabilidad'],
            'campos' => [
                ['persona', 'cargo', 'Cargo', 'texto', 0],
                ['organizacion', 'zona_comercial', 'Zona comercial', 'texto', 0],
                ['organizacion', 'es_franquicia', 'Es franquicia', 'booleano', 0],
                ['organizacion', 'fecha_apertura', 'Fecha de apertura', 'fecha', 0],
                ['organizacion', 'cupo_credito', 'Cupo de crédito', 'decimal', 0],
                ['organizacion', 'puntos_de_venta', 'Puntos de venta', 'entero', 0],
                ['oportunidad', 'origen', 'Origen del prospecto', 'texto', 0],
                ['oportunidad', 'visita_programada', 'Visita programada', 'fecha', 0],
            ],
            'grupos' => [
                'Zona' => [['Norte', '#1E88E5', 'organizacion'], ['Sur', '#43A047', 'organizacion'], ['Centro', '#FB8C00', 'organizacion'],
                           ['Oriente', '#8E24AA', 'organizacion'], ['Occidente', '#00897B', 'organizacion']],
                'Categoría' => [['Distribuidor', '#3949AB', 'organizacion'], ['Franquicia', '#D81B60', 'organizacion'], ['Ferretería', '#6D4C41', 'organizacion']],
                'Prioridad' => [['Alta', '#E53935', null], ['Media', '#FDD835', null], ['Baja', '#90A4AE', null]],
            ],
            'tags' => [['Moroso', '#B71C1C', 'organizacion'], ['Urgente', '#E53935', 'oportunidad']],
            'embudo' => ['nombre' => 'Embudo de ventas', 'etapas' => [
                ['Prospecto', 10, 'abierta', '#90A4AE'], ['Contactado', 25, 'abierta', '#42A5F5'], ['Visita o muestra', 40, 'abierta', '#26A69A'],
                ['Cotización enviada', 60, 'abierta', '#FB8C00'], ['Negociación', 80, 'abierta', '#8E24AA'], ['Ganada', 100, 'ganada', '#43A047'], ['Perdida', 0, 'perdida', '#E53935'],
            ]],
            'motivos' => [
                ['ganada', 'Precio competitivo'], ['ganada', 'Calidad del producto'], ['ganada', 'Relación con el asesor'], ['ganada', 'Entrega oportuna'],
                ['perdida', 'Precio'], ['perdida', 'Eligió a la competencia'], ['perdida', 'Sin presupuesto'], ['perdida', 'Sin respuesta'], ['perdida', 'Cambió de planes'],
            ],
            'catalogo' => [
                'categorias' => ['Pintura arquitectónica', 'Recubrimientos industriales', 'Accesorios'],
                'items' => [
                    ['VIN-T1-G', 'Vinilo tipo 1 (galón)', 'Pintura arquitectónica', 'galón', 78000],
                    ['VIN-T1-C', 'Vinilo tipo 1 (cuñete)', 'Pintura arquitectónica', 'cuñete', 365000],
                    ['ESM-SN-G', 'Esmalte sintético (galón)', 'Pintura arquitectónica', 'galón', 96000],
                    ['EPX-IND-G', 'Epóxico industrial (galón)', 'Recubrimientos industriales', 'galón', 185000],
                    ['ANT-RX-G', 'Anticorrosivo rojo óxido (galón)', 'Recubrimientos industriales', 'galón', 88000],
                    ['BRO-4', 'Brocha de 4 pulgadas', 'Accesorios', 'unidad', 14500],
                    ['ROD-9', 'Rodillo de 9 pulgadas', 'Accesorios', 'unidad', 18500],
                ],
            ],
        ],
        'plantas_agua' => [
            'vocabulario' => ['organizacion' => ['Planta', 'Plantas'], 'item' => ['Servicio', 'Servicios']],
            'roles' => ['Propietario', 'Administrador', 'Operario', 'Contabilidad'],
            'campos' => [
                ['persona', 'cargo', 'Cargo', 'texto', 0],
                ['organizacion', 'capacidad_lps', 'Capacidad (L/s)', 'decimal', 0],
                ['organizacion', 'area_m2', 'Área (m²)', 'decimal', 0],
                ['organizacion', 'tipo_tratamiento', 'Tipo de tratamiento', 'texto', 0],
                ['organizacion', 'frecuencia_mantenimiento_dias', 'Frecuencia de mantenimiento (días)', 'entero', 0],
                ['organizacion', 'ultimo_mantenimiento', 'Último mantenimiento', 'fecha', 0],
                ['organizacion', 'requiere_visita_mensual', 'Requiere visita mensual', 'booleano', 0],
                ['oportunidad', 'tipo_servicio', 'Tipo de servicio', 'texto', 0],
                ['oportunidad', 'visita_tecnica', 'Visita técnica', 'fecha', 0],
            ],
            'grupos' => [
                'Tipo de agua' => [['Potable', '#1E88E5', 'organizacion'], ['Residual', '#6D4C41', 'organizacion'], ['Industrial', '#546E7A', 'organizacion']],
                'Riesgo' => [['Riesgo alto', '#E53935', 'organizacion'], ['Riesgo medio', '#FDD835', 'organizacion'], ['Riesgo bajo', '#43A047', 'organizacion']],
            ],
            'tags' => [['Urgente', '#E53935', 'oportunidad']],
            'embudo' => ['nombre' => 'Embudo de servicios', 'etapas' => [
                ['Solicitud recibida', 10, 'abierta', '#90A4AE'], ['Visita técnica', 30, 'abierta', '#42A5F5'], ['Propuesta enviada', 60, 'abierta', '#FB8C00'],
                ['Contrato en firma', 85, 'abierta', '#8E24AA'], ['Ganada', 100, 'ganada', '#43A047'], ['Perdida', 0, 'perdida', '#E53935'],
            ]],
            'motivos' => [
                ['ganada', 'Confianza en el servicio'], ['ganada', 'Precio'], ['ganada', 'Tiempo de respuesta'],
                ['perdida', 'Precio'], ['perdida', 'Eligió a otro proveedor'], ['perdida', 'Sin presupuesto'], ['perdida', 'Sin respuesta'],
            ],
            'catalogo' => [
                'categorias' => ['Mantenimiento', 'Reparaciones', 'Insumos y análisis'],
                'items' => [
                    ['MNT-PREV', 'Mantenimiento preventivo mensual', 'Mantenimiento', 'visita', 850000],
                    ['MNT-LIMP', 'Limpieza y desinfección de tanques', 'Mantenimiento', 'servicio', 1200000],
                    ['REP-BOMBA', 'Reparación de bomba', 'Reparaciones', 'servicio', 650000],
                    ['REP-FILTRO', 'Cambio de filtros', 'Reparaciones', 'servicio', 420000],
                    ['ANA-CAL', 'Análisis de calidad de agua', 'Insumos y análisis', 'muestra', 280000],
                    ['INS-CLORO', 'Cloro granulado (bulto)', 'Insumos y análisis', 'bulto', 240000],
                ],
            ],
        ],
        'clinica_estetica' => [
            'vocabulario' => ['contacto' => ['Cliente', 'Clientes'], 'persona' => ['Paciente', 'Pacientes'], 'organizacion' => ['Convenio', 'Convenios'], 'item' => ['Servicio', 'Servicios']],
            'roles' => ['Acudiente', 'Contacto de emergencia', 'Responsable del convenio'],
            'campos' => [
                ['persona', 'peso_kg', 'Peso (kg)', 'decimal', 0],
                ['persona', 'talla', 'Talla', 'texto', 0],
                ['persona', 'ultima_visita', 'Última visita', 'fecha', 0],
                ['persona', 'acepta_marketing', 'Acepta marketing', 'booleano', 0],
                ['persona', 'como_nos_conocio', 'Cómo nos conoció', 'texto', 0],
                ['persona', 'alergias', 'Alergias', 'texto', 0],
                ['organizacion', 'descuento_pct', 'Descuento (%)', 'decimal', 0],
                ['oportunidad', 'origen', 'Origen', 'texto', 0],
                ['oportunidad', 'sesiones_estimadas', 'Sesiones estimadas', 'entero', 0],
            ],
            'grupos' => [
                'Interés' => [['Facial', '#EC407A', 'persona'], ['Corporal', '#26A69A', 'persona'], ['Capilar', '#8D6E63', 'persona']],
                'Etapa' => [['Nuevo', '#42A5F5', 'persona'], ['Recurrente', '#66BB6A', 'persona'], ['En pausa', '#BDBDBD', 'persona']],
            ],
            'tags' => [['VIP', '#8E24AA', null], ['Alérgico', '#D81B60', 'persona'], ['Urgente', '#E53935', 'oportunidad']],
            'embudo' => ['nombre' => 'Embudo de tratamientos', 'etapas' => [
                ['Interesado', 10, 'abierta', '#90A4AE'], ['Valoración agendada', 30, 'abierta', '#42A5F5'], ['Plan propuesto', 55, 'abierta', '#FB8C00'],
                ['Aceptó el plan', 85, 'abierta', '#8E24AA'], ['Ganada', 100, 'ganada', '#43A047'], ['Perdida', 0, 'perdida', '#E53935'],
            ]],
            'motivos' => [
                ['ganada', 'Resultados esperados'], ['ganada', 'Recomendación'], ['ganada', 'Promoción'],
                ['perdida', 'Precio'], ['perdida', 'Decidió no hacerse el tratamiento'], ['perdida', 'Eligió otra clínica'], ['perdida', 'Sin respuesta'],
            ],
            'catalogo' => [
                'categorias' => ['Facial', 'Corporal', 'Capilar'],
                'items' => [
                    ['FAC-LIMP', 'Limpieza facial profunda', 'Facial', 'sesión', 160000],
                    ['FAC-PEEL', 'Peeling químico', 'Facial', 'sesión', 280000],
                    ['FAC-MESO', 'Mesoterapia facial', 'Facial', 'sesión', 350000],
                    ['COR-MASA', 'Masaje reductor', 'Corporal', 'sesión', 120000],
                    ['COR-LASER', 'Depilación láser (zona)', 'Corporal', 'sesión', 210000],
                    ['CAP-PLASMA', 'Plasma rico en plaquetas capilar', 'Capilar', 'sesión', 420000],
                ],
            ],
        ],
    ];
}
