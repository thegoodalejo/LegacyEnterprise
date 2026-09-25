import { Injectable, inject } from '@angular/core';
import { ApiResponse, ApiService } from './api.service';

export type TipoContacto = 'persona' | 'organizacion';
/** Destino de un campo personalizado o de una etiqueta. */
export type AplicaA = TipoContacto | 'oportunidad';
export type TipoDato = 'entero' | 'decimal' | 'texto' | 'booleano' | 'fecha';
export type EstadoFiltro = 'activos' | 'archivados' | 'todos';

export interface CrmTag { id: number; nombre: string; color: string }
export interface TagDef extends CrmTag {
  id_grupo: number | null; aplica_a: AplicaA | null; orden: number; activo: boolean;
}
export interface TagGrupo { id: number; nombre: string; orden: number; activo: boolean }
export interface CatalogoTags { grupos: TagGrupo[]; tags: TagDef[] }

export interface CampoDef {
  id: number; aplica_a: AplicaA; clave: string; etiqueta: string; tipo_dato: TipoDato;
  obligatorio: boolean; orden: number; activo: boolean;
}
export type ValorCampo = string | number | boolean | null;
export interface CampoConValor { id: number; clave: string; etiqueta: string; tipo_dato: TipoDato; obligatorio: boolean; activo: boolean; valor: ValorCampo }

export interface UsuarioSede { id: number; nombre: string }
export interface RolVinculo { id: number; nombre: string; orden: number; activo: boolean }

export type ClaveVocabulario = 'contacto' | 'persona' | 'organizacion' | 'oportunidad' | 'item';
export type Vocabulario = Partial<Record<ClaveVocabulario, { singular: string; plural: string }>>;

export interface Plantilla {
  id: string; vocabulario: Vocabulario; roles: string[];
  campos: { aplica_a: AplicaA; etiqueta: string; tipo_dato: TipoDato }[];
  grupos: { nombre: string; tags: string[] }[]; tags: string[];
  embudo: { nombre: string; etapas: string[] } | null; motivos: string[]; items: string[]; metricas: string[];
}
export type ResultadoPlantilla = Record<'vocabulario' | 'roles' | 'campos' | 'grupos' | 'tags' | 'etapas' | 'motivos' | 'items' | 'metricas', { agregados: number; existentes: number }>;

export interface FiltroCampo { id_campo: number; op: string; valor?: ValorCampo; valor2?: ValorCampo }
export interface Filtros {
  q?: string; relacionados?: boolean; padre?: number; tipo?: TipoContacto | ''; estado?: EstadoFiltro; responsable?: number; creado_por?: number;
  creado_desde?: string; creado_hasta?: string; tags?: number[]; tags_modo?: 'cualquiera' | 'todos'; campos?: FiltroCampo[];
}

export interface ContactoFila {
  id: number; tipo: TipoContacto; nombre_completo: string; telefono: string | null; ciudad: string | null; activo: boolean;
  created_at: string; correo: string | null; documento_numero: string | null; creado_por_nombre: string | null;
  responsable_nombre: string | null; padre_nombre: string | null; tags: CrmTag[]; relacion: { total: number; nombres: string[] };
}
export interface ListaContactos { contactos: ContactoFila[]; total: number; pagina: number; por_pagina: number }

export interface ContactoBase {
  id: number; tipo: TipoContacto; nombre_completo: string; direccion: string | null; ciudad: string | null;
  lat: number | null; lng: number | null; telefono: string | null; id_responsable: number | null; responsable_nombre: string | null;
  activo: boolean; created_at: string; created_by: number | null; creado_por_nombre: string | null;
  updated_at: string; updated_by: number | null; modificado_por_nombre: string | null;
  nombres: string | null; apellidos: string | null; correo: string | null; whatsapp_indicativo: string | null;
  whatsapp_numero: string | null; fecha_nacimiento: string | null; razon_social: string | null; correo_facturacion: string | null;
  documento_tipo: string | null; documento_numero: string | null; id_padre: number | null; padre_nombre: string | null;
}
export interface Vinculo {
  id: number; nombre_completo: string; activo: boolean; telefono: string | null; correo: string | null;
  id_rol: number | null; rol: string | null; principal: boolean;
}
export interface ContactoDetalle {
  contacto: ContactoBase; vinculos: Vinculo[]; tags: (CrmTag & { id_grupo: number | null; activo: boolean })[]; campos: CampoConValor[];
  hijas: { id: number; nombre_completo: string; activo: boolean }[];
}

