# Módulo CRM — definición y estado

> Documento vivo del CRM. Estado: **v1 de contactos** — contactos Persona/Organización con jerarquía, roles configurables,
> campos personalizados, etiquetas, historial, filtros, búsqueda en relacionados, acciones en lote, vocabulario por empresa
> y plantillas por nicho, más **reportes PDF/Excel con la marca del cliente** (contactos). Actualizado: 2026-09-25.
> Oportunidades (embudo), ventas importadas y metas: plan aprobado, ver *Hoja de ruta*. Actividades y cotizaciones: por definir.

## Objetivo

Un CRM **parametrizable**, no uno hecho para un solo nicho: el mismo producto sirve a empresas de sectores distintos.
El núcleo (conceptos, tablas y lógica) es fijo en código; cada empresa lo amplía y lo ordena a su medida. El reto es
abstraer lo esencial.

## Principios de diseño

1. **Núcleo fijo, contenido configurable.** El código trabaja con conceptos genéricos (ver *Glosario*); la empresa
   configura qué datos extra guarda y cómo segmenta.
2. **Se parametrizan datos, no comportamiento.** Campos personalizados, etiquetas (y, más adelante, etapas y listas)
   son configurables. La lógica (cómo se guarda, qué exige, qué se audita) vive en el código.
3. **Plantillas por nicho**: una empresa nueva arranca desde una plantilla (vocabulario, roles, campos y etiquetas), no en blanco.
4. **Todo apunta al Contacto.** Etiquetas, valores personalizados, historial y, luego, negocios, citas y pedidos
   referencian siempre a un `crm_contactos.id`, sea Persona u Organización.

## Glosario

Nombres internos (código, BD, API); lo que ve el usuario sale del **vocabulario de la empresa** (por defecto, estos mismos).

| Concepto | Qué es |
|---|---|
| **Contacto** | Registro base de la libreta del CRM. Tiene un tipo: Persona u Organización. |
| **Persona** | Contacto que es un individuo. Puede ser cliente directo (clínica) o persona de referencia de una Organización. |
| **Organización** | Contacto que no es una persona: un negocio, una planta, cualquier entidad. Exige ≥ 1 Persona vinculada. |
| **Vínculo** | Relación Organización ↔ Persona, con un **rol** (de una lista por empresa: dueño, compras, administrador…) y una marca de **principal**. |
| **Padre / dependiente** | Una Organización puede pertenecer a otra (matriz → puntos de venta, conjunto → plantas). |
| **Campo personalizado** | Dato extra que la empresa define para Personas o para Organizaciones (talla, peso, área en m²…). |
| **Etiqueta** | Marca de color para segmentar contactos, con grupo opcional. |
| **Oportunidad** | Posible venta a un Contacto, con etapa de un embudo (ver *Hoja de ruta*). En pantalla se llama «Oportunidad»: «Negocio» ya es el vocabulario de la organización en la plantilla de pinturas. |
| **Actividad** | *Por definir* (llamadas, visitas, tareas). |

> **"Organización" y no "Empresa"**: `le_empresas` ya es el tenant que contrata la plataforma (y `empresas/` es ruta de
> plataforma L5). Usar la misma palabra para dos cosas distintas confundiría código, docs y respuestas.

## Pilotos

Tres empresas de nichos distintos contra las que se valida cada abstracción:

| Piloto | Nicho | Entidad principal | Contactos de referencia | Datos extra (ejemplo) |
|---|---|---|---|---|
| A | Pinturas B2B (vende a negocios que revenden como franquicia) | **Organización** (el negocio que compra) | Una o más Personas por negocio | Zona comercial, es franquicia |
| B | Mantenimiento de plantas de agua | **Organización** (la planta) | Una o más Personas por planta | Área m², capacidad L/s |
| C | Clínica estética | **Persona** (cliente final) | La propia persona | Talla, peso, última visita |

## Modelo de datos

Migraciones `003_historial_registros.sql` (plataforma) y `004_crm_base.sql` (módulo, prefijo `crm_`). Patrón **party**:
una tabla base con un solo espacio de ids y una extensión 1–1 por tipo.

