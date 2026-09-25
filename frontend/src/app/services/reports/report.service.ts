import { Injectable, inject } from '@angular/core';
import { TranslationService } from '../translation.service';
import { descargarBlob } from './download.util';
import { ReportTextos } from './report-format';
import { ReportBrandingService } from './report-branding.service';
import { FormatoReporte, ReportSpec } from './report-spec';

/**
 * Servicio único de reportes: recibe un ReportSpec y descarga el PDF o el Excel con la marca del cliente
 * (logo, empresa, sede, fecha y hora, usuario y pie «Generado por Legacy Enterprise»).
 * Los generadores (jsPDF, ExcelJS) se importan de forma diferida: no pesan en el bundle inicial.
 */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private branding = inject(ReportBrandingService);
  private i18n = inject(TranslationService);

  async exportar(spec: ReportSpec, formato: FormatoReporte): Promise<void> {
    const marca = await this.branding.cargar();
    const tx = this.textos();
    const locale = this.i18n.lang() === 'en' ? 'en-US' : 'es-CO';
    const blob = formato === 'pdf'
      ? await (await import('./pdf-renderer')).renderPdf(spec, marca, tx, locale)
      : await (await import('./xlsx-renderer')).renderXlsx(spec, marca, tx, locale);
    descargarBlob(blob, `${this.nombreSeguro(spec.nombreArchivo)}_${this.sello(marca.generadoEn)}.${formato}`);
  }

  private textos(): ReportTextos {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    return {
      generado: t('report.generated'), por: t('report.by'), filtros: t('report.filters'),
      hojaResumen: t('report.sheet_summary'), hojaDatos: t('report.sheet_data'),
      indicador: t('report.indicator'), valor: t('report.value'), marcaPie: t('report.brand_footer'),
      si: t('common.yes'), no: t('common.no'),
      pagina: (n, total) => t('report.page_of', { n, total }),
    };
  }

  private sello(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  private nombreSeguro(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'reporte';
  }
}
