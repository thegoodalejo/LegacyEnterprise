import type { Cell, Workbook, Worksheet } from 'exceljs';
import { ReportMarca, ReportTextos, RGB, aNumero, argb, contraste, crearFormateador, esNumerico, hexToRgb, partesFecha } from './report-format';
import { ajustar } from './report-imagen';
import { ColumnaTipo, ReportColumna, ReportFila, ReportSpec, ReportTabla, ReportValor } from './report-spec';

const GRIS = argb([100, 116, 139]);
const TEXTO = argb([31, 41, 55]);
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Excel con la marca del cliente. Hoja «Resumen»: logo, empresa, sede, fecha y hora, usuario, filtros, indicadores y tablas resumen.
 * Una hoja por tabla de detalle: banner con empresa y sede, encabezado en el color de marca, fila fija, autofiltro y celdas con
 * su tipo real (números, fechas y moneda son valores de Excel, no texto). ExcelJS se carga aquí, solo al exportar.
 */
export async function renderXlsx(spec: ReportSpec, marca: ReportMarca, tx: ReportTextos, locale: string): Promise<Blob> {
  const mod = await import('exceljs');
  const EJ = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb: Workbook = new EJ.Workbook();
  wb.creator = 'Legacy Enterprise';
  wb.company = marca.empresa;
  wb.title = spec.titulo;
  wb.created = marca.generadoEn;

  const moneda = spec.moneda ?? 'COP';
  const fmt = crearFormateador(locale, moneda, tx);
  const simbolo = new Intl.NumberFormat(locale, { style: 'currency', currency: moneda }).formatToParts(0).find(p => p.type === 'currency')?.value ?? moneda;
  const primary = hexToRgb(marca.colores.primary);
  const tabColor = { argb: argb(primary) };
  const usados = new Set<string>();
  const nombreHoja = (base: string): string => {
    const limpio = (base.replace(/[\\/*?:[\]]/g, ' ').trim() || 'Hoja').slice(0, 31);
    let n = limpio; let i = 2;
    while (usados.has(n.toLowerCase())) n = `${limpio.slice(0, 28)} ${i++}`;
    usados.add(n.toLowerCase());
    return n;
  };
  const relleno = (c: RGB) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: argb(c) } });
  const borde = { style: 'thin' as const, color: { argb: argb([203, 213, 225]) } };

  const numFmt = (c: { tipo?: ColumnaTipo; decimales?: number }, filas: ReportFila[], clave: string): string | undefined => {
    switch (c.tipo) {
      case 'numero': {
        const dec = c.decimales ?? (filas.every(f => { const n = aNumero(f[clave]); return n === null || Number.isInteger(n); }) ? 0 : 2);
        return dec > 0 ? `#,##0.${'0'.repeat(dec)}` : '#,##0';
      }
      case 'moneda': { const dec = c.decimales ?? 0; return `"${simbolo}"#,##0${dec > 0 ? '.' + '0'.repeat(dec) : ''}`; }
      case 'porcentaje': { const dec = c.decimales ?? 1; return dec > 0 ? `0.${'0'.repeat(dec)}"%"` : '0"%"'; }
      case 'fecha': return 'dd-mm-yyyy';
      case 'fechahora': return 'dd-mm-yyyy hh:mm';
      default: return undefined;
    }
  };

  const escribir = (cell: Cell, v: ReportValor, tipo: ColumnaTipo | undefined, formato: string | undefined): void => {
    if (v === null || v === undefined || v === '') return;
    if (esNumerico(tipo)) {
      const n = aNumero(v);
      if (n === null) { cell.value = String(v); return; }
      cell.value = n;
      if (formato) cell.numFmt = formato;
      return;
    }
    if (tipo === 'fecha' || tipo === 'fechahora') {
      const p = partesFecha(String(v));
      if (!p) { cell.value = String(v); return; }
      cell.value = new Date(Date.UTC(p.y, p.mo - 1, p.d, tipo === 'fechahora' ? p.h : 0, tipo === 'fechahora' ? p.mi : 0, tipo === 'fechahora' ? p.se : 0));
      if (formato) cell.numFmt = formato;
      return;
    }
    cell.value = tipo === 'booleano' ? fmt(v, 'booleano') : String(v);
  };

  const imprimir = (ws: Worksheet, columnas: number, filaTitulos?: number): void => {
    ws.pageSetup = {
      paperSize: 9, orientation: columnas > 6 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
      ...(filaTitulos ? { printTitlesRow: `${filaTitulos}:${filaTitulos}` } : {}),
    };
    const esc = (s: string) => s.replace(/&/g, '&&');
    ws.headerFooter = { oddFooter: `&L&8${esc(tx.marcaPie)}&C&8${esc(marca.empresa)} - ${esc(marca.sede)}&R&8${tx.pagina('&P', '&N')}` };
  };

  // ─── Hoja «Resumen» ────────────────────────────────────────────────────────────────────────────────────────────
  const resumen = wb.addWorksheet(nombreHoja(tx.hojaResumen), { views: [{ showGridLines: false }], properties: { tabColor } });
  resumen.columns = [{ width: 3 }, { width: 36 }, { width: 24 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }];
  const logo = marca.logo ?? marca.logoLegacy;
  const idLogo = wb.addImage({ base64: logo.dataUri, extension: logo.dataUri.startsWith('data:image/jpeg') ? 'jpeg' : 'png' });
  const caja = ajustar(logo, 220, 64);
  resumen.addImage(idLogo, { tl: { col: 1, row: 0 }, ext: { width: caja.w, height: caja.h } });
  for (let i = 1; i <= 3; i++) resumen.getRow(i).height = 20;

  let r = 5;
  const linea = (texto: string, o: { size?: number; bold?: boolean; italic?: boolean; color?: string } = {}): void => {
    const c = resumen.getCell(r, 2);
    c.value = texto;
    c.font = { size: o.size ?? 10, bold: o.bold ?? false, italic: o.italic ?? false, color: { argb: o.color ?? TEXTO } };
    r++;
  };
  linea(marca.empresa, { size: 18, bold: true, color: argb(primary) });
  linea(marca.sede, { size: 12, color: GRIS });
  linea(spec.titulo, { size: 14, bold: true });
  if (spec.subtitulo) linea(spec.subtitulo, { size: 10, color: GRIS });
  linea(`${tx.generado}: ${marca.generadoTexto}   |   ${tx.por}: ${marca.usuario}`, { size: 9, color: GRIS });
  r++;
  if (spec.filtros?.length) {
    linea(tx.filtros, { bold: true });
    for (const f of spec.filtros) linea(`- ${f}`, { size: 9, color: GRIS });
    r++;
  }

  const encabezado = (fila: number, titulos: string[], desde: number, numericas: boolean[] = []): void => {
    titulos.forEach((t, i) => {
      const c = resumen.getCell(fila, desde + i);
      c.value = t;
      c.fill = relleno(primary);
      c.font = { bold: true, color: { argb: argb(contraste(primary)) } };
      c.alignment = { vertical: 'middle', horizontal: numericas[i] ? 'right' : 'left', wrapText: true };
      c.border = { top: borde, bottom: borde, left: borde, right: borde };
    });
  };

  if (spec.indicadores?.length) {
    encabezado(r++, [tx.indicador, tx.valor], 2, [false, true]);
    for (const it of spec.indicadores) {
      const a = resumen.getCell(r, 2); a.value = it.etiqueta; a.border = { bottom: borde };
      const b = resumen.getCell(r, 3);
      escribir(b, it.valor, it.tipo, numFmt({ tipo: it.tipo, decimales: it.decimales }, [], ''));
      b.font = { bold: true }; b.alignment = { horizontal: 'right' }; b.border = { bottom: borde };
      r++;
    }
    r++;
  }

  const volcar = (ws: Worksheet, t: ReportTabla, cols: ReportColumna[], fila0: number, col0: number): number => {
    let fila = fila0;
    cols.forEach((c, i) => {
      const cell = ws.getCell(fila, col0 + i);
      cell.value = c.titulo;
      cell.fill = relleno(primary);
      cell.font = { bold: true, color: { argb: argb(contraste(primary)) } };
      cell.alignment = { vertical: 'middle', horizontal: esNumerico(c.tipo) ? 'right' : 'left', wrapText: true };
      cell.border = { top: borde, bottom: borde, left: borde, right: borde };
    });
    fila++;
    const formatos = cols.map(c => numFmt(c, t.filas, c.clave));
    for (const f of t.filas) {
      cols.forEach((c, i) => escribir(ws.getCell(fila, col0 + i), f[c.clave], c.tipo, formatos[i]));
      fila++;
    }
    if (t.totales) {
      cols.forEach((c, i) => {
        const cell = ws.getCell(fila, col0 + i);
        escribir(cell, t.totales?.[c.clave], c.tipo, formatos[i]);
        cell.font = { bold: true };
        cell.border = { top: borde };
      });
      fila++;
    }
    return fila;
  };

  for (const t of spec.resumen ?? []) {
    const cols = t.columnas.filter(c => c.solo !== 'pdf');
    if (!cols.length) continue;
    if (t.titulo) { const c = resumen.getCell(r, 2); c.value = t.titulo; c.font = { bold: true, size: 11, color: { argb: argb(primary) } }; r++; }
    r = volcar(resumen, t, cols, r, 2) + 1;
  }
  linea(tx.marcaPie, { size: 8, italic: true, color: GRIS });
  imprimir(resumen, 4);

  // ─── Una hoja por tabla de detalle ─────────────────────────────────────────────────────────────────────────────
  for (const t of spec.detalle) {
    const cols = t.columnas.filter(c => c.solo !== 'pdf');
    if (!cols.length) continue;
    const ws = wb.addWorksheet(nombreHoja(t.titulo ?? tx.hojaDatos), { views: [{ state: 'frozen', ySplit: 3, activeCell: 'A4' }], properties: { tabColor } });
    const n = cols.length;
    ws.columns = cols.map(c => {
      let ancho = c.titulo.length + 2;
      for (const f of t.filas.slice(0, 200)) ancho = Math.max(ancho, fmt(f[c.clave], c.tipo, c.decimales).length + 2);
      return { width: Math.min(48, Math.max(10, ancho)) };
    });

    if (n > 1) { ws.mergeCells(1, 1, 1, n); ws.mergeCells(2, 1, 2, n); }
    const banner = ws.getCell(1, 1);
    banner.value = `${marca.empresa}  ·  ${marca.sede}`;
    banner.font = { bold: true, size: 12, color: { argb: argb(contraste(primary)) } };
    banner.fill = relleno(primary);
    banner.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(1).height = 24;
    const sub = ws.getCell(2, 1);
    sub.value = `${spec.titulo}${t.titulo ? ' - ' + t.titulo : ''}   |   ${tx.generado}: ${marca.generadoTexto}   |   ${tx.por}: ${marca.usuario}`;
    sub.font = { size: 9, color: { argb: GRIS } };
    sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(2).height = 18;

    volcar(ws, t, cols, 3, 1);
    ws.getRow(3).height = 22;
    if (t.filas.length) {
      ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + t.filas.length, column: n } };
      ws.addConditionalFormatting({
        ref: `A4:${ws.getColumn(n).letter}${3 + t.filas.length}`,
        rules: [{ type: 'expression', formulae: ['MOD(ROW(),2)=0'], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: argb([244, 246, 250]) } } } }],
      });
    }
    imprimir(ws, n, 3);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer as BlobPart], { type: MIME });
}