| Tabla | Contenido |
|---|---|
| `crm_contactos` | Base: id, `id_sede`, tipo, `nombre_completo`, dirección, ciudad, **lat/lng (ubicación en el mapa, opcional)**, teléfono, responsable, `activo`, `busqueda` |
| `crm_contactos_personas` | Extensión: nombres, apellidos, documento, correo, WhatsApp (indicativo + número), fecha de nacimiento |
| `crm_contactos_organizaciones` | Extensión: razón social, documento (NIT…), correo de facturación, `id_padre` (organización a la que pertenece) |
| `crm_roles_vinculo` | Roles de vínculo (por **empresa**): nombre, orden, activo |
| `crm_contacto_vinculos` | Organización ↔ Persona (muchos a muchos) con `id_rol` y `principal` |
| `crm_vocabulario` | Nombres que la empresa da a Contacto, Persona y Organización (singular y plural); solo lo personalizado |
| `crm_campos_personalizados` | Definición de campos (por **empresa**): a quién aplica, clave, etiqueta, tipo, obligatorio, orden, activo |
| `crm_campos_valores` | Valores con **una columna por tipo**: `valor_entero`, `valor_decimal`, `valor_texto`, `valor_booleano`, `valor_fecha` |
| `crm_tags_grupos`, `crm_tags` | Catálogo de etiquetas (por **empresa**); grupo opcional; `aplica_a` opcional; color hex libre |
| `crm_contacto_tags` | Relación contacto ↔ etiqueta: PK `(contacto, tag)` + índice inverso `(tag, contacto)` |
| `le_H_registros` | **Historial genérico de plataforma** (módulo, tabla, id_registro, usuario, acción, detalle JSON) |

**Ámbitos.** Los contactos son de una **sede** (`id_sede` siempre sale de la sesión). La configuración (campos,
etiquetas) es de la **empresa**: todas sus sedes comparten el mismo catálogo.

**Auditoría en todas las tablas.** `created_at` / `updated_at` (mismos nombres que 001–002; son el *recDate* y
*changeDate*) más `created_by` / `updated_by` (FK a `le_usuarios`, `ON DELETE SET NULL`). Las tablas de solo
inserción/borrado (`crm_contacto_tags`, `le_H_registros`) llevan solo `created_*`. Un guardado idéntico **no** mueve
`updated_at` ni `updated_by`; un cambio que no vive en `crm_contactos` (etiquetas, vínculos, campos) sí los actualiza
(`crmTocar`).

**Eliminación siempre lógica.** "Eliminar" archiva (`activo = 0`); se restaura desde el filtro *Archivados*. No hay
borrado físico de contactos: se conservan historial, vínculos y referencias de módulos futuros.

**Jerarquía.** `id_padre` (solo Organizaciones): la organización elegida debe existir en la sede, ser una Organización, no ser
la propia ni crear un **ciclo** (se recorre la cadena de ancestros). El perfil muestra «Pertenece a» y la lista de
**dependientes**; el listado muestra «Pertenece a X» y se filtra por padre (directos). El historial guarda los nombres.

**Roles de vínculo.** Lista por empresa (`crm_roles_vinculo`), no texto libre: se configuran en *Ajustes → Roles* (L4). Un rol
desactivado se conserva en los vínculos que ya lo tienen y no se puede asignar de nuevo; el historial guarda el nombre.

**Regla de Organización.** Toda Organización tiene ≥ 1 Persona vinculada y exactamente una principal. Se valida en la
aplicación, en la misma transacción (no en la BD): no se puede crear sin personas ni quitar la última. Una Persona
puede estar vinculada a varias Organizaciones (un administrador de varias plantas es un solo registro).

## Campos personalizados

