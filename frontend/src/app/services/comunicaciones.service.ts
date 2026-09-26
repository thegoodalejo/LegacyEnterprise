import { Injectable, inject } from '@angular/core';
import { ApiResponse, ApiService } from './api.service';
import { CrmTag, Filtros } from './crm.service';

// ─── Plataforma (L5): apps de Meta, líneas, bolsas y tarifas ─────────────────────────────────────────────────────
export interface MetaApp {
  id: number; nombre: string; app_id: string; graph_version: string; activo: boolean; secret_configurado: boolean; verify_configurado: boolean;
  lineas: number; webhook_url: string; updated_at: string;
}
export interface LineaAdmin {
  id: number; id_sede: number; sede_nombre: string; empresa_nombre: string; id_app: number; app_nombre: string; nombre: string; telefono_visible: string | null;
  phone_number_id: string; waba_id: string; token_ultimos4: string | null; token_configurado: boolean; nombre_verificado: string | null;
  calidad: string | null; nivel_mensajes: string | null; verificada_at: string | null; suscrita_at: string | null; ultimo_error: string | null;
  activo: boolean; updated_at: string;
}
export interface Linea { id: number; id_sede: number; nombre: string; telefono_visible: string | null; nombre_verificado: string | null; calidad: string | null; nivel_mensajes: string | null; activo: boolean }
export interface PasoPrueba { paso: 'numero' | 'suscripcion'; ok: boolean; detalle: string }
export interface BolsaEmpresa {
  id: number; nombre: string; saldo: number;
  sedes: { id: number; nombre: string; fuente: 'sede' | 'empresa'; contratado: boolean; saldo: number }[];
}
export interface RecargaReciente {
  id: number; tipo: 'recarga' | 'ajuste'; fecha: string; creditos: number; referencia: string | null; descripcion: string | null; created_at: string;
  ambito: 'empresa' | 'sede'; id_empresa: number; id_sede: number | null; usuario: string | null;
}
export interface Tarifa { categoria: string; nombre: string; creditos: number }

// ─── Créditos de la sede ─────────────────────────────────────────────────────────────────────────────────────────
export interface Saldo {
  fuente: 'sede' | 'empresa';
  billetera: { id: number; ambito: 'sede' | 'empresa'; saldo: number; base: number; porcentaje: number | null; alerta_nivel: number };
  consumo_mes: { categoria: string; cantidad: number; creditos: number }[];
  tarifas: Tarifa[];
  bolsas: { empresa: number; sede: number } | null;
}
export type TipoMovimiento = 'recarga' | 'consumo' | 'ajuste' | 'transferencia';
export interface Movimiento {
  id: number; tipo: TipoMovimiento; fecha: string; categoria: string | null; categoria_nombre: string | null; cantidad: number; creditos: number; saldo_despues: number;
  descripcion: string | null; referencia: string | null; id_sede: number | null; sede_nombre: string | null; created_at: string; updated_at: string; usuario: string | null;
}
export interface ListaMovimientos { movimientos: Movimiento[]; total: number; pagina: number; por_pagina: number; bolsa: { id: number; ambito: 'sede' | 'empresa'; saldo: number }; desde: string; hasta: string }

// ─── Ajustes ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type SinCoincidencia = 'bandeja' | 'mensaje' | 'flujo';
export interface ConfigCom {
  id_sede: number; fuente_creditos: 'sede' | 'empresa'; palabras_asesor: string; sesion_minutos: number; sin_coincidencia: SinCoincidencia;
  texto_sin_coincidencia: string | null; id_flujo_respaldo: number | null; texto_transferencia: string | null; texto_cierre: string | null; enviar_texto_cierre: boolean;
}