export interface PersonaRef {
  id_persona?: number;
  nuevo?: { nombres: string; apellidos?: string; telefono?: string; correo?: string; whatsapp_indicativo?: string; whatsapp_numero?: string };
  id_rol?: number | null; principal?: boolean;
}
export interface Advertencia { tipo: 'documento_duplicado'; contactos: { id: number; nombre_completo: string }[] }

export type Seleccion = { ids: number[] } | { filtros: Filtros; excluidos: number[]; total_esperado: number };
/** Como Seleccion, pero exportar «todo» no conoce el total de antemano (el backend solo lo valida si viene). */
export type SeleccionExport = { ids: number[] } | { filtros: Filtros; excluidos: number[]; total_esperado?: number };
export type AccionLote ='archivar' | 'restaurar' | 'tags_agregar' | 'tags_quitar';
export interface ResultadoLote {
  procesados: number; sin_cambios: number; omitidos: { id: number; motivo: string; tag?: string }[]; omitidos_total: number; lote: string;
}

export interface ExportContacto {
  id: number; tipo: TipoContacto; nombre_completo: string; direccion: string | null; ciudad: string | null;
  lat: number | null; lng: number | null; telefono: string | null; activo: boolean; created_at: string; updated_at: string;
  documento_tipo: string | null; documento_numero: string | null; correo: string | null;
  whatsapp_indicativo: string | null; whatsapp_numero: string | null; fecha_nacimiento: string | null; padre_nombre: string | null;
  creado_por: string | null; modificado_por: string | null; responsable: string | null;
  etiquetas: string[]; vinculos: { nombre: string; rol: string | null; principal: boolean }[]; campos: Record<string, ValorCampo>;
}
export interface ExportCampoDef { id: number; aplica_a: TipoContacto; etiqueta: string; tipo_dato: TipoDato }
export interface PaginaExportContactos { contactos: ExportContacto[]; campos: ExportCampoDef[]; total: number; pagina: number; por_pagina: number }

export interface EntradaHistorial {
  id: number; accion: string; created_at: string; id_usuario: number; usuario: string | null;
  detalle: {
    tipo?: string; nombre?: string; origen?: string; lote?: string; rol?: string | null;
    cambios?: { campo: string; etiqueta?: string; antes: unknown; despues: unknown }[];
    tags?: string[] | { agregados: string[]; quitados: string[] };
    persona?: { id: number; nombre: string }; organizacion?: { id: number; nombre: string };
    desde?: { id: number; nombre: string }; hasta?: { id: number; nombre: string }; estado?: string; motivo?: string | null;
  } | null;
}
export interface ListaHistorial { historial: EntradaHistorial[]; total: number; pagina: number; por_pagina: number; desde: string; hay_anteriores: boolean }

// ─── Oportunidades, embudo, catálogo y configuración ─────────────────────────────────────────────────────────────
export type TipoEtapa = 'abierta' | 'ganada' | 'perdida';
export type EstadoOp = TipoEtapa;
export interface Etapa { id: number; id_embudo: number; nombre: string; orden: number; probabilidad: number; tipo: TipoEtapa; color: string | null; activo: boolean }
export interface Embudo { id: number; nombre: string; orden: number; activo: boolean; etapas: Etapa[] }
export interface ConfigCrm { moneda: string; decimales: number }
export interface MotivoCierre { id: number; tipo: 'ganada' | 'perdida'; nombre: string; orden: number; activo: boolean }
export interface CategoriaItem { id: number; nombre: string; orden: number; activo: boolean }
export interface ItemCatalogo {
  id: number; id_categoria: number | null; categoria: string | null; codigo: string | null; nombre: string; unidad: string | null; precio_ref: number | null; activo: boolean;
}
export interface ListaItems { items: ItemCatalogo[]; total: number; pagina: number; por_pagina: number }

