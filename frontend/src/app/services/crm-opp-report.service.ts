import { Injectable, inject } from '@angular/core';
import { CampoConValor, ConfigCrm, CrmService, ExportLineaOp, ExportOportunidad, ItemCatalogo, OportunidadDetalle, SeleccionOpExport, TipoDato } from './crm.service';
import { PDF_MAX_FILAS, ResultadoExportacion } from './crm-report.service';
import { ColumnaTipo, FormatoReporte, ReportColumna, ReportFila, ReportSpec, ReportTabla } from './reports/report-spec';
import { ReportService } from './reports/report.service';
import { formatDateTime } from '../pages/crm/crm-format';
import { TranslationService } from './translation.service';

const POR_PAGINA = 1000;
const TIPO_CAMPO: Record<TipoDato, ColumnaTipo> = { entero: 'numero', decimal: 'numero', texto: 'texto', booleano: 'booleano', fecha: 'fecha' };

/** Reportes de oportunidades y catálogo: informe del embudo (lista o tablero), ficha de una oportunidad y catálogo de ítems. */
@Injectable({ providedIn: 'root' })
export class CrmOppReportService {
  private crm = inject(CrmService);
  private reports = inject(ReportService);
  private i18n = inject(TranslationService);

  private t(k: string, p?: Record<string, string | number>): string { return this.i18n.t(k, p); }

  // ─── Oportunidades (informe del embudo) ────────────────────────────────────────────────────────────────────────
  async exportarOportunidades(o: { seleccion: SeleccionOpExport; formato: FormatoReporte; filtrosTexto: string[] }): Promise<ResultadoExportacion> {
    const filas: ExportOportunidad[] = [];
    const lineas: ExportLineaOp[] = [];
    let campos: { id: number; etiqueta: string; tipo_dato: TipoDato }[] = [];
    let cfg: ConfigCrm = { moneda: 'COP', decimales: 0 };
    let total = 0;
    for (let pagina = 1; ; pagina++) {
      const r = await this.crm.exportOportunidades(o.seleccion, pagina, POR_PAGINA, o.formato);
      if (!r.action || !r.data) return { ok: false, mensaje: r.mensaje };
      if (pagina === 1) {
        total = r.data.total; campos = r.data.campos; cfg = r.data.config;
        if (o.formato === 'pdf' && total > PDF_MAX_FILAS) return { ok: false, mensaje: '', limitePdf: { total, max: PDF_MAX_FILAS } };
      }
      filas.push(...r.data.oportunidades);
      lineas.push(...r.data.lineas);
      if (filas.length >= total || r.data.oportunidades.length === 0) break;
    }
    await this.reports.exportar(this.armarOportunidades(filas, lineas, campos, cfg, o.filtrosTexto), o.formato);
    return { ok: true, filas: filas.length };
  }

