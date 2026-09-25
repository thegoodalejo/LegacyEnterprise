# Módulo CRM — definición y estado

> Documento vivo del CRM. Estado: **v1 de contactos** — contactos Persona/Organización con jerarquía, roles configurables,
> campos personalizados, etiquetas, historial, filtros, búsqueda en relacionados, acciones en lote, vocabulario por empresa
> y plantillas por nicho, más **reportes PDF/Excel con la marca del cliente** y **oportunidades** (embudo configurable, tablero y lista,
> catálogo de ítems, líneas, notas, cierre con motivo) y **ventas importadas desde Excel/CSV** (lotes revertibles, análisis por cliente, ítem y mes).
> Actualizado: 2026-09-25. Metas: plan aprobado, ver *Hoja de ruta*. Actividades y cotizaciones: por definir.

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
| `crm_config` | Por **empresa**: moneda (ISO, por defecto COP) y decimales de los montos (migración `005`) |
| `crm_embudos`, `crm_etapas` | Por **empresa**: embudos y sus etapas (orden, probabilidad 0–100, tipo abierta/ganada/perdida, color) |
| `crm_motivos_cierre` | Por **empresa**: por qué se gana o se pierde (tipo ganada/perdida) |
| `crm_catalogo_categorias`, `crm_catalogo_items` | Por **empresa**: lo que se vende (código único opcional, unidad, precio de referencia) |
| `crm_oportunidades` | Por **sede**: título, contacto (Persona u Organización), persona de contacto, responsable, embudo/etapa, valor, cierre estimado y real, estado, motivo, descripción, `etapa_desde`, `activo` |
| `crm_oportunidad_lineas`, `crm_oportunidad_notas` | Líneas (ítem o descripción libre × cantidad × precio) y bitácora de notas (borrado lógico) |
| `crm_oportunidad_valores`, `crm_oportunidad_tags` | Campos personalizados y etiquetas de las oportunidades (espejo de las de contactos: aquellas tienen FK a `crm_contactos`) |

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

## Oportunidades y embudo

Una **oportunidad** es una posible venta a un Contacto (Persona u Organización) de la sede, con una persona de contacto opcional. Avanza por las
**etapas** de un embudo de la empresa; el **tipo** de la etapa decide su estado: *abierta* (en curso), *ganada* o *perdida*. Solo `move_oportunidad`
cambia la etapa: al entrar en una terminal fija la fecha de cierre y exige **motivo** si la empresa tiene motivos activos de ese tipo; al volver a una
abierta limpia cierre y motivo. `etapa_desde` guarda cuándo entró a la etapa actual.

- **Valor:** la suma de sus **líneas** (ítem del catálogo o descripción libre, cantidad × precio); sin líneas, el valor que escribe el usuario.
  **Ponderado** = valor × probabilidad de la etapa (ganada 100 %, perdida 0 %; la app fija esas dos).
- **Pantalla** `/m/crm/oportunidades`: **tablero** (una columna por etapa con conteo, valor y ponderado; se arrastran tarjetas con `@angular/cdk`,
  pulsación larga en táctil, o «Mover a…» en el menú de la tarjeta; las 25 primeras por columna y «Ver más») o **lista** (filtros, orden, paginación,
  selección y lote: etiquetar/quitar, archivar/restaurar). La vista elegida se recuerda en el navegador. Resumen arriba: abiertas, ponderado, ganadas, perdidas.
- **Filtros:** texto (título, cliente o persona de contacto), estado, embudo, responsable, cliente, cierre estimado desde/hasta, valor mínimo/máximo, etiquetas,
  campos personalizados de oportunidad y archivadas.
- **Ficha** `/m/crm/oportunidades/:id`: datos, líneas, notas (edita/elimina su autor o L2+), etiquetas, campos, historial (L2+) y «Mover a…».
  El perfil del contacto muestra sus oportunidades y permite crear una con el contacto ya elegido (si es una Organización, se propone su persona principal).
- **Varios embudos:** el modelo los admite; el selector aparece solo cuando hay más de uno. Reglas: no se desactiva un embudo con oportunidades activas
  ni el último activo; cada embudo conserva al menos una etapa abierta activa; el tipo de una etapa no cambia si ya tiene oportunidades (se crea otra);
  una etapa con oportunidades activas no se desactiva.