export interface OportunidadFila {
  id: number; titulo: string; id_embudo: number; id_etapa: number; id_contacto: number; id_persona_contacto: number | null; id_responsable: number | null;
  valor: number; fecha_cierre_estimada: string | null; estado: EstadoOp; fecha_cierre_real: string | null; etapa_desde: string; activo: boolean; created_at: string;
  contacto_nombre: string; contacto_tipo: TipoContacto; persona_nombre: string | null;
  etapa_nombre: string; etapa_tipo: TipoEtapa; etapa_probabilidad: number; etapa_color: string | null;
  responsable_nombre: string | null; tags: CrmTag[];
}
export interface ResumenEstado { n: number; valor: number; ponderado: number }
export interface ResumenOp { abierta: ResumenEstado; ganada: ResumenEstado; perdida: ResumenEstado; total: number }
export interface FiltrosOp {
  q?: string; archivo?: 'activas' | 'archivadas' | 'todas'; estado?: 'abiertas' | 'ganadas' | 'perdidas'; id_embudo?: number; etapas?: number[];
  responsable?: number; sin_responsable?: boolean; contacto?: number; creado_por?: number; creado_desde?: string; creado_hasta?: string;
  cierre_desde?: string; cierre_hasta?: string; valor_min?: string; valor_max?: string; tags?: number[]; tags_modo?: 'cualquiera' | 'todos'; campos?: FiltroCampo[];
}
export type OrdenOp = 'creado' | 'titulo' | 'valor' | 'etapa' | 'cierre' | 'cierre_real' | 'contacto';
export type SeleccionOp = { ids: number[] } | { filtros: FiltrosOp; excluidos: number[]; total_esperado: number };
/** Como SeleccionOp, pero exportar «todo» no conoce el total de antemano. */
export type SeleccionOpExport = { ids: number[] } | { filtros: FiltrosOp; excluidos: number[]; total_esperado?: number };
export interface ListaOportunidades { oportunidades: OportunidadFila[]; total: number; pagina: number; por_pagina: number; resumen: ResumenOp; config: ConfigCrm }
export interface ColumnaTablero { etapa: Etapa; total: number; valor: number; ponderado: number; oportunidades: OportunidadFila[]; hay_mas: boolean }
export interface Tablero { id_embudo: number | null; columnas: ColumnaTablero[]; resumen: ResumenOp; config: ConfigCrm }

export interface OportunidadBase {
  id: number; id_embudo: number; id_etapa: number; titulo: string; id_contacto: number; id_persona_contacto: number | null; id_responsable: number | null;
  valor: number; fecha_cierre_estimada: string | null; estado: EstadoOp; fecha_cierre_real: string | null; id_motivo_cierre: number | null; descripcion: string | null;
  etapa_desde: string; activo: boolean; created_at: string; created_by: number | null; updated_at: string; updated_by: number | null;
  contacto_nombre: string; contacto_tipo: TipoContacto; contacto_activo: boolean; persona_nombre: string | null;
  etapa_nombre: string; etapa_tipo: TipoEtapa; etapa_probabilidad: number; etapa_color: string | null; embudo_nombre: string; motivo_nombre: string | null;
  responsable_nombre: string | null; creado_por_nombre: string | null; modificado_por_nombre: string | null;
}
export interface LineaOp {
  id?: number; orden?: number; id_item: number | null; item_codigo?: string | null; item_nombre?: string | null; item_unidad?: string | null;
  descripcion: string | null; cantidad: number; precio_unitario: number; total: number;
}
export interface NotaOp { id: number; nota: string; created_at: string; updated_at: string; id_autor: number | null; autor: string | null; puede_editar?: boolean }
export interface OportunidadDetalle {
  oportunidad: OportunidadBase; lineas: LineaOp[]; tags: (CrmTag & { id_grupo: number | null; activo: boolean })[]; campos: CampoConValor[];
  notas: NotaOp[]; etapas: Etapa[]; config: ConfigCrm;
}

export interface ExportOportunidad {
  id: number; titulo: string; valor: number; fecha_cierre_estimada: string | null; estado: EstadoOp; fecha_cierre_real: string | null; etapa_desde: string;
  activo: boolean; created_at: string; updated_at: string; descripcion: string | null; contacto_nombre: string; contacto_tipo: TipoContacto; persona_nombre: string | null;
  embudo_nombre: string; embudo_orden: number; id_etapa: number; etapa_nombre: string; etapa_orden: number; etapa_tipo: TipoEtapa; etapa_probabilidad: number;
  motivo_nombre: string | null; responsable_nombre: string | null; creado_por: string | null; modificado_por: string | null;
  etiquetas: string[]; campos: Record<string, ValorCampo>;
}
export interface ExportLineaOp {
  id_oportunidad: number; item_codigo: string | null; item_nombre: string | null; item_unidad: string | null; categoria: string | null;
  descripcion: string | null; cantidad: number; precio_unitario: number; total: number;
}
export interface PaginaExportOportunidades {
  oportunidades: ExportOportunidad[]; lineas: ExportLineaOp[]; campos: { id: number; etiqueta: string; tipo_dato: TipoDato }[];
  total: number; pagina: number; por_pagina: number; config: ConfigCrm;
}

