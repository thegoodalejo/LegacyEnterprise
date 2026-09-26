# Módulo Comunicaciones — definición y estado

> Documento vivo del módulo **Comunicaciones** (código `comunicaciones`, rutas `/m/comunicaciones/…`, tablas `com_*`): los canales de
> comunicación de una empresa con sus clientes, empezando por **WhatsApp Business (Cloud API de Meta)**. Reemplaza a LegacyChats
> (`F:\Proyectos\LegacyChats`), reconstruido aquí con las convenciones de LegacyEnterprise (sin migrar datos: no tenía clientes activos).
>
> **Estado (2026-09-26):** fases **E0–E5 construidas y probadas** (bandeja, chatbot, plantillas, campañas, créditos, contactos y etiquetas
> compartidos con el CRM). **Para usar WhatsApp de verdad falta un paso del dueño en la VPS** (llave `COM_SECRET_KEY` y cron del worker, ver
> *Operación*) y dar de alta la app de Meta y la línea (*Puesta en marcha*). E6 (archivar LegacyChats) espera su confirmación para apagar esa
> infraestructura.

**Contenido:** Objetivo · Decisiones del dueño · Glosario · Mapa del módulo · Contactos, etiquetas y notas compartidos · Modelo de datos ·
WhatsApp (webhook, worker, envío, errores, estados) · Créditos y precios de Meta · Bandeja · Chatbot (palabras de activación, flujos, acciones,
editor, simulador) · Plantillas · Campañas · Bajas de marketing · Permisos · API · Frontend · Seguridad · Puesta en marcha de un cliente ·
Operación · Cómo probarlo · Integración con otros módulos · Hoja de ruta · Decisiones · Pendientes.

## Objetivo

Que una empresa atienda y le escriba a sus clientes por WhatsApp desde la misma suite donde vive su libreta de contactos:

- **Bandeja** compartida por los asesores de la sede: cola, «mis chats», todas, chatbot y cerradas; hilo con palomitas, medios, respuestas de
  botones; respuestas rápidas con `/atajo`; notas del contacto; transferir, devolver a la cola y cerrar.
- **Chatbot** que atiende **solo** cuando el cliente escribe una **palabra de activación**: varios flujos, «ir a otro flujo» (menús), preguntas
  que capturan datos, condiciones y **acciones** (etiquetar, guardar un dato en el contacto, avisar al equipo, crear una oportunidad del CRM).
  Editor visual con simulador.
- **Plantillas** de Meta con un constructor de una sola pantalla, vista previa tipo WhatsApp y **revisión de la categoría mientras se escribe**
  (reglas propias); aviso cuando Meta la reclasifica.
- **Campañas** a una audiencia sacada de las **etiquetas**, de todos los contactos o de una **selección de Contactos**; estimación de créditos,
  envío de prueba, programación, pausa, reporte en vivo (entregados, leídos, respuestas, clics) y exportación.
- **Créditos** en unidades que se descuentan con el costo real que Meta reporta por cada mensaje entregado.

Un cliente que solo quiere el chatbot compra **solo Comunicaciones**; si después compra CRM, se le activa y ve los mismos contactos, sin migrar.

## Decisiones del dueño

1. **Nombre** «Comunicaciones» («Communications»). Canales: WhatsApp primero; correo, SMS, etc. a futuro en el mismo módulo.
2. **Contactos y etiquetas compartidos con el CRM**: «Contactos» aparece en el menú de los dos módulos; son los mismos `crm_contactos`, las mismas
   etiquetas (`crm_tags`), campos personalizados, roles y vocabulario. Sin CRM, el perfil oculta las tarjetas de oportunidades, ventas y metas.
3. **Créditos en unidades**: utilidad, servicio y autenticación = **1**, marketing = **20** (tarifas editables por L5). Paquetes desde **1.000**.
   Bolsa **de la empresa** (la consumen las sedes que lo elijan) **y/o** bolsa **propia de cada sede**.
4. Se descuenta **todo lo que Meta cobre** (dato real de cada estado de mensaje). **Sin saldo, los envíos se detienen con aviso.**
5. Línea gráfica de **LegacyEnterprise** (tokens de marca blanca y `ui-standards`), no la de LegacyChats.
6. **Plantillas**: constructor mucho mejor; **revisión de categoría con reglas propias** (sin IA) antes de enviar a Meta y **aviso cuando Meta la
   reclasifica**; el botón de enlace usa **solo la URL de seguimiento del sistema**, visible y explicada al agregarlo.
7. **Chatbot por palabras de activación** (mensaje exacto, empieza por, contiene); **varios flujos**; un flujo puede **saltar a otro** (menú principal).
8. **Acciones del chatbot** como punto de extensión para Agenda, Servicios y Pedidos; con Comunicaciones sola solo se ofrecen las propias.
9. Comunicaciones **convive** con el módulo `integraciones` (canales de mensajería vs. sistemas externos).

## Glosario

| Término | Significado |
|---|---|
| **App de Meta** | La app de Meta for Developers que recibe los webhooks (una puede servir a varios clientes). Tiene *app secret* y *verify token*. |
| **WABA** | WhatsApp Business Account: agrupa números y plantillas de un negocio en Meta. |
| **Línea** | Un número de WhatsApp de una sede (`phone_number_id` de Meta + token). Una sede puede tener varias. |
| **Conversación** | El hilo entre una línea y un número de WhatsApp (`wa_id`). Una por pareja línea–número; se reabre cuando el cliente vuelve a escribir. |
| **Ventana de 24 h** | Tiempo desde el último mensaje del cliente en el que se le puede escribir texto libre. Fuera de ella, solo plantillas. |
| **Plantilla** | Mensaje aprobado por Meta (marketing, utilidad o autenticación). Única forma de escribir primero o después de 24 h. |
| **Crédito** | Unidad de saldo. Un mensaje que Meta cobra descuenta los créditos de su categoría (`com_tarifas`) al entregarse. |
| **Bolsa** | Billetera de créditos: de la empresa o de una sede. Cada sede elige de cuál gasta (`com_config_sede.fuente_creditos`). |
| **Palabra de activación** | Palabra o frase que inicia un flujo del chatbot (`com_flujo_disparadores`). |
| **Acción** | Paso del chatbot que hace algo en el sistema; la aporta un módulo contratado (`backend/<modulo>/_acciones_bot.php`). |
| **Baja** | Número que pidió no recibir marketing (`com_bajas`): «BAJA», «STOP» o el error 131050 de Meta. |

## Mapa del módulo

Menú `/m/comunicaciones/…` (cada ítem según permisos; `app-modules.ts`):

| Ítem | Ruta | Quién | Qué hay |
|---|---|---|---|
| Bandeja | `bandeja` (`?c=<id>` abre una) | acceso al módulo | Vistas cola / mis chats (todos) y todas / chatbot / cerradas (L2+); hilo, compositor, panel del contacto |
| Chatbot | `chatbot`, `chatbot/:id` (`nuevo`) | L2+ | Flujos con sus palabras; editor visual y simulador |
| Plantillas | `plantillas` (`?p=<id>`), `plantillas/:id` (`nueva`, `?duplicar=<id>`) | L2+ | Lista por estado; constructor con vista previa y revisión de categoría |
| Campañas | `campanas`, `campanas/:id` (`nueva`) | L2+ | Lista; asistente en borrador; reporte en vivo una vez lanzada |
| Contactos | `contactos`, `contactos/:id` | acceso al módulo | **Las mismas pantallas del CRM** (`data.base`), sin las tarjetas de CRM si la sede no lo tiene |
| Créditos | `creditos` | acceso al módulo (movimientos L2+) | Saldo, costo por mensaje, consumo del mes, movimientos exportables, transferir (L4) |
| Ajustes | `configuracion` | L4+ | Fuente de créditos, chatbot (asesor, sesión, sin coincidencia), cierre, respuestas de equipo y las pestañas compartidas con el CRM |

Plataforma (L5, menú de Inicio): **WhatsApp (plataforma)** en `/admin/comunicaciones` — apps de Meta, líneas, bolsas (recargas y ajustes) y tarifas.

