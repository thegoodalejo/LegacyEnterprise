// Lectura e interpretación de archivos de importación (CSV / Excel) en el navegador. Funciones puras salvo leerArchivo(),
// que carga ExcelJS solo cuando el archivo es .xlsx. Pruebas: import-parse.spec.ts.

export type Celda = string | number | boolean | Date | null;
export interface Hoja { nombre: string; filas: Celda[][] }

export type CampoVenta = 'fecha' | 'cliente' | 'documento' | 'codigo' | 'descripcion' | 'cantidad' | 'precio' | 'total';
export const CAMPOS_VENTA: readonly CampoVenta[] = ['fecha', 'cliente', 'documento', 'codigo', 'descripcion', 'cantidad', 'precio', 'total'];
export type FormatoFecha = 'dmy' | 'ymd' | 'mdy';
export type SeparadorDecimal = 'coma' | 'punto';

/** Índice de columna (0…) por campo; null = no se usa. */
export type Columnas = Partial<Record<CampoVenta, number | null>>;

export interface MapeoVentas {
  columnas: Columnas;
  /** Fila del encabezado (1 = primera). Los datos empiezan en la siguiente. */
  fila_encabezado: number;
  formato_fecha: FormatoFecha;
  decimal: SeparadorDecimal;
  hoja?: string;
}

export interface LineaImport { fila: number; codigo: string | null; descripcion: string | null; cantidad: number | null; precio: number | null; total: number | null }
export interface VentaImport { fila: number; fecha: string; cliente: string; documento: string | null; lineas: LineaImport[] }
export interface ErrorFila { fila: number; motivo: string }

// ─── Lectura ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Texto de un archivo: UTF-8 (con o sin BOM) y, si no es UTF-8 válido, Windows-1252 (lo que exporta Excel en español como «CSV»). */
export function decodificar(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Separador de un CSV: el que más aparece (fuera de comillas) en las primeras líneas entre «;», «,», tabulador y «|». */
export function detectarSeparador(texto: string): string {
  const muestra = texto.split(/\r?\n/).slice(0, 20).join('\n');
  let mejor = ',', max = -1;
  for (const sep of [';', ',', '\t', '|']) {
    let n = 0, comillas = false;
    for (const ch of muestra) { if (ch === '"') comillas = !comillas; else if (ch === sep && !comillas) n++; }
    if (n > max) { max = n; mejor = sep; }
  }
  return mejor;
}

/** CSV → filas de texto (RFC 4180: comillas dobles, comillas escapadas "" y saltos de línea dentro de comillas). */
export function parsearCsv(texto: string, sep = detectarSeparador(texto)): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(c => c.trim() !== ''));
}

/** Valor simple de una celda de ExcelJS (fórmulas, texto enriquecido, hipervínculos y errores incluidos). */
export function valorCelda(v: unknown): Celda {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown; error?: unknown };
    if ('result' in o) return valorCelda(o.result);
    if (Array.isArray(o.richText)) return o.richText.map(r => r.text).join('');
    if ('text' in o) return valorCelda(o.text);
    if ('error' in o) return null;
  }
  return String(v);
}

/** Lee un .csv/.txt o un .xlsx y devuelve sus hojas (un CSV es una sola hoja). */
export async function leerArchivo(archivo: File): Promise<Hoja[]> {
  const buf = await archivo.arrayBuffer();
  if (/\.xlsx$/i.test(archivo.name)) {
    const mod = await import('exceljs');
    const EJ = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const wb = new EJ.Workbook();
    await wb.xlsx.load(buf);
    return wb.worksheets.map(ws => {
      const filas: Celda[][] = [];
      ws.eachRow({ includeEmpty: false }, (row, n) => {
        const valores = (row.values as unknown[]).slice(1).map(valorCelda);   // ExcelJS numera las columnas desde 1
        filas[n - 1] = valores;
      });
      for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];
      return { nombre: ws.name, filas };
    }).filter(h => h.filas.some(f => f.some(c => c !== null && c !== '')));
  }
  if (/\.xls$/i.test(archivo.name)) throw new Error('xls');
  return [{ nombre: archivo.name, filas: parsearCsv(decodificar(buf)) }];
}

