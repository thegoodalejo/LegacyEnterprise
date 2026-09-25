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
  embudo: { nombre: string; etapas: string[] } | null; motivos: string[]; items: string[];
}
export type ResultadoPlantilla = Record<'vocabulario' | 'roles' | 'campos' | 'grupos' | 'tags' | 'etapas' | 'motivos' | 'items', { agregados: number; existentes: number }>;

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
}