// ─── Ventas importadas ────────────────────────────────────────────────────────────────────────────────────────────
export interface FiltrosVenta {
  desde?: string; hasta?: string; contacto?: number; dependientes?: boolean; q?: string; item?: number; categoria?: number; importacion?: number;
  estado?: 'activas' | 'inactivas' | 'todas';
}
export interface ResumenVentas { ventas: number; total: number; unidades: number; clientes: number; ticket_promedio: number; desde: string | null; hasta: string | null }
export interface VentaFila {
  id: number; fecha: string; documento: string | null; total: number; unidades: number; activo: boolean; id_importacion: number | null;
  id_contacto: number; cliente: string; cliente_tipo: TipoContacto; lineas: number;
}
export interface GrupoCliente { id: number; nombre: string; tipo: TipoContacto; ventas: number; total: number; unidades: number; ultima: string }
export interface GrupoItem { id_item: number | null; codigo: string | null; nombre: string | null; categoria: string | null; unidad: string | null; cantidad: number; total: number; ventas: number }
export interface GrupoCategoria { id_categoria: number | null; nombre: string; cantidad: number; total: number; ventas: number }
export interface GrupoMes { mes: string; ventas: number; total: number; unidades: number; clientes: number }
export type VistaVentas = 'lista' | 'clientes' | 'items' | 'categorias' | 'meses';
export interface ListaVentas { ventas: VentaFila[]; total: number; pagina: number; por_pagina: number; resumen: ResumenVentas }
export interface GruposVentas<T> { grupos: T[]; total: number; pagina: number; por_pagina: number; resumen: ResumenVentas }
export interface VentaDetalle {
  venta: { id: number; fecha: string; documento: string | null; total: number; unidades: number; activo: boolean; id_importacion: number | null; id_contacto: number;
    created_at: string; cliente: string; cliente_tipo: TipoContacto; archivo: string | null; creado_por: string | null };
  lineas: { id: number; id_item: number | null; codigo: string | null; nombre: string | null; unidad: string | null; categoria: string | null; cantidad: number; precio_unitario: number; total: number }[];
}
export interface Importacion {
  id: number; archivo: string | null; estado: 'procesando' | 'completa' | 'revertida'; filas_total: number; filas_ok: number; filas_error: number;
  ventas_nuevas: number; ventas_reemplazadas: number; ventas_omitidas: number; items_creados: number; total_valor: number;
  fecha_desde: string | null; fecha_hasta: string | null; errores: { fila: number; motivo: string }[]; created_at: string; revertido_at: string | null;
  creado_por: string | null; revertido_por: string | null;
}
export interface OpcionesImport { identificar: 'documento' | 'nombre' | 'campo'; id_campo?: number | null; items_nuevos: 'crear' | 'sin_item'; duplicados: 'omitir' | 'reemplazar' }
export interface ResultadoBloque {
  filas_ok: number; filas_error: number; ventas_nuevas: number; ventas_reemplazadas: number; ventas_omitidas: number; items_creados: number; total_valor: number;
  fecha_desde: string | null; fecha_hasta: string | null; errores: { fila: number; motivo: string }[]; clientes_no_encontrados: string[];
}
export interface PlantillaImport { id: number; nombre: string; mapeo: Record<string, unknown>; updated_at: string }
export interface PaginaExportVentas {
  ventas: (Omit<VentaFila, 'lineas' | 'id_importacion'> & { cliente_documento: string | null; lote: string | null })[];
  lineas: { id_venta: number; codigo: string | null; nombre: string | null; categoria: string | null; unidad: string | null; cantidad: number; precio_unitario: number; total: number }[];
  total: number; pagina: number; por_pagina: number; resumen: ResumenVentas; config: ConfigCrm;
}