// ─── Bandeja ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type EstadoConv = 'bot' | 'cola' | 'atencion' | 'cerrada';
export type VistaBandeja = 'cola' | 'mias' | 'todas' | 'bot' | 'cerradas';
export type EstadoMensaje = 'recibido' | 'pendiente' | 'enviado' | 'entregado' | 'leido' | 'fallido';
export interface ConversacionFila {
  id: number; estado: EstadoConv; wa_id: string; nombre: string; nombre_perfil: string | null; id_contacto: number | null; id_linea: number; linea_nombre: string;
  id_asignado: number | null; asignado_nombre: string | null; no_leidos: number; ultimo_mensaje_at: string | null; ventana_abierta: boolean; resumen: string | null;
  ultimo: { tipo: string; direccion: 'entrante' | 'saliente'; estado: EstadoMensaje; origen: string } | null;
}
export interface ConteosBandeja { cola: number; mias: number; mias_sin_leer: number; bot: number | null; todas: number | null }
export interface Conversacion {
  id: number; estado: EstadoConv; wa_id: string; nombre_perfil: string | null; id_linea: number; linea_nombre: string | null; linea_telefono: string | null;
  id_asignado: number | null; asignado_nombre: string | null; id_contacto: number | null; contacto_nombre: string | null; contacto_activo: boolean;
  etiquetas: (CrmTag & { id_grupo: number | null; activo: boolean })[]; ventana_abierta: boolean; ventana_vence: string | null; no_leidos: number;
  id_flujo: number | null; ultimo_mensaje_at: string | null; cerrada_at: string | null;
  /** Datos que capturó el chatbot en esta conversación. */
  variables: Record<string, string>;
}
export interface OpcionMsg { id: string; titulo: string; descripcion?: string | null }
export interface ContenidoMensaje {
  respuesta?: { tipo: 'boton' | 'lista' | 'plantilla'; id: string; titulo: string; descripcion?: string | null };
  botones?: OpcionMsg[]; lista?: { boton: string; filas: OpcionMsg[] }; encabezado?: string | null; pie?: string | null;
  ubicacion?: { lat: number | null; lng: number | null; nombre: string | null; direccion: string | null };
  contactos?: { nombre: string; telefonos: string[] }[]; reaccion?: { emoji: string; a: string | null };
  plantilla?: { id: number; nombre: string; idioma: string; categoria: string; encabezado: { tipo: string } | null; botones: BotonPlantilla[] };
  campana?: { id: number; nombre: string; prueba: boolean };
  nota_de_voz?: boolean; medio_error?: string; original?: unknown;
}
export interface Mensaje {
  id: number; direccion: 'entrante' | 'saliente'; origen: 'contacto' | 'bot' | 'asesor' | 'campana' | 'sistema'; tipo: string; texto: string | null;
  contenido: ContenidoMensaje | null;
  media: { disponible: boolean; mime: string | null; nombre: string | null; bytes: number | null; error: string | null } | null;
  estado: EstadoMensaje; error_detalle: string | null; error_codigo: number | null; categoria: string | null; creditos: number | null; usuario: string | null;
  id_campana: number | null; created_at: string; enviado_at: string | null; entregado_at: string | null; leido_at: string | null;
}
export interface HiloConversacion { conversacion: Conversacion; mensajes: Mensaje[]; ahora: string; hay_anteriores?: boolean }
export interface RespuestaRapida { id: number; equipo: boolean; atajo: string; titulo: string; texto: string; activo: boolean; updated_at: string }
export interface UsuarioModulo { id: number; nombre: string; email: string; rol: string }
export interface ConversacionContacto {
  id: number; estado: EstadoConv; wa_id: string; id_linea: number; linea_nombre: string; asignado_nombre: string | null; ultimo_mensaje_at: string | null;
  resumen: string | null; no_leidos: number; mensajes: number; puede_abrir: boolean; ventana_abierta: boolean;
}
export interface EnvioResultado { mensaje: Mensaje | null; ok: boolean; error: string | null; id_conversacion?: number }

