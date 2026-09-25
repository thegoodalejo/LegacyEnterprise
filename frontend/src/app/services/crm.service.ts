import { Injectable, inject } from '@angular/core';
import { ApiResponse, ApiService } from './api.service';

export type TipoContacto = 'persona' | 'organizacion';
export type TipoDato = 'entero' | 'decimal' | 'texto' | 'booleano' | 'fecha';
export type EstadoFiltro = 'activos' | 'archivados' | 'todos';

export interface CrmTag { id: number; nombre: string; color: string }
export interface TagDef extends CrmTag {
  id_grupo: number | null; aplica_a: TipoContacto | null; orden: number; activo: boolean;
}
export interface TagGrupo { id: number; nombre: string; orden: number; activo: boolean }
export interface CatalogoTags { grupos: TagGrupo[]; tags: TagDef[] }

export interface CampoDef {
  id: number; aplica_a: TipoContacto; clave: string; etiqueta: string; tipo_dato: TipoDato;
  obligatorio: boolean; orden: number; activo: boolean;
}
export type ValorCampo = string | number | boolean | null;
export interface CampoConValor { id: number; clave: string; etiqueta: string; tipo_dato: TipoDato; obligatorio: boolean; activo: boolean; valor: ValorCampo }

export interface UsuarioSede { id: number; nombre: string }
export interface RolVinculo { id: number; nombre: string; orden: number; activo: boolean }

export type ClaveVocabulario = 'contacto' | 'persona' | 'organizacion';
export type Vocabulario = Partial<Record<ClaveVocabulario, { singular: string; plural: string }>>;

export interface Plantilla {
  id: string; vocabulario: Vocabulario; roles: string[];
  campos: { aplica_a: TipoContacto; etiqueta: string; tipo_dato: TipoDato }[];
  grupos: { nombre: string; tags: string[] }[]; tags: string[];
}
export type ResultadoPlantilla = Record<'vocabulario' | 'roles' | 'campos' | 'grupos' | 'tags', { agregados: number; existentes: number }>;

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
export type AccionLote = 'archivar' | 'restaurar' | 'tags_agregar' | 'tags_quitar';
export interface ResultadoLote {
  procesados: number; sin_cambios: number; omitidos: { id: number; motivo: string; tag?: string }[]; omitidos_total: number; lote: string;
}

export interface EntradaHistorial {
  id: number; accion: string; created_at: string; id_usuario: number; usuario: string | null;
  detalle: {
    tipo?: string; nombre?: string; origen?: string; lote?: string; rol?: string | null;
    cambios?: { campo: string; etiqueta?: string; antes: unknown; despues: unknown }[];
    tags?: string[] | { agregados: string[]; quitados: string[] };
    persona?: { id: number; nombre: string }; organizacion?: { id: number; nombre: string };
  } | null;
}
export interface ListaHistorial { historial: EntradaHistorial[]; total: number; pagina: number; por_pagina: number; desde: string; hay_anteriores: boolean }

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
  setTags(idContacto: number, tagIds: number[]): Promise<ApiResponse<{ tags: CrmTag[] }>> {
    return this.api.post('crm/set_contacto_tags.php', { id_contacto: idContacto, tag_ids: tagIds });
  }
  listHistorial(idContacto: number, desde: string | null, pagina: number): Promise<ApiResponse<ListaHistorial>> {
    return this.api.post('crm/list_historial.php', { id_contacto: idContacto, desde, pagina });
  }
  listCampos(soloActivos = false): Promise<ApiResponse<{ campos: CampoDef[] }>> {
    return this.api.post('crm/list_campos.php', { solo_activos: soloActivos ? 1 : 0 });
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
}
