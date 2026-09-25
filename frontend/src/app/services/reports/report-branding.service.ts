import { Injectable, inject } from '@angular/core';
import { ApiService } from '../api.service';
import { SessionService } from '../session.service';
import { TranslationService } from '../translation.service';
import { BrandSeeds, DEFAULT_BRAND, isValidSeeds } from '../../theme/brand-scheme';
import { ReportLogo, ReportMarca } from './report-format';
import { medirRaster, svgAPng } from './report-imagen';

interface MarcaApi {
  empresa: { id: number; nombre: string | null };
  sede: { id: number; nombre: string | null };
  colores: BrandSeeds | null;
  logo: { mime: string; data_uri: string; ancho: number | null; alto: number | null } | null;
  usuario: { nombre: string; email: string };
}

type MarcaBase = Omit<ReportMarca, 'generadoEn' | 'generadoTexto'>;

const TTL_MS = 5 * 60_000;

/**
 * Reúne la marca del cliente para los reportes: nombre de la empresa y de la sede, colores, usuario y logo.
 * El logo lo entrega el backend (get_marca.php) como data URI porque el bucket público no tiene CORS; un SVG se rasteriza aquí.
 * Sin logo propio se usa el de Legacy Enterprise.
 */
@Injectable({ providedIn: 'root' })
export class ReportBrandingService {
  private api = inject(ApiService);
  private session = inject(SessionService);
  private i18n = inject(TranslationService);

  private cache: { sedeId: number | null; at: number; base: MarcaBase } | null = null;
  private legacy: Promise<ReportLogo> | null = null;

  constructor() {
    this.session.sedeChanged.subscribe(() => (this.cache = null));
  }

  async cargar(): Promise<ReportMarca> {
    const sedeId = this.session.sedeId();
    if (!this.cache || this.cache.sedeId !== sedeId || Date.now() - this.cache.at > TTL_MS) {
      this.cache = { sedeId, at: Date.now(), base: await this.armar() };
    }
    const generadoEn = new Date();
    return { ...this.cache.base, generadoEn, generadoTexto: this.fechaHora(generadoEn) };
  }

  private async armar(): Promise<MarcaBase> {
    const [r, logoLegacy] = await Promise.all([this.api.post<MarcaApi>('reportes/get_marca.php'), this.logoLegacy()]);
    if (!r.action || !r.data) throw new Error(r.mensaje || 'No se pudo obtener la marca del reporte');
    const d = r.data;
    let logo: ReportLogo | null = null;
    if (d.logo) {
      try {
        logo = d.logo.mime === 'image/svg+xml' ? await svgAPng(d.logo.data_uri)
          : d.logo.ancho && d.logo.alto ? { dataUri: d.logo.data_uri, ancho: d.logo.ancho, alto: d.logo.alto }
          : await medirRaster(d.logo.data_uri);
      } catch (e) {
        console.error('[reportes] no se pudo preparar el logo del cliente', e);   // el reporte sale con el logo de Legacy
      }
    }
    return {
      empresa: d.empresa.nombre ?? this.session.empresa()?.nombre ?? '',
      sede: d.sede.nombre ?? this.session.sedeNombre() ?? '',
      usuario: d.usuario.nombre,
      colores: isValidSeeds(d.colores) ? d.colores : DEFAULT_BRAND,
      logo,
      logoLegacy,
    };
  }

  /** Logo de Legacy Enterprise (pie «Generado por…» y respaldo cuando la empresa no tiene logo). */
  private logoLegacy(): Promise<ReportLogo> {
    this.legacy ??= (async () => {
      const svg = await (await fetch('logo.svg')).text();
      return svgAPng('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    })().catch(e => { this.legacy = null; throw e; });
    return this.legacy;
  }

  /** «25-09-2026 14:03 (GMT-5)». */
  private fechaHora(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    const zona = new Intl.DateTimeFormat(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO', { timeZoneName: 'short' })
      .formatToParts(d).find(x => x.type === 'timeZoneName')?.value ?? '';
    return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}${zona ? ` (${zona})` : ''}`;
  }
}