- **Configuración** (L4, *Ajustes → Embudo* y *Catálogo*): moneda y decimales, embudos, etapas, motivos, categorías e ítems. Los campos personalizados y
  las etiquetas admiten el destino «Oportunidad» (una etiqueta de oportunidad no se ofrece a contactos, ni al revés). Las plantillas por nicho traen
  embudo, motivos y un catálogo de ejemplo. Vocabulario: `oportunidad` e `item` («Negocio» no se usa para la oportunidad: en pinturas es la organización).
- **Reportes:** informe del embudo (tablero, lista, selección o todo): indicadores (abiertas, valor abierto, ponderado de abiertas, ganado, ganadas,
  perdidas, tasa de cierre), por etapa, por responsable, detalle y, en Excel, hoja de líneas. Ficha PDF/Excel de una oportunidad y catálogo.
  `crm/export_oportunidades.php` audita `crm_exportar` como contactos.
- **QA:** `qa-sanitize.sql` reemplaza el texto de notas y descripciones (pueden traer datos personales).

## Ventas importadas (Excel / CSV)

Las ventas reales del cliente (facturas, remisiones) llegan al CRM desde un archivo que exporta su sistema contable o ERP. Son la base de los
**indicadores de venta** por cliente, ítem y mes y, en la fase C, del avance de las **metas**. No hay módulo de facturación todavía: las tablas
(`crm_ventas`, `crm_venta_lineas`) se pensaron para que un módulo futuro de Ventas/Facturación escriba en las mismas (`id_importacion` NULL = venta
creada por otro medio).

### Modelo (migración `006_crm_ventas.sql`)

| Tabla | Contenido |
|---|---|
| `crm_importaciones` | Un **lote** por archivo cargado (por **sede**): archivo, estado (`procesando` → `completa` o `revertida`), opciones y mapeo con que se leyó, contadores (filas totales/ok/error, ventas nuevas/reemplazadas/omitidas, ítems creados), valor total, rango de fechas, las primeras 200 filas con error `[{fila, motivo}]`, quién y cuándo lo revirtió |
| `crm_ventas` | Una venta = un documento de un **Contacto** de la sede (Organización o Persona) en una fecha: número de documento (opcional), total (= suma de líneas), unidades (= suma de cantidades), lote, `activo` (0 = revertida o reemplazada) |
| `crm_venta_lineas` | Ítem del catálogo si el código se reconoce; si no, el código y la descripción tal como vinieron; cantidad, precio unitario, total |
| `crm_import_plantillas` | Por **empresa**: cómo leer el archivo de cada mes (columnas, fila de encabezado, formato de fecha, separador decimal y opciones), con nombre |

Nada se borra: revertir o reemplazar deja `activo = 0` y todos los indicadores cuentan solo las ventas activas.

### Formato del archivo

- **Excel (.xlsx)** o **CSV** (`.csv` o `.txt`). Los `.xls` de Excel 97-2003 no se leen (se pide guardarlos como `.xlsx`). Tope: 25 MB.
- **Una fila por cada línea vendida** (producto o servicio). Las filas con el mismo **número de documento** se agrupan en una venta; sin esa
  columna se agrupan por **cliente + fecha**. Si una misma factura aparece con otro cliente u otra fecha, esas filas se marcan con error.
- **Obligatorio:** fecha, cliente y (precio unitario **o** total de la línea). **Opcional:** número de documento, código y descripción del ítem,
  cantidad (1 si no viene). Si falta el total se calcula cantidad × precio; si falta el precio, total ÷ cantidad.
- **CSV:** el separador se detecta solo (`;`, `,`, tabulador o `|`), respeta comillas y saltos de línea entre comillas; la codificación se detecta
  (UTF-8 con o sin BOM; si no es UTF-8 válido, Windows-1252, que es lo que exporta Excel en español como «CSV»).
- **Excel:** se leen todas las hojas con datos (se elige cuál); fórmulas (su resultado), texto enriquecido, hipervínculos y fechas reales.
- **Fechas:** celdas de fecha de Excel, número de serie de Excel o texto en el formato elegido (dd/mm/aaaa, aaaa-mm-dd o mm/dd/aaaa, con `/`, `-`, `.`
  o espacio; años de dos dígitos). `aaaa-mm-dd` siempre se acepta. Se rechazan fechas imposibles (31/02) y futuras (más de un día adelante).
- **Números:** con separador decimal **coma** (`1.234.567,89`) o **punto** (`1,234,567.89`); se ignoran `$`, espacios y `COP`/`USD`; `(1.500)` es negativo.
- **Formato de ejemplo:** el asistente descarga un `.xlsx` con los encabezados que se reconocen solos y dos filas de muestra.

