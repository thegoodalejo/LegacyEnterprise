// Importar contactos (Personas u Organizaciones): qué columnas se reconocen, cómo se interpreta cada fila y en qué orden se mandan.
// Funciones puras (sin Angular) con pruebas en import-contactos.spec.ts. La lectura del archivo y los formatos de fecha/número son los de
// import-parse.ts (los mismos de la importación de ventas). El servidor vuelve a validar todo con las reglas del formulario.

import { Celda, FormatoFecha, SeparadorDecimal, mapeoPorSinonimos, normalizarEncabezado, parsearFecha, parsearNumero, texto } from './import-parse';

export type TipoImport = 'persona' | 'organizacion';
export type IdentificarImport = 'documento' | 'nombre' | 'campo' | 'ninguno';
export type CampoContacto =
  | 'nombres' | 'apellidos' | 'razon_social' | 'documento_tipo' | 'documento_numero' | 'correo' | 'correo_facturacion' | 'telefono' | 'whatsapp'
  | 'fecha_nacimiento' | 'direccion' | 'ciudad' | 'lat' | 'lng' | 'responsable' | 'etiquetas' | 'organizacion' | 'rol' | 'pertenece_a'
  | 'ref_nombres' | 'ref_apellidos' | 'ref_rol' | 'ref_telefono' | 'ref_correo' | 'ref_documento' | 'ref_whatsapp';

/** Campos fijos por tipo, en el orden en que se muestran. */
export const CAMPOS_CONTACTO: Record<TipoImport, readonly CampoContacto[]> = {
  persona: ['nombres', 'apellidos', 'documento_tipo', 'documento_numero', 'correo', 'telefono', 'whatsapp', 'fecha_nacimiento', 'direccion', 'ciudad',
    'lat', 'lng', 'responsable', 'etiquetas', 'organizacion', 'rol'],
  organizacion: ['razon_social', 'documento_tipo', 'documento_numero', 'correo_facturacion', 'telefono', 'direccion', 'ciudad', 'lat', 'lng', 'responsable',
    'etiquetas', 'pertenece_a', 'ref_nombres', 'ref_apellidos', 'ref_rol', 'ref_telefono', 'ref_correo', 'ref_documento', 'ref_whatsapp'],
};
/** Sin estas columnas no se puede revisar. (Una organización NUEVA además necesita «Contacto: nombres»: sin esa columna solo se actualizan existentes.) */
export const OBLIGATORIOS_CONTACTO: Record<TipoImport, readonly CampoContacto[]> = { persona: ['nombres'], organizacion: ['razon_social'] };