// ─── Metas ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** De dónde sale el valor real de una métrica (fijo en la app; la empresa elige y filtra). */
export type FuenteMetrica = 'ventas_valor' | 'ventas_unidades' | 'ventas_numero' | 'clientes_compra' | 'oportunidades_ganadas_valor' | 'oportunidades_ganadas_numero' | 'oportunidades_creadas';
export type PeriodoMeta = 'mes' | 'trimestre' | 'semestre' | 'anio' | 'personalizado';
export type AmbitoMeta = 'empresa' | 'sede' | 'organizacion';
export type EstadoMeta = 'cumplida' | 'en_ritmo' | 'en_riesgo' | 'atrasada' | 'no_cumplida' | 'futura';
export type FormatoMetrica = 'moneda' | 'numero';
export interface Metrica {
  id: number; nombre: string; fuente: FuenteMetrica; formato: FormatoMetrica; id_item: number | null; item_nombre: string | null;
  id_categoria: number | null; categoria_nombre: string | null; unidad: string | null; descripcion: string | null; orden: number; activo: boolean;
  /** Metas activas que la usan. */
  metas: number;
}
/** Una meta con su avance calculado a la fecha de corte (el backend no guarda el avance). */
export interface Meta {
  id: number; id_metrica: number; metrica_nombre: string; fuente: FuenteMetrica; formato: FormatoMetrica; unidad: string | null; metrica_orden: number; metrica_activa: boolean;
  /** Ítem o categoría que filtra la métrica. */
  filtro: string | null;
  ambito: AmbitoMeta; id_sede: number | null; sede_nombre: string | null; id_contacto: number | null; contacto_nombre: string | null;
  contacto_activo: boolean | null; id_padre: number | null;
  periodo: PeriodoMeta; fecha_inicio: string; fecha_fin: string; valor_meta: number; nota: string | null; activo: boolean; created_at: string; updated_at: string;
  real: number; porcentaje: number; esperado: number; tiempo_pct: number; ritmo: number | null; proyeccion: number | null; faltante: number;
  dias_total: number; dias_transcurridos: number; estado: EstadoMeta;
  /** Metas de sede y empresa: cuánto suman las del nivel de abajo con la misma métrica y período. */
  cobertura?: { n: number; suma: number } | null;
}
export type ConteoMetas = Record<EstadoMeta | 'total', number>;
export interface FiltrosMeta {
  fecha?: string; desde?: string; hasta?: string; ambito?: AmbitoMeta; id_metrica?: number; id_contacto?: number; q?: string;
  estado?: 'activas' | 'inactivas' | 'todas'; estado_avance?: EstadoMeta[];
}
export type OrdenMeta = 'avance' | 'ritmo' | 'meta' | 'real' | 'nombre' | 'periodo';
export interface ListaMetas { metas: Meta[]; total: number; pagina: number; por_pagina: number; conteo: ConteoMetas; corte: string; config: ConfigCrm }
export interface GrupoMetasOrg {
  id_metrica: number; metrica_nombre: string; metrica_orden: number; dias_total: number; formato: FormatoMetrica; unidad: string | null; filtro: string | null; periodo: PeriodoMeta;
  fecha_inicio: string; fecha_fin: string; tiempo_pct: number; n: number; meta: number; real: number; esperado: number; porcentaje: number; estados: Record<EstadoMeta, number>;
}
export interface PanelMetas {
  fecha: string; corte: string; empresa: Meta[]; sede: Meta[];
  organizaciones: { total: number; con_meta: number; activas: number; conteo: ConteoMetas; grupos: GrupoMetasOrg[]; atencion: Meta[]; atencion_total: number };
  config: ConfigCrm;
}
export interface ReferenciaMeta {
  inicio: string; fin: string; actual: number; formato: FormatoMetrica; config: ConfigCrm;
  anterior: { inicio: string; fin: string; real: number }; anio_anterior: { inicio: string; fin: string; real: number };
}
export type AccionGenerar = 'nueva' | 'reemplazar' | 'omitir' | 'sin_base';
export interface ResultadoGenerar {
  nuevas: number; reemplazadas: number; omitidas: number; sin_base: number; suma_meta: number; organizaciones: number; inicio: string; fin: string;
  base: { inicio: string; fin: string; referencia: string } | null;
  filas: { id_contacto: number; nombre: string; base: number | null; meta: number; actual: number | null; accion: AccionGenerar }[];
}
export interface ExportMetas { metas: Meta[]; total: number; conteo: ConteoMetas; corte: string; config: ConfigCrm }

/** Llamadas del módulo CRM. Cada método devuelve la respuesta cruda del backend ({action, mensaje, data}). */
@Injectable({ providedIn: 'root' })
export class CrmService {
  private api = inject(ApiService);