// ─── Chatbot ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type TipoNodo = 'inicio' | 'mensaje' | 'botones' | 'lista' | 'pregunta' | 'condicion' | 'accion' | 'asesor' | 'ir_flujo' | 'fin';
export type TipoDisparador = 'exacta' | 'empieza' | 'contiene';
export interface Nodo { id: string; tipo: TipoNodo; x: number; y: number; datos: Record<string, unknown> }
export interface Conexion { de: string; puerto: string; a: string }
export interface Grafo { nodos: Nodo[]; conexiones: Conexion[] }
export interface Disparador { tipo: TipoDisparador; texto: string; prioridad: number; id_linea: number | null }
export interface FlujoFila {
  id: number; nombre: string; descripcion: string | null; activo: boolean; version: number; pasos: number; en_curso: number; updated_at: string;
  actualizado_por: string | null; disparadores: Disparador[]; es_respaldo: boolean;
}
export interface Flujo {
  id: number; nombre: string; descripcion: string | null; activo: boolean; version: number; grafo: Grafo; updated_at: string; actualizado_por: string | null;
  disparadores: Disparador[];
}
export interface AvisoFlujo { nodo: string; aviso: 'inalcanzable' | 'opcion_sin_destino'; puerto?: string }
export interface ConfigAccionDef {
  clave: string; tipo: 'texto' | 'texto_largo' | 'entero' | 'variable' | 'etiqueta' | 'usuario' | 'campo_contacto' | 'embudo_etapa' | 'opcion';
  etiqueta: string; requerida?: boolean; opciones?: { valor: string; etiqueta: string }[];
}
export interface AccionDef {
  codigo: string; modulo: string; nombre: string; descripcion: string; config: ConfigAccionDef[];
  entradas: { clave: string; tipo: string; requerida?: boolean }[]; salidas: string[]; puertos: string[];
}
export interface CatalogoEditor {
  acciones: AccionDef[]; etiquetas: { id: number; nombre: string; color: string }[]; campos: { id: number; etiqueta: string; tipo_dato: string }[];
  etapas: { id: number; nombre: string; embudo: string }[]; usuarios: UsuarioModulo[]; flujos: { id: number; nombre: string; activo: boolean }[];
  lineas: { id: number; nombre: string }[];
}
export type SalidaBot =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'botones'; texto: string; encabezado?: string | null; pie?: string | null; botones: OpcionMsg[] }
  | { tipo: 'lista'; texto: string; boton: string; encabezado?: string | null; pie?: string | null; filas: OpcionMsg[] };
export interface EstadoSimulacion { id_flujo: number | null; nodo: string | null; vars: Record<string, string> }
export interface ResultadoSimulacion {
  salidas: SalidaBot[]; resultado: 'esperando' | 'fin' | 'asesor' | 'sin_coincidencia' | 'sin_creditos' | 'error'; estado: EstadoSimulacion;
  flujo: string | null; nota: string | null; sin_coincidencia: SinCoincidencia;
}

// ─── Plantillas ──────────────────────────────────────────────────────────────────────────────────────────────────
export type EstadoPlantilla = 'borrador' | 'pendiente' | 'aprobada' | 'rechazada' | 'pausada' | 'deshabilitada' | 'eliminada';
export type CategoriaPlantilla = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
export type TipoEncabezado = 'ninguno' | 'texto' | 'imagen' | 'video' | 'documento';
export interface VariableDef { n: number; ejemplo: string; origen: string; valor: string | null; defecto: string | null }
export interface BotonPlantilla { tipo: 'respuesta' | 'enlace' | 'otro'; texto: string; url?: string; externa?: boolean; subtipo?: string }
export interface Encabezado { tipo: Exclude<TipoEncabezado, 'ninguno'>; texto?: string; variable?: VariableDef }
export interface RevisionCategoria {
  riesgo: 'bajo' | 'medio' | 'alto'; puntaje: number; motivos: { codigo: string; palabras?: string[] }[]; transaccional: boolean; palabras_transaccion?: string[];
  creditos?: { utility: number; marketing: number };
}
export interface PlantillaCom {
  id: number; id_sede: number; id_linea: number; linea_nombre: string; waba_id: string; nombre: string; idioma: string; categoria_solicitada: CategoriaPlantilla;
  categoria: CategoriaPlantilla | null; categoria_anterior: string | null; reclasificada_at: string | null; reclasificada: boolean; estado: EstadoPlantilla;
  meta_id: string | null; motivo_rechazo: string | null; calidad: string | null; encabezado: Encabezado | null; cuerpo: string; pie: string | null;
  botones: BotonPlantilla[]; variables: VariableDef[]; revision: RevisionCategoria | null; origen: 'sistema' | 'meta'; enviada_at: string | null; aprobada_at: string | null;
  created_at: string; updated_at: string; creada_por: string | null; url_seguimiento: string; no_enviable?: string | null; creditos?: number;
  revision_actual?: RevisionCategoria; usos?: number;
}

