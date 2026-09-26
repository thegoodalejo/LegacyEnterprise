import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatPaginator, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { MatProgressBar } from '@angular/material/progress-bar';
import { ExportAlcance, ExportMenuComponent, ExportSolicitud } from '../../components/export-menu.component';
import { Campana, ComunicacionesService, EstadoCampana } from '../../services/comunicaciones.service';
import { ejecutarExportacion } from '../../services/crm-report.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { ReportService } from '../../services/reports/report.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDateTime } from '../crm/crm-format';
import { TranslatedPaginatorIntl } from '../crm/translated-paginator-intl';

export const CAMP_EN_CURSO: EstadoCampana[] = ['programada', 'enviando', 'esperando_saldo', 'esperando_cupo', 'pausada'];

/** Campañas de WhatsApp (L2+): estado, avance y resultados (entregados, leídos, respuestas, clics, créditos). */
@Component({
  selector: 'app-campanas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl }],
  imports: [RouterLink, MatButton, MatIcon, MatPaginator, MatProgressBar, ExportMenuComponent, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ 'com.camp.title' | translate }}</h1>
        <div class="actions">
          <app-export-menu [alcances]="alcances()" [disabled]="!total()" (exportar)="exportar($event)" />
          <a mat-flat-button id="btn-new-camp" routerLink="/m/comunicaciones/campanas/nueva"><mat-icon>add</mat-icon>{{ 'com.camp.new' | translate }}</a>
        </div>
      </header>
      <div class="chips" role="tablist">
        @for (f of filtros; track f.id) {
          <button role="tab" class="fchip" [class.on]="filtro() === f.id" [attr.aria-selected]="filtro() === f.id" (click)="cambiarFiltro(f.id)">{{ 'com.camp.f.' + f.id | translate }}</button>
        }
      </div>
      @for (c of campanas(); track c.id) {
        <a class="card" [routerLink]="['/m/comunicaciones/campanas', c.id]" [attr.data-id]="c.id">
          <div class="chead">
            <strong class="nm">{{ c.nombre }}</strong>
            <span class="estado" [attr.data-estado]="c.estado">{{ 'com.camp.st.' + c.estado | translate }}</span>
          </div>
          <span class="muted small">{{ c.plantilla_nombre }} · {{ c.linea_nombre }} · {{ fecha(c.iniciada_at || c.programada_para || c.created_at) }}@if (c.creada_por) { · {{ c.creada_por }} }</span>
          @if (c.estado !== 'borrador') {
            <mat-progress-bar mode="determinate" [value]="avance(c)" />
            <div class="kpis">
              <span><strong>{{ c.conteos.enviados }}</strong>/{{ c.conteos.total }} {{ 'com.camp.k.sent' | translate }}</span>
              <span><strong>{{ pct(c.conteos.entregados, c.conteos.enviados) }}</strong> {{ 'com.camp.k.delivered' | translate }}</span>
              <span><strong>{{ pct(c.conteos.leidos, c.conteos.enviados) }}</strong> {{ 'com.camp.k.read' | translate }}</span>
              <span><strong>{{ c.conteos.respuestas }}</strong> {{ 'com.camp.k.replies' | translate }}</span>
              <span><strong>{{ c.conteos.clics }}</strong> {{ 'com.camp.k.clicks' | translate }}</span>
              @if (c.conteos.fallidos) { <span class="err"><strong>{{ c.conteos.fallidos }}</strong> {{ 'com.camp.k.failed' | translate }}</span> }
              <span class="muted">{{ c.conteos.creditos }} {{ 'com.credits_short' | translate }}</span>
            </div>
            @if (c.motivo_pausa) { <span class="motivo small"><mat-icon>info</mat-icon>{{ c.motivo_pausa }}</span> }
          }
        </a>
      } @empty {
        @if (!cargando()) {
          <div class="empty-state"><mat-icon>campaign</mat-icon><strong>{{ 'com.camp.empty' | translate }}</strong><span>{{ 'com.camp.empty_hint' | translate }}</span>
            <a mat-flat-button routerLink="/m/comunicaciones/campanas/nueva"><mat-icon>add</mat-icon>{{ 'com.camp.new' | translate }}</a></div>
        }
      }
      @if (total() > porPagina) { <mat-paginator [length]="total()" [pageIndex]="pagina()" [pageSize]="porPagina" [hidePageSize]="true" (page)="paginar($event)" /> }
    </div>
  `,
  styles: `
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
    .fchip { padding: 6px 12px; border-radius: 16px; border: 1px solid var(--md-sys-color-outline-variant); background: none; color: var(--md-sys-color-on-surface-variant);
      font: var(--mat-sys-label-large); cursor: pointer; &.on { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); border-color: transparent; } }
    .card { display: flex; flex-direction: column; gap: 8px; padding: 16px 20px; border-radius: 16px; margin-bottom: 12px; text-decoration: none; color: inherit;
      background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); &:hover { background: var(--md-sys-color-surface-container); } }
    .chead { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; .nm { flex: 1; font: var(--mat-sys-title-medium); overflow-wrap: anywhere; } }
    .estado { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-surface-container-highest);
      &[data-estado='enviando'], &[data-estado='programada'] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      &[data-estado='completada'] { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
      &[data-estado='esperando_saldo'], &[data-estado='esperando_cupo'], &[data-estado='pausada'] { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); } }
    .kpis { display: flex; flex-wrap: wrap; gap: 4px 20px; font: var(--mat-sys-body-medium); }
    .err { color: var(--md-sys-color-error); }
    .motivo { display: flex; align-items: center; gap: 6px; color: var(--md-sys-color-tertiary); mat-icon { width: 18px; height: 18px; font-size: 18px; } }
    .small { font: var(--mat-sys-body-small); }
  `,
})
export default class CampanasPage implements OnDestroy {
  private com = inject(ComunicacionesService);
  private reports = inject(ReportService);
  readonly loading = inject(LoadingService);
  readonly dialogs = inject(DialogService);
  readonly i18n = inject(TranslationService);
  readonly campanas = signal<Campana[]>([]);
  readonly total = signal(0);
  readonly pagina = signal(0);
  readonly porPagina = 30;
  readonly filtro = signal('');
  readonly cargando = signal(true);
  readonly filtros = [{ id: '' }, { id: 'enviando' }, { id: 'programada' }, { id: 'pausada' }, { id: 'completada' }, { id: 'borrador' }, { id: 'cancelada' }];
  readonly alcances = computed<ExportAlcance[]>(() => [{ id: 'lista', etiqueta: this.i18n.t('com.camp.export_list', { n: this.total() }) }]);
  private timer = setInterval(() => { if (document.visibilityState === 'visible' && this.campanas().some(c => CAMP_EN_CURSO.includes(c.estado))) void this.cargar(false); }, 8000);

  constructor() { void this.cargar(true); }
  ngOnDestroy(): void { clearInterval(this.timer); }

  async cargar(conLoader: boolean): Promise<void> {
    try {
      const f = () => this.com.listCampanas({ estado: this.filtro(), pagina: this.pagina() + 1, porPagina: this.porPagina });
      const r = conLoader ? await this.loading.wrap(f) : await f();
      if (r.action && r.data) { this.campanas.set(r.data.campanas); this.total.set(r.data.total); }
    } catch { /* se reintenta */ } finally { this.cargando.set(false); }
  }

  cambiarFiltro(f: string): void { this.filtro.set(f); this.pagina.set(0); void this.cargar(true); }
  paginar(e: PageEvent): void { this.pagina.set(e.pageIndex); void this.cargar(true); }
  fecha(s: string | null): string { return formatDateTime(s); }
  avance(c: Campana): number { return c.conteos.total ? Math.round(((c.conteos.total - c.conteos.pendientes) / c.conteos.total) * 100) : 0; }
  pct(a: number, b: number): string { return b ? `${Math.round((a / b) * 100)} %` : '—'; }

  async exportar(e: ExportSolicitud): Promise<void> {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    await ejecutarExportacion(this, async () => {
      const filas: Campana[] = [];
      for (let p = 1; ; p++) {
        const r = await this.com.listCampanas({ estado: this.filtro(), pagina: p, porPagina: 100 });
        if (!r.action || !r.data) return { ok: false, mensaje: r.mensaje };
        filas.push(...r.data.campanas);
        if (filas.length >= r.data.total || !r.data.campanas.length) break;
      }
      await this.reports.exportar({
        titulo: t('com.camp.title'), nombreArchivo: 'campanas-whatsapp',
        filtros: [this.filtro() ? `${t('com.camp.state')}: ${t('com.camp.f.' + this.filtro())}` : t('com.camp.f.')],
        detalle: [{
          columnas: [
            { clave: 'nombre', titulo: t('com.camp.name'), ancho: 2 }, { clave: 'estado', titulo: t('com.camp.state') },
            { clave: 'plantilla', titulo: t('com.camp.template'), solo: 'xlsx' }, { clave: 'inicio', titulo: t('com.camp.started'), tipo: 'fechahora' },
            { clave: 'total', titulo: t('com.camp.k.total'), tipo: 'numero' }, { clave: 'enviados', titulo: t('com.camp.k.sent'), tipo: 'numero' },
            { clave: 'entregados', titulo: t('com.camp.k.delivered'), tipo: 'numero' }, { clave: 'leidos', titulo: t('com.camp.k.read'), tipo: 'numero' },
            { clave: 'fallidos', titulo: t('com.camp.k.failed'), tipo: 'numero' }, { clave: 'respuestas', titulo: t('com.camp.k.replies'), tipo: 'numero' },
            { clave: 'clics', titulo: t('com.camp.k.clicks'), tipo: 'numero' }, { clave: 'creditos', titulo: t('com.credits.credits'), tipo: 'numero' },
          ],
          filas: filas.map(c => ({ nombre: c.nombre, estado: t('com.camp.st.' + c.estado), plantilla: c.plantilla_nombre, inicio: c.iniciada_at, total: c.conteos.total,
            enviados: c.conteos.enviados, entregados: c.conteos.entregados, leidos: c.conteos.leidos, fallidos: c.conteos.fallidos, respuestas: c.conteos.respuestas,
            clics: c.conteos.clics, creditos: c.conteos.creditos })),
        }],
      }, e.formato);
      return { ok: true, filas: filas.length };
    });
  }
}