Tipos: **entero, decimal, texto, booleano, fecha**. Cada valor vive en la columna de su tipo (las demás quedan NULL), así
un filtro por rango numérico o de fechas usa el tipo y el índice reales en vez de castear texto
(`EXPLAIN` confirma `idx_crm_cv_decimal`). La fecha se guarda como `DATE` (AAAA-MM-DD); **dd-mm-aaaa es solo de
presentación** en el frontend. Reglas: `clave` y `aplica_a` son fijos tras crear; el **tipo no cambia** si ya hay valores
(se desactiva el campo y se crea otro); los campos no se borran, se desactivan (los valores existentes se siguen
mostrando); un campo obligatorio se exige al crear/editar.

## Etiquetas

Inspiradas en las de Kingdom (nombre + color + relación por tabla intermedia), con una diferencia: **Kingdom no agrupa**
(`kingdom_tags_miembros` es plano y `kingdom_marks` asigna de a un miembro por llamada); aquí el **grupo es opcional** y
la asignación **en lote** es nueva. `aplica_a` opcional restringe una etiqueta a Personas u Organizaciones. Una sola
tabla de relación sirve a ambos tipos porque comparten el espacio de ids de `crm_contactos`. El color es un dato del
cliente (hex libre), no un token de marca; el texto del chip pasa a blanco/negro por luminancia.

## Historial de cambios

Cada creación, edición, archivado/restauración, cambio de etiquetas y de vínculos deja una fila en `le_H_registros` con
el usuario, la fecha y el detalle `[{campo, antes, después}]`. Las acciones en lote llevan un `lote` (uuid) común. **Se
conserva todo**; el perfil muestra por defecto los **últimos 3 meses** y «Ver anteriores» muestra el resto. Botón
pequeño de historial (ícono `history`) en la cabecera del perfil. La tabla es genérica: Agenda, Pedidos, etc. la
reutilizarán con `auditRegistro()`.

## Filtros y búsqueda

Todos combinables, con paginación en servidor:
texto (nombre, teléfono, documento, correo: insensible a mayúsculas y tildes, por palabras sueltas, teléfonos y NIT sin
formato), tipo, estado (activos / archivados / todos), responsable, creado por, rango de **fecha de creación**,
**etiquetas** (cualquiera / todas), **campos personalizados** (operador según el tipo) y **«Pertenece a»** (organización padre).
La búsqueda de texto **incluye por defecto los registros relacionados**: cada palabra puede coincidir en el propio contacto o
en los vinculados (se encuentra un negocio por el nombre o teléfono de su persona de referencia, y una persona por su negocio);
se apaga con «Incluir registros relacionados al buscar» (filtro `relacionados: false`). El lote usa la misma búsqueda. Cada contacto muestra su
**fecha de creación y quién lo creó** (y quién lo modificó por última vez).

## Selección y acciones en lote

Botón *Seleccionar* → casillas, «seleccionar los de esta página» y «Seleccionar los N resultados del filtro» (el cliente
manda el filtro y los excluidos, no los N ids). Acciones: **Etiquetar**, **Quitar etiqueta**, **Eliminar/Restaurar**.
Eliminar más de **5** exige escribir la palabra (`ELIMINAR` / `DELETE`). El servidor resuelve la selección dentro de la
sede, rechaza si el total cambió (409) o supera **5.000**, opera en una transacción y responde
`{procesados, sin_cambios, omitidos}` (p. ej. etiquetas que no aplican al tipo de contacto).

## Ubicación en el mapa

Campo base de **Personas y Organizaciones**, opcional: `lat`/`lng` (DECIMAL(9,6), nulos) junto a `direccion` y `ciudad`, que ya
existían. Latitud y longitud van **juntas o ninguna** (400 si viene una sola) y se redondean a 6 decimales, así un guardado sin
cambios no se registra como cambio. El historial muestra **un solo cambio «Ubicación»** (`4.711000, -74.072100` → …), no dos.

