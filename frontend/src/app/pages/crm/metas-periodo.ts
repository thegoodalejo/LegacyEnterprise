// Períodos de las metas en el navegador: el mismo cálculo que crmMetaPeriodo (backend) para mostrar el rango antes de guardar,
// etiquetas legibles («Septiembre de 2026», «Trimestre 3 · 2026») y la navegación mes a mes del panel. Fechas siempre 'AAAA-MM-DD'.
import { PeriodoMeta } from '../../services/crm.service';

export const PERIODOS_META: PeriodoMeta[] = ['mes', 'trimestre', 'semestre', 'anio', 'personalizado'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const partes = (f: string): [number, number, number] => f.split('-').map(Number) as [number, number, number];
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Rango [inicio, fin] de un período. Mes, trimestre, semestre y año: basta cualquier día dentro. Personalizado: inicio y fin (null si falta o no cuadra). */
export function rangoMeta(periodo: PeriodoMeta, fecha: string | null, fin?: string | null): { inicio: string; fin: string } | null {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const [y, m] = partes(fecha);
  switch (periodo) {
    case 'mes': return { inicio: iso(y, m, 1), fin: iso(y, m, ultimoDia(y, m)) };
    case 'trimestre': { const q = Math.floor((m - 1) / 3) * 3 + 1; return { inicio: iso(y, q, 1), fin: iso(y, q + 2, ultimoDia(y, q + 2)) }; }
    case 'semestre': { const s = m <= 6 ? 1 : 7; return { inicio: iso(y, s, 1), fin: iso(y, s + 5, ultimoDia(y, s + 5)) }; }
    case 'anio': return { inicio: iso(y, 1, 1), fin: iso(y, 12, 31) };
    default: return fin && /^\d{4}-\d{2}-\d{2}$/.test(fin) && fin >= fecha ? { inicio: fecha, fin } : null;
  }
}

/** Primer día del mes sumando n meses (n puede ser negativo). */
export function sumarMeses(fecha: string, n: number): string {
  const [y, m] = partes(fecha);
  const t = y * 12 + (m - 1) + n;
  return iso(Math.floor(t / 12), (t % 12) + 1, 1);
}

/** Día con que se mira un mes: hoy si es el mes en curso, el último día si ya pasó, el primero si es futuro. */
export function fechaReferenciaMes(mes: string, hoy: string): string {
  const r = rangoMeta('mes', mes)!;
  if (hoy >= r.inicio && hoy <= r.fin) return hoy;
  return hoy > r.fin ? r.fin : r.inicio;
}

/** Número del trimestre (1–4) o semestre (1–2) de una fecha. */
export function indicePeriodo(periodo: 'trimestre' | 'semestre', fecha: string): number {
  const m = partes(fecha)[1];
  return periodo === 'trimestre' ? Math.floor((m - 1) / 3) + 1 : (m <= 6 ? 1 : 2);
}

/** «Septiembre de 2026» / «September 2026». */
export function nombreMes(fecha: string, lang: string): string {
  const [y, m] = partes(fecha);
  const s = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

/**
 * Etiqueta de un período ya resuelto. `t` traduce las plantillas crm.goals.label_* ({n}, {y}); las fechas del personalizado van en dd-mm-aaaa.
 */
export function etiquetaPeriodo(periodo: PeriodoMeta, inicio: string, fin: string, t: (k: string, p?: Record<string, string | number>) => string, lang: string): string {
  const y = partes(inicio)[0];
  switch (periodo) {
    case 'mes': return nombreMes(inicio, lang);
    case 'trimestre': return t('crm.goals.label_trimestre', { n: indicePeriodo('trimestre', inicio), y });
    case 'semestre': return t('crm.goals.label_semestre', { n: indicePeriodo('semestre', inicio), y });
    case 'anio': return t('crm.goals.label_anio', { y });
    default: return `${dmy(inicio)} – ${dmy(fin)}`;
  }
}

function dmy(f: string): string {
  const [y, m, d] = partes(f);
  return `${pad(d)}-${pad(m)}-${y}`;
}
