import { Injectable, inject } from '@angular/core';
import { CrmService, ExportCampoDef, ExportContacto, SeleccionExport, TipoDato } from './crm.service';
import { ColumnaTipo, FormatoReporte, ReportColumna, ReportFila, ReportIndicador, ReportSpec, ReportTabla } from './reports/report-spec';
import { ReportService } from './reports/report.service';
import { TranslationService } from './translation.service';

/** El PDF es para leer: pasado este número de filas se pide Excel o afinar el filtro. */
export const PDF_MAX_FILAS = 2000;
const POR_PAGINA = 1000;

export type ResultadoExportacion =
  | { ok: true; filas: number }
  | { ok: false; mensaje: string; limitePdf?: { total: number; max: number } };

const TIPO_CAMPO: Record<TipoDato, ColumnaTipo> = { entero: 'numero', decimal: 'numero', texto: 'texto', booleano: 'booleano', fecha: 'fecha' };

/** Reportes del CRM. Hoy: contactos. Arman el ReportSpec con datos del backend; ReportService lo dibuja con la marca del cliente. */
@Injectable({ providedIn: 'root' })
export class CrmReportService {
  private crm = inject(CrmService);
  private reports = inject(ReportService);
  private i18n = inject(TranslationService);

  /** Trae todas las páginas de la selección y genera el archivo. `filtrosTexto`: el alcance y los filtros en lenguaje natural. */
  async exportarContactos(o: { seleccion: SeleccionExport; formato: FormatoReporte; filtrosTexto: string[] }): Promise<ResultadoExportacion> {
    const filas: ExportContacto[] = [];
    let campos: ExportCampoDef[] = [];
    let total = 0;
    for (let pagina = 1; ; pagina++) {
      const r = await this.crm.exportContactos(o.seleccion, pagina, POR_PAGINA, 'nombre', 'asc', o.formato);
      if (!r.action || !r.data) return { ok: false, mensaje: r.mensaje };
      if (pagina === 1) {
        total = r.data.total;
        campos = r.data.campos;
        if (o.formato === 'pdf' && total > PDF_MAX_FILAS) return { ok: false, mensaje: '', limitePdf: { total, max: PDF_MAX_FILAS } };
      }
      filas.push(...r.data.contactos);
      if (filas.length >= total || r.data.contactos.length === 0) break;
    }
    await this.reports.exportar(this.armarContactos(filas, campos, o.filtrosTexto), o.formato);
    return { ok: true, filas: filas.length };
  }