// ─── Campañas ────────────────────────────────────────────────────────────────────────────────────────────────────
export type EstadoCampana = 'borrador' | 'programada' | 'enviando' | 'esperando_saldo' | 'esperando_cupo' | 'pausada' | 'completada' | 'cancelada';
export type AudienciaCampana = ({ ids: number[] } | { filtros: Filtros; excluidos: number[] }) & { organizaciones?: boolean };
export interface ConteosCampana {
  total: number; pendientes: number; enviados: number; entregados: number; leidos: number; fallidos: number; omitidos: number; respuestas: number; clics: number; creditos: number;
}
export interface Campana {
  id: number; id_sede: number; id_linea: number; id_plantilla: number; nombre: string; estado: EstadoCampana; audiencia: AudienciaCampana | null;
  valores: Record<string, string> | null; enlace_destino: string | null; media_nombre: string | null; media_mime: string | null; media_subida_at: string | null;
  tiene_media: boolean; programada_para: string | null; total: number; creditos_estimados: number; motivo_pausa: string | null; reintentar_desde: string | null;
  iniciada_at: string | null; completada_at: string | null; created_at: string; updated_at: string; creada_por: string | null;
  plantilla_nombre: string; plantilla_idioma: string; plantilla_categoria: string; linea_nombre: string; conteos: ConteosCampana;
  plantilla?: PlantillaCom | null; errores?: { error: string | null; n: number }[];
}
export interface EstimacionCampana {
  destinatarios: number; seleccionados: number; organizaciones: number; sin_whatsapp: number; bajas: number; repetidos: number; categoria: string;
  creditos_por_mensaje: number; creditos: number; saldo: number; alcanza: boolean; cupo_24h: number | null;
  muestra: { nombre: string; wa_id: string; texto: string; faltan: string[] } | null; nota: string;
}
export type EstadoDestinatario = 'pendiente' | 'enviado' | 'entregado' | 'leido' | 'fallido' | 'omitido';
export interface Destinatario {
  id: number; id_contacto: number | null; nombre: string | null; wa_id: string; estado: EstadoDestinatario; error: string | null; enviado_at: string | null;
  respondio_at: string | null; clic_at: string | null; entregado_at: string | null; leido_at: string | null; creditos: number | null;
}

/** Llamadas del módulo Comunicaciones (backend/comunicaciones/*). Respuesta cruda del backend ({action, mensaje, data}). */
@Injectable({ providedIn: 'root' })
export class ComunicacionesService {
  private api = inject(ApiService);
  private p<T>(ep: string, data: Record<string, unknown> = {}, files?: Record<string, File | Blob>): Promise<ApiResponse<T>> {
    return this.api.post<T>(`comunicaciones/${ep}.php`, data, files);
  }

  // Plataforma (L5)
  listApps() { return this.p<{ apps: MetaApp[]; cifrado_disponible: boolean }>('list_apps'); }
  saveApp(d: Record<string, unknown>) { return this.p<{ id: number; webhook_url: string }>('save_app', d); }
  listLineas(idSede?: number) { return this.p<{ lineas: LineaAdmin[]; cifrado_disponible: boolean }>('list_lineas', { id_sede: idSede }); }
  saveLinea(d: Record<string, unknown>) { return this.p<{ id: number }>('save_linea', d); }
  probarLinea(id: number) { return this.p<{ ok: boolean; pasos: PasoPrueba[] }>('probar_linea', { id }); }
  listBilleteras() { return this.p<{ empresas: BolsaEmpresa[]; ultimas: RecargaReciente[]; recarga_minima: number }>('list_billeteras'); }
  recargar(d: Record<string, unknown>) { return this.p<{ saldo: number }>('recargar', d); }
  listTarifas() { return this.p<{ tarifas: Tarifa[] }>('list_tarifas'); }
  saveTarifa(categoria: string, creditos: number) { return this.p('save_tarifa', { categoria, creditos }); }