El formulario tiene el bloque «Ubicación en el mapa»: **Elegir en el mapa** abre el selector (Google Maps: clic o arrastre del pin,
búsqueda por dirección con Geocoding, «usar mi ubicación», o coordenadas escritas/pegadas). Al confirmar se guardan las coordenadas y,
si están vacías, se rellenan `direccion` y `ciudad` con lo que Google reconoce para ese punto (nunca se pisa lo que la persona
escribió). Sin Google la función sigue: el selector queda en **modo coordenadas escritas** y avisa que el mapa no está
configurado. El perfil muestra la ubicación con «Abrir en Google Maps» (enlace, no necesita key).

**Key de Google Maps** (`googleMapsApiKey` en los tres `frontend/src/environments/environment*.ts`): key de navegador, pública
por diseño como la de Firebase, y por eso **restringida**. Configurada el 2026-09-24 con `gcloud`:
- **Proyecto:** `fireapp-ce836` (el único con facturación activa; comparte proyecto y cuenta de facturación con Kingdom, pero es una
  clave **independiente** con su propio uso). Ahí ya estaban habilitadas *Maps JavaScript API* y *Geocoding API* (Places no se usa).
- **Clave:** «LegacyEnterprise (Maps, navegador)» (`a612ecc7-3c9e-47d5-8889-efc74b91d177`). Restricción de aplicación = referrers
  `https://legacyenterprise.web.app/*`, `https://legacyenterprise-731cb.web.app/*` y `http://localhost:4200/*`; restricción de API =
  solo `maps-backend` y `geocoding-backend`. **Otro puerto local (p. ej. 4201) o dominio nuevo se rechaza** hasta agregarlo:
  `gcloud services api-keys update a612ecc7-… --project=fireapp-ce836 --allowed-referrers="…lista completa…"`.
- **Ver/administrar:** `gcloud services api-keys list --project=fireapp-ce836`; uso y cuotas en Cloud Console → *APIs y servicios* →
  *Credenciales* / *Métricas*. Conviene una alerta de presupuesto en la cuenta de facturación (Maps tiene uso gratuito mensual).
- **Si Google la rechaza** (dominio no permitido, API deshabilitada, facturación) el selector avisa y sigue funcionando con
  coordenadas escritas. Para moverla a un proyecto propio: crear otra clave allí, cambiarla en los `environment*.ts` y promover.

La API de Google se descarga solo al abrir el selector (`GoogleMapsLoaderService`), nunca con la app.

## Reportes y exportación (PDF / Excel)

**Regla del proyecto:** toda lista o panel del CRM nace con «Exportar» PDF y Excel, y todos los reportes salen del mismo servicio para verse iguales y con la marca del cliente.

- **Se generan en el navegador**, con carga diferida (`jspdf` + `jspdf-autotable` para PDF, `exceljs` para Excel; ~113 kB y ~218 kB transferidos, solo al exportar; el bundle inicial no cambia).
  El backend PHP no tiene Composer ni librerías de PDF y el CI solo sincroniza archivos: agregarlas exigiría reconstruir el contenedor a mano. Un generador en servidor (reportes programados o por correo) queda para cuando exista Integraciones.
- **Contrato:** cada pantalla arma un `ReportSpec` (`services/reports/report-spec.ts`: título, filtros en texto, indicadores, tablas resumen y de detalle, columnas tipadas y `solo: 'pdf' | 'xlsx'`)
  y llama a `ReportService.exportar(spec, formato)`. El PDF lleva pocas columnas y el Excel todas (incluidos los campos personalizados); las fechas y números del Excel son valores reales, no texto.
- **Marca:** logo de la empresa (respaldo: el de Legacy Enterprise), nombre de empresa y de sede, fecha y hora de generación con zona horaria, usuario, colores de marca en la línea de acento y los encabezados de tabla
  (texto por contraste), indicadores ejecutivos, «Página X de Y» y, muy pequeño en el pie, «Generado por LegacyEnterprise» con su logo. Fuente estándar Helvetica: los textos del PDF pasan por `pdfSeguro` (Latin-1).
