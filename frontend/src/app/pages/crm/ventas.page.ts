import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatPrefix, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatPaginator, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTab, MatTabGroup } from '@angular/material/tabs';
import { ContactoPickerComponent } from '../../components/contacto-picker.component';
import { DateInputComponent } from '../../components/date-input.component';
import { ExportAlcance, ExportMenuComponent, ExportSolicitud } from '../../components/export-menu.component';
import { ItemPickerComponent } from '../../components/item-picker.component';
import { CrmConfigService } from '../../services/crm-config.service';
import { ejecutarExportacion } from '../../services/crm-report.service';
import { CrmVentasReportService } from '../../services/crm-ventas-report.service';
import {
  CategoriaItem, CrmService, FiltrosVenta, GrupoCliente, GrupoItem, GrupoMes, Importacion, ResumenVentas, VentaFila,
} from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDate, formatDateTime } from './crm-format';
import { TranslatedPaginatorIntl } from './translated-paginator-intl';
import { VentaDialogComponent } from './venta-dialog.component';
import { VentasImportDialogComponent } from './ventas-import-dialog.component';

type Periodo = 'mes' | 'mes_ant' | 'trimestre' | 'anio' | '12m' | 'todo' | 'rango';
type Tab = 'clientes' | 'items' | 'meses' | 'ventas' | 'importaciones';
const TABS: Tab[] = ['clientes', 'items', 'meses', 'ventas', 'importaciones'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Rango de fechas de un período con nombre (en la zona del navegador). */
export function rangoPeriodo(p: Periodo, hoy = new Date()): { desde: string | null; hasta: string | null } {
  const y = hoy.getFullYear(), m = hoy.getMonth();
  switch (p) {
    case 'mes': return { desde: iso(new Date(y, m, 1)), hasta: iso(hoy) };
    case 'mes_ant': return { desde: iso(new Date(y, m - 1, 1)), hasta: iso(new Date(y, m, 0)) };
    case 'trimestre': return { desde: iso(new Date(y, Math.floor(m / 3) * 3, 1)), hasta: iso(hoy) };
    case 'anio': return { desde: iso(new Date(y, 0, 1)), hasta: iso(hoy) };
    case '12m': return { desde: iso(new Date(y, m - 11, 1)), hasta: iso(hoy) };
    default: return { desde: null, hasta: null };
  }
}

/** Ventas importadas: indicadores, análisis por cliente, ítem y mes, detalle, importaciones (con reversión) y exportación. */
@Component({
  selector: 'app-ventas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl }],
  imports: [
    FormsModule, MatButton, MatIconButton, MatFormField, MatLabel, MatPrefix, MatSuffix, MatIcon, MatInput, MatPaginator, MatSelect, MatOption, MatSlideToggle,
    MatTab, MatTabGroup, ContactoPickerComponent, DateInputComponent, ExportMenuComponent, ItemPickerComponent, TranslatePipe,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ 'crm.sales.title' | translate }}</h1>
        <div class="actions">
          <app-export-menu [alcances]="exportAlcances()" [disabled]="!resumen()?.ventas" (exportar)="exportar($event)" />
          @if (puedeImportar()) { <button mat-flat-button id="btn-import" (click)="importar()"><mat-icon>upload</mat-icon>{{ 'crm.sales.import' | translate }}</button> }
        </div>
      </header>

      <section class="filters">
        <div class="frow">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="narrow">
            <mat-label>{{ 'crm.sales.period' | translate }}</mat-label>
            <mat-select id="filter-periodo" [ngModel]="periodo()" (ngModelChange)="setPeriodo($event)">
              @for (p of periodos; track p) { <mat-option [value]="p">{{ 'crm.sales.p_' + p | translate }}</mat-option> }
            </mat-select>
          </mat-form-field>
          @if (periodo() === 'rango') {
            <app-date-input [label]="'crm.sales.from' | translate" [value]="desde()" (valueChange)="desde.set($event)" />
            <app-date-input [label]="'crm.sales.to' | translate" [value]="hasta()" (valueChange)="hasta.set($event)" />
          }
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
            <mat-label>{{ 'crm.filters.search' | translate }}</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput id="filter-q" type="search" autocomplete="off" [placeholder]="'crm.sales.search_hint' | translate" [ngModel]="qInput()" (ngModelChange)="onSearch($event)" />
            @if (qInput()) { <button matSuffix mat-icon-button type="button" (click)="onSearch('')" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button> }
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="narrow">
            <mat-label>{{ 'crm.catalog.item_category' | translate }}</mat-label>
            <mat-select id="filter-categoria" [ngModel]="categoria()" (ngModelChange)="categoria.set($event)">
              <mat-option [value]="null">{{ 'crm.filters.all' | translate }}</mat-option>
              @for (c of categorias(); track c.id) { <mat-option [value]="c.id">{{ c.nombre }}</mat-option> }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="frow">
          <div class="pick">
            @if (cliente(); as c) {
              <span class="pill" id="client-chip">{{ 'crm.opp.client' | translate }}: {{ c.nombre }}</span>
              <button mat-icon-button (click)="cliente.set(null)" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button>
              <mat-slide-toggle [checked]="dependientes()" (change)="dependientes.set($event.checked)">{{ 'crm.sales.with_children' | translate }}</mat-slide-toggle>
            } @else {
              <app-contacto-picker tipo="organizacion" inputId="filter-client" [label]="'crm.opp.client_search' | translate" (picked)="cliente.set({ id: $event.id, nombre: $event.nombre_completo })" />
            }
          </div>
          <div class="pick">
            @if (item(); as i) {
              <span class="pill" id="item-chip">{{ 'crm.oreport.item' | translate }}: {{ i.nombre }}</span>
              <button mat-icon-button (click)="item.set(null)" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button>
            } @else {
              <app-item-picker inputId="filter-item" [label]="'crm.sales.item_search' | translate" (picked)="item.set({ id: $event.id, nombre: $event.nombre })" />
            }
          </div>
          @if (importacion(); as imp) {
            <span class="pill">{{ 'crm.sales.batch' | translate }}: {{ imp.archivo || imp.id }}</span>
            <button mat-icon-button (click)="importacion.set(null)" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button>
          }
        </div>
      </section>

      @if (resumen(); as r) {
        <div class="kpis" id="kpis">
          <div class="kpi"><span>{{ 'crm.sales.k_total' | translate }}</span><strong>{{ cfg.money(r.total) }}</strong></div>
          <div class="kpi"><span>{{ 'crm.sales.k_sales' | translate }}</span><strong>{{ num(r.ventas) }}</strong></div>
          <div class="kpi"><span>{{ 'crm.sales.k_clients' | translate }}</span><strong>{{ num(r.clientes) }}</strong></div>
          <div class="kpi"><span>{{ 'crm.sales.k_ticket' | translate }}</span><strong>{{ cfg.money(r.ticket_promedio) }}</strong></div>
          <div class="kpi"><span>{{ 'crm.sales.units' | translate }}</span><strong>{{ num(r.unidades) }}</strong></div>
        </div>
      }

      <mat-tab-group animationDuration="0ms" mat-stretch-tabs="false" mat-align-tabs="start" [selectedIndex]="tabIndex()" (selectedIndexChange)="setTab($event)">
        <mat-tab [label]="'crm.sales.by_client' | translate">
          <div class="table-scroll">
            <table class="t" id="tbl-clientes">
              <thead><tr><th>{{ 'crm.opp.client' | translate }}</th><th class="n">{{ 'crm.sales.k_sales' | translate }}</th><th class="n hide-md">{{ 'crm.sales.last' | translate }}</th><th class="n">{{ 'crm.sales.total' | translate }}</th><th class="bar hide-md"></th></tr></thead>
              <tbody>
                @for (g of clientes(); track g.id) {
                  <tr class="row" (click)="verCliente(g)">
                    <td><strong>{{ g.nombre }}</strong></td><td class="n">{{ g.ventas }}</td><td class="n hide-md">{{ fmt(g.ultima) }}</td><td class="n">{{ cfg.money(g.total) }}</td>
                    <td class="bar hide-md"><span [style.width.%]="pct(g.total, maxCliente())"></span></td>
                  </tr>
                } @empty { <tr><td colspan="5" class="muted">{{ 'crm.sales.empty' | translate }}</td></tr> }
              </tbody>
            </table>
          </div>
          <mat-paginator [length]="totalGrupos()" [pageSize]="pageSize()" [pageIndex]="page()" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
        </mat-tab>

        <mat-tab [label]="'crm.sales.by_item' | translate">
          <div class="table-scroll">
            <table class="t" id="tbl-items">
              <thead><tr><th>{{ 'crm.oreport.item' | translate }}</th><th class="hide-md">{{ 'crm.catalog.item_category' | translate }}</th><th class="n">{{ 'crm.opp.qty' | translate }}</th><th class="n">{{ 'crm.sales.total' | translate }}</th><th class="bar hide-md"></th></tr></thead>
              <tbody>
                @for (g of items(); track $index) {
                  <tr class="row" (click)="verItem(g)">
                    <td><strong>{{ g.nombre || '—' }}</strong><br /><span class="muted small">{{ g.codigo }}{{ g.id_item ? '' : ' · ' + ('crm.sales.no_item' | translate) }}</span></td>
                    <td class="hide-md">{{ g.categoria || '—' }}</td><td class="n">{{ num(g.cantidad) }}{{ g.unidad ? ' ' + g.unidad : '' }}</td><td class="n">{{ cfg.money(g.total) }}</td>
                    <td class="bar hide-md"><span [style.width.%]="pct(g.total, maxItem())"></span></td>
                  </tr>
                } @empty { <tr><td colspan="5" class="muted">{{ 'crm.sales.empty' | translate }}</td></tr> }
              </tbody>
            </table>
          </div>
          <mat-paginator [length]="totalGrupos()" [pageSize]="pageSize()" [pageIndex]="page()" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
        </mat-tab>

        <mat-tab [label]="'crm.sales.by_month' | translate">
          <div class="months" id="tbl-meses">
            @for (g of meses(); track g.mes) {
              <div class="month"><span class="ml">{{ mes(g.mes) }}</span><span class="mb"><span [style.width.%]="pct(g.total, maxMes())"></span></span>
                <span class="mv">{{ cfg.money(g.total) }}</span><span class="muted small mc">{{ 'crm.sales.month_detail' | translate: { v: g.ventas, c: g.clientes } }}</span></div>
            } @empty { <p class="muted">{{ 'crm.sales.empty' | translate }}</p> }
          </div>
        </mat-tab>

        <mat-tab [label]="'crm.sales.detail' | translate">
          <div class="table-scroll">
            <table class="t" id="tbl-ventas">
              <thead><tr><th>{{ 'crm.sales.date' | translate }}</th><th>{{ 'crm.sales.document' | translate }}</th><th>{{ 'crm.opp.client' | translate }}</th><th class="n hide-md">{{ 'crm.opp.lines' | translate }}</th><th class="n">{{ 'crm.sales.total' | translate }}</th></tr></thead>
              <tbody>
                @for (v of ventas(); track v.id) {
                  <tr class="row" (click)="verVenta(v)"><td>{{ fmt(v.fecha) }}</td><td>{{ v.documento || '—' }}</td><td>{{ v.cliente }}</td><td class="n hide-md">{{ v.lineas }}</td><td class="n">{{ cfg.money(v.total) }}</td></tr>
                } @empty { <tr><td colspan="5" class="muted">{{ 'crm.sales.empty' | translate }}</td></tr> }
              </tbody>
            </table>
          </div>
          <mat-paginator [length]="resumen()?.ventas ?? 0" [pageSize]="pageSize()" [pageIndex]="page()" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" showFirstLastButtons />
        </mat-tab>

        <mat-tab [label]="'crm.sales.imports' | translate">
          <div class="imports" id="tbl-importaciones">
            @for (i of importaciones(); track i.id) {
              <article class="imp" [class.off]="i.estado === 'revertida'">
                <div class="imp-head">
                  <mat-icon>description</mat-icon>
                  <div class="imp-t"><strong>{{ i.archivo || ('#' + i.id) }}</strong><span class="muted small">{{ fmtDt(i.created_at) }} · {{ i.creado_por || '—' }}</span></div>
                  <span class="state" [attr.data-estado]="i.estado">{{ 'crm.sales.st_' + i.estado | translate }}</span>
                </div>
                <div class="imp-n small">
                  <span>{{ 'crm.sales.i_new' | translate: { n: i.ventas_nuevas } }}</span>
                  @if (i.ventas_reemplazadas) { <span>{{ 'crm.sales.i_replaced' | translate: { n: i.ventas_reemplazadas } }}</span> }
                  @if (i.ventas_omitidas) { <span>{{ 'crm.sales.i_skipped' | translate: { n: i.ventas_omitidas } }}</span> }
                  @if (i.items_creados) { <span>{{ 'crm.sales.i_items' | translate: { n: i.items_creados } }}</span> }
                  <span [class.err]="i.filas_error > 0">{{ 'crm.sales.i_errors' | translate: { n: i.filas_error } }}</span>
                  <span>{{ cfg.money(i.total_valor) }}</span>
                  @if (i.fecha_desde) { <span>{{ fmt(i.fecha_desde) }} – {{ fmt(i.fecha_hasta!) }}</span> }
                </div>
                @if (i.estado === 'revertida') { <span class="muted small">{{ 'crm.sales.reverted_by' | translate: { date: fmtDt(i.revertido_at!), user: i.revertido_por || '—' } }}</span> }
                <div class="imp-a">
                  @if (i.errores.length) { <button mat-button (click)="verErrores(i)"><mat-icon>error_outline</mat-icon>{{ 'crm.sales.see_errors' | translate }}</button> }
                  @if (i.estado !== 'revertida') { <button mat-button (click)="verLote(i)"><mat-icon>filter_list</mat-icon>{{ 'crm.sales.see_sales' | translate }}</button> }
                  @if (puedeImportar() && i.estado !== 'revertida') { <button mat-button class="danger-t" [id]="'btn-revert-' + i.id" (click)="revertir(i)"><mat-icon>undo</mat-icon>{{ 'crm.sales.revert' | translate }}</button> }
                </div>
              </article>
            } @empty { <p class="muted">{{ 'crm.sales.no_imports' | translate }}</p> }
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    .filters { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
    .frow { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .narrow { flex: 0 1 190px; } .search { flex: 1 1 240px; min-width: 0; }
    .pick { display: flex; align-items: center; gap: 6px; flex: 1 1 280px; min-width: 0; flex-wrap: wrap; > app-contacto-picker, > app-item-picker { flex: 1 1 240px; } }
    .pill { padding: 4px 12px; border-radius: 999px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); font: var(--mat-sys-label-large); overflow-wrap: anywhere; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin-bottom: 8px; }
    .kpi { display: flex; flex-direction: column; gap: 2px; padding: 12px 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant);
      span { font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); } strong { font: var(--mat-sys-title-large); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } }
    .t { width: 100%; border-collapse: collapse; margin-top: 8px; th, td { padding: 8px; border-bottom: 1px solid var(--md-sys-color-outline-variant); text-align: left; } th { font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); } .n { text-align: right; white-space: nowrap; } }
    tr.row { cursor: pointer; } tr.row:hover { background: var(--md-sys-color-surface-container-low); }
    .bar { width: 22%; span { display: block; height: 8px; border-radius: 4px; background: var(--md-sys-color-primary); min-width: 2px; } }
    .months { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
    .month { display: grid; grid-template-columns: 110px 1fr auto; gap: 4px 12px; align-items: center; .mb { height: 14px; background: var(--md-sys-color-surface-container-high); border-radius: 7px; overflow: hidden; span { display: block; height: 100%; background: var(--md-sys-color-primary); } } .mv { font: var(--mat-sys-label-large); text-align: right; } .mc { grid-column: 2 / 4; } }
    .imports { display: flex; flex-direction: column; gap: 12px; padding: 12px 0; }
    .imp { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); &.off { opacity: 0.65; } }
    .imp-head { display: flex; align-items: center; gap: 12px; } .imp-t { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .state { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container);
      &[data-estado='revertida'] { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); } &[data-estado='procesando'] { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); } }
    .imp-n { display: flex; flex-wrap: wrap; gap: 4px 16px; } .imp-a { display: flex; flex-wrap: wrap; gap: 4px; }
    .err { color: var(--md-sys-color-error); } .danger-t { color: var(--md-sys-color-error); }
    .small { font: var(--mat-sys-body-small); }
    @media (max-width: 599px) { .hide-md { display: none; } .narrow { flex: 1 1 140px; } .month { grid-template-columns: 80px 1fr auto; } }
  `,
})
export default class VentasPage {
  private crm = inject(CrmService);
  readonly loading = inject(LoadingService);
  readonly dialogs = inject(DialogService);
  private matDialog = inject(MatDialog);
  private router = inject(Router);
  private session = inject(SessionService);
  readonly i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);
  private reportes = inject(CrmVentasReportService);

  readonly periodos: Periodo[] = ['mes', 'mes_ant', 'trimestre', 'anio', '12m', 'todo', 'rango'];
  readonly periodo = signal<Periodo>('anio');
  readonly desde = signal<string | null>(rangoPeriodo('anio').desde);
  readonly hasta = signal<string | null>(rangoPeriodo('anio').hasta);
  readonly qInput = signal('');
  private readonly q = signal('');
  private qTimer: ReturnType<typeof setTimeout> | null = null;
  readonly categoria = signal<number | null>(null);
  readonly cliente = signal<{ id: number; nombre: string } | null>(null);
  readonly dependientes = signal(true);
  readonly item = signal<{ id: number; nombre: string } | null>(null);
  readonly importacion = signal<{ id: number; archivo: string | null } | null>(null);
  readonly categorias = signal<CategoriaItem[]>([]);
  readonly puedeImportar = computed(() => this.session.hasMinRole('L2'));

  readonly tab = signal<Tab>('clientes');
  readonly tabIndex = computed(() => TABS.indexOf(this.tab()));
  readonly page = signal(0);
  readonly pageSize = signal(25);

  readonly resumen = signal<ResumenVentas | null>(null);
  readonly clientes = signal<GrupoCliente[]>([]);
  readonly items = signal<GrupoItem[]>([]);
  readonly meses = signal<GrupoMes[]>([]);
  readonly ventas = signal<VentaFila[]>([]);
  readonly importaciones = signal<Importacion[]>([]);
  readonly totalGrupos = signal(0);
  readonly maxCliente = computed(() => Math.max(1, ...this.clientes().map(g => g.total)));
  readonly maxItem = computed(() => Math.max(1, ...this.items().map(g => g.total)));
  readonly maxMes = computed(() => Math.max(1, ...this.meses().map(g => g.total)));
  private reqId = 0;
  private lastKey = '';

  readonly filtros = computed<FiltrosVenta>(() => {
    const f: FiltrosVenta = {};
    if (this.desde()) f.desde = this.desde()!;
    if (this.hasta()) f.hasta = this.hasta()!;
    if (this.q()) f.q = this.q();
    if (this.categoria()) f.categoria = this.categoria()!;
    if (this.cliente()) { f.contacto = this.cliente()!.id; if (this.dependientes()) f.dependientes = true; }
    if (this.item()) f.item = this.item()!.id;
    if (this.importacion()) f.importacion = this.importacion()!.id;
    return f;
  });
  readonly exportAlcances = computed<ExportAlcance[]>(() => [
    { id: 'filtro', etiqueta: this.i18n.t('crm.sales.scope_filter', { n: this.resumen()?.ventas ?? 0 }), deshabilitado: !this.resumen()?.ventas },
    { id: 'todos', etiqueta: this.i18n.t('crm.sales.scope_all') },
  ]);

  constructor() {
    void this.crm.listCategoriasItem(true).then(r => { if (r.action && r.data) this.categorias.set(r.data.categorias); });
    effect(() => {
      const key = JSON.stringify([this.filtros(), this.tab(), this.pageSize()]);
      const p = this.page();
      untracked(() => {
        if (key !== this.lastKey) { this.lastKey = key; if (p !== 0) { this.page.set(0); return; } }
        void this.load();
      });
    });
  }

  async load(): Promise<void> {
    const id = ++this.reqId;
    const f = this.filtros(), p = this.page() + 1, n = this.pageSize();
    await this.loading.wrap(async () => {
      switch (this.tab()) {
        case 'clientes': { const r = await this.crm.gruposVentas<GrupoCliente>('clientes', f, p, n); if (id === this.reqId && r.data) { this.clientes.set(r.data.grupos); this.totalGrupos.set(r.data.total); this.resumen.set(r.data.resumen); } break; }
        case 'items': { const r = await this.crm.gruposVentas<GrupoItem>('items', f, p, n); if (id === this.reqId && r.data) { this.items.set(r.data.grupos); this.totalGrupos.set(r.data.total); this.resumen.set(r.data.resumen); } break; }
        case 'meses': { const r = await this.crm.gruposVentas<GrupoMes>('meses', f); if (id === this.reqId && r.data) { this.meses.set(r.data.grupos); this.resumen.set(r.data.resumen); } break; }
        case 'ventas': { const r = await this.crm.listVentas(f, p, n); if (id === this.reqId && r.data) { this.ventas.set(r.data.ventas); this.resumen.set(r.data.resumen); } break; }
        case 'importaciones': {
          const [r, s] = await Promise.all([this.crm.listImportaciones(1, 100), this.crm.listVentas(f, 1, 1)]);
          if (id === this.reqId) { if (r.data) this.importaciones.set(r.data.importaciones); if (s.data) this.resumen.set(s.data.resumen); }
          break;
        }
      }
    });
  }

  setPeriodo(p: Periodo): void {
    this.periodo.set(p);
    if (p === 'rango') return;
    const r = rangoPeriodo(p);
    this.desde.set(r.desde); this.hasta.set(r.hasta);
  }
  setTab(i: number): void { this.tab.set(TABS[i] ?? 'clientes'); }
  onSearch(v: string): void {
    this.qInput.set(v);
    if (this.qTimer) clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => this.q.set(v.trim()), 300);
  }
  onPage(e: PageEvent): void { this.pageSize.set(e.pageSize); this.page.set(e.pageIndex); }

  fmt(s: string): string { return formatDate(s); }
  fmtDt(s: string): string { return formatDateTime(s); }
  num(n: number): string { return n.toLocaleString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 2 }); }
  pct(v: number, max: number): number { return Math.max(0, Math.min(100, (v / max) * 100)); }
  mes(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    const s = new Intl.DateTimeFormat(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  verCliente(g: GrupoCliente): void { void this.router.navigate(['/m/crm/contactos', g.id]); }
  verItem(g: GrupoItem): void { if (g.id_item) { this.item.set({ id: g.id_item, nombre: g.nombre ?? '' }); this.tab.set('ventas'); } }
  verVenta(v: VentaFila): void { this.matDialog.open(VentaDialogComponent, { ...dialogSize('720px'), data: v.id }); }
  verLote(i: Importacion): void { this.importacion.set({ id: i.id, archivo: i.archivo }); this.setPeriodo('todo'); this.tab.set('ventas'); }

  async verErrores(i: Importacion): Promise<void> {
    const lineas = i.errores.slice(0, 40).map(e => this.i18n.t('crm.imp.row', { n: e.fila }) + ': ' + e.motivo);
    if (i.errores.length > 40) lineas.push('…');
    await this.dialogs.info({ title: this.i18n.t('crm.sales.errors_of', { file: i.archivo || '#' + i.id }), message: lineas.join('\n') });
  }

  importar(): void {
    this.matDialog.open(VentasImportDialogComponent, { ...dialogSize('960px'), autoFocus: 'first-tabbable', disableClose: false })
      .afterClosed().subscribe(ok => { if (ok) { this.tab.set('importaciones'); void this.load(); } });
  }

  async revertir(i: Importacion): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('crm.sales.revert_title'), message: this.i18n.t('crm.sales.revert_msg', { file: i.archivo || '#' + i.id, n: i.ventas_nuevas + i.ventas_reemplazadas }),
      confirmText: this.i18n.t('crm.sales.revert'), danger: true,
    });
    if (!ok) return;
    const r = await this.loading.wrap(() => this.crm.revertirImportacion(i.id));
    if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('crm.sales.revert_error'), message: r.mensaje }); return; }
    await this.dialogs.success({ title: this.i18n.t('crm.sales.reverted'), message: this.i18n.t('crm.sales.reverted_msg', { n: r.data.ventas_desactivadas }) });
    await this.load();
  }

  // ─── Exportar ──────────────────────────────────────────────────────────────────────────────────────────────────
  async exportar(e: ExportSolicitud): Promise<void> {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const todos = e.alcance === 'todos';
    const filtros: FiltrosVenta = todos ? {} : this.filtros();
    const texto: string[] = [];
    if (todos) texto.push(t('crm.sales.scope_all_text'));
    else {
      texto.push(`${t('crm.sales.period')}: ${this.desde() || this.hasta() ? `${this.desde() ? this.fmt(this.desde()!) : '…'} – ${this.hasta() ? this.fmt(this.hasta()!) : '…'}` : t('crm.sales.p_todo')}`);
      if (this.cliente()) texto.push(`${t('crm.opp.client')}: ${this.cliente()!.nombre}${this.dependientes() ? ' (' + t('crm.sales.with_children') + ')' : ''}`);
      if (this.item()) texto.push(`${t('crm.oreport.item')}: ${this.item()!.nombre}`);
      if (this.categoria()) texto.push(`${t('crm.catalog.item_category')}: ${this.categorias().find(c => c.id === this.categoria())?.nombre ?? ''}`);
      if (this.q()) texto.push(`${t('crm.filters.search')}: «${this.q()}»`);
      if (this.importacion()) texto.push(`${t('crm.sales.batch')}: ${this.importacion()!.archivo ?? this.importacion()!.id}`);
    }
    await ejecutarExportacion(this, () => this.reportes.exportarVentas({ filtros, totalEsperado: todos ? undefined : this.resumen()?.ventas, formato: e.formato, filtrosTexto: texto }));
  }
}