  private armarOportunidades(filas: ExportOportunidad[], lineas: ExportLineaOp[], campos: { id: number; etiqueta: string; tipo_dato: TipoDato }[], cfg: ConfigCrm, filtros: string[]): ReportSpec {
    const t = this.t.bind(this);
    const dec = cfg.decimales;
    const ponderado = (f: ExportOportunidad) => (f.valor * f.etapa_probabilidad) / 100;
    const de = (estado: string) => filas.filter(f => f.estado === estado);
    const suma = (l: ExportOportunidad[], fn: (f: ExportOportunidad) => number) => l.reduce((s, f) => s + fn(f), 0);
    const abiertas = de('abierta'), ganadas = de('ganada'), perdidas = de('perdida');
    const cerradas = ganadas.length + perdidas.length;

    // Resumen por etapa, en el orden del embudo (y de los embudos, si hay varios).
    const porEtapa = new Map<number, { etapa: string; embudo: string; orden: number; eOrden: number; n: number; valor: number; pond: number }>();
    for (const f of filas) {
      const x = porEtapa.get(f.id_etapa) ?? { etapa: f.etapa_nombre, embudo: f.embudo_nombre, orden: f.embudo_orden, eOrden: f.etapa_orden, n: 0, valor: 0, pond: 0 };
      x.n++; x.valor += f.valor; x.pond += ponderado(f);
      porEtapa.set(f.id_etapa, x);
    }
    const varios = new Set(filas.map(f => f.embudo_nombre)).size > 1;
    const etapas = [...porEtapa.values()].sort((a, b) => a.orden - b.orden || a.eOrden - b.eOrden);
    const resumen: ReportTabla[] = [{
      titulo: t('crm.oreport.by_stage'),
      columnas: [
        { clave: 'etapa', titulo: t('crm.opp.col_stage'), ancho: 3 },
        { clave: 'n', titulo: t('crm.report.count'), tipo: 'numero', decimales: 0 },
        { clave: 'valor', titulo: t('crm.opp.col_value'), tipo: 'moneda', decimales: dec, ancho: 1.6 },
        { clave: 'pond', titulo: t('crm.oreport.weighted'), tipo: 'moneda', decimales: dec, ancho: 1.6 },
      ],
      filas: etapas.map(e => ({ etapa: varios ? `${e.embudo} · ${e.etapa}` : e.etapa, n: e.n, valor: e.valor, pond: e.pond })),
      totales: { etapa: t('crm.opp.total'), n: filas.length, valor: suma(filas, f => f.valor), pond: suma(filas, ponderado) },
    }];

    // Por responsable: cuánto lleva cada uno abierto y cuánto ganó.
    const porResp = new Map<string, { n: number; abierto: number; ganado: number; nGan: number }>();
    for (const f of filas) {
      const k = f.responsable_nombre ?? t('crm.oreport.no_owner');
      const x = porResp.get(k) ?? { n: 0, abierto: 0, ganado: 0, nGan: 0 };
      x.n++;
      if (f.estado === 'abierta') x.abierto += f.valor;
      if (f.estado === 'ganada') { x.ganado += f.valor; x.nGan++; }
      porResp.set(k, x);
    }
    if (porResp.size > 1) {
      resumen.push({
        titulo: t('crm.oreport.by_owner'),
        columnas: [
          { clave: 'r', titulo: t('crm.opp.col_owner'), ancho: 3 },
          { clave: 'n', titulo: t('crm.report.count'), tipo: 'numero', decimales: 0 },
          { clave: 'abierto', titulo: t('crm.oreport.open_value'), tipo: 'moneda', decimales: dec, ancho: 1.6 },
          { clave: 'nGan', titulo: t('crm.oreport.won_n'), tipo: 'numero', decimales: 0 },
          { clave: 'ganado', titulo: t('crm.oreport.won_value'), tipo: 'moneda', decimales: dec, ancho: 1.6 },
        ],
        filas: [...porResp.entries()].sort((a, b) => b[1].abierto + b[1].ganado - (a[1].abierto + a[1].ganado)).map(([r, x]) => ({ r, ...x })),
      });
    }

    const columnas: ReportColumna[] = [
      { clave: 'titulo', titulo: t('crm.opp.col_title'), ancho: 2.6 },
      { clave: 'cliente', titulo: t('crm.opp.client'), ancho: 2.2 },
      { clave: 'persona', titulo: t('crm.opp.contact_person'), solo: 'xlsx' },
      ...(varios ? [{ clave: 'embudo', titulo: t('crm.opp.funnel'), solo: 'xlsx' } as ReportColumna] : []),
      { clave: 'etapa', titulo: t('crm.opp.col_stage'), ancho: 1.5 },
      { clave: 'estado', titulo: t('crm.opp.status'), solo: 'xlsx' },
      { clave: 'prob', titulo: t('crm.oreport.probability'), tipo: 'porcentaje', decimales: 0, solo: 'xlsx' },
      { clave: 'valor', titulo: t('crm.opp.col_value'), tipo: 'moneda', decimales: dec, ancho: 1.4 },
      { clave: 'pond', titulo: t('crm.oreport.weighted'), tipo: 'moneda', decimales: dec, solo: 'xlsx' },
      { clave: 'cierre', titulo: t('crm.opp.col_close'), tipo: 'fecha', ancho: 1.2 },
      { clave: 'cierre_real', titulo: t('crm.opp.closed_on'), tipo: 'fecha', solo: 'xlsx' },
      { clave: 'motivo', titulo: t('crm.opp.close_reason'), solo: 'xlsx' },
      { clave: 'responsable', titulo: t('crm.opp.col_owner'), ancho: 1.5 },
      { clave: 'etiquetas', titulo: t('crm.col.tags'), solo: 'xlsx' },
      { clave: 'en_etapa', titulo: t('crm.opp.in_stage_since'), tipo: 'fechahora', solo: 'xlsx' },
      { clave: 'descripcion', titulo: t('crm.opp.description'), solo: 'xlsx' },
      { clave: 'archivada', titulo: t('crm.col.status'), solo: 'xlsx' },
      { clave: 'creado', titulo: t('crm.col.created'), tipo: 'fechahora', solo: 'xlsx' },
      { clave: 'creado_por', titulo: t('crm.col.created_by'), solo: 'xlsx' },
      { clave: 'modificado', titulo: t('crm.col.modified'), tipo: 'fechahora', solo: 'xlsx' },
      { clave: 'modificado_por', titulo: t('crm.col.modified_by'), solo: 'xlsx' },
      ...campos.map((c): ReportColumna => ({ clave: `campo_${c.id}`, titulo: c.etiqueta, solo: 'xlsx', tipo: TIPO_CAMPO[c.tipo_dato], decimales: c.tipo_dato === 'entero' ? 0 : undefined })),
    ];
    const tituloDe = new Map(filas.map(f => [f.id, f.titulo]));
    const detalle: ReportTabla[] = [{
      titulo: t('crm.opp.title'), columnas,
      filas: filas.map(f => {
        const r: ReportFila = {
          titulo: f.titulo, cliente: f.contacto_nombre, persona: f.persona_nombre, embudo: f.embudo_nombre, etapa: f.etapa_nombre,
          estado: t('crm.oreport.state_' + f.estado), prob: f.etapa_probabilidad, valor: f.valor, pond: ponderado(f),
          cierre: f.fecha_cierre_estimada, cierre_real: f.fecha_cierre_real, motivo: f.motivo_nombre, responsable: f.responsable_nombre,
          etiquetas: f.etiquetas.join(', '), en_etapa: f.etapa_desde, descripcion: f.descripcion,
          archivada: t(f.activo ? 'crm.report.status_active' : 'crm.report.status_archived'),
          creado: f.created_at, creado_por: f.creado_por, modificado: f.updated_at, modificado_por: f.modificado_por,
        };
        for (const c of campos) r['campo_' + c.id] = f.campos[String(c.id)];
        return r;
      }),
    }];
    if (lineas.length) {
      detalle.push({
        titulo: t('crm.opp.lines'),
        columnas: [
          { clave: 'op', titulo: t('crm.opp.col_title'), solo: 'xlsx' }, { clave: 'codigo', titulo: t('crm.catalog.item_code'), solo: 'xlsx' },
          { clave: 'item', titulo: t('crm.oreport.item'), solo: 'xlsx' }, { clave: 'categoria', titulo: t('crm.catalog.item_category'), solo: 'xlsx' },
          { clave: 'unidad', titulo: t('crm.catalog.item_unit'), solo: 'xlsx' }, { clave: 'cantidad', titulo: t('crm.opp.qty'), tipo: 'numero', solo: 'xlsx' },
          { clave: 'precio', titulo: t('crm.opp.price'), tipo: 'moneda', decimales: dec, solo: 'xlsx' }, { clave: 'total', titulo: t('crm.opp.total'), tipo: 'moneda', decimales: dec, solo: 'xlsx' },
        ],
        filas: lineas.map(l => ({
          op: tituloDe.get(l.id_oportunidad) ?? '', codigo: l.item_codigo, item: l.item_nombre ?? l.descripcion, categoria: l.categoria, unidad: l.item_unidad,
          cantidad: l.cantidad, precio: l.precio_unitario, total: l.total,
        })),
      });
    }

    return {
      titulo: t('crm.oreport.title'), subtitulo: t('crm.oreport.subtitle', { n: filas.length }), nombreArchivo: t('crm.oreport.file'),
      filtros, moneda: cfg.moneda,
      indicadores: [
        { etiqueta: t('crm.oreport.kpi_open'), valor: abiertas.length, tipo: 'numero', decimales: 0 },
        { etiqueta: t('crm.oreport.kpi_open_value'), valor: suma(abiertas, f => f.valor), tipo: 'moneda', decimales: dec },
        { etiqueta: t('crm.oreport.kpi_weighted'), valor: suma(abiertas, ponderado), tipo: 'moneda', decimales: dec },
        { etiqueta: t('crm.oreport.kpi_won'), valor: suma(ganadas, f => f.valor), tipo: 'moneda', decimales: dec },
        { etiqueta: t('crm.oreport.kpi_won_n'), valor: ganadas.length, tipo: 'numero', decimales: 0 },
        { etiqueta: t('crm.oreport.kpi_lost_n'), valor: perdidas.length, tipo: 'numero', decimales: 0 },
        { etiqueta: t('crm.oreport.kpi_rate'), valor: cerradas ? (ganadas.length / cerradas) * 100 : null, tipo: 'porcentaje', decimales: 1 },
      ],
      resumen, detalle,
    };
  }