### Asistente de importación (`/m/crm/ventas` → «Importar ventas», L2+)

1. **Archivo:** arrastrar o elegir. El archivo **nunca se sube entero**: el navegador lo lee (ExcelJS con carga diferida para `.xlsx`).
2. **Columnas y opciones:** se detecta la fila del encabezado (la primera con dos o más celdas con texto: salta títulos) y se **proponen las columnas**
   por el nombre del encabezado, sin tildes ni mayúsculas (p. ej. «Fecha factura», «NIT», «No. Factura», «Vr. Unitario», «Valor total»). La vista
   previa muestra las primeras 8 filas **ya interpretadas** y marca en rojo lo que no se puede leer. Opciones:
   - **Reconocer al cliente por:** *documento o NIT* (compara solo dígitos, con y sin dígito de verificación: `901.142.687-7` = `901142687-7` =
     `901142687`), *nombre exacto* (sin distinguir mayúsculas ni tildes) o *un campo personalizado* de texto o número entero de Personas u
     Organizaciones (p. ej. «Código de cliente» del ERP). Si varios contactos coinciden y solo uno está activo, se usa ese; si no, la fila es error.
   - **Código fuera del catálogo:** cargar la línea sin ítem (queda el código y la descripción del archivo) o **crear el ítem** (nombre = descripción,
     precio de referencia = precio de la línea).
   - **Factura ya cargada** (mismo número entre las ventas activas de la sede, sin distinguir mayúsculas): *dejar la que está* (se cuenta como
     omitida) o *reemplazarla* (la anterior queda inactiva y entra la del archivo). Así se vuelve a cargar un mes corregido.
   - **Plantillas:** el mapeo y las opciones se guardan con un nombre por empresa y se reutilizan cada mes (guardar con el mismo nombre la sobrescribe).
3. **Revisión:** el servidor procesa **todo** el archivo dentro de una transacción que se revierte (`accion=simular`): nada queda guardado. Muestra
   filas leídas, ventas nuevas, reemplazos, ya cargadas, ítems nuevos, filas con error, valor y rango de fechas, la lista de **clientes que no se
   encontraron** (para crearlos o corregir cómo se reconocen) y cada fila con error con su número de fila del archivo y el motivo.
4. **Importación:** se crea el lote (`iniciar`), se mandan **bloques** de hasta 400 ventas / 2.500 líneas (el servidor acepta 500 / 3.000) con barra de
   progreso (`bloque`, cada uno en su transacción) y se cierra (`finalizar`, auditado como `crm_importar_ventas` en `le_H_admin`). Las filas con error se
   omiten; el resto se guarda. Si la importación se corta a mitad, lo cargado queda en un lote «En proceso» que se puede revertir.

### Pantalla de ventas (`/m/crm/ventas`, cualquiera con acceso al CRM)

- **Filtros:** período (este mes, mes anterior, este trimestre, este año —por defecto—, últimos 12 meses, todo o rango), búsqueda (número de documento
  o cliente), categoría, cliente (con o sin sus **dependientes**: una matriz suma las ventas de sus puntos de venta), ítem e importación.
- **Indicadores:** total vendido, número de ventas, clientes con compra, ticket promedio y unidades.
- **Pestañas:** *Por cliente* (ventas, última compra, total y barra; clic abre el perfil), *Por ítem* (cantidad y total; las líneas sin ítem se agrupan
  por código/descripción; clic filtra las ventas de ese ítem), *Por mes* (barras), *Ventas* (detalle; clic abre la venta con sus líneas y el archivo
  de origen) e *Importaciones* (lotes con contadores, errores, «Ver sus ventas» y **Revertir**, L2+).
- **Revertir un lote:** sus ventas quedan inactivas y el lote pasa a «Revertida» (auditado como `crm_revertir_importacion`). Las ventas que ese lote
  había **reemplazado no se reactivan solas** (pudieron cambiar después): si hace falta, se vuelve a importar el archivo anterior.
- **Perfil del contacto:** tarjeta «Ventas (últimos 12 meses)» con total, número de ventas, última compra y las 3 más recientes (una organización con
  dependientes suma las de ellos).
- **Reporte** (`export_ventas.php`, auditado `crm_exportar`): indicadores, por mes, por categoría (con participación), principales 25 clientes e ítems;
  en Excel además hojas completas *Por cliente*, *Por ítem*, *Ventas* y *Líneas*. Tope del PDF: 2.000 ventas (se pide Excel).

### Permisos

