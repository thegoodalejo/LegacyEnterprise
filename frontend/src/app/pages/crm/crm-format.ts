// Formato y utilidades del módulo CRM. El backend habla AAAA-MM-DD y "AAAA-MM-DD HH:MM:SS";
// el usuario ve dd-mm-aaaa. Sin objetos Date: evitan corrimientos por zona horaria en fechas de calendario.

/** AAAA-MM-DD → dd-mm-aaaa ('' si no hay valor). */
export function isoToDmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/** dd-mm-aaaa → AAAA-MM-DD, o null si está incompleta o no es una fecha real. */
export function dmyToIso(dmy: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(Date.UTC(y, mo - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== mo - 1 || real.getUTCDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Solo dígitos → dd-mm-aaaa con guiones automáticos mientras se escribe. */
export function maskDmy(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`;
}

/** "AAAA-MM-DD HH:MM:SS" → "dd-mm-aaaa HH:MM". */
export function formatDateTime(sql: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(sql ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}` : '';
}

export function formatDate(sql: string | null | undefined): string {
  return isoToDmy(sql);
}

/** Texto en blanco o negro según la luminancia del color de fondo (misma idea que el selector de tags de Kingdom). */
export function contrastColor(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return '#000000';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? '#000000' : '#ffffff';
}

/** Minúsculas y sin tildes, para buscar en listas del lado del cliente. */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Iniciales para el avatar de un contacto. */
export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
}
