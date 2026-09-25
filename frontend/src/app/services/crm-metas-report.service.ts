import { Injectable, inject } from '@angular/core';
import { etiquetaPeriodo } from '../pages/crm/metas-periodo';
import { ConfigCrm, CrmService, EstadoMeta, ExportMetas, FiltrosMeta, Meta } from './crm.service';
import { PDF_MAX_FILAS, ResultadoExportacion } from './crm-report.service';
import { ColumnaTipo, FormatoReporte, ReportColumna, ReportFila, ReportSpec, ReportTabla } from './reports/report-spec';
import { ReportService } from './reports/report.service';
import { TranslationService } from './translation.service';

const ESTADOS: EstadoMeta[] = ['cumplida', 'en_ritmo', 'en_riesgo', 'atrasada', 'no_cumplida', 'futura'];

/**
 * Informe de avance de metas: empresa, sede y organizaciones (resumen por métrica y período, y una tabla por cada grupo) con meta, real,
 * avance, esperado a la fecha, proyección y estado. Una tabla con métricas de dinero y de número usa números con una columna «Unidad».
 */
@Injectable({ providedIn: 'root' })
export class CrmMetasReportService {
  private crm = inject(CrmService);
  private reports = inject(ReportService);
  private i18n = inject(TranslationService);

  async exportarMetas(o: { filtros: FiltrosMeta; formato: FormatoReporte; subtitulo: string; filtrosTexto: string[] }): Promise<ResultadoExportacion> {
    const r = await this.crm.exportMetas(o.filtros, o.formato);
    if (!r.action || !r.data) return { ok: false, mensaje: r.mensaje };
    if (o.formato === 'pdf' && r.data.total > PDF_MAX_FILAS) return { ok: false, mensaje: '', limitePdf: { total: r.data.total, max: PDF_MAX_FILAS } };
    await this.reports.exportar(this.armar(r.data, o.subtitulo, o.filtrosTexto), o.formato);
    return { ok: true, filas: r.data.total };
  }

  private armar(d: ExportMetas, subtitulo: string, filtros: string[]): ReportSpec {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const cfg = d.config;
    const periodo = (m: Pick<Meta, 'periodo' | 'fecha_inicio' | 'fecha_fin'>) => etiquetaPeriodo(m.periodo, m.fecha_inicio, m.fecha_fin, t, this.i18n.lang());
    const estado = (e: EstadoMeta) => t('crm.goals.st_' + e);
    const unidad = (m: Pick<Meta, 'formato' | 'unidad'>) => (m.formato === 'moneda' ? cfg.moneda : m.unidad ?? '');

    const empresa = d.metas.filter(m => m.ambito === 'empresa');
    const sede = d.metas.filter(m => m.ambito === 'sede');
    const orgs = d.metas.filter(m => m.ambito === 'organizacion');

    const resumen: ReportTabla[] = [];
    if (empresa.length) resumen.push(this.tablaNivel(t('crm.goals.level_empresa') + ' · ' + t('crm.goals.all_sedes'), empresa, cfg, periodo, estado, unidad, 'empresa'));
    if (sede.length) resumen.push(this.tablaNivel(t('crm.goals.level_sede') + (sede[0].sede_nombre ? ' · ' + sede[0].sede_nombre : ''), sede, cfg, periodo, estado, unidad, 'sede'));

    // Organizaciones: un grupo por métrica y período. Las sumas no cuentan dos veces a una dependiente cuyo padre también tiene meta en el grupo.
    const grupos = new Map<string, Meta[]>();
    for (const m of orgs) { const k = `${m.id_metrica}|${m.fecha_inicio}|${m.fecha_fin}`; grupos.set(k, [...(grupos.get(k) ?? []), m]); }
    const detalle: ReportTabla[] = [];
    if (grupos.size) {
      const filas: ReportFila[] = [];
      for (const g of grupos.values()) {
        const ids = new Set(g.map(m => m.id_contacto));
        const cuentan = g.filter(m => m.id_padre === null || !ids.has(m.id_padre));
        const meta = cuentan.reduce((s, m) => s + m.valor_meta, 0), real = cuentan.reduce((s, m) => s + m.real, 0);
        const f: ReportFila = { metrica: g[0].metrica_nombre, periodo: periodo(g[0]), n: g.length, meta, real, unidad: unidad(g[0]), avance: meta ? (real / meta) * 100 : 0 };
        for (const e of ESTADOS) f[e] = g.filter(m => m.estado === e).length;
        filas.push(f);

        const tipo: ColumnaTipo = g[0].formato === 'moneda' ? 'moneda' : 'numero';
        const dec = tipo === 'moneda' ? cfg.decimales : undefined;
        detalle.push({
          titulo: `${g[0].metrica_nombre} · ${periodo(g[0])}`,
          columnas: [
            { clave: 'org', titulo: t('crm.tipo.organizacion'), ancho: 3 },
            { clave: 'meta', titulo: t('crm.goals.target'), tipo, decimales: dec, ancho: 1.4 },
            { clave: 'real', titulo: t('crm.goals.real'), tipo, decimales: dec, ancho: 1.4 },
            { clave: 'avance', titulo: t('crm.goals.progress'), tipo: 'porcentaje', decimales: 1 },
            { clave: 'esperado', titulo: t('crm.goals.expected_today'), tipo, decimales: dec, solo: 'xlsx' },
            { clave: 'proyeccion', titulo: t('crm.goals.projection'), tipo, decimales: dec, solo: 'xlsx' },
            { clave: 'faltante', titulo: t('crm.goals.missing'), tipo, decimales: dec, ancho: 1.3 },
            { clave: 'estado', titulo: t('crm.col.status'), ancho: 1.2 },
            { clave: 'padre', titulo: t('crm.profile.parent'), solo: 'xlsx' },
            { clave: 'nota', titulo: t('crm.goals.note'), solo: 'xlsx' },
          ],
          filas: g.map(m => ({
            org: m.contacto_nombre, meta: m.valor_meta, real: m.real, avance: m.porcentaje, esperado: m.esperado, proyeccion: m.proyeccion, faltante: m.faltante,
            estado: estado(m.estado), padre: m.id_padre !== null ? (orgs.find(x => x.id_contacto === m.id_padre)?.contacto_nombre ?? '') : '', nota: m.nota,
          })),
        });
      }
      const mixto = new Set([...grupos.values()].map(g => g[0].formato)).size > 1;
      resumen.push({
        titulo: t('crm.goals.report_orgs', { orgs: t('crm.tipo.organizaciones') }),
        columnas: [
          { clave: 'metrica', titulo: t('crm.goals.metric'), ancho: 2 }, { clave: 'periodo', titulo: t('crm.goals.period'), ancho: 1.5 },
          { clave: 'n', titulo: t('crm.goals.report_n'), tipo: 'numero', decimales: 0 },
          ...ESTADOS.map<ReportColumna>(e => ({ clave: e, titulo: t('crm.goals.kp_' + e), tipo: 'numero', decimales: 0, ...(e === 'futura' || e === 'no_cumplida' ? { solo: 'xlsx' as const } : {}) })),
          { clave: 'meta', titulo: t('crm.goals.report_sum_target'), tipo: mixto ? 'numero' : 'moneda', decimales: mixto ? undefined : cfg.decimales, ancho: 1.5 },
          { clave: 'real', titulo: t('crm.goals.report_sum_real'), tipo: mixto ? 'numero' : 'moneda', decimales: mixto ? undefined : cfg.decimales, ancho: 1.5 },
          ...(mixto ? [{ clave: 'unidad', titulo: t('crm.goals.unit'), ancho: 1.1 } as ReportColumna] : []),
          { clave: 'avance', titulo: t('crm.goals.progress'), tipo: 'porcentaje', decimales: 1 },
        ],
        filas,
      });
    }

    const c = d.conteo;
    return {
      titulo: t('crm.goals.report_title'), subtitulo, nombreArchivo: t('crm.goals.report_file'), filtros, moneda: cfg.moneda, orientacion: 'horizontal',
      indicadores: [
        { etiqueta: t('crm.goals.report_n'), valor: c.total, tipo: 'numero', decimales: 0 },
        ...ESTADOS.filter(e => e !== 'futura' || c.futura).map(e => ({ etiqueta: t('crm.goals.kp_' + e), valor: c[e], tipo: 'numero' as const, decimales: 0 })),
      ],
      resumen, detalle,
    };
  }