Con **un solo módulo** en la sede, la primera entrada a Inicio va directo a él (`home.page.ts`, una vez por sesión de la app; volver a Inicio por
el logo muestra los accesos de administración).

## Contactos, etiquetas y notas compartidos

- **Backend:** `requireModuloAlguno(['crm','comunicaciones'])` (`auth.php`) y `crmContext(CRM_MODULOS_CONTACTOS)` (`_lib/_crm.php`) en los
  endpoints de contactos (`list/get/save_contacto`, `bulk_contactos`, `export_contactos`, `set_contacto_tags`, `save/remove_vinculo`,
  `list_historial`), etiquetas (`list_tags`, `save_tag`, `save_tag_grupo`), campos (`list/save_campo`), roles (`list/save_rol`), vocabulario
  (`list/save_vocabulario`), `list_responsables`, `get_config`, plantillas por nicho (`list/apply_plantilla`) e **importar contactos**
  (`import_contactos`; `list_importaciones`, `list/save_import_plantilla` con `tipo=contactos`; `revertir_importacion` de un lote de contactos).
  Oportunidades, ventas, metas, embudo, catálogo y métricas siguen exigiendo `crm` (probado: una sede solo-Comunicaciones recibe 403).
- **Frontend:** las rutas `m/comunicaciones/contactos(/:id)` cargan `contactos.page.ts` y `contacto-perfil.page.ts` con `data.base`
  (input `base`) para que los enlaces se queden en el módulo. En el perfil: `#profile-opps`, `#profile-sales`, `#profile-goals` solo con
  `hasModule('crm')`; **«Conversaciones de WhatsApp»** (`#profile-conversations`) con `hasModule('comunicaciones')`, con «Enviar WhatsApp»
  (plantilla). En la barra de selección de Contactos, **«Campaña de WhatsApp»** (L2+ con el módulo) lleva la selección (o «todos los resultados
  del filtro») a una campaña nueva (`CampanaHandoffService`).
- **Ajustes:** las pestañas de etiquetas y campos se extrajeron a `crm-tags-tab.component.ts` y `crm-campos-tab.component.ts` (con sus diálogos)
  y las usan los Ajustes de los dos módulos; sin CRM no se ofrece «Oportunidades» como destino.
- **WhatsApp → contacto:** columna generada `crm_contactos_personas.whatsapp_e164` = indicativo + número (índice `idx_crm_p_wa`). Un mensaje de un
  número desconocido crea una **Persona** con el nombre del perfil de WhatsApp (sin exigir campos obligatorios; indicativo según el plan E.164:
  1 y 7 de un dígito, la lista de dos dígitos de la ITU y el resto de tres). Si hay varias Personas con el mismo número se usa la activa más antigua.
- **Notas del contacto** (`crm_contacto_notas`, migración 011): tarjeta «Notas» en el perfil (los dos módulos) y en el panel de la bandeja
  (queda asociada a la conversación, `origen = comunicaciones`). Editar o eliminar: su autor o L2+. Endpoints `crm/list_contacto_notas.php`,
  `crm/save_contacto_nota.php` (acceso a contactos).
- **Historial sin usuario:** `le_H_registros.id_usuario` admite NULL (010); `auditRegistroSistema()` registra lo que hace el webhook, el worker o el
  chatbot (contacto creado por WhatsApp, etiqueta o dato guardado por el bot, oportunidad creada por el bot) con `detalle.origen`. El diálogo de
  historial lo muestra como **«Sistema · WhatsApp»** o **«Sistema · chatbot»**.

## Modelo de datos

Prefijo `com_`, auditoría estándar (`created_at/updated_at`, `created_by/updated_by` → `le_usuarios ON DELETE SET NULL`), borrado lógico donde aplica.

**Migración `010_comunicaciones_base.sql`** (E1): fila `('comunicaciones','Comunicaciones',25)` en `le_modulos` (la sede semilla 1 la recibe, como
en la 002); `whatsapp_e164`; `le_H_registros.id_usuario` NULL; y:

| Tabla | Ámbito | Contenido |
|---|---|---|
| `com_meta_apps` | plataforma | Nombre, `app_id` (único), **`app_secret_enc`, `verify_token_enc` cifrados**, versión de Graph (`v23.0` por defecto), activo |
| `com_lineas` | sede | App, nombre, teléfono visible, **`phone_number_id` único**, `waba_id`, **`access_token_enc` cifrado** + `token_ultimos4`, nombre verificado, calidad, nivel de mensajes, `verificada_at`, `suscrita_at`, último error, activo |
| `com_config_sede` | sede | `fuente_creditos` (sede/empresa), `palabras_asesor`, `sesion_minutos`, `sin_coincidencia` (bandeja/mensaje/flujo), su texto y el flujo de respaldo, textos de transferencia y cierre, `enviar_texto_cierre` |
| `com_conversaciones` | sede | Línea, contacto, `wa_id`, nombre del perfil, estado `bot/cola/atencion/cerrada`, asignado, flujo y nodo en curso, **variables** (JSON), `bot_actividad_at`, `ultimo_entrante_at` (ventana), último mensaje (fecha, id, resumen), no leídos, cierre; único (línea, `wa_id`) |
| `com_mensajes` | sede | Conversación, dirección, origen (`contacto/bot/asesor/campana/sistema`), tipo, texto, contenido JSON, medio en R2 privado, **`wa_message_id` único**, contexto, estado, error, **categoría y cobrable (de `pricing`), créditos, bolsa, `cobrado_at`**, usuario, campaña, fechas de envío/entrega/lectura |
| `com_entrantes` | línea | Cola del webhook: `tipo` mensaje/estado, `clave` (wamid o wamid:estado), payload, estado, intentos, `procesar_desde`; único (línea, tipo, clave) = **deduplicación** |
| `com_tarifas` | plataforma | Categoría de Meta → créditos: `marketing` 20, `utility` 1, `authentication` 1, `service` 1, `*` 1 |
| `com_billeteras` | empresa o sede | Saldo (puede quedar negativo por mensajes en vuelo), `base_alerta`, `alerta_nivel`; `ambito_ref` generado (`e<id>`/`s<id>`) único |
| `com_movimientos` | bolsa | `recarga`, `consumo` (**agregado por bolsa, sede, día y categoría**, con `cantidad`), `ajuste`, `transferencia` (con contraparte); créditos con signo, saldo después, referencia |

**`011_comunicaciones_bandeja.sql`** (E2): `com_respuestas_rapidas` (sede; `id_usuario` NULL = de equipo; atajo, título, texto, activo) y
`crm_contacto_notas`.

**`012_comunicaciones_chatbot.sql`** (E3): `com_flujos` (nombre, descripción, `activo` = encendido, `borrado`, **`grafo` JSON**, `version`) y
`com_flujo_disparadores` (flujo, tipo `exacta/empieza/contiene`, texto y `texto_norm`, prioridad, línea opcional); FKs del flujo de respaldo y del
flujo en curso de una conversación.

**`013_comunicaciones_plantillas.sql`** (E4): `com_plantillas` (línea/WABA, nombre de Meta, idioma, `categoria_solicitada` y `categoria` actual de
Meta, `categoria_anterior`, `reclasificada_at`, estado, `meta_id`, motivo de rechazo, calidad, encabezado, cuerpo, pie, botones, variables con su
origen, revisión de categoría al enviarla, `origen` sistema/meta; único WABA+nombre+idioma) y `com_enlaces` (token de 24 hex por envío → destino,
clics).

**`014_comunicaciones_campanas.sql`** (E5): `com_campanas` (línea, plantilla, estado, audiencia JSON, valores, enlace de destino, medio del
encabezado, programación, total, créditos estimados, motivo de pausa, `reintentar_desde`), `com_campana_destinatarios` (contacto, `wa_id`,
estado, mensaje, error, intentos, `link_token`, respondió, clic; **único campaña + número**) y `com_bajas`.

**`015_comunicaciones_webhook_linea.sql`**: `com_lineas.webhook_numero` (URL alterna del número según Meta), `webhook_efectivo` (a dónde llegan
hoy sus mensajes) y `webhook_revisado_at` (ver *Convivencia con LegacyChats*).

Todas idempotentes (probadas aplicándolas dos veces) y compatibles con Linux (nombres `le_H_…` con su mayúscula).