Ver ventas, filtros y reportes: acceso al módulo. **Importar, revertir y guardar plantillas: L2** (las ventas alimentan las metas; se cambia con un
`requireRole` en `import_ventas.php`, `revertir_importacion.php` y `save_import_plantilla.php`).

### Pruebas

`import-parse.spec.ts` (CSV, codificación, fechas, números, mapeo automático, agrupación y bloques). A mano: API con 51 casos (reconocimiento en los
tres modos, NIT con puntos y sin dígito de verificación, errores por fila, simulación sin escritura, ítems nuevos, omitir/reemplazar, lotes, reversión,
vistas, permisos y aislamiento entre sedes) y Playwright con un `.xlsx` real (título antes del encabezado, 83 filas, cliente inexistente y fecha rota)
y un CSV Windows-1252 con `;` y coma decimal reconocido por nombre.

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
| Crear, editar, mover de etapa y etiquetar oportunidades; agregar notas | Acceso al módulo |
| Eliminar / restaurar contactos; archivar / restaurar oportunidades (uno o en lote) | L2 |
| Ver el historial de un contacto o de una oportunidad | L2 |
| Editar o eliminar una nota ajena | L2 (la propia: su autor) |
| Ver ventas, sus análisis y reportes | Acceso al módulo |
| Importar ventas, revertir importaciones y guardar plantillas de mapeo | L2 |
| Configurar campos, etiquetas, roles, vocabulario, moneda, embudos, etapas, motivos y catálogo; ver y aplicar plantillas | L4 |

## API (`backend/crm/`)

`list_contactos`, `get_contacto`, `save_contacto`, `bulk_contactos`, `set_contacto_tags`, `save_vinculo`,
`remove_vinculo`, `list_historial`, `list_campos`, `save_campo`, `list_tags`, `save_tag`, `save_tag_grupo`,
`list_roles`, `save_rol`, `list_vocabulario`, `save_vocabulario`, `list_plantillas`, `apply_plantilla`, `list_responsables`, `export_contactos` (más `reportes/get_marca.php`, compartido por todos los reportes).
Oportunidades: `list_oportunidades` (`vista` lista o tablero, con resumen), `get_oportunidad`, `save_oportunidad`, `move_oportunidad`, `bulk_oportunidades`,
`list_notas`, `save_nota`, `export_oportunidades`; configuración: `get_config`, `save_config`, `list_embudos`, `save_embudo`, `save_etapa`, `list_motivos`,
`save_motivo`, `list_categorias_item`, `save_categoria_item`, `list_items`, `save_item`. `list_historial` acepta `tabla` (`crm_contactos` | `crm_oportunidades`).
Ventas: `list_ventas` (`vista` lista, clientes, items, categorias o meses; siempre con resumen), `get_venta`, `import_ventas` (`accion` simular, iniciar, bloque o
finalizar), `list_importaciones`, `revertir_importacion`, `list_import_plantillas`, `save_import_plantilla`, `export_ventas`.
Helpers en `backend/_lib/_crm.php` (los de campos y etiquetas sirven a contactos y oportunidades vía `crmEntidad`), `_crm_oportunidades.php`, `_crm_ventas.php`, `_historial.php` y `_reportes.php`. Todo con `db_prepare_or_fail`, respuesta
`{action, mensaje, data}` y guardado en transacción. `save_vinculo`/`remove_vinculo` están probados pero la UI v0 edita
los vínculos desde el formulario de la Organización.

## Frontend (`/m/crm/…`)

`contactos` (listado + filtros + lote), `contactos/:id` (perfil), `oportunidades` (tablero/lista), `oportunidades/:id` (ficha), `ventas` (análisis, detalle,
importaciones y asistente de importación), `configuracion` (L4: campos,
etiquetas, embudo, catálogo, roles, vocabulario y plantillas; cada pestaña se crea al abrirla). Diálogos: formulario de contacto, de oportunidad, de cierre,
selector de etiquetas (multi, agrupado, por destino), historial (contactos y oportunidades). Componentes reutilizables:
`app-contacto-picker` (buscador con autocompletado de un tipo de contacto), `app-item-picker` (ítems del catálogo), `app-campos-form` (campos personalizados),
`app-tag-chip`, `app-date-input`, `app-export-menu` (botón Exportar). `CrmConfigService.money()` formatea montos con la moneda de la empresa.
Lectura de archivos: `services/import/import-parse.ts` (funciones puras con pruebas; ExcelJS solo al abrir un `.xlsx`).
`DialogService.confirm` gana `confirmWord`.