/** Encabezados que se reconocen solos (normalizados: minúsculas, sin tildes ni signos). */
const SINONIMOS: Record<TipoImport, Partial<Record<CampoContacto, string[]>>> = {
  persona: {
    nombres: ['nombres', 'nombre', 'nombre completo', 'nombres y apellidos', 'nombre y apellido', 'name', 'first name', 'paciente', 'cliente'],
    apellidos: ['apellidos', 'apellido', 'last name', 'surname'],
    documento_tipo: ['tipo documento', 'tipo de documento', 'tipo doc', 'tipo identificacion', 'tipo id'],
    documento_numero: ['documento', 'numero documento', 'numero de documento', 'cedula', 'identificacion', 'cc', 'no documento', 'num documento', 'nit', 'id'],
    correo: ['correo', 'email', 'e mail', 'correo electronico', 'mail'],
    telefono: ['telefono', 'tel', 'celular', 'movil', 'telefono fijo', 'phone', 'numero telefono'],
    whatsapp: ['whatsapp', 'wa', 'numero whatsapp', 'celular whatsapp'],
    fecha_nacimiento: ['fecha nacimiento', 'fecha de nacimiento', 'nacimiento', 'cumpleanos', 'birthday'],
    direccion: ['direccion', 'dir', 'address', 'domicilio'],
    ciudad: ['ciudad', 'municipio', 'city', 'localidad'],
    lat: ['latitud', 'lat', 'latitude'],
    lng: ['longitud', 'lng', 'lon', 'long', 'longitude'],
    responsable: ['responsable', 'vendedor', 'asesor', 'ejecutivo', 'comercial', 'owner'],
    etiquetas: ['etiquetas', 'etiqueta', 'tags', 'tag'],
    organizacion: ['organizacion', 'empresa', 'negocio', 'nit empresa', 'compania', 'company', 'organizacion nit'],
    rol: ['rol', 'cargo', 'puesto', 'role', 'position'],
  },
  organizacion: {
    razon_social: ['razon social', 'nombre', 'empresa', 'nombre empresa', 'negocio', 'nombre negocio', 'establecimiento', 'tienda', 'cliente', 'organizacion', 'company'],
    documento_tipo: ['tipo documento', 'tipo de documento', 'tipo doc', 'tipo identificacion', 'tipo id'],
    documento_numero: ['nit', 'documento', 'numero documento', 'identificacion', 'nit empresa', 'rut', 'nit cliente'],
    correo_facturacion: ['correo facturacion', 'email facturacion', 'correo de facturacion', 'correo', 'email', 'correo electronico'],
    telefono: ['telefono', 'tel', 'celular', 'telefono empresa', 'phone', 'pbx'],
    direccion: ['direccion', 'dir', 'address'],
    ciudad: ['ciudad', 'municipio', 'city', 'localidad'],
    lat: ['latitud', 'lat', 'latitude'],
    lng: ['longitud', 'lng', 'lon', 'long', 'longitude'],
    responsable: ['responsable', 'vendedor', 'asesor', 'ejecutivo', 'comercial', 'owner'],
    etiquetas: ['etiquetas', 'etiqueta', 'tags', 'tag'],
    pertenece_a: ['pertenece a', 'matriz', 'grupo', 'empresa padre', 'nit matriz', 'operador', 'cadena', 'casa matriz'],
    ref_nombres: ['contacto', 'nombre contacto', 'persona contacto', 'contacto nombre', 'contacto nombres', 'nombres contacto', 'contacto principal', 'persona de contacto'],
    ref_apellidos: ['apellidos contacto', 'contacto apellidos', 'apellido contacto', 'contacto apellido'],
    ref_rol: ['cargo contacto', 'rol contacto', 'contacto cargo', 'contacto rol', 'cargo'],
    ref_telefono: ['telefono contacto', 'celular contacto', 'contacto telefono', 'contacto celular'],
    ref_correo: ['correo contacto', 'email contacto', 'contacto correo', 'contacto email'],
    ref_documento: ['cedula contacto', 'documento contacto', 'contacto documento', 'contacto cedula'],
    ref_whatsapp: ['whatsapp contacto', 'contacto whatsapp'],
  },
};

export type TipoDato = 'entero' | 'decimal' | 'texto' | 'booleano' | 'fecha';
export interface CampoPersonalizadoImport { id: number; etiqueta: string; clave: string; tipo_dato: TipoDato }

/** Columna (0…) por campo fijo o por campo personalizado (`campo:<id>`); null = no se usa. */
export type ColumnasContacto = Record<string, number | null>;
export interface MapeoContactos {
  tipo: TipoImport;
  columnas: ColumnasContacto;
  fila_encabezado: number;
  formato_fecha: FormatoFecha;
  decimal: SeparadorDecimal;
  hoja?: string;
}
/** Lo que se manda al servidor por fila. `clave` = el valor con que se reconoce si ya existe (según «Reconocer existentes por»). */
export interface FilaContacto { fila: number; clave: string | null; d: Partial<Record<CampoContacto, string | number | null>>; campos: Record<number, string | number | null> }
export interface ErrorFilaContacto { fila: number; motivo: string }

export const claveCampo = (id: number): string => `campo:${id}`;

/** Propone las columnas de cada campo (fijos del tipo y personalizados, por su etiqueta o su clave). */
export function mapeoContactos(encabezados: string[], tipo: TipoImport, personalizados: readonly CampoPersonalizadoImport[]): ColumnasContacto {
  const claves: string[] = [...CAMPOS_CONTACTO[tipo], ...personalizados.map(c => claveCampo(c.id))];
  const sin: Record<string, string[]> = { ...(SINONIMOS[tipo] as Record<string, string[]>) };
  for (const c of personalizados) sin[claveCampo(c.id)] = [normalizarEncabezado(c.etiqueta), normalizarEncabezado(c.clave.replace(/_/g, ' '))];
  return mapeoPorSinonimos(encabezados, claves, sin);
}