// ─── Interpretación ──────────────────────────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
function fechaValida(y: number, m: number, d: number): string | null {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/**
 * Fecha de una celda → AAAA-MM-DD, o null si no se puede leer.
 * Date de Excel: se toma en UTC (ExcelJS la entrega así). Número: serial de Excel. Texto: según el formato elegido, con «/», «-», «.» o espacio.
 * AAAA-MM-DD (con o sin hora) siempre se acepta, sea cual sea el formato.
 */
export function parsearFecha(v: Celda, formato: FormatoFecha): string | null {
  if (v === null || v === '' || typeof v === 'boolean') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;   // serial de Excel entre 1954 y 2119
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = v.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(s);
  if (iso) return fechaValida(+iso[1], +iso[2], +iso[3]);
  const p = /^(\d{1,4})[/\-. ](\d{1,2})[/\-. ](\d{1,4})(?:\s.*)?$/.exec(s);
  if (!p) return null;
  const [a, b, c] = [+p[1], +p[2], +p[3]];
  if (formato === 'ymd') return fechaValida(a, b, c);
  if (formato === 'mdy') return fechaValida(c, a, b);
  return fechaValida(c, b, a);
}

/**
 * Número de una celda. Texto con separador decimal «coma» (1.234.567,89) o «punto» (1,234,567.89); acepta $, espacios y signo.
 * null si está vacía; NaN si no es un número.
 */
export function parsearNumero(v: Celda, decimal: SeparadorDecimal): number | null {
  if (v === null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean' || v instanceof Date) return NaN;
  let s = v.replace(/[\s$€]|COP|USD/gi, '');
  if (!s) return null;
  const negativo = /^\(.*\)$/.test(s);
  if (negativo) s = s.slice(1, -1);
  s = decimal === 'coma' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return NaN;
  const n = Number(s);
  return negativo ? -n : n;
}

export function texto(v: Celda): string {
  if (v === null) return '';
  if (v instanceof Date) return parsearFecha(v, 'ymd') ?? '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

/** Minúsculas, sin tildes ni signos: para comparar encabezados. */
export function normalizarEncabezado(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const SINONIMOS: Record<CampoVenta, string[]> = {
  fecha: ['fecha', 'fecha factura', 'fecha documento', 'fecha venta', 'fecha emision', 'date'],
  cliente: ['nit', 'nit cliente', 'cliente', 'identificacion', 'documento cliente', 'cedula', 'codigo cliente', 'id cliente', 'tercero', 'nit tercero'],
  documento: ['factura', 'numero factura', 'no factura', 'n factura', 'documento', 'numero', 'consecutivo', 'remision', 'prefijo numero', 'invoice'],
  codigo: ['codigo', 'codigo producto', 'cod producto', 'referencia', 'ref', 'sku', 'codigo item', 'item', 'codigo articulo'],
  descripcion: ['descripcion', 'producto', 'nombre producto', 'articulo', 'detalle', 'nombre item', 'nombre'],
  cantidad: ['cantidad', 'cant', 'unidades', 'qty', 'cantidad vendida'],
  precio: ['precio', 'precio unitario', 'valor unitario', 'vr unitario', 'vlr unitario', 'unitario', 'precio venta'],
  total: ['total', 'valor total', 'vr total', 'vlr total', 'subtotal', 'total linea', 'valor', 'importe'],
};

/**
 * Propone qué columna va a cada campo según el texto del encabezado: primero coincidencias exactas (en todos los campos), luego parciales
 * (el sinónimo al principio o al final del encabezado). Cada columna se usa una sola vez; el orden de `campos` decide los empates.
 */
export function mapeoPorSinonimos<K extends string>(encabezados: string[], campos: readonly K[], sinonimos: Record<K, string[]>): Record<K, number | null> {
  const norm = encabezados.map(h => normalizarEncabezado(h ?? ''));
  const usadas = new Set<number>();
  const out = {} as Record<K, number | null>;
  for (const pasada of ['exacta', 'parcial'] as const) {
    for (const campo of campos) {
      if (out[campo] !== undefined && out[campo] !== null) continue;
      const idx = norm.findIndex((h, i) => !usadas.has(i) && h !== '' && (sinonimos[campo] ?? []).some(s => (pasada === 'exacta' ? h === s : h.startsWith(s + ' ') || h.endsWith(' ' + s))));
      if (idx >= 0) { out[campo] = idx; usadas.add(idx); }
    }
  }
  for (const campo of campos) if (out[campo] === undefined) out[campo] = null;
  return out;
}

/** Propone qué columna va a cada campo de una venta según el texto del encabezado. */
export function mapeoAutomatico(encabezados: string[]): Columnas {
  return mapeoPorSinonimos(encabezados, CAMPOS_VENTA, SINONIMOS);
}

/** Primera fila con al menos dos celdas con texto (1 = primera fila). */
export function detectarEncabezado(filas: Celda[][]): number {
  const i = filas.findIndex(f => f.filter(c => c !== null && String(c).trim() !== '').length >= 2);
  return i >= 0 ? i + 1 : 1;
}

/**
 * Convierte las filas de datos en ventas. Agrupa por número de documento (si esa columna está asignada) o por cliente + fecha.
 * Las filas vacías se ignoran. Devuelve las ventas y los errores detectados aquí (antes de ir al servidor): fecha ilegible, sin cliente,
 * números inválidos o un mismo documento con distinto cliente o fecha.
 */
export function armarVentas(filas: Celda[][], m: MapeoVentas): { ventas: VentaImport[]; errores: ErrorFila[]; filas: number } {
  const col = (f: Celda[], c: CampoVenta): Celda => { const i = m.columnas[c]; return i === null || i === undefined ? null : f[i] ?? null; };
  const ventas = new Map<string, VentaImport>();
  const errores: ErrorFila[] = [];
  let contadas = 0;
  for (let i = m.fila_encabezado; i < filas.length; i++) {
    const f = filas[i] ?? [];
    if (!f.some(c => c !== null && String(c).trim() !== '')) continue;
    const fila = i + 1;
    contadas++;
    const fecha = parsearFecha(col(f, 'fecha'), m.formato_fecha);
    const cliente = texto(col(f, 'cliente'));
    const documento = texto(col(f, 'documento')) || null;
    const cantidad = parsearNumero(col(f, 'cantidad'), m.decimal);
    const precio = parsearNumero(col(f, 'precio'), m.decimal);
    const total = parsearNumero(col(f, 'total'), m.decimal);
    if (!fecha) { errores.push({ fila, motivo: 'fecha' }); continue; }
    if (!cliente) { errores.push({ fila, motivo: 'cliente' }); continue; }
    if ([cantidad, precio, total].some(n => n !== null && Number.isNaN(n))) { errores.push({ fila, motivo: 'numero' }); continue; }
    if (precio === null && total === null) { errores.push({ fila, motivo: 'precio' }); continue; }
    const clave = documento ? `d:${documento.toLowerCase()}` : `c:${cliente.toLowerCase()}|${fecha}`;
    let v = ventas.get(clave);
    if (!v) { v = { fila, fecha, cliente, documento, lineas: [] }; ventas.set(clave, v); }
    else if (v.cliente.toLowerCase() !== cliente.toLowerCase() || v.fecha !== fecha) { errores.push({ fila, motivo: 'documento_mixto' }); continue; }
    v.lineas.push({ fila, codigo: texto(col(f, 'codigo')) || null, descripcion: texto(col(f, 'descripcion')) || null, cantidad, precio, total });
  }
  return { ventas: [...ventas.values()], errores, filas: contadas };
}

/** Parte las ventas en bloques que respetan los topes del servidor (ventas y líneas por bloque). */
export function bloques(ventas: VentaImport[], maxVentas = 400, maxLineas = 2500): VentaImport[][] {
  const out: VentaImport[][] = [];
  let actual: VentaImport[] = [], lineas = 0;
  for (const v of ventas) {
    if (actual.length && (actual.length >= maxVentas || lineas + v.lineas.length > maxLineas)) { out.push(actual); actual = []; lineas = 0; }
    actual.push(v); lineas += v.lineas.length;
  }
  if (actual.length) out.push(actual);
  return out;
}