  // Sede
  listLineasSede() { return this.p<{ lineas: Linea[] }>('list_lineas_sede'); }
  getConfig() { return this.p<{ config: ConfigCom; flujos: { id: number; nombre: string }[] }>('get_config'); }
  saveConfig(d: Partial<ConfigCom>) { return this.p('save_config', { ...d, enviar_texto_cierre: d.enviar_texto_cierre === undefined ? undefined : d.enviar_texto_cierre ? 1 : 0 }); }
  getSaldo() { return this.p<Saldo>('get_saldo'); }
  listMovimientos(o: { bolsa?: 'actual' | 'sede' | 'empresa'; desde?: string | null; hasta?: string | null; tipo?: string; pagina?: number; porPagina?: number } = {}) {
    return this.p<ListaMovimientos>('list_movimientos', { bolsa: o.bolsa ?? 'actual', desde: o.desde ?? undefined, hasta: o.hasta ?? undefined, tipo: o.tipo || undefined,
      pagina: o.pagina ?? 1, por_pagina: o.porPagina ?? 50 });
  }
  transferir(direccion: 'a_sede' | 'a_empresa', creditos: number) { return this.p<{ saldo_destino: number }>('transferir', { direccion, creditos }); }

  // Bandeja
  listConversaciones(o: { vista: VistaBandeja; idLinea?: number | null; q?: string; limite?: number }) {
    return this.p<{ conversaciones: ConversacionFila[]; conteos: ConteosBandeja; ahora: string }>('list_conversaciones',
      { vista: o.vista, id_linea: o.idLinea ?? undefined, q: o.q || undefined, limite: o.limite ?? 60 });
  }
  getConversacion(id: number, o: { desdeId?: number; desde?: string; antesDe?: number } = {}) {
    return this.p<HiloConversacion>('get_conversacion', { id, desde_id: o.desdeId, desde: o.desde, antes_de: o.antesDe });
  }
  marcarLeida(id: number) { return this.p('marcar_leida', { id }); }
  tomar(id: number) { return this.p('tomar', { id }); }
  enviarTexto(idConversacion: number, texto: string) { return this.p<EnvioResultado>('send_mensaje', { id_conversacion: idConversacion, texto }); }
  enviarArchivo(idConversacion: number, archivo: File, caption?: string) {
    return this.p<EnvioResultado>('send_media', { id_conversacion: idConversacion, caption }, { archivo });
  }
  getMedia(id: number) { return this.p<{ url: string; mime: string | null; nombre: string | null }>('get_media', { id }); }
  transferirConversacion(id: number, destino: { idUsuario?: number; aCola?: boolean }) {
    return this.p('transferir_conversacion', { id, id_usuario: destino.idUsuario, a_cola: destino.aCola ? 1 : undefined });
  }
  cerrar(id: number, enviarCierre?: boolean) { return this.p<{ aviso: string | null }>('cerrar', { id, enviar_cierre: enviarCierre === undefined ? undefined : enviarCierre ? 1 : 0 }); }
  listRespuestas(todas = false) { return this.p<{ respuestas: RespuestaRapida[]; puede_equipo: boolean }>('list_respuestas', { todas: todas ? 1 : 0 }); }
  saveRespuesta(d: Record<string, unknown>) { return this.p<{ id: number }>('save_respuesta', d); }
  listUsuarios() { return this.p<{ usuarios: UsuarioModulo[] }>('list_usuarios_modulo'); }
  listConversacionesContacto(idContacto: number) { return this.p<{ conversaciones: ConversacionContacto[] }>('list_conversaciones_contacto', { id_contacto: idContacto }); }

  // Chatbot
  listFlujos() { return this.p<{ flujos: FlujoFila[]; sin_coincidencia: SinCoincidencia; palabras_asesor: string }>('list_flujos'); }
  getFlujo(id: number) { return this.p<{ flujo: Flujo }>('get_flujo', { id }); }
  saveFlujo(d: { id?: number; nombre: string; descripcion?: string | null; activo: boolean; grafo: Grafo; disparadores: Disparador[]; version?: number }) {
    return this.p<{ id: number; version: number; avisos: AvisoFlujo[] }>('save_flujo', { ...d, activo: d.activo ? 1 : 0 });
  }
  eliminarFlujo(id: number) { return this.p('save_flujo', { id, eliminar: 1 }); }
  catalogoEditor() { return this.p<CatalogoEditor>('list_acciones'); }
  probarFlujo(d: { grafo: Grafo; idFlujo: number; nombre: string; disparadores: Disparador[]; estado?: EstadoSimulacion | null; texto?: string; respuestaId?: string;
                   iniciar?: boolean; idContacto?: number | null }) {
    return this.p<ResultadoSimulacion>('probar_flujo', { grafo: d.grafo, id_flujo: d.idFlujo, nombre: d.nombre, disparadores: d.disparadores, estado: d.estado ?? undefined,
      texto: d.texto, respuesta_id: d.respuestaId, iniciar: d.iniciar ? 1 : undefined, id_contacto: d.idContacto ?? undefined });
  }