/** Texto para comparar (igual que el servidor): minúsculas, sin tildes, espacios normalizados. */
export function claveTexto(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Documento para comparar (como crmVentaClavesDoc del servidor): con guion, los dígitos antes del guion (NIT sin dígito de verificación);
 * si no, todos los dígitos. null si quedan menos de 3.
 */
export function claveDocumento(s: string): string | null {
  const antes = s.includes('-') ? s.slice(0, s.indexOf('-')).replace(/\D/g, '') : '';
  if (antes.length >= 3) return antes;
  const todos = s.replace(/\D/g, '');
  return todos.length >= 3 ? todos : null;
}

/** Clave de una organización del archivo (la misma que calcula el servidor en crmImpcClaveOrg): «d:<dígitos>» o «n:<nombre>». */
export function claveOrganizacion(v: string): string {
  const d = claveDocumento(v);
  return d ? `d:${d}` : `n:${claveTexto(v)}`;
}

/** «sí», «si», «x», «true», «1», «verdadero», «yes» → 'true'; «no», «false», «0», «falso» → 'false'; vacío → null; otro → NaN. */
export function parsearBooleano(v: Celda): string | null | typeof NaN {
  if (v === null || v === '') return null;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return v === 1 ? 'true' : v === 0 ? 'false' : NaN;
  const s = claveTexto(String(v));
  if (['si', 'x', 'true', '1', 'verdadero', 'yes', 's'].includes(s)) return 'true';
  if (['no', 'false', '0', 'falso', 'n'].includes(s)) return 'false';
  return NaN;
}

/**
 * Interpreta las filas de datos. Por fila: textos recortados, fecha de nacimiento y fechas de campos → AAAA-MM-DD, latitud/longitud y campos
 * numéricos → número, sí/no → 'true'/'false'. Errores detectados aquí (antes del servidor): sin nombre, fecha o número ilegible, sí/no ilegible
 * y el mismo contacto repetido en el archivo (según cómo se reconocen los existentes). Las filas vacías se ignoran.
 */
export function armarContactos(
  filas: Celda[][], m: MapeoContactos, personalizados: readonly CampoPersonalizadoImport[], identificar: IdentificarImport, idCampo: number | null,
): { filas: FilaContacto[]; errores: ErrorFilaContacto[]; total: number } {
  const col = (f: Celda[], k: string): Celda => { const i = m.columnas[k]; return i === null || i === undefined ? null : f[i] ?? null; };
  const out: FilaContacto[] = [];
  const errores: ErrorFilaContacto[] = [];
  const vistas = new Map<string, number>();   // clave de comparación → fila donde apareció primero
  let total = 0;
  for (let i = m.fila_encabezado; i < filas.length; i++) {
    const f = filas[i] ?? [];
    if (!f.some(c => c !== null && String(c).trim() !== '')) continue;
    const fila = i + 1;
    total++;
    const d: FilaContacto['d'] = {};
    let motivo: string | null = null;
    for (const k of CAMPOS_CONTACTO[m.tipo]) {
      if (m.columnas[k] === null || m.columnas[k] === undefined) continue;
      const v = col(f, k);
      if (k === 'fecha_nacimiento') {
        const iso = parsearFecha(v, m.formato_fecha);
        if (!iso && texto(v) !== '') { motivo = 'fecha'; break; }
        d[k] = iso;
      } else if (k === 'lat' || k === 'lng') {
        const n = parsearNumero(v, m.decimal);
        if (n !== null && Number.isNaN(n)) { motivo = 'numero'; break; }
        d[k] = n;
      } else {
        d[k] = texto(v) || null;
      }
    }
    const campos: FilaContacto['campos'] = {};
    if (!motivo) {
      for (const c of personalizados) {
        const v = col(f, claveCampo(c.id));
        if (m.columnas[claveCampo(c.id)] === null || m.columnas[claveCampo(c.id)] === undefined) continue;
        if (c.tipo_dato === 'fecha') {
          const iso = parsearFecha(v, m.formato_fecha);
          if (!iso && texto(v) !== '') { motivo = 'fecha'; break; }
          campos[c.id] = iso;
        } else if (c.tipo_dato === 'entero' || c.tipo_dato === 'decimal') {
          const n = parsearNumero(v, m.decimal);
          if (n !== null && Number.isNaN(n)) { motivo = 'numero'; break; }
          campos[c.id] = n;
        } else if (c.tipo_dato === 'booleano') {
          const b = parsearBooleano(v);
          if (typeof b === 'number') { motivo = 'booleano'; break; }
          campos[c.id] = b;
        } else {
          campos[c.id] = texto(v) || null;
        }
      }
    }
    const nombre = m.tipo === 'persona' ? [d.nombres, d.apellidos].filter(Boolean).join(' ') : String(d.razon_social ?? '');
    if (!motivo && !(m.tipo === 'persona' ? d.nombres : d.razon_social)) motivo = 'nombre';
    if (motivo) { errores.push({ fila, motivo }); continue; }

    let clave: string | null = null;
    if (identificar === 'documento') clave = (d.documento_numero as string | null) ?? null;
    else if (identificar === 'nombre') clave = nombre || null;
    else if (identificar === 'campo' && idCampo) { const v = campos[idCampo]; clave = v === null || v === undefined ? null : String(v); }
    if (clave) {
      const cmp = identificar === 'documento' ? claveDocumento(clave) ?? claveTexto(clave) : claveTexto(clave);
      const antes = vistas.get(cmp);
      if (antes !== undefined) { errores.push({ fila, motivo: `repetido:${antes}` }); continue; }
      vistas.set(cmp, fila);
    }
    out.push({ fila, clave, d, campos });
  }
  return { filas: out, errores, total };
}

/**
 * Organizaciones: primero las que otras filas del archivo tienen como «Pertenece a» (una matriz antes que sus sucursales, a cualquier
 * profundidad), para que al importar por bloques la matriz ya exista. Orden estable; un ciclo no se reordena (el servidor lo rechaza).
 */
export function ordenarPorMatriz(filas: FilaContacto[]): FilaContacto[] {
  const indice = new Map<string, number>();
  filas.forEach((f, i) => {
    for (const v of [f.d.documento_numero, f.d.razon_social]) if (v !== null && v !== undefined && String(v).trim()) indice.set(claveOrganizacion(String(v)), i);
  });
  const nivel = new Map<number, number>();
  const calcular = (i: number, visitando: Set<number>): number => {
    const ya = nivel.get(i);
    if (ya !== undefined) return ya;
    const p = filas[i].d.pertenece_a;
    const padre = p ? indice.get(claveOrganizacion(String(p))) : undefined;
    let n = 0;
    if (padre !== undefined && padre !== i && !visitando.has(padre)) { visitando.add(i); n = calcular(padre, visitando) + 1; visitando.delete(i); }
    nivel.set(i, n);
    return n;
  };
  return filas.map((f, i) => ({ f, i, n: calcular(i, new Set([i])) })).sort((a, b) => a.n - b.n || a.i - b.i).map(x => x.f);
}

/** Parte las filas en bloques (el servidor acepta hasta 500). */
export function bloquesContactos(filas: FilaContacto[], max = 400): FilaContacto[][] {
  const out: FilaContacto[][] = [];
  for (let i = 0; i < filas.length; i += max) out.push(filas.slice(i, i + max));
  return out;
}

/**
 * Para la simulación por bloques: por cada bloque, las claves de las organizaciones de bloques ANTERIORES que alguna fila usa como «Pertenece a»
 * (el servidor revierte cada bloque simulado, así que no las encontraría en la base).
 */
export function padresPorBloque(bloques: FilaContacto[][]): string[][] {
  const usadas = new Set<string>();
  for (const b of bloques) for (const f of b) if (f.d.pertenece_a) usadas.add(claveOrganizacion(String(f.d.pertenece_a)));
  const acumuladas: string[] = [];
  return bloques.map(b => {
    const aqui = [...acumuladas];
    for (const f of b) for (const v of [f.d.documento_numero, f.d.razon_social]) {
      if (v === null || v === undefined || !String(v).trim()) continue;
      const k = claveOrganizacion(String(v));
      if (usadas.has(k) && !acumuladas.includes(k)) acumuladas.push(k);
    }
    return aqui;
  });
}