  // ─── Ficha de una oportunidad ──────────────────────────────────────────────────────────────────────────────────
  async exportarFicha(det: OportunidadDetalle, formato: FormatoReporte): Promise<void> {
    const t = this.t.bind(this);
    const o = det.oportunidad;
    const dec = det.config.decimales;
    const valorCampo = (f: CampoConValor): string => {
      if (f.valor === null || f.valor === '') return '—';
      if (typeof f.valor === 'boolean') return t(f.valor ? 'common.yes' : 'common.no');
      return f.tipo_dato === 'fecha' ? String(f.valor).split('-').reverse().join('-') : String(f.valor);
    };
    const datos: [string, string | null][] = [
      [t('crm.opp.client'), o.contacto_nombre], [t('crm.opp.contact_person'), o.persona_nombre], [t('crm.opp.funnel'), o.embudo_nombre],
      [t('crm.opp.col_stage'), o.etapa_nombre], [t('crm.opp.status'), t('crm.oreport.state_' + o.estado)], [t('crm.opp.col_owner'), o.responsable_nombre],
      [t('crm.opp.close_reason'), o.motivo_nombre], [t('crm.col.tags'), det.tags.map(x => x.nombre).join(', ')],
      [t('crm.opp.description'), o.descripcion], ...det.campos.filter(f => f.valor !== null && f.valor !== '').map((f): [string, string] => [f.etiqueta, valorCampo(f)]),
      [t('crm.col.created'), `${formatDateTime(o.created_at)} · ${o.creado_por_nombre ?? '—'}`], [t('crm.col.modified'), `${formatDateTime(o.updated_at)} · ${o.modificado_por_nombre ?? '—'}`],
    ];
    const resumen: ReportTabla[] = [{
      titulo: t('crm.profile.data'),
      columnas: [{ clave: 'k', titulo: t('crm.oreport.field'), ancho: 1.4 }, { clave: 'v', titulo: t('report.value'), ancho: 3 }],
      filas: datos.filter(([, v]) => v !== null && v !== '').map(([k, v]) => ({ k, v })),
    }];
    const detalle: ReportTabla[] = [];
    if (det.lineas.length) {
      detalle.push({
        titulo: t('crm.opp.lines'),
        columnas: [
          { clave: 'item', titulo: t('crm.oreport.item'), ancho: 3 }, { clave: 'codigo', titulo: t('crm.catalog.item_code'), ancho: 1.2 },
          { clave: 'cantidad', titulo: t('crm.opp.qty'), tipo: 'numero' }, { clave: 'precio', titulo: t('crm.opp.price'), tipo: 'moneda', decimales: dec, ancho: 1.4 },
          { clave: 'total', titulo: t('crm.opp.total'), tipo: 'moneda', decimales: dec, ancho: 1.4 },
        ],
        filas: det.lineas.map(l => ({ item: l.item_nombre ?? l.descripcion, codigo: l.item_codigo, cantidad: l.cantidad, precio: l.precio_unitario, total: l.total })),
        totales: { item: t('crm.opp.total'), total: o.valor },
      });
    }
    if (det.notas.length) {
      detalle.push({
        titulo: t('crm.opp.notes'),
        columnas: [{ clave: 'fecha', titulo: t('crm.oreport.date'), tipo: 'fechahora', ancho: 1.2 }, { clave: 'autor', titulo: t('crm.oreport.author'), ancho: 1.3 }, { clave: 'nota', titulo: t('crm.opp.note'), ancho: 4 }],
        filas: det.notas.map(n => ({ fecha: n.created_at, autor: n.autor, nota: n.nota })),
      });
    }
    await this.reports.exportar({
      titulo: o.titulo, subtitulo: t('crm.oreport.sheet_subtitle', { stage: o.etapa_nombre }), nombreArchivo: t('crm.oreport.sheet_file', { id: o.id }),
      moneda: det.config.moneda, orientacion: 'vertical',
      indicadores: [
        { etiqueta: t('crm.opp.value'), valor: o.valor, tipo: 'moneda', decimales: dec },
        { etiqueta: t('crm.oreport.probability'), valor: o.etapa_probabilidad, tipo: 'porcentaje', decimales: 0 },
        { etiqueta: t('crm.oreport.weighted'), valor: (o.valor * o.etapa_probabilidad) / 100, tipo: 'moneda', decimales: dec },
        { etiqueta: o.estado === 'abierta' ? t('crm.opp.close_estimated') : t('crm.opp.closed_on'), valor: o.estado === 'abierta' ? o.fecha_cierre_estimada : o.fecha_cierre_real, tipo: 'fecha' },
      ],
      resumen, detalle,
    }, formato);
  }

