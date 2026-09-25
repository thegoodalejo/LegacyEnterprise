import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatPrefix, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatPaginator, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { MatOption, MatSelect } from '@angular/material/select';
import { ExportAlcance, ExportMenuComponent, ExportSolicitud } from '../../components/export-menu.component';
import { CrmConfigService } from '../../services/crm-config.service';
import { CrmMetasReportService } from '../../services/crm-metas-report.service';
import { ejecutarExportacion } from '../../services/crm-report.service';
import { ConteoMetas, CrmService, EstadoMeta, FiltrosMeta, Meta, Metrica, OrdenMeta } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { hoyIso } from './oportunidad-cierre-dialog.component';
import { abrirMetaDialog } from './meta-dialog.component';
import { MetasGenerarDialogComponent } from './metas-generar-dialog.component';
import { MetasPanelComponent } from './metas-panel.component';
import { fechaReferenciaMes, nombreMes, sumarMeses } from './metas-periodo';
import { MetaBarComponent, MetaEstadoComponent, periodoDe, valorMetrica } from './metas-ui';
import { TranslatedPaginatorIntl } from './translated-paginator-intl';

const ESTADOS: EstadoMeta[] = ['cumplida', 'en_ritmo', 'en_riesgo', 'atrasada', 'no_cumplida', 'futura'];
const ORDENES: OrdenMeta[] = ['avance', 'ritmo', 'meta', 'real', 'nombre'];

