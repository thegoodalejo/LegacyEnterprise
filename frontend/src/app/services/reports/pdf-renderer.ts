import { RGB, ReportMarca, ReportTextos, aclarar, contraste, crearFormateador, esNumerico, hexToRgb, pdfSeguro } from './report-format';
import { ajustar } from './report-imagen';
import { ReportSpec, ReportTabla } from './report-spec';

const M = 12;                            // margen lateral (mm)
const GRIS: RGB = [100, 116, 139];
const TEXTO: RGB = [31, 41, 55];
const LINEA: RGB = [203, 213, 225];
const TOPE_COMPACTO = 22;                // y donde empieza el contenido en las páginas siguientes
const PIE = 16;                          // alto reservado abajo

const formatoImagen = (dataUri: string): 'PNG' | 'JPEG' => (dataUri.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG');

/**
 * PDF con la marca del cliente: encabezado (logo, empresa, sede, fecha y hora, usuario), título, filtros, indicadores,
 * tablas con los colores de marca y pie en cada página con «Página X de Y» y «Generado por Legacy Enterprise».
 * jsPDF y jspdf-autotable se cargan aquí, solo al exportar.
 */
export async function renderPdf(spec: ReportSpec, marca: ReportMarca, tx: ReportTextos, locale: string): Promise<Blob> {
  const [{ jsPDF: JsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableMod.default;

  const fmt = crearFormateador(locale, spec.moneda ?? 'COP', tx);
  const primary = hexToRgb(marca.colores.primary);
  const tablas: ReportTabla[] = [...(spec.resumen ?? []), ...spec.detalle]
    .map(t => ({ ...t, columnas: t.columnas.filter(c => c.solo !== 'xlsx') }))
    .filter(t => t.columnas.length > 0);
  const masAncha = Math.max(1, ...tablas.map(t => t.columnas.length));
  const horizontal = spec.orientacion === 'horizontal' || (spec.orientacion !== 'vertical' && masAncha > 6);

  const doc = new JsPDF({ orientation: horizontal ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: pdfSeguro(spec.titulo), subject: pdfSeguro(marca.empresa), author: pdfSeguro(marca.usuario), creator: 'Legacy Enterprise' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const W = pageW - 2 * M;
  const conEncabezado = new Set<number>();

  const logo = marca.logo ?? marca.logoLegacy;
  const poner = (s: string, x: number, y: number, opts?: { align?: 'left' | 'center' | 'right'; maxWidth?: number }) => doc.text(pdfSeguro(s), x, y, opts);
  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const paginaActual = () => doc.getCurrentPageInfo().pageNumber;

  // ─── Encabezados ───────────────────────────────────────────────────────────────────────────────────────────────
  const encabezadoCompleto = (): number => {
    conEncabezado.add(paginaActual());
    let y = M;
    const { w, h } = ajustar(logo, 46, 17);
    doc.addImage(logo.dataUri, formatoImagen(logo.dataUri), M, y, w, h);
    const xt = M + w + 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); color(TEXTO);
    poner(marca.empresa, xt, y + 6.5, { maxWidth: pageW - M - xt - 60 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); color(GRIS);
    poner(marca.sede, xt, y + 12, { maxWidth: pageW - M - xt - 60 });
    doc.setFontSize(8.5);
    poner(`${tx.generado}: ${marca.generadoTexto}`, pageW - M, y + 6.5, { align: 'right' });
    poner(`${tx.por}: ${marca.usuario}`, pageW - M, y + 11.5, { align: 'right' });
    y += Math.max(h, 14) + 3;
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.rect(M, y, W, 0.9, 'F');
    y += 6;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); color(TEXTO);
    for (const linea of doc.splitTextToSize(pdfSeguro(spec.titulo), W) as string[]) { doc.text(linea, M, y + 5); y += 7; }
    if (spec.subtitulo) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); color(GRIS);
      for (const linea of doc.splitTextToSize(pdfSeguro(spec.subtitulo), W) as string[]) { doc.text(linea, M, y + 4); y += 5; }
    }
    if (spec.filtros?.length) {
      y += 1.5;
      doc.setFontSize(8.5); color(GRIS);
      doc.setFont('helvetica', 'bold'); poner(`${tx.filtros}:`, M, y + 3);
      const xf = M + doc.getTextWidth(pdfSeguro(`${tx.filtros}:`)) + 2;
      doc.setFont('helvetica', 'normal');
      const texto = doc.splitTextToSize(pdfSeguro(spec.filtros.join('  |  ')), pageW - M - xf) as string[];
      for (const linea of texto) { doc.text(linea, xf, y + 3); y += 4; }
    }
    return y + 3;
  };

  const encabezadoCompacto = (): void => {
    const p = paginaActual();
    if (conEncabezado.has(p)) return;
    conEncabezado.add(p);
    const { w, h } = ajustar(logo, 22, 8);
    doc.addImage(logo.dataUri, formatoImagen(logo.dataUri), M, 8, w, h);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); color(GRIS);
    poner(`${marca.empresa} · ${marca.sede}`, M + w + 3, 12.2, { maxWidth: W * 0.5 });
    poner(spec.titulo, pageW - M, 12.2, { align: 'right', maxWidth: W * 0.4 });
    doc.setFillColor(primary[0], primary[1], primary[2]);
    doc.rect(M, 8 + Math.max(h, 8) + 2, W, 0.5, 'F');
  };

  // ─── Indicadores ───────────────────────────────────────────────────────────────────────────────────────────────
  const dibujarIndicadores = (y0: number): number => {
    const items = spec.indicadores ?? [];
    if (!items.length) return y0;
    const columnas = Math.min(items.length, horizontal ? 5 : 4);
    const gap = 3;
    const bw = (W - gap * (columnas - 1)) / columnas;
    const bh = 15;
    let y = y0;
    items.forEach((it, i) => {
      const col = i % columnas;
      if (i > 0 && col === 0) y += bh + gap;
      const x = M + col * (bw + gap);
      const fondo = aclarar(primary, 0.91);
      doc.setFillColor(fondo[0], fondo[1], fondo[2]);
      doc.roundedRect(x, y, bw, bh, 1.2, 1.2, 'F');
      doc.setFillColor(primary[0], primary[1], primary[2]);
      doc.rect(x, y + 1.5, 1.1, bh - 3, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); color(GRIS);
      poner(it.etiqueta.toUpperCase(), x + 4, y + 5, { maxWidth: bw - 6 });
      const valor = pdfSeguro(fmt(it.valor, it.tipo, it.decimales));
      let fs = 13;
      doc.setFont('helvetica', 'bold'); color(TEXTO);
      doc.setFontSize(fs);
      while (fs > 8 && doc.getTextWidth(valor) > bw - 6) { fs -= 1; doc.setFontSize(fs); }
      doc.text(valor, x + 4, y + 11.6);
    });
    return y + bh + 6;
  };

  // ─── Tablas ────────────────────────────────────────────────────────────────────────────────────────────────────
  const espacio = (y: number, necesita: number): number => {
    if (y + necesita <= pageH - PIE) return y;
    doc.addPage();
    encabezadoCompacto();
    return TOPE_COMPACTO;
  };

  const dibujarTabla = (t: ReportTabla, y0: number): number => {
    let y = y0;
    if (t.titulo) {
      y = espacio(y, 20);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); color(primary);
      poner(t.titulo, M, y + 4);
      y += 7;
    }
    const pesoTotal = t.columnas.reduce((s, c) => s + (c.ancho ?? 1), 0);
    const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'right' | 'center' }> = {};
    t.columnas.forEach((c, i) => { columnStyles[i] = { cellWidth: (W * (c.ancho ?? 1)) / pesoTotal, halign: esNumerico(c.tipo) ? 'right' : 'left' }; });
    const cuerpo = t.filas.map(f => t.columnas.map(c => pdfSeguro(fmt(f[c.clave], c.tipo, c.decimales))));
    const pie = t.totales ? [t.columnas.map(c => pdfSeguro(fmt(t.totales?.[c.clave], c.tipo, c.decimales)))] : undefined;
    const cabecera = contraste(primary);
    autoTable(doc, {
      startY: y,
      margin: { top: TOPE_COMPACTO, left: M, right: M, bottom: PIE },
      head: [t.columnas.map(c => pdfSeguro(c.titulo))],
      body: cuerpo,
      foot: pie,
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.7, textColor: TEXTO, lineColor: [226, 232, 240], lineWidth: 0.1, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: primary, textColor: cabecera, fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: aclarar(primary, 0.88), textColor: TEXTO, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 248, 251] },
      columnStyles,
      // El encabezado y los totales de una columna numérica se alinean a la derecha, igual que sus valores.
      didParseCell: d => {
        const col = t.columnas[d.column.index];
        if (col && esNumerico(col.tipo) && d.section !== 'body') d.cell.styles.halign = 'right';
      },
      didDrawPage: () => encabezadoCompacto(),
    });
    const fin = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    return fin + 8;
  };

  // ─── Armado ────────────────────────────────────────────────────────────────────────────────────────────────────
  let y = encabezadoCompleto();
  y = dibujarIndicadores(y);
  for (const t of tablas) y = dibujarTabla(t, y);

  // Pie en todas las páginas: empresa y sede, «Página X de Y» y, muy pequeño, «Generado por Legacy Enterprise» con su logo.
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(LINEA[0], LINEA[1], LINEA[2]);
    doc.setLineWidth(0.2);
    doc.line(M, pageH - 12, pageW - M, pageH - 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); color(GRIS);
    poner(`${marca.empresa} · ${marca.sede}`, M, pageH - 8, { maxWidth: W * 0.4 });
    poner(tx.pagina(i, total), pageW / 2, pageH - 8, { align: 'center' });
    doc.setFontSize(6.5);
    const anchoTexto = doc.getTextWidth(pdfSeguro(tx.marcaPie));
    poner(tx.marcaPie, pageW - M, pageH - 8, { align: 'right' });
    const lh = 3.4;
    doc.addImage(marca.logoLegacy.dataUri, 'PNG', pageW - M - anchoTexto - lh - 1.2, pageH - 8 - 2.5, lh, lh);
  }

  return doc.output('blob');
}