  private armarContactos(filas: ExportContacto[], campos: ExportCampoDef[], filtros: string[]): ReportSpec {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const personas = filas.filter(f => f.tipo === 'persona').length;
    const activos = filas.filter(f => f.activo).length;
    const entero = (etiqueta: string, valor: number): ReportIndicador => ({ etiqueta, valor, tipo: 'numero', decimales: 0 });
    const indicadores = [
      entero(t('crm.report.kpi_total'), filas.length),
      entero(t('crm.tipo.personas'), personas),
      entero(t('crm.tipo.organizaciones'), filas.length - personas),
      entero(t('crm.filters.active'), activos),
      entero(t('crm.filters.archived'), filas.length - activos),
    ];

    const porTag = new Map<string, number>();
    for (const f of filas) for (const e of f.etiquetas) porTag.set(e, (porTag.get(e) ?? 0) + 1);
    const top = [...porTag.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);
    const resumen: ReportTabla[] = top.length ? [{
      titulo: t('crm.report.by_tag'),
      columnas: [{ clave: 'tag', titulo: t('crm.col.tags'), ancho: 4 }, { clave: 'n', titulo: t('crm.report.count'), tipo: 'numero', decimales: 0 }],
      filas: top.map(([tag, n]) => ({ tag, n })),
    }] : [];

    // El PDF lleva las columnas para leer; el Excel, además, todo lo demás (incluidos los campos personalizados).
    const repetidos = new Set(campos.filter((c, i) => campos.findIndex(x => x.etiqueta === c.etiqueta) !== i).map(c => c.etiqueta));
    const columnas: ReportColumna[] = [
      { clave: 'nombre', titulo: t('crm.col.name'), ancho: 2.3 },
      { clave: 'tipo', titulo: t('crm.col.type'), ancho: 1.1 },
      { clave: 'doc_pdf', titulo: t('crm.col.doc'), ancho: 1.5, solo: 'pdf' },
      { clave: 'documento_tipo', titulo: t('crm.col.doc_type'), solo: 'xlsx' },
      { clave: 'documento', titulo: t('crm.col.doc'), solo: 'xlsx' },
      { clave: 'correo', titulo: t('crm.col.email'), ancho: 2.1 },
      { clave: 'telefono', titulo: t('crm.col.phone'), ancho: 1.3 },
      { clave: 'whatsapp', titulo: t('crm.col.whatsapp'), solo: 'xlsx' },
      { clave: 'fecha_nacimiento', titulo: t('crm.col.birth'), tipo: 'fecha', solo: 'xlsx' },
      { clave: 'ciudad', titulo: t('crm.col.city'), ancho: 1.1 },
      { clave: 'direccion', titulo: t('crm.col.address'), solo: 'xlsx' },
      { clave: 'lat', titulo: t('crm.col.lat'), tipo: 'numero', decimales: 6, solo: 'xlsx' },
      { clave: 'lng', titulo: t('crm.col.lng'), tipo: 'numero', decimales: 6, solo: 'xlsx' },
      { clave: 'etiquetas', titulo: t('crm.col.tags'), ancho: 1.7 },
      { clave: 'vinculos', titulo: t('crm.col.links'), solo: 'xlsx' },
      { clave: 'padre', titulo: t('crm.col.parent'), solo: 'xlsx' },
      { clave: 'responsable', titulo: t('crm.col.owner'), ancho: 1.7 },
      { clave: 'estado', titulo: t('crm.col.status'), solo: 'xlsx' },
      { clave: 'creado', titulo: t('crm.col.created'), tipo: 'fechahora', ancho: 1.5 },
      { clave: 'creado_por', titulo: t('crm.col.created_by'), solo: 'xlsx' },
      { clave: 'modificado', titulo: t('crm.col.modified'), tipo: 'fechahora', solo: 'xlsx' },
      { clave: 'modificado_por', titulo: t('crm.col.modified_by'), solo: 'xlsx' },
      ...campos.map((c): ReportColumna => ({
        clave: `campo_${c.id}`, solo: 'xlsx', tipo: TIPO_CAMPO[c.tipo_dato], decimales: c.tipo_dato === 'entero' ? 0 : undefined,
        titulo: repetidos.has(c.etiqueta) ? `${c.etiqueta} (${t('crm.tipo.' + c.aplica_a)})` : c.etiqueta,
      })),
    ];

    const fila = (f: ExportContacto): ReportFila => {
      const wa = f.whatsapp_numero ? `+${f.whatsapp_indicativo ?? ''} ${f.whatsapp_numero}`.replace('+ ', '+') : '';
      const r: ReportFila = {
        nombre: f.nombre_completo,
        tipo: t(f.tipo === 'persona' ? 'crm.tipo.persona' : 'crm.tipo.organizacion'),
        doc_pdf: [f.documento_tipo, f.documento_numero].filter(Boolean).join(' '),
        documento_tipo: f.documento_tipo, documento: f.documento_numero,
        correo: f.correo, telefono: f.telefono, whatsapp: wa, fecha_nacimiento: f.fecha_nacimiento,
        ciudad: f.ciudad, direccion: f.direccion, lat: f.lat, lng: f.lng,
        etiquetas: f.etiquetas.join(', '),
        vinculos: f.vinculos.map(v => (v.rol ? `${v.nombre} (${v.rol})` : v.nombre)).join('; '),
        padre: f.padre_nombre, responsable: f.responsable,
        estado: t(f.activo ? 'crm.report.status_active' : 'crm.report.status_archived'),
        creado: f.created_at, creado_por: f.creado_por, modificado: f.updated_at, modificado_por: f.modificado_por,
      };
      for (const c of campos) r['campo_' + c.id] = f.campos[String(c.id)];
      return r;
    };

    return {
      titulo: t('crm.report.title'),
      subtitulo: t('crm.report.subtitle', { n: filas.length }),
      nombreArchivo: t('crm.report.file'),
      filtros,
      indicadores,
      resumen,
      detalle: [{ titulo: t('crm.report.sheet'), columnas, filas: filas.map(fila) }],
    };
  }
}