  // ─── Catálogo ──────────────────────────────────────────────────────────────────────────────────────────────────
  async exportarCatalogo(formato: FormatoReporte, moneda: string, decimales: number): Promise<ResultadoExportacion> {
    const t = this.t.bind(this);
    const items: ItemCatalogo[] = [];
    for (let pagina = 1; ; pagina++) {
      const r = await this.crm.listItems({ pagina, porPagina: 100 });
      if (!r.action || !r.data) return { ok: false, mensaje: r.mensaje };
      items.push(...r.data.items);
      if (items.length >= r.data.total || !r.data.items.length) break;
    }
    if (!items.length) return { ok: false, mensaje: t('crm.catalog.no_items') };
    if (formato === 'pdf' && items.length > PDF_MAX_FILAS) return { ok: false, mensaje: '', limitePdf: { total: items.length, max: PDF_MAX_FILAS } };
    const porCat = new Map<string, number>();
    for (const i of items) porCat.set(i.categoria ?? t('crm.catalog.no_category'), (porCat.get(i.categoria ?? t('crm.catalog.no_category')) ?? 0) + 1);
    await this.reports.exportar({
      titulo: t('crm.oreport.catalog_title'), subtitulo: t('crm.oreport.subtitle', { n: items.length }), nombreArchivo: t('crm.oreport.catalog_file'), moneda,
      indicadores: [
        { etiqueta: t('crm.report.kpi_total'), valor: items.length, tipo: 'numero', decimales: 0 },
        { etiqueta: t('common.active'), valor: items.filter(i => i.activo).length, tipo: 'numero', decimales: 0 },
        { etiqueta: t('crm.catalog.categories'), valor: porCat.size, tipo: 'numero', decimales: 0 },
      ],
      resumen: [{
        titulo: t('crm.catalog.categories'), columnas: [{ clave: 'c', titulo: t('crm.catalog.item_category'), ancho: 3 }, { clave: 'n', titulo: t('crm.report.count'), tipo: 'numero', decimales: 0 }],
        filas: [...porCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ c, n })),
      }],
      detalle: [{
        titulo: t('crm.catalog.items'),
        columnas: [
          { clave: 'codigo', titulo: t('crm.catalog.item_code'), ancho: 1.2 }, { clave: 'nombre', titulo: t('crm.catalog.item_name'), ancho: 3 },
          { clave: 'categoria', titulo: t('crm.catalog.item_category'), ancho: 1.6 }, { clave: 'unidad', titulo: t('crm.catalog.item_unit') },
          { clave: 'precio', titulo: t('crm.catalog.item_price'), tipo: 'moneda', decimales, ancho: 1.3 }, { clave: 'estado', titulo: t('crm.col.status') },
        ],
        filas: items.map(i => ({ codigo: i.codigo, nombre: i.nombre, categoria: i.categoria, unidad: i.unidad, precio: i.precio_ref, estado: t(i.activo ? 'common.active' : 'common.inactive') })),
      }],
    }, formato);
    return { ok: true, filas: items.length };
  }
}