- **Logo sin CORS:** el bucket público de R2 no tiene CORS, así que `backend/reportes/get_marca.php` (cualquier usuario con sede) baja el logo desde el servidor y lo entrega como data URI, solo si la URL es del bucket público y de esa empresa (guarda contra SSRF; tope 1 MB).
  WebP se convierte a PNG con `gd`; un SVG se rasteriza en el navegador con un canvas (`report-imagen.ts`). La marca se guarda 5 min por sede en el cliente.
- **Botón `app-export-menu`:** alcances *selección*, *resultados del filtro* y *todos los registros*; cada uno en Excel o PDF. `crm/export_contactos.php` recibe la misma `seleccion` que las acciones en lote (`{ids}` o `{filtros, excluidos, total_esperado}`),
  responde por páginas de 1.000 con etiquetas, vínculos y valores personalizados, y devuelve 409 si el total cambió. **Topes:** Excel 20.000 filas (`CRM_EXPORT_MAX`); PDF 2.000 (`PDF_MAX_FILAS`, con aviso).
- **Datos personales:** la primera página de cada exportación registra `crm_exportar` en `le_H_admin` (usuario, formato, filas, filtros). Quien puede ver el listado puede exportarlo; subirlo a L2 es un `requireRole` en `export_contactos.php`.
- **Pruebas:** `services/reports/report-format.spec.ts` (`ng test`). A mano se verificó con Playwright: PDF renderizado a imagen y Excel leído con `openpyxl` (logo SVG/PNG/WebP/JPG, sin logo ni colores, español/inglés, 3.080 filas en 1,2 s, 375 y 1280 px).

## Vocabulario por empresa

Cada empresa nombra a su manera (`crm_vocabulario`): **Contacto** (el registro en general), **Persona** y **Organización**, en
singular y plural (p. ej. Cliente / Paciente / Planta). Sin personalizar se usa el nombre por defecto del idioma
(`crm.voc.def.*`). Mecanismo: `CrmVocabService` publica los nombres como variables globales de `TranslationService`
(`{persona}`, `{Personas}`, `{organizacion}`, `{Contactos}`… minúscula para frases, mayúscula inicial para títulos), y se carga con
un *resolver* antes de mostrar cualquier pantalla del CRM (sin parpadeo). **Regla de redacción:** los textos con vocabulario no
llevan artículos ni adjetivos que dependan del género («Crear {persona}», «Se restauraron {n} {contactos}»), para que sirva
cualquier palabra. Se edita en *Ajustes → Vocabulario* (L4): singular y plural juntos, o ambos vacíos para volver al nombre por defecto.

## Plantillas por nicho

`backend/_lib/_crm_plantillas.php` (código, no datos): **Pinturas B2B y distribución**, **Mantenimiento de plantas de agua** y
**Clínica estética** (vocabulario, roles, campos, grupos de etiquetas y etiquetas). *Ajustes → Plantillas* (L4; L5 la aplica a la
empresa de la sede en la que está parado) muestra qué agrega cada una y la aplica **solo agregando lo que falta**: nunca pisa
vocabulario ya personalizado ni cambia o borra roles, campos o etiquetas existentes (por nombre/clave); es idempotente y devuelve
{agregados, existentes} por categoría. Queda en `le_H_admin` (`crm_aplicar_plantilla`). Los textos de las plantillas están en español.

## Permisos

| Acción | Mínimo |
|---|---|
| Ver, crear, editar, etiquetar (uno o en lote) | Acceso al módulo (`requireModulo('crm')`) |
| Eliminar / restaurar (uno o en lote) | L2 |
| Ver el historial de un contacto | L2 |
| Configurar campos, etiquetas, roles y vocabulario; ver y aplicar plantillas | L4 |

## API (`backend/crm/`)

`list_contactos`, `get_contacto`, `save_contacto`, `bulk_contactos`, `set_contacto_tags`, `save_vinculo`,
`remove_vinculo`, `list_historial`, `list_campos`, `save_campo`, `list_tags`, `save_tag`, `save_tag_grupo`,
`list_roles`, `save_rol`, `list_vocabulario`, `save_vocabulario`, `list_plantillas`, `apply_plantilla`, `list_responsables`, `export_contactos` (más `reportes/get_marca.php`, compartido por todos los reportes).
Helpers en `backend/_lib/_crm.php`, `_historial.php` y `_reportes.php`. Todo con `db_prepare_or_fail`, respuesta
`{action, mensaje, data}` y guardado en transacción. `save_vinculo`/`remove_vinculo` están probados pero la UI v0 edita
los vínculos desde el formulario de la Organización.

