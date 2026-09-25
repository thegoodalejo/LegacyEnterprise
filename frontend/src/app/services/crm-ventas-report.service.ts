import { Injectable, inject } from '@angular/core';
import { ConfigCrm, CrmService, FiltrosVenta, PaginaExportVentas, ResumenVentas } from './crm.service';
import { PDF_MAX_FILAS, ResultadoExportacion } from './crm-report.service';
import { FormatoReporte, ReportSpec, ReportTabla } from './reports/report-spec';
import { ReportService } from './reports/report.service';
import { TranslationService } from './translation.service';

const POR_PAGINA = 1000;

/** Reporte de ventas: indicadores, por mes, por cliente, por ítem y por categoría; en Excel además el detalle de ventas y de líneas. */
@Injectable({ providedIn: 'root' })
export class CrmVentasReportService {
  private crm = inject(CrmService);
  private reports = inject(ReportService);
  private i18n = inject(TranslationService);

  async exportarVentas(o: { filtros: FiltrosVenta; totalEsperado?: number; formato: FormatoReporte; filtrosTexto: string[] }): Promise<ResultadoExportacion> {
    const ventas: PaginaExportVentas['ventas'] = [];
    const lineas: PaginaExportVentas['lineas'] = [];
    let resumen: ResumenVentas | null = null;
    let cfg: ConfigCrm = { moneda: 'COP', decimales: 0 };
    let total = 0;
    for (let pagina = 1; ; pagina++) {
      const r = await this.crm.exportVentas(o.filtros, pagina, POR_PAGINA, o.formato, pagina === 1 ? o.totalEsperado : undefined);
      if (!r.action || !r.data) return { ok: false, mensaje: r.mensaje };
      if (pagina === 1) {
        total = r.data.total; resumen = r.data.resumen; cfg = r.data.config;
        // El PDF lleva resúmenes y el detalle; pasado el tope se pide Excel.
        if (o.formato === 'pdf' && total > PDF_MAX_FILAS) return { ok: false, mensaje: '', limitePdf: { total, max: PDF_MAX_FILAS } };
      }
      ventas.push(...r.data.ventas);
      lineas.push(...r.data.lineas);
      if (ventas.length >= total || !r.data.ventas.length) break;
    }
    await this.reports.exportar(this.armar(ventas, lineas, resumen!, cfg, o.filtrosTexto), o.formato);
    return { ok: true, filas: ventas.length };
  }