/** Metas: el mes que se mira (vigentes ese día), el panel de tres niveles y la tabla de metas de organizaciones. L4 crea, genera y edita. */
@Component({
  selector: 'app-metas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl }],
  imports: [
    FormsModule, RouterLink, MatButton, MatIconButton, MatFormField, MatLabel, MatPrefix, MatSuffix, MatIcon, MatInput, MatPaginator, MatSelect, MatOption,
    ExportMenuComponent, MetasPanelComponent, MetaBarComponent, MetaEstadoComponent, TranslatePipe,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ 'crm.goals.title' | translate }}</h1>
        <div class="actions">
          <app-export-menu [alcances]="exportAlcances()" (exportar)="exportar($event)" />
          @if (esAdmin() && metricas().length) {
            <button mat-stroked-button id="btn-gen-metas" (click)="generar()"><mat-icon>auto_awesome</mat-icon>{{ 'crm.goals.gen_button' | translate }}</button>
            <button mat-flat-button id="btn-new-meta" (click)="nueva()"><mat-icon>add</mat-icon>{{ 'crm.goals.new' | translate }}</button>
          }
        </div>
      </header>

      @if (cargado() && !metricas().length) {
        <div class="empty-state" id="sin-metricas">
          <mat-icon>flag</mat-icon><strong>{{ 'crm.goals.no_metrics_title' | translate }}</strong>
          @if (esAdmin()) { <span class="muted">{{ 'crm.goals.no_metrics_admin' | translate }}</span><a mat-flat-button routerLink="/m/crm/configuracion">{{ 'crm.opp.go_config' | translate }}</a> }
          @else { <span class="muted">{{ 'crm.goals.no_metrics_user' | translate }}</span> }
        </div>
      } @else {
        <div class="mes-nav">
          <button mat-icon-button id="btn-mes-ant" (click)="moverMes(-1)" [attr.aria-label]="'crm.goals.prev_month' | translate"><mat-icon>chevron_left</mat-icon></button>
          <strong id="mes-label">{{ mesTexto() }}</strong>
          <button mat-icon-button id="btn-mes-sig" (click)="moverMes(1)" [attr.aria-label]="'crm.goals.next_month' | translate"><mat-icon>chevron_right</mat-icon></button>
          @if (mes() !== mesHoy) { <button mat-button id="btn-mes-hoy" (click)="mes.set(mesHoy)">{{ 'crm.goals.today' | translate }}</button> }
          <span class="muted small">{{ 'crm.goals.data_until' | translate: { date: dmy(corte()) } }}</span>
        </div>

        <app-metas-panel [fecha]="fechaRef()" [editable]="esAdmin()" (cambio)="load()" />

        <section class="orgs" id="metas-orgs">
          <div class="head">
            <h2>{{ 'crm.goals.orgs_title' | translate }}</h2>
            @if (conteo(); as c) { <span class="muted small" id="orgs-conteo">{{ 'crm.goals.n_goals' | translate: { n: c.total } }}</span> }
          </div>
          <div class="frow">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
              <mat-label>{{ 'crm.filters.search' | translate }}</mat-label>
              <mat-icon matPrefix>search</mat-icon>
              <input matInput id="metas-q" type="search" autocomplete="off" [ngModel]="qInput()" (ngModelChange)="onSearch($event)" />
              @if (qInput()) { <button matSuffix mat-icon-button type="button" (click)="onSearch('')" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button> }
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="narrow">
              <mat-label>{{ 'crm.goals.metric' | translate }}</mat-label>
              <mat-select id="metas-metrica" [ngModel]="idMetrica()" (ngModelChange)="idMetrica.set($event)">
                <mat-option [value]="null">{{ 'crm.filters.all' | translate }}</mat-option>
                @for (m of metricas(); track m.id) { <mat-option [value]="m.id">{{ m.nombre }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="narrow">
              <mat-label>{{ 'crm.col.status' | translate }}</mat-label>
              <mat-select id="metas-estado" [ngModel]="estado()" (ngModelChange)="estado.set($event)">
                <mat-option [value]="null">{{ 'crm.filters.all' | translate }}</mat-option>
                @for (e of estados; track e) { <mat-option [value]="e">{{ 'crm.goals.st_' + e | translate }}@if (conteo(); as c) { ({{ c[e] }}) }</mat-option> }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="narrow">
              <mat-label>{{ 'crm.opp.sort' | translate }}</mat-label>
              <mat-select id="metas-orden" [ngModel]="orden()" (ngModelChange)="orden.set($event)">
                @for (o of ordenes; track o) { <mat-option [value]="o">{{ 'crm.goals.sort_' + o | translate }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <button mat-icon-button id="metas-dir" (click)="dir.set(dir() === 'asc' ? 'desc' : 'asc')" [attr.aria-label]="'crm.opp.sort_dir' | translate"><mat-icon>{{ dir() === 'asc' ? 'arrow_upward' : 'arrow_downward' }}</mat-icon></button>
          </div>
          <div class="table-scroll">
            <table class="t" id="tbl-metas">
              <thead><tr>
                <th>{{ 'crm.tipo.organizacion' | translate }}</th><th class="hide-md">{{ 'crm.goals.metric' | translate }}</th>
                <th class="n">{{ 'crm.goals.real' | translate }} / {{ 'crm.goals.target' | translate }}</th><th class="bar">{{ 'crm.goals.progress' | translate }}</th>
                <th>{{ 'crm.col.status' | translate }}</th>@if (esAdmin()) { <th class="act"></th> }
              </tr></thead>
              <tbody>
                @for (m of metas(); track m.id) {
                  <tr class="row">
                    <td><a class="org" [routerLink]="['/m/crm/contactos', m.id_contacto]">{{ m.contacto_nombre }}</a>
                      <span class="muted small sub">{{ m.metrica_nombre }} · {{ periodoTexto(m) }}</span></td>
                    <td class="hide-md">{{ m.metrica_nombre }}@if (m.filtro) { <span class="muted small"> · {{ m.filtro }}</span> }<br /><span class="muted small">{{ periodoTexto(m) }}</span></td>
                    <td class="n"><strong>{{ fmt(m, m.real) }}</strong><br /><span class="muted small">{{ 'crm.goals.of' | translate }} {{ fmt(m, m.valor_meta) }}</span></td>
                    <td class="bar"><app-meta-bar [porcentaje]="m.porcentaje" [tiempoPct]="m.tiempo_pct" [estado]="m.estado" [etiqueta]="m.contacto_nombre ?? ''" /><span class="small">{{ pct(m.porcentaje) }}</span></td>
                    <td><app-meta-estado [estado]="m.estado" /></td>
                    @if (esAdmin()) { <td class="act"><button mat-icon-button [id]="'btn-edit-meta-' + m.id" (click)="editar(m)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button></td> }
                  </tr>
                } @empty { <tr><td [attr.colspan]="esAdmin() ? 6 : 5" class="muted">{{ 'crm.goals.orgs_empty' | translate }}</td></tr> }
              </tbody>
            </table>
          </div>
          <mat-paginator [length]="total()" [pageSize]="pageSize()" [pageIndex]="page()" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
        </section>
      }
    </div>
  `,
  styles: `
    .mes-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-bottom: 12px; strong { font: var(--mat-sys-title-medium); min-width: 150px; text-align: center; } }
    .orgs { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
    .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; h2 { margin: 0; font: var(--mat-sys-title-medium); } }
    .frow { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .search { flex: 1 1 220px; min-width: 0; } .narrow { flex: 0 1 180px; }
    .t { width: 100%; border-collapse: collapse; th, td { padding: 8px; border-bottom: 1px solid var(--md-sys-color-outline-variant); text-align: left; vertical-align: middle; }
      th { font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); } .n { text-align: right; white-space: nowrap; } }
    .bar { width: 22%; min-width: 110px; app-meta-bar { margin-bottom: 2px; } }
    .act { width: 48px; }
    .org { color: inherit; font-weight: 500; text-decoration: none; overflow-wrap: anywhere; &:hover { text-decoration: underline; } }
    .sub { display: none; }
    .small { font: var(--mat-sys-body-small); }
    @media (max-width: 599px) { .hide-md { display: none; } .sub { display: block; } .narrow { flex: 1 1 140px; } }
  `,
})
export default class MetasPage {
  private crm = inject(CrmService);
  readonly loading = inject(LoadingService);
  readonly dialogs = inject(DialogService);
  private matDialog = inject(MatDialog);
  private session = inject(SessionService);
  readonly i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);
  private reportes = inject(CrmMetasReportService);
  private panel = viewChild(MetasPanelComponent);

  readonly estados = ESTADOS;
  readonly ordenes = ORDENES;
  readonly esAdmin = computed(() => this.session.hasMinRole('L4'));
  readonly hoy = hoyIso();
  readonly mesHoy = sumarMeses(this.hoy, 0);
  readonly mes = signal(this.mesHoy);
  readonly fechaRef = computed(() => fechaReferenciaMes(this.mes(), this.hoy));
  readonly corte = computed(() => (this.fechaRef() < this.hoy ? this.fechaRef() : this.hoy));
  readonly mesTexto = computed(() => nombreMes(this.mes(), this.i18n.lang()));

  readonly metricas = signal<Metrica[]>([]);
  readonly cargado = signal(false);
  readonly qInput = signal('');
  private readonly q = signal('');
  private qTimer: ReturnType<typeof setTimeout> | null = null;
  readonly idMetrica = signal<number | null>(null);
  readonly estado = signal<EstadoMeta | null>(null);
  readonly orden = signal<OrdenMeta>('avance');
  readonly dir = signal<'asc' | 'desc'>('asc');
  readonly page = signal(0);
  readonly pageSize = signal(25);

  readonly metas = signal<Meta[]>([]);
  readonly total = signal(0);
  readonly conteo = signal<ConteoMetas | null>(null);
  private reqId = 0;
  private lastKey = '';

  readonly filtros = computed<FiltrosMeta>(() => {
    const f: FiltrosMeta = { fecha: this.fechaRef(), ambito: 'organizacion' };
    if (this.q()) f.q = this.q();
    if (this.idMetrica()) f.id_metrica = this.idMetrica()!;
    if (this.estado()) f.estado_avance = [this.estado()!];
    return f;
  });
  readonly exportAlcances = computed<ExportAlcance[]>(() => [
    { id: 'mes', etiqueta: this.i18n.t('crm.goals.scope_month', { month: this.mesTexto() }) },
    { id: 'todas', etiqueta: this.i18n.t('crm.goals.scope_all') },
  ]);

  constructor() {
    void this.crm.listMetricas().then(r => { if (r.action && r.data) this.metricas.set(r.data.metricas); this.cargado.set(true); });
    effect(() => {
      const key = JSON.stringify([this.filtros(), this.orden(), this.dir(), this.pageSize()]);
      const p = this.page();
      untracked(() => {
        if (key !== this.lastKey) { this.lastKey = key; if (p !== 0) { this.page.set(0); return; } }
        void this.load();
      });
    });
  }

  async load(): Promise<void> {
    const id = ++this.reqId;
    const r = await this.loading.wrap(() => this.crm.listMetas(this.filtros(), { pagina: this.page() + 1, porPagina: this.pageSize(), orden: this.orden(), dir: this.dir() }));
    if (id !== this.reqId) return;
    if (r.action && r.data) { this.metas.set(r.data.metas); this.total.set(r.data.total); this.conteo.set(r.data.conteo); }
    else await this.dialogs.error({ title: this.i18n.t('crm.goals.load_error'), message: r.mensaje });
  }

  moverMes(n: number): void { this.mes.set(sumarMeses(this.mes(), n)); }
  onSearch(v: string): void {
    this.qInput.set(v);
    if (this.qTimer) clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => this.q.set(v.trim()), 300);
  }
  onPage(e: PageEvent): void { this.pageSize.set(e.pageSize); this.page.set(e.pageIndex); }

  fmt(m: Meta, n: number | null): string { return valorMetrica(this.cfg, this.i18n.lang(), m.formato, m.unidad, n); }
  pct(n: number): string { return `${n.toLocaleString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 1 })} %`; }
  periodoTexto(m: Meta): string { return periodoDe(this.i18n, m); }
  dmy(s: string): string { return s.split('-').reverse().join('-'); }

  private recargarTodo(): void { void this.load(); void this.panel()?.load(); }
  nueva(): void { abrirMetaDialog(this.matDialog, { fecha: this.fechaRef() }).afterClosed().subscribe(ok => { if (ok) this.recargarTodo(); }); }
  editar(m: Meta): void { abrirMetaDialog(this.matDialog, { meta: m }).afterClosed().subscribe(ok => { if (ok) this.recargarTodo(); }); }
  generar(): void {
    this.matDialog.open(MetasGenerarDialogComponent, { ...dialogSize('960px'), data: { fecha: this.fechaRef() }, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(ok => { if (ok) this.recargarTodo(); });
  }

  // ─── Exportar ──────────────────────────────────────────────────────────────────────────────────────────────────
  async exportar(e: ExportSolicitud): Promise<void> {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const todas = e.alcance === 'todas';
    const filtros: FiltrosMeta = todas ? {} : { fecha: this.fechaRef() };
    const subtitulo = todas ? t('crm.goals.report_sub_all', { date: this.dmy(this.hoy) }) : t('crm.goals.report_sub', { date: this.dmy(this.fechaRef()), cut: this.dmy(this.corte()) });
    const texto = [todas ? t('crm.goals.scope_all') : t('crm.goals.scope_month', { month: this.mesTexto() })];
    await ejecutarExportacion(this, () => this.reportes.exportarMetas({ filtros, formato: e.formato, subtitulo, filtrosTexto: texto }));
  }

}