  listContactos(filtros: Filtros, pagina: number, porPagina: number, orden: string, dir: 'asc' | 'desc'): Promise<ApiResponse<ListaContactos>> {
    return this.api.post('crm/list_contactos.php', { filtros, pagina, por_pagina: porPagina, orden, dir });
  }
  getContacto(id: number): Promise<ApiResponse<ContactoDetalle>> {
    return this.api.post('crm/get_contacto.php', { id });
  }
  saveContacto(data: Record<string, unknown>): Promise<ApiResponse<{ id: number; advertencias: Advertencia[] }>> {
    return this.api.post('crm/save_contacto.php', data);
  }
  bulk(accion: AccionLote, seleccion: Seleccion, tagIds?: number[]): Promise<ApiResponse<ResultadoLote>> {
    return this.api.post('crm/bulk_contactos.php', { accion, seleccion, tag_ids: tagIds });
  }
  /** Una página de contactos para exportar (misma selección que las acciones en lote). La primera deja la auditoría. */
  exportContactos(seleccion: SeleccionExport, pagina: number, porPagina: number, orden: string, dir: 'asc' | 'desc', formato: 'pdf' | 'xlsx'): Promise<ApiResponse<PaginaExportContactos>> {
    return this.api.post('crm/export_contactos.php', { seleccion, pagina, por_pagina: porPagina, orden, dir, formato });
  }
  setTags(idContacto: number, tagIds: number[]): Promise<ApiResponse<{ tags: CrmTag[] }>> {
    return this.api.post('crm/set_contacto_tags.php', { id_contacto: idContacto, tag_ids: tagIds });
  }
  listHistorial(idRegistro: number, desde: string | null, pagina: number, tabla: 'crm_contactos' | 'crm_oportunidades' = 'crm_contactos'): Promise<ApiResponse<ListaHistorial>> {
    return this.api.post('crm/list_historial.php', { tabla, id_contacto: idRegistro, desde, pagina });
  }
  listCampos(soloActivos = false, aplicaA?: AplicaA): Promise<ApiResponse<{ campos: CampoDef[] }>> {
    return this.api.post('crm/list_campos.php', { solo_activos: soloActivos ? 1 : 0, aplica_a: aplicaA });
  }
  saveCampo(data: Record<string, unknown>): Promise<ApiResponse<CampoDef>> {
    return this.api.post('crm/save_campo.php', data);
  }
  listTags(soloActivos = false): Promise<ApiResponse<CatalogoTags>> {
    return this.api.post('crm/list_tags.php', { solo_activos: soloActivos ? 1 : 0 });
  }
  saveTag(data: Record<string, unknown>): Promise<ApiResponse<TagDef>> {
    return this.api.post('crm/save_tag.php', data);
  }
  saveTagGrupo(data: Record<string, unknown>): Promise<ApiResponse<TagGrupo>> {
    return this.api.post('crm/save_tag_grupo.php', data);
  }
  listResponsables(): Promise<ApiResponse<{ usuarios: UsuarioSede[] }>> {
    return this.api.post('crm/list_responsables.php');
  }
  listRoles(soloActivos = false): Promise<ApiResponse<{ roles: RolVinculo[] }>> {
    return this.api.post('crm/list_roles.php', { solo_activos: soloActivos ? 1 : 0 });
  }
  saveRol(data: Record<string, unknown>): Promise<ApiResponse<RolVinculo>> {
    return this.api.post('crm/save_rol.php', data);
  }
  listVocabulario(): Promise<ApiResponse<{ vocabulario: Vocabulario }>> {
    return this.api.post('crm/list_vocabulario.php');
  }
  saveVocabulario(vocabulario: Vocabulario): Promise<ApiResponse<{ vocabulario: Vocabulario }>> {
    return this.api.post('crm/save_vocabulario.php', { vocabulario });
  }
  listPlantillas(): Promise<ApiResponse<{ plantillas: Plantilla[] }>> {
    return this.api.post('crm/list_plantillas.php');
  }
  applyPlantilla(plantilla: string): Promise<ApiResponse<ResultadoPlantilla>> {
    return this.api.post('crm/apply_plantilla.php', { plantilla });
  }