## Frontend (`/m/crm/…`)

`contactos` (listado + filtros + lote), `contactos/:id` (perfil), `configuracion` (L4: campos, etiquetas, roles, vocabulario y
plantillas). Diálogos: formulario de contacto, selector de etiquetas (multi, agrupado), historial. Componentes reutilizables:
`app-contacto-picker` (buscador con autocompletado de un tipo de contacto), `app-tag-chip`, `app-date-input`, `app-export-menu` (botón Exportar).
`DialogService.confirm` gana `confirmWord`.

## Cómo probarlo en local

Migraciones 001–004 + `database/dev-seed-crm.sql` (solo desarrollo, **no** se despliega: usuarios con token conocido,
61 personas y 20 organizaciones ficticias, con jerarquía y roles, config de los tres pilotos). Login de prueba en dev:
`window.__leDev.login('dev-token-l4')` (l5, l4, l2, l1, nocrm, otro). Ver «Desarrollo local» en `pendientes.md`.

## Límites con otros módulos (propuesta)

| Función | Dueño | El CRM… |
|---|---|---|
| Reuniones, citas, recordatorios | Agenda | Las muestra en la ficha del contacto |
| Cotización → pedido | Pedidos | Llega hasta la cotización aceptada |
| Visitas técnicas, tickets de postventa | Servicios | Muestra el historial en la ficha |
| WhatsApp, correo, formularios web, webhooks | Integraciones | Recibe leads y registra conversaciones |
| Tableros entre sedes | Gerencia | Expone sus indicadores |

## Hoja de ruta (plan aprobado 2026-09-25)

Cada fase se prueba, se despliega y se usa sola. Todo es configurable por empresa (se acepta una configuración inicial larga: se hace una vez por cliente) y todo se exporta a PDF/Excel.

| Fase | Contenido |
|---|---|
| **0** ✅ | Servicio de reportes con marca del cliente + exportar contactos (esta sección: *Reportes y exportación*) |
| **A** | **Oportunidades**: un embudo por empresa configurable (tablas listas para varios), etapas con probabilidad y tipo abierta/ganada/perdida, motivos de cierre; tablero (arrastrar con `@angular/cdk`) + lista; catálogo de ítems (producto/servicio/tratamiento) y líneas por oportunidad; notas; etiquetas y campos personalizados también para oportunidades; vocabulario `oportunidad` e `item`; visibilidad igual que contactos (L2 archiva y ve historial, L4 configura). Migración `005`. |
| **B** | **Ventas importadas** por Excel/CSV: `crm_ventas` + líneas + lotes revertibles + plantillas de mapeo de columnas; la organización se identifica por NIT o código de cliente; pestaña «Ventas» en el perfil de la organización. El navegador lee el archivo y envía bloques al servidor. Migración `006`. |
| **C** | **Metas paramétricas** (empresa → sede → organización): métricas configurables (ventas en monto o cantidad, filtro por ítem o categoría, oportunidades ganadas, clientes con compra), períodos, avance y «esperado a la fecha»; panel superior en Oportunidades. La meta de la empresa suma las sedes de la empresa y muestra **solo el agregado** a todo el CRM (excepción documentada al aislamiento por sede). Migración `007`. |

Las ventas y las metas viven dentro del CRM; sus tablas se piensan para que un futuro módulo de Ventas/Facturación escriba en las mismas.

## Decisiones