  /** Tabla de metas de empresa o de sede (pocas filas, métricas que pueden mezclar dinero y números). */
  private tablaNivel(titulo: string, metas: Meta[], cfg: ConfigCrm, periodo: (m: Meta) => string, estado: (e: EstadoMeta) => string,
                     unidad: (m: Meta) => string, nivel: 'empresa' | 'sede'): ReportTabla {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const mixto = new Set(metas.map(m => m.formato)).size > 1;
    const tipo: ColumnaTipo = mixto || metas[0].formato === 'numero' ? 'numero' : 'moneda';
    const dec = tipo === 'moneda' ? cfg.decimales : undefined;
    const valor = (k: string, titulo: string, extra: Partial<ReportColumna> = {}): ReportColumna => ({ clave: k, titulo, tipo, decimales: dec, ancho: 1.4, ...extra });
    // En una tabla mixta la columna es «número»: los montos se redondean a los decimales de la moneda y las cantidades a 2.
    const redondear = (m: Meta, v: number | null): number | null => { if (v === null) return null; const f = 10 ** (m.formato === 'moneda' ? cfg.decimales : 2); return Math.round(v * f) / f; };
    return {
      titulo,
      columnas: [
        { clave: 'metrica', titulo: t('crm.goals.metric'), ancho: 2 }, { clave: 'periodo', titulo: t('crm.goals.period'), ancho: 1.5 },
        valor('meta', t('crm.goals.target')), valor('real', t('crm.goals.real')),
        ...(tipo === 'numero' ? [{ clave: 'unidad', titulo: t('crm.goals.unit'), ancho: 1.1 } as ReportColumna] : []),
        { clave: 'avance', titulo: t('crm.goals.progress'), tipo: 'porcentaje', decimales: 1 },
        valor('esperado', t('crm.goals.expected_today')), valor('proyeccion', t('crm.goals.projection'), { solo: 'xlsx' }),
        { clave: 'estado', titulo: t('crm.col.status'), ancho: 1.2 },
        { clave: 'cob_n', titulo: t(nivel === 'empresa' ? 'crm.goals.report_cov_sedes' : 'crm.goals.report_cov_orgs', { orgs: t('crm.tipo.organizaciones') }), tipo: 'numero', decimales: 0, solo: 'xlsx' },
        valor('cob_suma', t('crm.goals.report_cov_sum'), { solo: 'xlsx' }),
      ],
      filas: metas.map(m => ({
        metrica: m.metrica_nombre + (m.filtro ? ` (${m.filtro})` : ''), periodo: periodo(m), meta: m.valor_meta, real: redondear(m, m.real), unidad: unidad(m), avance: m.porcentaje,
        esperado: redondear(m, m.esperado), proyeccion: redondear(m, m.proyeccion), estado: estado(m.estado), cob_n: m.cobertura?.n ?? null, cob_suma: m.cobertura?.suma ?? null,
      })),
    };
  }
}
