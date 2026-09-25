import { ColumnaTipo, ReportValor } from './report-spec';

export type RGB = [number, number, number];

/** Textos del reporte ya traducidos (los arma ReportService desde el i18n). */
export interface ReportTextos {
  generado: string;
  por: string;
  filtros: string;
  hojaResumen: string;
  hojaDatos: string;
  indicador: string;
  valor: string;
  marcaPie: string;
  si: string;
  no: string;
  /** «Página 3 de 8»; acepta los códigos &P y &N del pie de impresión de Excel. */
  pagina: (n: number | string, total: number | string) => string;
}

export interface ReportLogo {
  /** PNG o JPEG listo para incrustar (los SVG y WebP ya vienen convertidos). */
  dataUri: string;
  ancho: number;
  alto: number;
}

/** Marca del cliente lista para dibujar. */
export interface ReportMarca {
  empresa: string;
  sede: string;
  usuario: string;
  colores: { primary: string; secondary: string; tertiary: string };
  /** null = la empresa no subió logo (los reportes usan el de Legacy Enterprise). */
  logo: ReportLogo | null;
  logoLegacy: ReportLogo;
  generadoEn: Date;
  /** Fecha y hora de generación con zona horaria, p. ej. «25-09-2026 14:03 (GMT-5)». */
  generadoTexto: string;
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x3949ab;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Mezcla el color con blanco: `factor` 0 = el color, 1 = blanco. */
export function aclarar(rgb: RGB, factor: number): RGB {
  return [rgb[0] + (255 - rgb[0]) * factor, rgb[1] + (255 - rgb[1]) * factor, rgb[2] + (255 - rgb[2]) * factor];
}

/** Blanco o casi negro según la luminancia del fondo (mismo criterio que contrastColor del CRM). */
export function contraste(rgb: RGB): RGB {
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return lum > 0.55 ? [17, 24, 39] : [255, 255, 255];
}

/** «FFRRGGBB» para ExcelJS. */
export function argb(rgb: RGB): string {
  return 'FF' + rgbToHex(rgb).slice(1).toUpperCase();
}

/** Las fuentes estándar de jsPDF solo cubren Latin-1/WinAnsi: lo demás se reemplaza para que no salgan caracteres rotos. */
const REEMPLAZOS: Record<string, string> = { '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '≠': '!=', '✓': 'x', '★': '*' };
export function pdfSeguro(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac].includes(c)) out += ch;
    else if (c === 0x09 || c === 0x0a) out += ' ';
    else out += REEMPLAZOS[ch] ?? (c < 0x20 ? '' : '?');
  }
  return out;
}

/** 'AAAA-MM-DD[ HH:MM[:SS]]' → partes (sin objetos Date: las fechas de calendario no deben correrse por zona horaria). */
export function partesFecha(s: string): { y: number; mo: number; d: number; h: number; mi: number; se: number; conHora: boolean } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] ?? 0), mi: +(m[5] ?? 0), se: +(m[6] ?? 0), conHora: m[4] !== undefined };
}

export function aNumero(v: ReportValor): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type Formateador = (v: ReportValor, tipo?: ColumnaTipo, decimales?: number) => string;

/** Texto para mostrar un valor según su tipo (PDF y resúmenes). Los formateadores Intl se reutilizan: hay miles de celdas. */
export function crearFormateador(locale: string, moneda: string, tx: Pick<ReportTextos, 'si' | 'no'>): Formateador {
  const cache = new Map<string, Intl.NumberFormat>();
  const nf = (moneda_: boolean, dec: number | undefined): Intl.NumberFormat => {
    const key = `${moneda_}|${dec ?? ''}`;
    let f = cache.get(key);
    if (!f) {
      f = new Intl.NumberFormat(locale, moneda_
        ? { style: 'currency', currency: moneda, minimumFractionDigits: dec ?? 0, maximumFractionDigits: dec ?? 0 }
        : { minimumFractionDigits: dec ?? 0, maximumFractionDigits: dec ?? 2 });
      cache.set(key, f);
    }
    return f;
  };
  return (v, tipo = 'texto', decimales) => {
    if (v === null || v === undefined || v === '') return '';
    switch (tipo) {
      case 'numero': { const n = aNumero(v); return n === null ? String(v) : nf(false, decimales).format(n); }
      case 'moneda': { const n = aNumero(v); return n === null ? String(v) : nf(true, decimales).format(n); }
      case 'porcentaje': { const n = aNumero(v); return n === null ? String(v) : `${nf(false, decimales ?? 1).format(n)}%`; }
      case 'fecha': case 'fechahora': {
        const p = partesFecha(String(v));
        if (!p) return String(v);
        const dmy = `${String(p.d).padStart(2, '0')}-${String(p.mo).padStart(2, '0')}-${p.y}`;
        return tipo === 'fechahora' && p.conHora ? `${dmy} ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}` : dmy;
      }
      case 'booleano': return v === true || v === 'true' || v === 1 || v === '1' ? tx.si : tx.no;
      default: return String(v);
    }
  };
}

export function esNumerico(tipo: ColumnaTipo | undefined): boolean {
  return tipo === 'numero' || tipo === 'moneda' || tipo === 'porcentaje';
}