## Cómo probarlo en local

Migraciones 001–006 + `database/dev-seed-crm.sql` (solo desarrollo, **no** se despliega: usuarios con token conocido,
61 personas y 20 organizaciones ficticias, con jerarquía y roles, config de los tres pilotos; el embudo y el catálogo se crean aplicando una plantilla
desde *Ajustes → Plantillas*). Login de prueba en dev:
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
| **A** ✅ | **Oportunidades**: un embudo por empresa configurable (tablas listas para varios), etapas con probabilidad y tipo abierta/ganada/perdida, motivos de cierre; tablero (arrastrar con `@angular/cdk`) + lista; catálogo de ítems (producto/servicio/tratamiento) y líneas por oportunidad; notas; etiquetas y campos personalizados también para oportunidades; vocabulario `oportunidad` e `item`; visibilidad igual que contactos (L2 archiva y ve historial, L4 configura). Migración `005`. |
| **B** ✅ | **Ventas importadas** por Excel/CSV: `crm_ventas` + líneas + lotes revertibles + plantillas de mapeo de columnas; la organización se identifica por NIT o código de cliente; pestaña «Ventas» en el perfil de la organización. El navegador lee el archivo y envía bloques al servidor. Migración `006`. |
| **C** | **Metas paramétricas** (empresa → sede → organización): métricas configurables (ventas en monto o cantidad, filtro por ítem o categoría, oportunidades ganadas, clientes con compra), períodos, avance y «esperado a la fecha»; panel superior en Oportunidades. La meta de la empresa suma las sedes de la empresa y muestra **solo el agregado** a todo el CRM (excepción documentada al aislamiento por sede). Migración `007`. |

Las ventas y las metas viven dentro del CRM; sus tablas se piensan para que un futuro módulo de Ventas/Facturación escriba en las mismas.

## Decisiones

| Fecha | Decisión |
|---|---|
| 2026-09-25 | Reportes PDF/Excel **en el navegador** con carga diferida (`jspdf`, `jspdf-autotable`, `exceljs`), un `ReportSpec` común y la marca del cliente; el logo llega por `reportes/get_marca.php` (sin configurar CORS en R2) |
| 2026-09-25 | Toda lista o panel del CRM lleva «Exportar»; la exportación de datos personales se audita (`crm_exportar` en `le_H_admin`) y tiene topes (Excel 20.000 filas, PDF 2.000) |
| 2026-09-25 | Ventas: el navegador lee el archivo y manda bloques ya agrupados; revisión completa en el servidor con transacción revertida antes de guardar; cada carga es un lote revertible (lógico) |
| 2026-09-25 | Cliente por documento (solo dígitos, con y sin DV), nombre exacto o campo personalizado; duplicados por número de documento con «dejar» o «reemplazar»; importar y revertir = L2 |
| 2026-09-25 | Estado de una oportunidad = tipo de su etapa; cerrar exige motivo solo si la empresa tiene motivos activos; valor = suma de líneas o valor escrito |
| 2026-09-25 | Campos y etiquetas con destino «oportunidad» en tablas espejo (`crm_oportunidad_valores`/`_tags`); los helpers se generalizan con `crmEntidad` |
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
1. **Metas (fase C)**: plan aprobado, ver *Hoja de ruta*. Actividades y cotizaciones: por definir.
1b. Ventas: reactivar automáticamente lo que un lote revertido había reemplazado; leer `.xls` antiguos; cerrar solos los lotes «En proceso» abandonados
   (hoy se revierten a mano); ventas creadas a mano (hoy solo por archivo; llegarán con Pedidos/Facturación).
2. **Orden por columna** en el listado (el backend ya lo soporta: `orden`, `dir`).
3. **Datos personales**: autorización de tratamiento por contacto; en la clínica, la historia clínica queda fuera del CRM.
4. **Purga del historial** (política de retención a largo plazo, si se necesita).
5. ~~Exportar contactos (Excel/PDF)~~ ✅ 2026-09-25. Falta **importar** contactos desde Excel/CSV (se puede reutilizar `import-parse.ts` y el patrón simular/lotes de ventas).
6. Etiquetas con `aplica_a` restringido que ya están asignadas al tipo contrario: hoy se conservan.
7. Plantillas y nombres por defecto solo en español/inglés; los textos de las plantillas (campos, etiquetas) son en español.
8. Jerarquía: hoy el filtro «Pertenece a» trae solo los dependientes directos (no todo el árbol).