  // ─── Configuración general, embudos, motivos y catálogo ─────────────────────────────────────────────────────────
  getConfig(): Promise<ApiResponse<ConfigCrm>> { return this.api.post('crm/get_config.php'); }
  saveConfig(cfg: ConfigCrm): Promise<ApiResponse<ConfigCrm>> { return this.api.post('crm/save_config.php', { ...cfg }); }
  listEmbudos(soloActivos = false): Promise<ApiResponse<{ embudos: Embudo[]; config: ConfigCrm }>> {
    return this.api.post('crm/list_embudos.php', { solo_activos: soloActivos ? 1 : 0 });
  }
  saveEmbudo(data: Record<string, unknown>): Promise<ApiResponse<{ id: number }>> { return this.api.post('crm/save_embudo.php', data); }
  saveEtapa(data: Record<string, unknown>): Promise<ApiResponse<Etapa>> { return this.api.post('crm/save_etapa.php', data); }
  listMotivos(soloActivos = false, tipo?: 'ganada' | 'perdida'): Promise<ApiResponse<{ motivos: MotivoCierre[] }>> {
    return this.api.post('crm/list_motivos.php', { solo_activos: soloActivos ? 1 : 0, tipo });
  }
  saveMotivo(data: Record<string, unknown>): Promise<ApiResponse<MotivoCierre>> { return this.api.post('crm/save_motivo.php', data); }
  listCategoriasItem(soloActivos = false): Promise<ApiResponse<{ categorias: CategoriaItem[] }>> {
    return this.api.post('crm/list_categorias_item.php', { solo_activos: soloActivos ? 1 : 0 });
  }
  saveCategoriaItem(data: Record<string, unknown>): Promise<ApiResponse<CategoriaItem>> { return this.api.post('crm/save_categoria_item.php', data); }
  listItems(o: { q?: string; idCategoria?: number | null; soloActivos?: boolean; pagina?: number; porPagina?: number } = {}): Promise<ApiResponse<ListaItems>> {
    return this.api.post('crm/list_items.php', {
      q: o.q, id_categoria: o.idCategoria ?? undefined, solo_activos: o.soloActivos ? 1 : 0, pagina: o.pagina ?? 1, por_pagina: o.porPagina ?? 50,
    });
  }
  saveItem(data: Record<string, unknown>): Promise<ApiResponse<ItemCatalogo>> { return this.api.post('crm/save_item.php', data); }

  // ─── Oportunidades ──────────────────────────────────────────────────────────────────────────────────────────────
  listOportunidades(filtros: FiltrosOp, pagina: number, porPagina: number, orden: OrdenOp, dir: 'asc' | 'desc'): Promise<ApiResponse<ListaOportunidades>> {
    return this.api.post('crm/list_oportunidades.php', { vista: 'lista', filtros, pagina, por_pagina: porPagina, orden, dir });
  }
  tableroOportunidades(filtros: FiltrosOp): Promise<ApiResponse<Tablero>> {
    return this.api.post('crm/list_oportunidades.php', { vista: 'tablero', filtros });
  }
  getOportunidad(id: number): Promise<ApiResponse<OportunidadDetalle>> { return this.api.post('crm/get_oportunidad.php', { id }); }
  saveOportunidad(data: Record<string, unknown>): Promise<ApiResponse<{ id: number }>> { return this.api.post('crm/save_oportunidad.php', data); }
  moveOportunidad(o: { id: number; idEtapa: number; idMotivo?: number | null; fechaCierre?: string | null; nota?: string }): Promise<ApiResponse<{ cambio: boolean; oportunidad: OportunidadBase }>> {
    return this.api.post('crm/move_oportunidad.php', { id: o.id, id_etapa: o.idEtapa, id_motivo: o.idMotivo ?? undefined, fecha_cierre: o.fechaCierre ?? undefined, nota: o.nota || undefined });
  }
  bulkOportunidades(accion: AccionLote, seleccion: SeleccionOp, tagIds?: number[]): Promise<ApiResponse<ResultadoLote>> {
    return this.api.post('crm/bulk_oportunidades.php', { accion, seleccion, tag_ids: tagIds });
  }
  exportOportunidades(seleccion: SeleccionOpExport, pagina: number, porPagina: number, formato: 'pdf' | 'xlsx'): Promise<ApiResponse<PaginaExportOportunidades>> {
    return this.api.post('crm/export_oportunidades.php', { seleccion, pagina, por_pagina: porPagina, formato });
  }
  listNotas(idOportunidad: number): Promise<ApiResponse<{ notas: NotaOp[]; total: number }>> { return this.api.post('crm/list_notas.php', { id_oportunidad: idOportunidad }); }
  saveNota(data: Record<string, unknown>): Promise<ApiResponse<{ id: number }>> { return this.api.post('crm/save_nota.php', data); }