| Fecha | Decisión |
|---|---|
| 2026-09-25 | Reportes PDF/Excel **en el navegador** con carga diferida (`jspdf`, `jspdf-autotable`, `exceljs`), un `ReportSpec` común y la marca del cliente; el logo llega por `reportes/get_marca.php` (sin configurar CORS en R2) |
| 2026-09-25 | Toda lista o panel del CRM lleva «Exportar»; la exportación de datos personales se audita (`crm_exportar` en `le_H_admin`) y tiene topes (Excel 20.000 filas, PDF 2.000) |
| 2026-09-25 | Oportunidades → ventas importadas → metas, en ese orden y dentro del CRM; en pantalla «Oportunidad» (no «Negocio»); la meta de la empresa se muestra solo como total agregado |
| 2026-09-24 | CRM parametrizable: núcleo fijo + configuración por empresa |
| 2026-09-24 | Contacto base con dos tipos, **Persona** y **Organización** (patrón party); "Organización" y no "Empresa" (colisión con el tenant) |
| 2026-09-24 | Una Organización exige ≥ 1 Persona vinculada (regla de aplicación); una Persona puede servir a varias |
| 2026-09-24 | Campos personalizados por empresa con 5 tipos y columnas tipadas; fecha dd-mm-aaaa solo en presentación |
| 2026-09-24 | Etiquetas por empresa, grupo opcional, `aplica_a` opcional, una tabla de relación para ambos tipos |
| 2026-09-24 | Configuración por **Empresa**; contactos por **Sede** |
| 2026-09-24 | Auditoría (`created_at/by`, `updated_at/by`) en todas las tablas nuevas; historial genérico `le_H_registros`, conservado sin borrar, 3 meses por defecto |
| 2026-09-24 | Eliminación **siempre lógica** y restaurable; en lote, palabra obligatoria si son más de 5 |
| 2026-09-24 | Selección con «todos los resultados del filtro»; etiquetar/quitar en lote (endpoint nuevo, UX de Kingdom) |
| 2026-09-24 | Se construye el prototipo real (no un mockup) para descubrir lo que falta |
| 2026-09-24 | La búsqueda incluye por defecto los registros relacionados (persona ↔ organización), con opción de apagarla |
| 2026-09-24 | Jerarquía de organizaciones con `id_padre` (sin ciclos); dependientes en el perfil y filtro «Pertenece a» |
| 2026-09-24 | Roles de vínculo: lista configurable por empresa (no texto libre) |
| 2026-09-24 | Vocabulario por empresa (Contacto/Persona/Organización) vía variables globales de i18n; textos sin género |
| 2026-09-24 | Plantillas por nicho en código (pinturas B2B, plantas de agua, clínica estética): solo agregan, nunca pisan |
| 2026-09-24 | Ubicación en el mapa: campo base opcional (lat/lng, ya existentes) para Persona y Organización; selector con Google Maps + Geocoding y respaldo con coordenadas escritas |

## Pendientes y preguntas abiertas

**Supuestos míos, por confirmar (⚠):** permisos de la tabla anterior (eliminar/historial = L2); documento repetido =
aviso, no bloqueo; búsqueda v0 no tolera errores de tipeo; tope de 5.000 por lote.

**Por construir / definir:**
1. **Oportunidades (fase A), ventas importadas (B) y metas (C)**: plan aprobado, ver *Hoja de ruta*. Actividades y cotizaciones: por definir.
2. **Orden por columna** en el listado (el backend ya lo soporta: `orden`, `dir`).
3. **Datos personales**: autorización de tratamiento por contacto; en la clínica, la historia clínica queda fuera del CRM.
4. **Purga del historial** (política de retención a largo plazo, si se necesita).
5. ~~Exportar contactos (Excel/PDF)~~ ✅ 2026-09-25. Falta **importar** contactos desde Excel/CSV (la lectura de archivos llega con la fase B).
6. Etiquetas con `aplica_a` restringido que ya están asignadas al tipo contrario: hoy se conservan.
7. Plantillas y nombres por defecto solo en español/inglés; los textos de las plantillas (campos, etiquetas) son en español.
8. Jerarquía: hoy el filtro «Pertenece a» trae solo los dependientes directos (no todo el árbol).