  // Plantillas
  listPlantillas(o: { enviables?: boolean; idLinea?: number | null; incluirEliminadas?: boolean } = {}) {
    return this.p<{ plantillas: PlantillaCom[]; tarifas: { marketing: number; utility: number; authentication: number }; url_seguimiento: string }>('list_plantillas',
      { enviables: o.enviables ? 1 : undefined, id_linea: o.idLinea ?? undefined, incluir_eliminadas: o.incluirEliminadas ? 1 : undefined });
  }
  getPlantilla(id: number) { return this.p<{ plantilla: PlantillaCom }>('get_plantilla', { id }); }
  savePlantilla(d: Record<string, unknown>) { return this.p<{ id: number; nombre: string; revision: RevisionCategoria }>('save_plantilla', d); }
  enviarPlantillaAMeta(id: number, cambios?: Record<string, unknown>, ejemplo?: File | null) {
    return this.p<{ plantilla: PlantillaCom; revision?: RevisionCategoria }>('enviar_plantilla', { id, ...(cambios ?? {}) }, ejemplo ? { ejemplo } : undefined);
  }
  revisarCategoria(d: { encabezado?: string; cuerpo: string; pie?: string; botones?: string[] }) { return this.p<RevisionCategoria>('revisar_categoria', d); }
  eliminarPlantilla(id: number) { return this.p('delete_plantilla', { id }); }
  sincronizarPlantillas() { return this.p<{ cuentas: { waba_id: string; nuevas?: number; actualizadas?: number; eliminadas?: number; error?: string }[] }>('sync_plantillas'); }
  enviarPlantilla(d: { idPlantilla: number; idConversacion?: number; idContacto?: number; idLinea?: number; valores?: Record<string, string>; destino?: string }, archivo?: File | null) {
    return this.p<EnvioResultado>('send_plantilla', { id_plantilla: d.idPlantilla, id_conversacion: d.idConversacion, id_contacto: d.idContacto, id_linea: d.idLinea,
      valores: d.valores, destino: d.destino || undefined }, archivo ? { archivo } : undefined);
  }

  // Campañas
  listCampanas(o: { estado?: string; pagina?: number; porPagina?: number } = {}) {
    return this.p<{ campanas: Campana[]; total: number; pagina: number; por_pagina: number }>('list_campanas', { estado: o.estado || undefined, pagina: o.pagina ?? 1, por_pagina: o.porPagina ?? 30 });
  }
  getCampana(id: number) { return this.p<{ campana: Campana }>('get_campana', { id }); }
  saveCampana(d: Record<string, unknown>) { return this.p<{ id: number }>('save_campana', d); }
  eliminarCampana(id: number) { return this.p('save_campana', { id, eliminar: 1 }); }
  estimarCampana(id: number) { return this.p<EstimacionCampana>('estimar_campana', { id }); }
  subirMediaCampana(id: number, archivo: File) { return this.p<{ nombre: string }>('media_campana', { id }, { archivo }); }
  probarCampana(id: number, idContacto: number) { return this.p<{ id_mensaje: number }>('prueba_campana', { id, id_contacto: idContacto }); }
  lanzarCampana(id: number, totalEsperado: number) { return this.p<{ destinatarios: number; estado: EstadoCampana }>('lanzar_campana', { id, total_esperado: totalEsperado }); }
  estadoCampana(id: number, accion: 'pausar' | 'reanudar' | 'cancelar') { return this.p('estado_campana', { id, accion }); }
  listDestinatarios(id: number, o: { estado?: string; q?: string; pagina?: number; porPagina?: number; exportar?: boolean } = {}) {
    return this.p<{ destinatarios: Destinatario[]; total: number; pagina: number; por_pagina: number }>('list_destinatarios',
      { id, estado: o.estado || undefined, q: o.q || undefined, pagina: o.pagina ?? 1, por_pagina: o.porPagina ?? 50, exportar: o.exportar ? 1 : undefined });
  }
}