  // ─── Ventas importadas ──────────────────────────────────────────────────────────────────────────────────────────
  listVentas(filtros: FiltrosVenta, pagina = 1, porPagina = 25, orden = 'fecha', dir: 'asc' | 'desc' = 'desc'): Promise<ApiResponse<ListaVentas>> {
    return this.api.post('crm/list_ventas.php', { vista: 'lista', filtros, pagina, por_pagina: porPagina, orden, dir });
  }
  gruposVentas<T>(vista: Exclude<VistaVentas, 'lista'>, filtros: FiltrosVenta, pagina = 1, porPagina = 25): Promise<ApiResponse<GruposVentas<T>>> {
    return this.api.post('crm/list_ventas.php', { vista, filtros, pagina, por_pagina: porPagina });
  }
  getVenta(id: number): Promise<ApiResponse<VentaDetalle>> { return this.api.post('crm/get_venta.php', { id }); }
  importarVentas(accion: 'simular' | 'bloque', ventas: unknown[], opciones: OpcionesImport, idImportacion?: number): Promise<ApiResponse<ResultadoBloque>> {
    return this.api.post('crm/import_ventas.php', { accion, ventas, opciones, id_importacion: idImportacion });
  }
  iniciarImportacion(archivo: string, filasTotal: number, opciones: OpcionesImport, mapeo: unknown): Promise<ApiResponse<{ id: number }>> {
    return this.api.post('crm/import_ventas.php', { accion: 'iniciar', archivo, filas_total: filasTotal, opciones, mapeo });
  }
  finalizarImportacion(id: number): Promise<ApiResponse<{ id: number }>> { return this.api.post('crm/import_ventas.php', { accion: 'finalizar', id_importacion: id }); }
  listImportaciones(pagina = 1, porPagina = 25): Promise<ApiResponse<{ importaciones: Importacion[]; total: number }>> {
    return this.api.post('crm/list_importaciones.php', { pagina, por_pagina: porPagina });
  }
  revertirImportacion(id: number): Promise<ApiResponse<{ ventas_desactivadas: number }>> { return this.api.post('crm/revertir_importacion.php', { id_importacion: id }); }
  listImportPlantillas(): Promise<ApiResponse<{ plantillas: PlantillaImport[] }>> { return this.api.post('crm/list_import_plantillas.php'); }
  saveImportPlantilla(nombre: string, mapeo: unknown, activo = true): Promise<ApiResponse<{ nombre: string }>> {
    return this.api.post('crm/save_import_plantilla.php', { nombre, mapeo: activo ? mapeo : undefined, activo: activo ? 1 : 0 });
  }
  exportVentas(filtros: FiltrosVenta, pagina: number, porPagina: number, formato: 'pdf' | 'xlsx', totalEsperado?: number): Promise<ApiResponse<PaginaExportVentas>> {
    return this.api.post('crm/export_ventas.php', { filtros, pagina, por_pagina: porPagina, formato, total_esperado: totalEsperado });
  }

  // ─── Metas ──────────────────────────────────────────────────────────────────────────────────────────────────────
  listMetricas(soloActivas = false): Promise<ApiResponse<{ metricas: Metrica[]; config: ConfigCrm }>> {
    return this.api.post('crm/list_metricas.php', { solo_activas: soloActivas ? 1 : 0 });
  }
  saveMetrica(data: Record<string, unknown>): Promise<ApiResponse<Metrica>> { return this.api.post('crm/save_metrica.php', data); }
  listMetas(filtros: FiltrosMeta, o: { pagina?: number; porPagina?: number; orden?: OrdenMeta; dir?: 'asc' | 'desc'; corte?: string } = {}): Promise<ApiResponse<ListaMetas>> {
    return this.api.post('crm/list_metas.php', { vista: 'lista', filtros, pagina: o.pagina ?? 1, por_pagina: o.porPagina ?? 25, orden: o.orden ?? 'avance', dir: o.dir ?? 'asc', corte: o.corte });
  }
  /** Metas vigentes en `fecha` (por defecto hoy) en tres niveles: empresa, sede y organizaciones. */
  panelMetas(fecha?: string): Promise<ApiResponse<PanelMetas>> { return this.api.post('crm/list_metas.php', { vista: 'panel', fecha }); }
  /** Real del período actual, del anterior y del mismo período del año anterior, para decidir cuánto pedir. */
  referenciaMeta(p: { idMetrica: number; ambito: AmbitoMeta; idContacto?: number | null; periodo: PeriodoMeta; fecha: string; fechaFin?: string | null }): Promise<ApiResponse<ReferenciaMeta>> {
    return this.api.post('crm/list_metas.php', {
      vista: 'referencia', id_metrica: p.idMetrica, ambito: p.ambito, id_contacto: p.idContacto ?? undefined, periodo: p.periodo, fecha: p.fecha, fecha_fin: p.fechaFin ?? undefined,
    });
  }
  saveMeta(data: Record<string, unknown>): Promise<ApiResponse<Meta>> { return this.api.post('crm/save_meta.php', data); }
  generarMetas(accion: 'simular' | 'guardar', data: Record<string, unknown>): Promise<ApiResponse<ResultadoGenerar>> {
    return this.api.post('crm/generar_metas.php', { accion, ...data });
  }
  exportMetas(filtros: FiltrosMeta, formato: 'pdf' | 'xlsx'): Promise<ApiResponse<ExportMetas>> { return this.api.post('crm/export_metas.php', { filtros, formato }); }
}