  private armar(ventas: PaginaExportVentas['ventas'], lineas: PaginaExportVentas['lineas'], res: ResumenVentas, cfg: ConfigCrm, filtros: string[]): ReportSpec {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const dec = cfg.decimales;
    const participacion = (v: number) => (res.total ? (v / res.total) * 100 : 0);

    const porMes = new Map<string, { n: number; total: number; clientes: Set<number> }>();
    const porCliente = new Map<number, { nombre: string; doc: string | null; n: number; total: number; ultima: string }>();
    for (const v of ventas) {
      const m = porMes.get(v.fecha.slice(0, 7)) ?? { n: 0, total: 0, clientes: new Set<number>() };
      m.n++; m.total += v.total; m.clientes.add(v.id_contacto); porMes.set(v.fecha.slice(0, 7), m);
      const c = porCliente.get(v.id_contacto) ?? { nombre: v.cliente, doc: v.cliente_documento, n: 0, total: 0, ultima: v.fecha };
      c.n++; c.total += v.total; if (v.fecha > c.ultima) c.ultima = v.fecha; porCliente.set(v.id_contacto, c);
    }
    const porItem = new Map<string, { codigo: string | null; nombre: string | null; categoria: string | null; unidad: string | null; cantidad: number; total: number }>();
    const porCat = new Map<string, { cantidad: number; total: number }>();
    for (const l of lineas) {
      const k = (l.codigo ?? '') + '|' + (l.nombre ?? '');
      const x = porItem.get(k) ?? { codigo: l.codigo, nombre: l.nombre, categoria: l.categoria, unidad: l.unidad, cantidad: 0, total: 0 };
      x.cantidad += l.cantidad; x.total += l.total; porItem.set(k, x);
      const cat = l.categoria ?? t('crm.catalog.no_category');
      const y = porCat.get(cat) ?? { cantidad: 0, total: 0 }; y.cantidad += l.cantidad; y.total += l.total; porCat.set(cat, y);
    }
    const clientes = [...porCliente.values()].sort((a, b) => b.total - a.total);
    const items = [...porItem.values()].sort((a, b) => b.total - a.total);

    const resumen: ReportTabla[] = [
      {
        titulo: t('crm.sales.by_month'),
        columnas: [{ clave: 'mes', titulo: t('crm.sales.month'), ancho: 1.4 }, { clave: 'n', titulo: t('crm.sales.k_sales'), tipo: 'numero', decimales: 0 },
          { clave: 'c', titulo: t('crm.sales.k_clients'), tipo: 'numero', decimales: 0 }, { clave: 'total', titulo: t('crm.sales.total'), tipo: 'moneda', decimales: dec, ancho: 1.6 }],
        filas: [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, m]) => ({ mes: this.mes(mes), n: m.n, c: m.clientes.size, total: m.total })),
        totales: { mes: t('crm.opp.total'), n: res.ventas, c: res.clientes, total: res.total },
      },
      {
        titulo: t('crm.sales.by_category'),
        columnas: [{ clave: 'cat', titulo: t('crm.catalog.item_category'), ancho: 2.4 }, { clave: 'cantidad', titulo: t('crm.opp.qty'), tipo: 'numero' },
          { clave: 'total', titulo: t('crm.sales.total'), tipo: 'moneda', decimales: dec, ancho: 1.6 }, { clave: 'p', titulo: t('crm.sales.share'), tipo: 'porcentaje', decimales: 1 }],
        filas: [...porCat.entries()].sort((a, b) => b[1].total - a[1].total).map(([cat, c]) => ({ cat, cantidad: c.cantidad, total: c.total, p: participacion(c.total) })),
      },
      {
        titulo: t('crm.sales.top_clients'),
        columnas: [{ clave: 'nombre', titulo: t('crm.opp.client'), ancho: 3 }, { clave: 'n', titulo: t('crm.sales.k_sales'), tipo: 'numero', decimales: 0 },
          { clave: 'ultima', titulo: t('crm.sales.last'), tipo: 'fecha' }, { clave: 'total', titulo: t('crm.sales.total'), tipo: 'moneda', decimales: dec, ancho: 1.6 },
          { clave: 'p', titulo: t('crm.sales.share'), tipo: 'porcentaje', decimales: 1 }],
        filas: clientes.slice(0, 25).map(c => ({ ...c, p: participacion(c.total) })),
      },
      {
        titulo: t('crm.sales.top_items'),
        columnas: [{ clave: 'nombre', titulo: t('crm.oreport.item'), ancho: 3 }, { clave: 'codigo', titulo: t('crm.catalog.item_code'), ancho: 1.2 },
          { clave: 'cantidad', titulo: t('crm.opp.qty'), tipo: 'numero' }, { clave: 'total', titulo: t('crm.sales.total'), tipo: 'moneda', decimales: dec, ancho: 1.6 },
          { clave: 'p', titulo: t('crm.sales.share'), tipo: 'porcentaje', decimales: 1 }],
        filas: items.slice(0, 25).map(i => ({ ...i, p: participacion(i.total) })),
      },
    ];

    const tituloDe = new Map(ventas.map(v => [v.id, v]));
    const detalle: ReportTabla[] = [
      {
        titulo: t('crm.sales.by_client'),
        columnas: [{ clave: 'nombre', titulo: t('crm.opp.client'), solo: 'xlsx' }, { clave: 'doc', titulo: t('crm.col.doc'), solo: 'xlsx' },
          { clave: 'n', titulo: t('crm.sales.k_sales'), tipo: 'numero', decimales: 0, solo: 'xlsx' }, { clave: 'ultima', titulo: t('crm.sales.last'), tipo: 'fecha', solo: 'xlsx' },
          { clave: 'total', titulo: t('crm.sales.total'), tipo: 'moneda', decimales: dec, solo: 'xlsx' }, { clave: 'p', titulo: t('crm.sales.share'), tipo: 'porcentaje', decimales: 2, solo: 'xlsx' }],
        filas: clientes.map(c => ({ ...c, p: participacion(c.total) })),
      },
      {
        titulo: t('crm.sales.by_item'),
        columnas: [{ clave: 'codigo', titulo: t('crm.catalog.item_code'), solo: 'xlsx' }, { clave: 'nombre', titulo: t('crm.oreport.item'), solo: 'xlsx' },
          { clave: 'categoria', titulo: t('crm.catalog.item_category'), solo: 'xlsx' }, { clave: 'unidad', titulo: t('crm.catalog.item_unit'), solo: 'xlsx' },
          { clave: 'cantidad', titulo: t('crm.opp.qty'), tipo: 'numero', solo: 'xlsx' }, { clave: 'total', titulo: t('crm.sales.total'), tipo: 'moneda', decimales: dec, solo: 'xlsx' },
          { clave: 'p', titulo: t('crm.sales.share'), tipo: 'porcentaje', decimales: 2, solo: 'xlsx' }],
        filas: items.map(i => ({ ...i, p: participacion(i.total) })),
      },
      {
        titulo: t('crm.sales.title'),
        columnas: [
          { clave: 'fecha', titulo: t('crm.sales.date'), tipo: 'fecha', ancho: 1.1 }, { clave: 'documento', titulo: t('crm.sales.document'), ancho: 1.2 },
          { clave: 'cliente', titulo: t('crm.opp.client'), ancho: 3 }, { clave: 'doc', titulo: t('crm.col.doc'), solo: 'xlsx' },
          { clave: 'unidades', titulo: t('crm.sales.units'), tipo: 'numero', solo: 'xlsx' }, { clave: 'total', titulo: t('crm.sales.total'), tipo: 'moneda', decimales: dec, ancho: 1.4 },
          { clave: 'lote', titulo: t('crm.sales.origin_col'), solo: 'xlsx' }, { clave: 'estado', titulo: t('crm.col.status'), solo: 'xlsx' },
        ],
        filas: ventas.map(v => ({ fecha: v.fecha, documento: v.documento, cliente: v.cliente, doc: v.cliente_documento, unidades: v.unidades, total: v.total, lote: v.lote ?? t('crm.sales.manual'),
          estado: t(v.activo ? 'crm.report.status_active' : 'crm.sales.inactive') })),
        totales: { cliente: t('crm.opp.total'), total: res.total },
      },
      {
        titulo: t('crm.opp.lines'),
        columnas: [{ clave: 'fecha', titulo: t('crm.sales.date'), tipo: 'fecha', solo: 'xlsx' }, { clave: 'documento', titulo: t('crm.sales.document'), solo: 'xlsx' },
          { clave: 'cliente', titulo: t('crm.opp.client'), solo: 'xlsx' }, { clave: 'codigo', titulo: t('crm.catalog.item_code'), solo: 'xlsx' },
          { clave: 'nombre', titulo: t('crm.oreport.item'), solo: 'xlsx' }, { clave: 'categoria', titulo: t('crm.catalog.item_category'), solo: 'xlsx' },
          { clave: 'cantidad', titulo: t('crm.opp.qty'), tipo: 'numero', solo: 'xlsx' }, { clave: 'precio', titulo: t('crm.opp.price'), tipo: 'moneda', decimales: dec, solo: 'xlsx' },
          { clave: 'total', titulo: t('crm.sales.total'), tipo: 'moneda', decimales: dec, solo: 'xlsx' }],
        filas: lineas.map(l => { const v = tituloDe.get(l.id_venta); return { fecha: v?.fecha, documento: v?.documento, cliente: v?.cliente, codigo: l.codigo, nombre: l.nombre, categoria: l.categoria, cantidad: l.cantidad, precio: l.precio_unitario, total: l.total }; }),
      },
    ];

    return {
      titulo: t('crm.sales.report_title'), subtitulo: res.desde ? t('crm.sales.report_period', { a: this.fecha(res.desde), b: this.fecha(res.hasta!) }) : undefined,
      nombreArchivo: t('crm.sales.report_file'), filtros, moneda: cfg.moneda, orientacion: 'vertical',
      indicadores: [
        { etiqueta: t('crm.sales.k_total'), valor: res.total, tipo: 'moneda', decimales: dec },
        { etiqueta: t('crm.sales.k_sales'), valor: res.ventas, tipo: 'numero', decimales: 0 },
        { etiqueta: t('crm.sales.k_clients'), valor: res.clientes, tipo: 'numero', decimales: 0 },
        { etiqueta: t('crm.sales.k_ticket'), valor: res.ticket_promedio, tipo: 'moneda', decimales: dec },
        { etiqueta: t('crm.sales.units'), valor: res.unidades, tipo: 'numero', decimales: 0 },
      ],
      resumen, detalle,
    };
  }

  private fecha(iso: string): string { return iso.split('-').reverse().join('-'); }
  private mes(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    const s = new Intl.DateTimeFormat(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