## WhatsApp

### Webhook (`backend/comunicaciones/webhook.php?app=<id>`)

Público (sin sesión ni CORS). **Una URL por app de Meta**, así el *app secret* se conoce antes de validar la firma.

- **GET** (verificación): si `hub.mode=subscribe` y `hub.verify_token` coincide (`hash_equals`) con el de esa app, responde `hub.challenge` en
  **`text/plain`**; si no, 403. (PHP convierte los puntos del query string: se leen `hub_mode`, `hub_verify_token`, `hub_challenge`.)
- **POST**: valida `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256 del **cuerpo crudo** con el *app secret* (`hash_equals`). Sin firma, firma
  inválida o de otro secreto → 403 y nada se procesa. Sin *app secret* legible (falta la llave) → 500 y log. Luego (`_lib/_com_webhook.php`):
  - `messages`: solo para una línea **activa de esa app** (`phone_number_id`). Cada mensaje se **encola** en `com_entrantes` con el nombre del
    perfil (`INSERT IGNORE`: los reintentos de Meta no duplican). Cada estado se aplica al momento; si su mensaje aún no tiene `wa_message_id`
    (carrera con el envío) se encola como `estado` y el worker lo reintenta 3 veces (20, 40, 60 s) antes de darlo por ajeno.
  - `message_template_status_update`, `template_category_update`, `message_template_quality_update`: actualizan la plantilla y avisan.
  - `phone_number_quality_update`: calidad y nivel de la línea; con `FLAGGED`/`DOWNGRADE` avisa a los L4. `account_update`: al log.
- Responde `OK` y, si encoló mensajes, **despierta al worker** (`comDespertarWorker()`: `exec setsid php …/com_worker.php &`; en Windows no hace nada).

### Worker (`backend/cron/jobs/com_worker.php`)

- Solo CLI (`PHP_SAPI`), un solo worker a la vez (`GET_LOCK('com_worker_<bd>')`), con `authFailLanza` (una validación que falla no mata el proceso).
- Bucle hasta vaciar (máx. `COM_WORKER_SEGUNDOS`, 50 por defecto): `comProcesarCola()` (hasta 50 entrantes que ya tocan) y
  `comCampanasProcesar()`; con una vuelta vacía espera medio segundo por lo que llegue con el candado tomado y termina.
- Un entrante que falla se reintenta con espera creciente (30 s × intento) y a los 5 intentos queda `error`.
- Deja `logs/last_run_com_worker.json` (inicio, fin, segundos, entrantes, campañas, vueltas).

### Mensaje entrante (`comProcesarMensajeEntrante`, `_lib/_com_conversaciones.php`)

1. Conversación de (línea, `wa_id`) o nueva (con la Persona encontrada o creada); actualiza el nombre del perfil.
2. Mensaje (`INSERT IGNORE` por `wa_message_id`): texto, respuesta de botón o lista (`contenido.respuesta` con el id), botón de plantilla,
   medios (con `caption`, nota de voz), ubicación, contactos, reacción, no soportado; `referral` de anuncios.
3. Salvo reacciones: ventana (`ultimo_entrante_at`), resumen, no leídos; **una cerrada se reabre** en estado `bot` sin asignado ni flujo.
4. Medio → R2 privado (`sedes/{id}/comunicaciones/…`); si R2 no está configurado o Meta falla, `contenido.medio_error` con el motivo.
5. Marca «respondió» en las campañas de los últimos 7 días que le llegaron a esa conversación.
6. **«BAJA», «STOP», «DETENER»… (el mensaje completo)** registra la baja de marketing, responde la confirmación, deja una nota y, si estaba con el
   chatbot, la cierra; **«ALTA»** la revierte. No pasa al chatbot.
7. Si la conversación está en estado `bot`: **chatbot** (ver *Chatbot*).

### Envío (`comEnviar`, `_lib/_com_whatsapp.php`)

Payloads: texto (con vista previa de enlaces), botones (≤ 3, título ≤ 20), lista (≤ 10 filas, título ≤ 24, descripción ≤ 72, botón ≤ 20),
medio subido a Meta por id (`/media`), plantilla con componentes. Antes de enviar: línea activa con token, **ventana de 24 h** (salvo plantilla),
**saldo disponible** para la categoría (ver *Créditos*). El mensaje se guarda `pendiente` antes de llamar a Meta; con éxito guarda el `wamid` (el
«enviado» llega por webhook); con error queda `fallido` con el código y el motivo en español.

**Errores** (`comClasificarError`): *permanente* (100, 131008, 131009, 131021, 131026 no es usuario de WhatsApp, 131047 fuera de ventana, 131050 no
quiere marketing, 131051, 131052, 131053, 1320xx de plantillas, 133010, 470, 368, 190 token, 10, 200) · *límite* (HTTP 429, 4, 80007, 130429,
131048 spam, 131056 par de números) · *transitorio* (el resto). 131050 registra la baja.

### Estados de un mensaje

`pendiente(0) → enviado(1) → entregado(2) → leido(3)`; `fallido` es final. Un estado que llega tarde **no retrocede** («enviado» después de
«leído» se ignora); «leído» sin «entregado» completa las fechas anteriores; un «fallido» después de «leído» se ignora; nada revive a un fallido
**ni se cobra**. El cambio pasa al destinatario de la campaña si lo hay.

## Créditos y precios de Meta

**Qué cobra Meta** (revisado el 2026-09-25 en la documentación de precios de WhatsApp Business Platform):

- Desde el **1-jul-2025** Meta cobra **por mensaje de plantilla entregado** según su categoría y país.
- Desde el **1-oct-2026** Meta **también cobra los mensajes de servicio** (texto libre del bot y de los asesores dentro de las 24 h) y la
  utilidad dentro de la ventana, por mensaje entregado, a la tarifa de utilidad del país, sin descuento por volumen.
- Referencia Colombia (USD por mensaje): marketing ≈ 0,0125; utilidad y servicio ≈ 0,0008–0,003. Verificar en la calculadora oficial antes de
  fijar el precio de los paquetes: las tarifas cambian por trimestre.
- Cada estado trae `pricing: {billable, category, pricing_model, type}`: **esa es la fuente de verdad** del cobro.

**Cómo se descuenta** (`_lib/_com_creditos.php`):

1. **Antes de enviar**, `comPuedeEnviar($idSede, $categoria, $n)`: la bolsa que usa la sede debe tener **saldo disponible** ≥ tarifa × n, donde
   disponible = saldo − **reservado** (créditos de los mensajes enviados en las últimas 24 h que Meta aún no confirmó ni cobró: `pendiente` o
   `enviado`, cobrables). Así una campaña no gasta más de lo que hay aunque Meta cobre después. Sin saldo: la bandeja responde «Sin créditos»
   (402), el chatbot se detiene (la conversación pasa a la cola con la nota «Sin créditos: el chatbot se detuvo…») y una campaña queda
   `esperando_saldo` (se reanuda sola al recargar).
2. Con un estado que trae `pricing`: se guarda la categoría y `cobrable`; **si es cobrable y es entrega o lectura**, `comCobrar()` marca
   `cobrado_at` (idempotente: solo la primera vez), descuenta la tarifa de la bolsa y suma al **consumo del día** (bolsa, sede, día, categoría).
   `billable=false` no descuenta. Un mensaje fallido nunca se cobra.
3. **Alertas** a los L4 de las sedes que gastan de la bolsa (campanita + push): al bajar del 20 % y del 5 % del saldo de la última recarga, y a
   cero («Sin créditos de WhatsApp»). Cada nivel una vez; la siguiente recarga las reinicia.
4. El saldo puede quedar levemente negativo (mensajes en vuelo); nada más sale hasta recargar.

**Recargas y bolsas:** L5 recarga (≥ 1.000, con referencia) o ajusta (± con descripción obligatoria) la bolsa de una **empresa** o de una
**sede** (`/admin/comunicaciones` → Créditos). L4 elige la fuente de su sede (Ajustes) y **transfiere** entre la bolsa de la empresa y la de su
sede (Créditos → Transferir; valida el saldo de origen con `FOR UPDATE`). Todo queda en `com_movimientos`; recargas, ajustes, transferencias,
tarifas y cambio de fuente también en `le_H_admin`.

## Bandeja (E2)

- **Estados:** `bot` (lo atiende el chatbot) → `cola` (espera asesor) → `atencion` (asignada) → `cerrada`. Escribir desde la cola, el chatbot o una
  cerrada **toma** la conversación (queda en atención con quien escribe y el chatbot se detiene).
- **Vistas:** Cola y Mis chats (todos); Todas, Chatbot y Cerradas (L2+). Contadores en cada vista (Mis chats resaltado si hay sin leer).
  Búsqueda por nombre del contacto, del perfil o número; filtro por línea si hay varias. La primera vista es «Mis chats» si hay y la cola está vacía.
- **Hilo:** separadores por día, burbujas con hora y palomitas (reloj, ✓ enviado, ✓✓ entregado, ✓✓ en color leído, error con el motivo),
  formato de WhatsApp (*negrita*, _cursiva_, ~tachado~, enlaces), origen de cada saliente (Chatbot, Campaña, Sistema o el nombre del asesor),
  plantillas con su nombre y botones, opciones de botones/listas que envió el bot, respuestas elegidas por el cliente, medios con URL firmada
  (imágenes y stickers se cargan solos; audio, video y documentos al tocar; se pide otra URL si venció), ubicación con enlace a mapas, notas del
  sistema centradas (tomó, transfirió, cerró, sin créditos…). «Ver mensajes anteriores» pagina hacia atrás.
- **Compositor:** Enter envía (Shift+Enter salto de línea); `/` muestra las respuestas rápidas (de equipo y personales; Enter elige la primera);
  adjuntar archivo (imagen ≤ 5 MB; video, audio, documento ≤ 16 MB; tipos que acepta WhatsApp); «Enviar plantilla»; «Mis respuestas rápidas».
  Fuera de la ventana de 24 h el compositor se reemplaza por el aviso y el botón de plantilla; dentro, se muestra cuánto falta para que venza.
- **Acciones:** Tomar; Transferir (a una persona con acceso al módulo, con push) o Devolver a la cola; Cerrar (el asignado o L2+; envía el
  mensaje de cierre si está activo en Ajustes y la ventana sigue abierta; si falla, igual cierra y lo avisa).
- **Panel del contacto:** datos, nombre en WhatsApp, etiquetas (editar con el mismo selector de Contactos), **datos que capturó el chatbot** y notas.
- **Tiempo real:** *polling* liviano con la pestaña visible: la lista cada 5 s y el hilo cada 4 s (`desde_id` + `desde` = lo nuevo y lo que cambió
  de estado); marcar leída avisa a WhatsApp (palomitas azules para el cliente). Push al que recibe una transferencia y a los usuarios del
  módulo cuando una conversación entra a la cola.

## Chatbot (E3)

### Palabras de activación

- Por flujo, varias (máx. 30): **mensaje exacto**, **empieza por** o **contiene** (palabra o frase completa), comparadas **sin tildes,
  mayúsculas ni signos** (`comNormalizar`; la ñ se conserva); prioridad; línea opcional.
- Solo se evalúan con la conversación en estado `bot` **sin flujo en curso** (o con la sesión vencida: `sesion_minutos` sin actividad del bot).
- Gana la mayor prioridad; a igual prioridad, la de una línea específica, luego exacta > empieza > contiene, luego el texto más largo.
- Una palabra no puede activar dos flujos **encendidos** (mismo tipo y texto en las mismas líneas): el guardado responde 409 con el nombre del otro flujo.
- **Sin coincidencia** (Ajustes): **bandeja** (por defecto: no responde y la deja en la cola), **mensaje** (responde un texto fijo y sigue en
  `bot`, así la siguiente palabra funciona) o **flujo** (inicia el flujo de respaldo; no se puede eliminar mientras sea el respaldo).
- **Palabras para pedir asesor** (Ajustes; por defecto «asesor, agente, humano»): en cualquier punto pasan a la cola, con el mensaje de
  transferencia si hay.

### Flujos y pasos

El grafo (`com_flujos.grafo`) se guarda entero y el servidor lo valida (`comBotValidarGrafo`): un solo inicio, ids únicos, datos de cada paso,
salidas existentes, una conexión por salida, ninguna vuelve al inicio (para repetir un menú se usa «Ir a otro flujo»), máx. 200 pasos.
Guardar devuelve **avisos** (no bloquean): pasos a los que no se llega y opciones de botones/listas sin destino. Hay control de versión: si otra
persona guardó el flujo mientras se editaba, 409.

| Paso | Qué hace | Salidas |
|---|---|---|
| Inicio | Punto de entrada | Siguiente |
| Mensaje | Texto (≤ 4096) con `{{variables}}` | Siguiente |
| Botones | Texto (≤ 1024) + 1 a 3 botones (≤ 20), encabezado y pie opcionales; espera | Una por botón + Otra respuesta |
| Lista | Texto + botón (≤ 20) + 1 a 10 opciones (≤ 24, descripción ≤ 72); espera | Una por opción + Otra respuesta |
| Pregunta | Pregunta y guarda la respuesta en una variable; validación texto, número, correo, fecha o teléfono; opcional guardarla en el contacto (nombre, correo, documento o campo personalizado de Personas); reintentos (0–5) con su texto | Siguiente (válida), No válida |
| Condición | Última respuesta, `contacto.*` o una variable: igual, distinto, contiene, empieza, tiene valor, vacío, mayor, menor | Sí, No |
| Acción | Ejecuta una acción del registro con su configuración | Las de la acción (siempre Bien y Error) |
| Pasar a asesor | Mensaje opcional (o el de Ajustes) y cola | — |
| Ir a otro flujo | Salta al inicio de otro flujo (activo) | — |
| Fin | Mensaje opcional; la conversación queda en `bot` sin flujo | — |

Respuestas a botones y listas: por el id de la respuesta interactiva (`<paso>|<opción>`), por el **título escrito** o por su **número** (1, 2, 3…).
Si no coincide: «Otra respuesta» si está conectada; si no, «Por favor elige una de las opciones» y se reenvía el menú (2 veces) y después pasa a
la cola. Una pregunta inválida agota sus reintentos y sale por «No válida» (o a la cola si no está conectada).

Variables en textos: `{{contacto.nombre}}`, `{{contacto.primer_nombre}}`, `{{contacto.telefono}}`, `{{contacto.correo}}`, `{{sede.nombre}}` y
las capturadas (`{{ciudad}}`) o que deja una acción (`{{id_oportunidad}}`). Las internas empiezan con `_` y no se muestran. Tope de **25 pasos
seguidos** por mensaje (evita ciclos sin preguntas: el bot se detiene y la conversación pasa a la cola con la nota). Lo capturado se ve en el
panel de la bandeja («Datos que capturó el chatbot»).

### Acciones (punto de extensión)

`_lib/_com_acciones.php` carga las acciones de `backend/*/_acciones_bot.php` (Apache no sirve archivos que empiezan con `_`) y ofrece en el editor
solo las de los módulos **contratados** por la sede (Comunicaciones siempre). El servidor rechaza al guardar una acción no disponible.

```php
comRegistrarAccion([
  'codigo'   => 'agenda.agendar_cita',               // <modulo>.<accion>, único
  'modulo'   => 'agenda',                             // se ofrece si la sede lo tiene contratado
  'nombre'   => 'Agendar una cita', 'descripcion' => '…',
  'config'   => [['clave' => 'id_recurso', 'tipo' => 'entero', 'etiqueta' => 'Recurso', 'requerida' => true]],
  'entradas' => [['clave' => 'fecha', 'tipo' => 'fecha', 'requerida' => true]],   // variables que el flujo debe haber capturado
  'salidas'  => ['id_cita', 'resumen'],               // variables que deja en la conversación
  'puertos'  => ['ok', 'sin_disponibilidad', 'error'],
  'ejecutar' => fn(array $ctx, array $vars, array $config): array => ['puerto' => 'ok', 'variables' => [...]],
]);
```

- Tipos de config que el editor sabe pintar: `texto` (admite `{{variables}}`), `texto_largo`, `entero`, `variable`, `etiqueta`, `usuario`,
  `campo_contacto`, `embudo_etapa` (CRM) y `opcion` (con `opciones`). El servidor valida la config con ese esquema (`comValidarConfigAccion`).
- `$ctx`: `conn`, `id_sede`, `id_empresa`, `id_contacto`, `id_conversacion`, `simulacion` (en «Probar» no se escribe nada), `contacto`, `sede_nombre`.
- Una acción **no envía mensajes**: devuelve variables y el flujo decide qué decir. Una excepción o un puerto desconocido salen por `error`
  (`_error` con el motivo); `authFail` dentro de una acción lanza en vez de responder.

**Acciones incluidas:** `comunicaciones.etiquetar` (agregar/quitar una etiqueta de Personas o de ambos), `comunicaciones.guardar_dato` (variable →
nombre, correo, documento o campo personalizado; sale por «inválido» si el valor no sirve), `comunicaciones.notificar` (a una persona, a todo el
equipo del módulo o a los L4; texto con variables), `crm.crear_oportunidad` (solo con CRM: etapa abierta, título con variables, valor opcional desde
una variable como «1.500.000»; deja `id_oportunidad`; historial «Sistema · chatbot»). Previstas para otros módulos: `agenda.agendar_cita`,
`agenda.agendar_visita`, `servicios.programar_mantenimiento`, `pedidos.solicitar_pedido`, `pedidos.estado_pedido`.

### Editor y simulador

- **Lienzo** con puntos, pasos de ancho fijo que se arrastran por el título (rejilla de 8 px), salidas a la derecha con su etiqueta (el título del
  botón u opción) y conexiones como curvas; para conectar se arrastra desde el círculo de una salida hasta otro paso (reemplaza la conexión de
  esa salida); tocar una conexión la selecciona y muestra el botón para quitarla; Supr/Retroceso borra lo seleccionado; **Ctrl+Z** deshace (60
  estados; escribir en un paso se confirma tras una pausa). Zoom de 40 % a 160 %.
- **Paleta** con los tipos de paso (con su ayuda); un paso nuevo aparece en el centro visible.
- **Panel lateral:** propiedades del paso elegido (con «Insertar variable» en el cursor y contador de caracteres) o, sin selección, las **palabras
  de activación** (opciones avanzadas: prioridad y línea), la descripción y los avisos (clic lleva al paso).
- **Flujo nuevo:** arranca con una plantilla de bienvenida + menú de 3 botones (información, horarios, asesor) y la palabra «hola».
- **Guardado explícito;** el botón se habilita solo con cambios; salir con cambios pide confirmación (guard `canDeactivate` + `beforeunload`).
- **Probar:** chat simulado contra el grafo **sin guardar** (`probar_flujo.php`): «Iniciar este flujo» o escribir como el cliente (evalúa las
  palabras de todos los flujos, incluidas las del editor), botones y listas clicables, contacto de ejemplo opcional para `{{contacto.*}}`, notas de
  lo que pasaría (fin, asesor, sin coincidencia, error). No envía nada ni escribe datos.

## Plantillas (E4)

- **Lista** por estado (todas, aprobadas, en revisión, con problemas, borradores) con búsqueda: categoría y créditos por mensaje, idioma, calidad,
  **aviso de reclasificación**, motivo de rechazo, línea, fecha y autor. Sincronizar con Meta (`sync_plantillas.php`: por cada WABA de las
  líneas activas; actualiza estado/categoría/calidad, **importa las creadas fuera** —variables «a mano»— y marca «eliminada» lo que ya no está).
  Duplicar y eliminar (también en Meta; Meta no deja reutilizar el nombre 30 días; no se elimina si una campaña en curso la usa).
- **Constructor en una pantalla** (`plantilla-editor.page.ts`), con vista previa tipo WhatsApp siempre a la vista:
  1. Nombre (se muestra cómo queda en Meta: minúsculas sin tildes con `_`), idioma, línea/WABA y **categoría** como tarjetas con su costo
     (utilidad 1 crédito / marketing 20) y qué significa cada una.
  2. Encabezado: ninguno, texto (≤ 60, una variable) o imagen/video/documento con **archivo de ejemplo** (Meta lo pide; se sube con la subida
     reanudable de la app al enviar a revisión).
  3. Mensaje (≤ 1024) con barra de negrita/cursiva/tachado e **«Insertar variable»** (pone `{{n}}` siguiente en el cursor). Cada variable tiene su
     ficha: ejemplo (para Meta), de dónde sale el valor al enviar (primer nombre, nombre, teléfono, correo, campo personalizado, texto fijo o
     «se escribe al enviar») y un valor por defecto. Si la numeración queda desordenada, «Renumerar» la arregla.
  4. Pie (≤ 60, sin variables; sugerencia «Responde BAJA…» en marketing).
  5. Botones: hasta 3 de respuesta y 1 de enlace; el de enlace **muestra la URL de seguimiento** `{API}/comunicaciones/r.php?t={{1}}` y explica
     que el destino se elige en cada envío/campaña y que la base no cambia tras aprobarse. Se ordenan como exige Meta (respuestas primero).
- **Reglas de Meta que valida el servidor** (`comPlantillaParsear`): variables numeradas en orden sin saltos; en el cuerpo, ninguna al inicio ni al
  final, no pegadas y con suficiente texto (palabras ≥ 2 × variables + 1); ejemplos obligatorios; largo de cada parte; nombre + idioma únicos por
  WABA; nombre, idioma, cuenta y (si está aprobada) categoría fijos después de enviarla.
- **Revisión de categoría** (`_lib/_com_categoria.php`, `revisar_categoria.php`): el constructor la pide **mientras se escribe** (pausa de
  600 ms) y la muestra al lado de la vista previa; una sola fuente de reglas en el servidor (sin copia en TypeScript). Suma puntos por palabras
  promocionales (descuento, oferta, gratis, 2x1, cupón, «solo por hoy», equivalentes en inglés…), porcentajes, emojis de venta, muchos «!»,
  falta de referencia a una transacción (pedido, factura, cita, envío, cuenta, pago…), falta de variables y saludo genérico; resta si menciona
  una transacción con variables. **≥ 5 alto** (no deja enviar como utilidad: botón deshabilitado y el servidor responde 409 con la revisión;
  ofrece «Pedirla como marketing»), 3–4 medio, < 3 bajo. Es orientativa: la decisión es de Meta.
- **Enviar a revisión:** borradores y rechazadas se guardan primero y luego se crean o editan en Meta; una aprobada o pausada se edita enviando
  los cambios (Meta: 1 edición al día, 10 al mes). Si Meta responde con otra categoría, queda **reclasificada**.
- **Webhooks:** `APPROVED/REJECTED/PAUSED/DISABLED/FLAGGED/…` → estado, motivo, calidad y aviso (campanita + push) al creador y a los L4;
  `template_category_update` → **«Meta la clasificó como Marketing: cada envío cuesta 20 créditos en vez de 1»** (o la categoría que sea);
  si vuelve a la pedida, se quita la marca; calidad roja avisa.
- **Enviar una plantilla a un contacto** (bandeja fuera de ventana o «Enviar WhatsApp» del perfil; `send_plantilla.php`): solo aprobadas de la
  misma WABA; pide lo que el sistema no completa (variables «a mano», destino del enlace, archivo del encabezado); marketing a un número de baja
  → 409; quien la envía queda atendiendo la conversación; el enlace lleva su propio token.
- **Enlace de seguimiento** (`r.php`, público): token de 24 hex → cuenta el clic (y el del destinatario de campaña) y redirige 302 al destino
  guardado; token inválido → 404. Nunca redirige a una URL recibida por parámetro.

## Campañas (E5)

- **Lista** con avance y resultados (se actualiza sola mientras hay campañas en curso) y exportación PDF/Excel.
- **Borrador** (`campana.page.ts`): nombre, línea, plantilla aprobada (con categoría y créditos), audiencia (**etiquetas** —cualquiera/todas—,
  **todos los contactos con WhatsApp** o la **selección traída de Contactos**, más «incluir a la persona principal de cada organización»),
  contenido (variables «a mano», iguales para todos; enlace de destino; archivo del encabezado, que se sube a Meta y vale 30 días), cuándo
  (al lanzar o programada con fecha y hora). **Calcular** muestra destinatarios, cuántos se excluyen (sin WhatsApp, bajas, números repetidos),
  créditos necesarios frente al saldo disponible, cupo de 24 h de la línea y la vista previa con el primer destinatario. **Envío de prueba** a una
  Persona de la sede. **Lanzar** confirma, arma los destinatarios (únicos por número; token de enlace por destinatario), **exige saldo para
  todos** (402 si no alcanza) y la deja `enviando` o `programada`; si la audiencia cambió desde el cálculo, 409.
- **Envío** (worker, `comCampanasProcesar`): programadas que ya tocan → `enviando`; `esperando_saldo/cupo` se reintentan; lotes de 100 por
  campaña y vuelta, respetando el **cupo de 24 h** del nivel de la línea (250 / 1K / 2K / 10K / 100K / ilimitado; se cuentan los números con
  plantilla en 24 h) → `esperando_cupo` 30 min. Por destinatario: baja de marketing → omitido; sin saldo → `esperando_saldo` (aviso una vez;
  se reanuda sola); datos faltantes sin valor por defecto → omitido con el motivo; límite de Meta → espera 1 min; transitorio → 3 intentos;
  permanente → fallido. Una conversación nueva abierta por la campaña queda **cerrada** hasta que el cliente responde (entonces se reabre).
  Al terminar: `completada` y aviso al creador.
- **Reporte:** avance, KPIs clicables que filtran la tabla (destinatarios, enviados, entregados, leídos, respuestas, clics, fallidos, omitidos,
  pendientes, créditos consumidos), motivos de fallo agrupados, destinatarios con búsqueda y exportación PDF/Excel con la marca del cliente
  (la primera página deja `com_exportar_campana` en `le_H_admin`). Pausar, reanudar y cancelar (los pendientes quedan omitidos).

## Bajas de marketing

`com_bajas` por sede y número: se registran con «BAJA»/«STOP»/… (mensaje completo), con el error 131050 de Meta en un envío o un estado. No
reciben campañas ni plantillas de marketing (las de utilidad sí). «ALTA» las quita.

## Permisos

| Acción | Quién |
|---|---|
| Bandeja (cola, mis chats, responder, tomar, transferir/cerrar la propia), contactos, asignar etiquetas, notas, enviar plantilla, saldo | Acceso al módulo (L4 o privilegio `comunicaciones`) |
| Ver todas las conversaciones, gestionar las de otros, chatbot, plantillas, campañas, respuestas de equipo, movimientos de créditos | **L2+** |
| Ajustes de la sede, catálogo de etiquetas/campos/roles/vocabulario, fuente de créditos, transferir entre bolsas | **L4+** |
| Apps de Meta, líneas y tokens, tarifas, recargas y ajustes | **L5** |

Todo se valida en el backend (`comContext()` = `requireModulo('comunicaciones')`, `requireRole`, `requirePlatformAdmin`, y
`comConversacionAcceso()` para ver/escribir/gestionar una conversación). El frontend solo oculta.

## API (`backend/comunicaciones/`)

| Endpoint | Permiso | Qué hace |
|---|---|---|
| `webhook.php?app=<id>` | público firmado | Verificación y eventos de Meta |
| `r.php?t=<token>` | público | Cuenta el clic y redirige al destino guardado |
| `list_apps`, `save_app` | L5 | Apps de Meta (secretos cifrados; nunca se devuelven; URL del webhook) |
| `list_lineas`, `save_linea`, `probar_linea` | L5 | Líneas; probar conexión (Graph: nombre verificado, calidad, nivel) + suscribir la WABA + a dónde llegan sus mensajes (informativo) |
| `webhook_linea` | L5 | `accion` ver / activar / quitar: webhook alterno del número en Meta (recibir aquí sus mensajes aunque la app apunte a otro sistema) |
| `list_billeteras`, `recargar`, `list_tarifas`, `save_tarifa` | L5 | Bolsas de todas las empresas/sedes, recargas y ajustes, tarifas |
| `list_lineas_sede` | módulo | Líneas activas de la sede (sin datos sensibles) |
| `get_config`, `save_config` | L4 | Ajustes (lo que no viene en el POST se conserva) |
| `get_saldo` | módulo | Bolsa en uso, porcentaje, consumo del mes, tarifas (L4: ambas bolsas) |
| `list_movimientos` | L2 | Movimientos (bolsa actual; L4 elige sede/empresa); en la bolsa de la empresa, L2/L3 ven solo el consumo de su sede |
| `transferir` | L4 | Entre la bolsa de la empresa y la de la sede |
| `list_conversaciones`, `get_conversacion`, `marcar_leida`, `tomar`, `send_mensaje`, `send_media`, `get_media`, `transferir_conversacion`, `cerrar` | módulo | Bandeja (vistas todas/bot/cerradas: L2+) |
| `list_respuestas`, `save_respuesta`, `list_usuarios_modulo`, `list_conversaciones_contacto` | módulo | Respuestas rápidas (de equipo: L2+), destinos de transferencia, tarjeta del perfil |
| `list_flujos`, `get_flujo`, `save_flujo`, `list_acciones`, `probar_flujo` | L2 | Chatbot |
| `list_plantillas` (con `enviables=1`: módulo), `get_plantilla`, `save_plantilla`, `revisar_categoria`, `enviar_plantilla`, `delete_plantilla`, `sync_plantillas` | L2 | Plantillas |
| `send_plantilla` | módulo | Enviar una plantilla a una conversación o a un contacto |
| `list_campanas`, `get_campana`, `save_campana`, `estimar_campana`, `media_campana`, `prueba_campana`, `lanzar_campana`, `estado_campana`, `list_destinatarios` | L2 | Campañas |

En `backend/crm/`: `list_contacto_notas`, `save_contacto_nota` (acceso a contactos) y `_acciones_bot.php` (acciones del CRM).
Respuesta estándar `{action, mensaje, data}` (`crmOk` / `authFail`); 402 = sin créditos.

Bibliotecas (`backend/_lib/`): `_com.php` (contexto, líneas, usuarios del módulo, bajas, URL pública), `_com_crypto.php`, `_com_whatsapp.php`
(Graph, payloads, errores, medios), `_com_creditos.php`, `_com_conversaciones.php` (entrantes, envío, estados), `_com_webhook.php` (eventos y
cola), `_com_bandeja.php` (permisos y formato), `_com_bot.php` (validación, disparadores, motor), `_com_acciones.php`, `_com_categoria.php`,
`_com_plantillas.php`, `_com_campanas.php`.

## Frontend (`frontend/src/app/`)

- `services/comunicaciones.service.ts` (tipos y llamadas); `CrmService.listNotasContacto/saveNotaContacto`.
- `pages/comunicaciones/`: `bandeja.page.ts` (+ `bandeja-hilo`, `bandeja-panel`, `com-media`, `respuestas-editor`), `enviar-plantilla-dialog`,
  `contacto-conversaciones` (tarjeta del perfil), `chatbot.page.ts`, `flujo-editor.page.ts` (+ `flujo-modelo.ts`, `flujo-nodo-form`,
  `flujo-simulador`), `plantillas.page.ts`, `plantilla-editor.page.ts`, `wa-preview` y `wa-format.ts` (formato WhatsApp seguro: escapa y luego
  da formato), `campanas.page.ts`, `campana.page.ts`, `campana-handoff.service.ts`, `creditos.page.ts`, `com-config.page.ts`.
- `pages/admin/comunicaciones-admin.page.ts` (L5); `components/contacto-notas.component.ts`; `pages/crm/crm-tags-tab` y `crm-campos-tab`.
- Rutas con `data: { modulo: 'comunicaciones' }` (+ `minRole`), resolver del vocabulario en todas y `canDeactivate` en los editores.
- i18n `com.*`, `nav.com.*`, `notes.*` (es/en).

## Seguridad

- **Secretos cifrados** con AES-256-GCM (`_lib/_com_crypto.php`, formato `v1:` + base64 de iv·tag·texto): *app secret*, *verify token* y *access
  token*. Llave `COM_SECRET_KEY` (32 bytes en base64, **distinta por entorno**) en el `.env` de la VPS y en el `environment:` del compose. Sin llave,
  guardar un secreto responde 500 «Falta COM_SECRET_KEY…», la pantalla de plataforma lo avisa y los envíos fallan con ese motivo. Los secretos
  **nunca** vuelven al frontend (solo «configurado» y los últimos 4 del token).
- Webhook con firma obligatoria (tiempo constante) y solo para líneas activas de esa app. Tokens de Graph solo en el encabezado `Authorization`.
- Medios en el bucket **privado** de R2 con URL firmada de 5 minutos, previa verificación de sede y permiso sobre la conversación.
- `r.php` solo redirige al destino guardado (no es un *open redirect*); los destinos deben ser `http(s)` válidos.
- `COM_GRAPH_FAKE=1` (respuestas simuladas de Meta) solo funciona fuera de producción.
- QA: `database/qa-sanitize.sql` desactiva líneas y apps y borra sus secretos, vacía la cola, pausa campañas en curso y **enmascara** números,
  nombres de perfil, textos y medios de las conversaciones, notas, destinatarios, bajas y destinos de enlaces.

## Puesta en marcha de un cliente (WhatsApp)

1. **L5 → Sedes:** contratar el módulo `comunicaciones` en la sede y dar el privilegio `comunicaciones` a los usuarios L0–L3 que lo usarán.
2. **Créditos:** `/admin/comunicaciones` → Créditos → Recargar la bolsa de la sede o de la empresa (y en Ajustes de la sede, elegir la fuente).
3. **App de Meta: se reutiliza la que ya está publicada y revisada** (la app «LegacyChats»; **no se crea una app nueva en Meta**). En
   Apps de Meta → «Nueva app» solo se **registra** en LegacyEnterprise: `app_id`, *app secret* (App Dashboard → Configuración → Básica → Clave
   secreta; LegacyChats nunca lo guardó porque no validaba la firma) y un *verify token* («Generar»). La tarjeta muestra la **URL del webhook**
   (`https://api.legacyenterprise.legacysoftware.cloud/comunicaciones/webhook.php?app=<id>`). Una app de Meta tiene **una sola URL de webhook**:
   mientras LegacyChats siga vivo se deja la suya y cada número que pasa a LegacyEnterprise se redirige con un *override* (ver *Convivencia con
   LegacyChats*); al apagarlo se cambia la URL de la app (App Dashboard → WhatsApp → Configuración → Webhook, con el mismo *verify token*) y se
   suscriben `messages`, `message_template_status_update`, `template_category_update`, `message_template_quality_update`,
   `phone_number_quality_update` y `account_update`.
4. **Token permanente:** el del usuario del sistema que ya usa LegacyChats sirve (es del usuario del sistema, no de la plataforma). Si hay que
   generar uno: Business Settings → Usuarios del sistema → usuario Administrador con acceso a la app y a la WABA → «Generar token» con
   `whatsapp_business_messaging` y `whatsapp_business_management`, vencimiento «Nunca».
5. **Línea:** Líneas → Nueva línea (sede, app, nombre, teléfono visible, `phone_number_id`, `waba_id`, token). Al guardarla se **prueba la conexión
   sola**: lee el número en Graph (nombre verificado, calidad, nivel) y **suscribe la WABA a la app** (`POST /{waba_id}/subscribed_apps`), el
   paso que más se olvidaba en LegacyChats. Debe quedar «Conexión verificada» y «WABA suscrita».
6. **Ajustes de la sede** (L4): palabras para pedir asesor, qué hacer sin coincidencia, textos de transferencia y cierre, respuestas de equipo.
7. **Chatbot** (L2): crear un flujo (arranca con un menú de ejemplo), ajustar textos, probarlo con «Probar» y encenderlo.
8. **Plantillas** (L2): crear las de la operación (o sincronizar las que ya existan en Meta); la aprobación tarda de minutos a un día.
9. **Prueba real:** escribir «hola» al número desde un celular → el chatbot responde; «asesor» → aparece en la cola; responder desde la bandeja.

### Convivencia con LegacyChats (hasta confirmar que LegacyEnterprise envía y recibe)

**LegacyChats no se apaga** hasta que el dueño compruebe desde LegacyEnterprise que un mensaje sale y llega. Para probar con la misma app sin
tocar la URL de webhook de la app (que sigue siendo la de LegacyChats), Meta permite un **webhook alterno por número** ([Webhook overrides](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override/)):
prioridad número → WABA → app. Solo afecta a ese número; las demás líneas de LegacyChats siguen igual.

**En la pantalla** (`/admin/comunicaciones` → Líneas, L5; migración `015`, `webhook_linea.php`): cada línea muestra a dónde manda Meta hoy sus
mensajes («Mensajes: llegan aquí» / «van a otra URL: …» / «sin revisar»; lo lee «Probar conexión» o el botón de sincronizar) y ofrece
**«Recibir aquí los mensajes de este número»** (con confirmación) o **«Devolver a la URL de la app»**. Activar exige que la app tenga *App
Secret* (sin él la firma fallaría y se perderían mensajes) y manda a Meta nuestra URL con el *verify token* de la app (Meta la verifica con un
GET antes de aceptarla). Cada cambio queda en `le_H_admin` (`com_webhook_linea`). En QA el saneo borra lo leído de PDN.

Lo mismo a mano, por si hiciera falta:

```bash
# Redirigir UN número a LegacyEnterprise (Meta hace la verificación GET con ese verify token: el de la app registrada en LegacyEnterprise)
curl -s -X POST "https://graph.facebook.com/v23.0/<PHONE_NUMBER_ID>" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"webhook_configuration":{"override_callback_uri":"https://api.legacyenterprise.legacysoftware.cloud/comunicaciones/webhook.php?app=<id>","verify_token":"<VERIFY_TOKEN_EN_LE>"}}'
# Ver a dónde llega cada nivel
curl -s "https://graph.facebook.com/v23.0/<PHONE_NUMBER_ID>?fields=webhook_configuration" -H "Authorization: Bearer <TOKEN>"
# Devolverlo a LegacyChats
curl -s -X POST "https://graph.facebook.com/v23.0/<PHONE_NUMBER_ID>" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"webhook_configuration":{"override_callback_uri":""}}'
```

- El *override* cubre `messages` (mensajes y estados de entrega, que es lo que cobra créditos). Los eventos de **plantillas y de la cuenta**
  (aprobación, reclasificación, calidad) **siempre van a la URL de la app** (LegacyChats) mientras no se cambie: en LegacyEnterprise se ven con
  **Plantillas → Sincronizar**.
- Enviar una plantilla no necesita webhook, pero sin el *override* el mensaje queda «pendiente» en LegacyEnterprise (el «enviado/entregado» le
  llega a LegacyChats) y no se cobra.
- La firma de los eventos es con el *app secret* de la app: por eso hay que registrarlo en LegacyEnterprise.
- Guardar la línea en LegacyEnterprise hace `POST /{waba_id}/subscribed_apps` sin cuerpo: la app ya estaba suscrita (no cambia nada para
  LegacyChats), pero ese llamado **borra un override a nivel de WABA** si existiera; por eso el override va por número.
- Una misma línea en QA y en PDN: el override apunta a un solo entorno a la vez.

## Operación

- **Llave `COM_SECRET_KEY`** (una vez por entorno; sin ella no se pueden guardar apps ni líneas; **puesta en QA y PDN el 2026-09-26**). Cómo se
  generó en la VPS, sin pasar la llave por el chat:
  ```bash
  cd /opt/legacyenterprise/production        # y luego /opt/legacyenterprise/qa
  sed -i '/^COM_SECRET_KEY=$/d' .env         # quita una línea vacía si bootstrap-env.sh la agregó
  grep -q '^COM_SECRET_KEY=' .env || echo "COM_SECRET_KEY=$(openssl rand -base64 32)" >> .env
  # en docker-compose.yml, dentro de services.php.environment (ya está en infra/<env>/docker-compose.yml del repo):
  #   COM_SECRET_KEY: ${COM_SECRET_KEY}
  docker compose up -d                       # recrea el contenedor PHP (apache2 reload no toma variables nuevas)
  docker exec legacyenterprise_php_prod php -r 'echo strlen(base64_decode(getenv("COM_SECRET_KEY"))), "\n";'   # debe decir 32 (_qa en QA)
  ```
  **No cambiarla:** lo cifrado con la anterior deja de poder leerse (habría que volver a cargar los secretos). QA tiene su propia llave (lo que
  llega de PDN en la copia queda sin secretos por el saneo).
- **Cron del worker** (crontab de `dev01`, uno por entorno; **instalado el 2026-09-26**). Corre como `www-data` dentro del contenedor: `logs/` es
  de `www-data` y `dev01` no puede escribir ahí (con la redirección en el host, `sh` no lanzaría el comando); así el webhook también puede
  escribir en el mismo log:
  ```
  * * * * * timeout 58 docker exec -u www-data legacyenterprise_php_prod sh -c 'php /var/www/html/cron/jobs/com_worker.php >> /var/log/app/com_worker.log 2>&1'
  * * * * * timeout 58 docker exec -u www-data legacyenterprise_php_qa sh -c 'php /var/www/html/cron/jobs/com_worker.php >> /var/log/app/com_worker.log 2>&1'
  ```
  ¿Corrió? `cat /opt/legacyenterprise/<env>/logs/last_run_com_worker.json` (inicio, fin, entrantes, campañas).
  Sin cron el módulo funciona por el disparo del webhook y del lanzamiento, pero las campañas programadas, los reintentos y la espera por saldo o
  cupo esperan al siguiente evento. En QA el cron no escribe a clientes: las líneas copiadas de PDN quedan inactivas.
- **QA** se reinicia con una copia saneada de PDN en cada push a `qa`: para probar WhatsApp allí se registra una app/línea de prueba (número de
  prueba de Meta) después del deploy; se pierde en el siguiente push.
- La **URL de seguimiento** usa el dominio de la API (`comUrlApi()`, fijo por entorno; `COM_API_URL` lo sobreescribe): cambiar el dominio rompe los
  botones de las plantillas ya aprobadas.
- Límites de subida: medios de la bandeja hasta 16 MB (imágenes 5 MB); requieren `upload_max_filesize`/`post_max_size` suficientes en el
  `uploads.ini` de la VPS.

## Cómo probarlo en local

Arnés del CRM (MariaDB portable + `php -S`; memoria `crm-test-harness`) con `database/dev-seed-comunicaciones.sql` después de `dev-seed-crm.sql`:
sede 3 «Sede Solo Comunicaciones» (solo este módulo) y los tokens `dev-token-com-l4`, `dev-token-com-l2`, `dev-token-com-l1` y `dev-token-l1com`
(L1 de la sede 1 con solo el privilegio `comunicaciones`). El backend local se levanta además con `COM_SECRET_KEY` (cualquier base64 de 32 bytes)
y `COM_GRAPH_FAKE=1`: las llamadas a Meta responden simuladas (un texto con `[[FALLA:<código>]]` simula ese error) y quedan en
`%TEMP%/com_graph_fake.log`. El webhook se prueba firmando el cuerpo con el *app secret* de la app de prueba; el worker se corre a mano
(`php backend/cron/jobs/com_worker.php` con las mismas variables).

**Pruebas hechas (2026-09-26), fuera del repo como las del CRM:** API E1 98 casos (módulo compartido, apps, líneas, webhook firmado, cola,
estados fuera de orden, cobro idempotente, bolsas, alertas), E2+E3 86 (bandeja, permisos, respuestas, notas, chatbot real y simulado, acciones,
oportunidad del CRM), E4+E5 74 (revisión de categoría, validaciones de Meta, envío y webhooks de plantillas, reclasificación, enlace de
seguimiento, bajas, campañas con saldo/cupo/programación/pausa, filtros del reporte) 76 = **260**; regresión del CRM **399/399**; unitarias del
frontend 61 (11 nuevas: formato WhatsApp, modelo del editor, nombre de Meta); interfaz con Playwright **65 comprobaciones** a 1280 y 375 px sin
errores de consola ni scroll horizontal: sede solo-Comunicaciones (menú, entrada directa), bandeja (vistas, hilo, tomar, respuestas rápidas,
panel), contactos compartidos sin tarjetas de CRM, editor del chatbot (pasos, conexiones, deshacer, simulador, salir sin guardar), plantillas
(revisión en vivo, bloqueo como utilidad, URL de seguimiento, variables), campañas (reporte y filtros, estimación), créditos, ajustes L4,
plataforma L5 y el perfil con CRM + Comunicaciones (ver `ui_seed_com.py` y `com-ui-test.js` en el scratchpad de la sesión).

## Integración con otros módulos

- **CRM:** mismos contactos, etiquetas, campos, roles, vocabulario y notas; tarjeta de conversaciones en el perfil; «Campaña de WhatsApp» desde la
  selección de Contactos; acción del chatbot `crm.crear_oportunidad`. Si una sede tiene los dos módulos, el perfil muestra todas las tarjetas.
- **Agenda, Servicios, Pedidos (futuros):** aportan acciones del chatbot con `backend/<modulo>/_acciones_bot.php` (contrato arriba) y podrán
  enviar plantillas de utilidad (recordatorios, estados) con `comEnviar` + `comPlantillaPayload`.
- **Integraciones:** sigue como módulo aparte para sistemas externos; otros canales de mensajería (correo, SMS) entran en Comunicaciones.

## Hoja de ruta

| Fase | Contenido | Estado |
|---|---|---|
| E0 | Este documento | ✅ |
| E1 | Módulo, contactos y etiquetas compartidos, apps y líneas, webhook firmado, cola + worker, envío, créditos | ✅ |
| E2 | Bandeja | ✅ |
| E3 | Chatbot: palabras de activación, flujos, ir a flujo, variables, acciones, editor y simulador | ✅ |
| E4 | Plantillas: constructor, revisión de categoría, URL de seguimiento, sincronización y avisos | ✅ |
| E5 | Campañas | ✅ |
| E6 | Archivar LegacyChats | ⏳ espera la confirmación del dueño para apagar su infraestructura |

## Decisiones

- **Grafo del flujo en JSON** (`com_flujos.grafo`) en vez de tablas de nodos y conexiones: el editor guarda el flujo entero, la validación es una
  función y el motor lo carga de una vez; las palabras de activación sí van en tabla porque se consultan entre flujos.
- **Revisión de categoría solo en el servidor**, consultada mientras se escribe (con pausa), en vez de una copia en TypeScript que se desalinee.
- **Consumo agregado por día** en `com_movimientos`; el detalle por mensaje está en `com_mensajes` (`creditos`, `cobrado_at`).
- **Reserva de créditos en vuelo** en el control previo (saldo − lo enviado y aún no cobrado en 24 h), porque Meta cobra al entregar.
- **Una conversación por línea y número**, reabierta en cada contacto nuevo (sin tabla de «sesiones»): el hilo completo se ve siempre.
- **El saldo puede quedar negativo** por mensajes en vuelo; el bloqueo es antes de enviar.
- **Sin coincidencia = «mensaje»** deja la conversación con el chatbot (para que la siguiente palabra funcione); «bandeja» la pasa a la cola.
- **Conversaciones abiertas por una campaña** quedan cerradas hasta que el cliente responde (no llenan la bandeja).
- **Todo por *polling* liviano** (4–5 s con la pestaña visible) + push en transferencias y entradas a la cola; sin WebSockets en esta versión.

## Pendientes

- Acción del dueño: `COM_SECRET_KEY` y cron en QA y PDN (ver *Operación*); dar de alta la primera app de Meta y la línea.
- E6: confirmar para apagar la infraestructura de LegacyChats y archivar el repositorio.
- Horario de atención por sede (mensaje fuera de horario) y asignación automática (reparto entre asesores).
- Correo y SMS como canales nuevos.
- Acciones de Agenda, Servicios y Pedidos cuando existan esos módulos.
- Pago en línea de paquetes de créditos (hoy la recarga la registra L5).
- Versionar las baterías de prueba en `tests/` y correr las de API en el CI (igual que las del CRM).
