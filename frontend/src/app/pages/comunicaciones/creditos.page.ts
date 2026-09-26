import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatPaginator, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { DateInputComponent } from '../../components/date-input.component';
import { ExportAlcance, ExportMenuComponent, ExportSolicitud } from '../../components/export-menu.component';
import { ComunicacionesService, Movimiento, Saldo } from '../../services/comunicaciones.service';
import { ejecutarExportacion } from '../../services/crm-report.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { ReportService } from '../../services/reports/report.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDate, formatDateTime } from '../crm/crm-format';
import { TranslatedPaginatorIntl } from '../crm/translated-paginator-intl';

interface TransferData { empresa: number; sede: number }

/** Transferir créditos entre la bolsa de la empresa y la de la sede (L4). */
@Component({
  selector: 'app-transferir-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton, MatButtonToggleGroup, MatButtonToggle, MatFormField,
    MatLabel, MatHint, MatInput, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'com.credits.transfer' | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-button-toggle-group [(ngModel)]="direccion" [hideSingleSelectionIndicator]="true">
          <mat-button-toggle value="a_sede">{{ 'com.credits.to_branch' | translate }}</mat-button-toggle>
          <mat-button-toggle value="a_empresa">{{ 'com.credits.to_company' | translate }}</mat-button-toggle>
        </mat-button-toggle-group>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'com.credits.amount' | translate }}</mat-label>
          <input matInput id="transfer-amount" type="number" min="1" [(ngModel)]="creditos" />
          <mat-hint>{{ 'com.credits.available' | translate: { n: disponible() } }}</mat-hint>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-transfer-ok" [disabled]="!creditos || creditos < 1 || creditos > disponible() || guardando()" (click)="ok()">{{ 'com.credits.transfer' | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class TransferirDialogComponent {
  readonly data = inject<TransferData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<TransferirDialogComponent, boolean>);
  private com = inject(ComunicacionesService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  direccion: 'a_sede' | 'a_empresa' = 'a_sede';
  creditos: number | null = null;
  readonly guardando = signal(false);
  disponible(): number { return Math.max(0, this.direccion === 'a_sede' ? this.data.empresa : this.data.sede); }

  async ok(): Promise<void> {
    this.guardando.set(true);
    try {
      const r = await this.com.transferir(this.direccion, Number(this.creditos));
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.credits.transfer_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally { this.guardando.set(false); }
  }
}

/**
 * Créditos de WhatsApp de la sede: saldo de la bolsa que usa (de la sede o de la empresa), cuánto cuesta cada tipo de mensaje, consumo del mes y
 * movimientos (L2+, exportables). L4 ve las dos bolsas y transfiere entre ellas. Las recargas las hace la plataforma (L5).
 */
@Component({
  selector: 'app-creditos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl }],
  imports: [FormsModule, RouterLink, MatButton, MatIcon, MatPaginator, MatProgressBar, MatFormField, MatLabel, MatSelect, MatOption, DateInputComponent,
    ExportMenuComponent, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ 'com.credits.title' | translate }}</h1>
        <div class="actions">
          @if (esL2()) { <app-export-menu [alcances]="alcances()" [disabled]="!total()" (exportar)="exportar($event)" /> }
          @if (esL4() && s()?.bolsas) { <button mat-flat-button id="btn-transfer" (click)="transferir()"><mat-icon>swap_horiz</mat-icon>{{ 'com.credits.transfer' | translate }}</button> }
        </div>
      </header>

      @if (s(); as sal) {
        <div class="cards">
          <section class="card balance" [attr.data-nivel]="sal.billetera.alerta_nivel">
            <span class="label">{{ (sal.billetera.ambito === 'empresa' ? 'com.credits.wallet_company' : 'com.credits.wallet_branch') | translate }}</span>
            <strong class="big" id="credit-balance">{{ num(sal.billetera.saldo) }}</strong>
            <span class="muted">{{ 'com.credits.credits' | translate }}</span>
            @if (sal.billetera.porcentaje !== null) {
              <mat-progress-bar mode="determinate" [value]="sal.billetera.porcentaje" />
              <span class="muted small">{{ 'com.credits.of_last' | translate: { p: sal.billetera.porcentaje } }}</span>
            }
            @if (sal.billetera.saldo <= 0) { <p class="warn"><mat-icon>block</mat-icon>{{ 'com.credits.empty' | translate }}</p> }
            @else if (sal.billetera.alerta_nivel > 0) { <p class="warn"><mat-icon>warning</mat-icon>{{ 'com.credits.low' | translate }}</p> }
            <p class="muted small">{{ 'com.credits.how' | translate }}</p>
          </section>

          <section class="card">
            <h2>{{ 'com.credits.rates' | translate }}</h2>
            <dl class="rates">
              @for (t of sal.tarifas; track t.categoria) {
                <div><dt>{{ 'com.cat.' + t.categoria | translate }}</dt><dd><strong>{{ t.creditos }}</strong> {{ (t.creditos === 1 ? 'com.credits.credit' : 'com.credits.credits') | translate }}</dd></div>
              }
            </dl>
            <p class="muted small">{{ 'com.credits.rates_hint' | translate }}</p>
          </section>

          <section class="card">
            <h2>{{ 'com.credits.month' | translate }}</h2>
            @for (c of sal.consumo_mes; track c.categoria) {
              <div class="line"><span>{{ 'com.cat.' + c.categoria | translate }}</span><span class="muted">{{ num(c.cantidad) }} {{ 'com.credits.msgs' | translate }}</span><strong>{{ num(c.creditos) }}</strong></div>
            } @empty { <p class="muted">{{ 'com.credits.month_empty' | translate }}</p> }
            @if (sal.consumo_mes.length) { <div class="line total"><span>{{ 'com.credits.total' | translate }}</span><span></span><strong>{{ num(totalMes()) }}</strong></div> }
          </section>

          @if (sal.bolsas; as b) {
            <section class="card">
              <h2>{{ 'com.credits.wallets' | translate }}</h2>
              <div class="line"><span>{{ 'com.credits.wallet_company' | translate }}</span><span></span><strong>{{ num(b.empresa) }}</strong></div>
              <div class="line"><span>{{ 'com.credits.wallet_branch' | translate }}</span><span></span><strong>{{ num(b.sede) }}</strong></div>
              <p class="muted small">{{ (sal.fuente === 'empresa' ? 'com.credits.source_company' : 'com.credits.source_branch') | translate }}
                <a routerLink="/m/comunicaciones/configuracion">{{ 'com.credits.change_source' | translate }}</a></p>
            </section>
          }
        </div>
      }

      @if (esL2()) {
        <section class="movs">
          <div class="movs-head">
            <h2>{{ 'com.credits.movements' | translate }}</h2>
            <div class="filters">
              <app-date-input [label]="'crm.filters.created_from' | translate" [value]="desde()" (valueChange)="desde.set($event); recargar()" />
              <app-date-input [label]="'crm.filters.created_to' | translate" [value]="hasta()" (valueChange)="hasta.set($event); recargar()" />
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'com.credits.type' | translate }}</mat-label>
                <mat-select [ngModel]="tipo()" (ngModelChange)="tipo.set($event); recargar()">
                  <mat-option value="">{{ 'crm.filters.all' | translate }}</mat-option>
                  @for (t of tipos; track t) { <mat-option [value]="t">{{ 'com.mov.' + t | translate }}</mat-option> }
                </mat-select>
              </mat-form-field>
              @if (esL4()) {
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>{{ 'com.credits.wallet' | translate }}</mat-label>
                  <mat-select [ngModel]="bolsa()" (ngModelChange)="bolsa.set($event); recargar()">
                    <mat-option value="actual">{{ 'com.credits.wallet_current' | translate }}</mat-option>
                    <mat-option value="empresa">{{ 'com.credits.wallet_company' | translate }}</mat-option>
                    <mat-option value="sede">{{ 'com.credits.wallet_branch' | translate }}</mat-option>
                  </mat-select>
                </mat-form-field>
              }
            </div>
          </div>
          <div class="table-scroll">
            <table class="tbl" id="movs-table">
              <thead><tr><th>{{ 'com.credits.date' | translate }}</th><th>{{ 'com.credits.type' | translate }}</th><th>{{ 'com.credits.detail' | translate }}</th>
                <th class="num">{{ 'com.credits.msgs_col' | translate }}</th><th class="num">{{ 'com.credits.credits' | translate }}</th><th class="num">{{ 'com.credits.after' | translate }}</th></tr></thead>
              <tbody>
                @for (m of movs(); track m.id) {
                  <tr>
                    <td>{{ fecha(m.fecha) }}</td>
                    <td><span class="chip" [attr.data-tipo]="m.tipo">{{ 'com.mov.' + m.tipo | translate }}</span></td>
                    <td>{{ detalle(m) }}</td>
                    <td class="num">{{ m.tipo === 'consumo' ? num(m.cantidad) : '' }}</td>
                    <td class="num" [class.neg]="m.creditos < 0">{{ m.creditos > 0 ? '+' : '' }}{{ num(m.creditos) }}</td>
                    <td class="num">{{ num(m.saldo_despues) }}</td>
                  </tr>
                } @empty { <tr><td colspan="6"><div class="empty-state"><mat-icon>receipt_long</mat-icon>{{ 'com.credits.no_movs' | translate }}</div></td></tr> }
              </tbody>
            </table>
          </div>
          <mat-paginator [length]="total()" [pageIndex]="pagina()" [pageSize]="50" [hidePageSize]="true" (page)="paginar($event)" />
        </section>
      }
    </div>
  `,
  styles: `
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px; align-items: start; }
    .card { padding: 20px; border-radius: 20px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); display: flex; flex-direction: column; gap: 8px; min-width: 0;
      h2 { margin: 0 0 4px; font: var(--mat-sys-title-medium); } }
    .balance { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); border-color: transparent;
      &[data-nivel='2'], &[data-nivel='3'] { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); } }
    .balance .muted { color: inherit; opacity: .8; }
    .label { font: var(--mat-sys-label-large); }
    .big { font: var(--mat-sys-display-small); }
    .warn { display: flex; align-items: center; gap: 6px; margin: 4px 0 0; font: var(--mat-sys-label-large); }
    .small { font: var(--mat-sys-body-small); margin: 0; }
    .rates { margin: 0; display: flex; flex-direction: column; gap: 6px; div { display: flex; justify-content: space-between; gap: 8px; } dt { color: var(--md-sys-color-on-surface-variant); } dd { margin: 0; } }
    .line { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: baseline; padding: 4px 0; &.total { border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 8px; } }
    .movs-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; h2 { margin: 0; font: var(--mat-sys-title-large); } }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; > * { flex: 0 1 170px; } }
    .tbl { width: 100%; border-collapse: collapse; th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--md-sys-color-outline-variant); white-space: nowrap; }
      th { font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); } .num { text-align: right; } td:nth-child(3) { white-space: normal; min-width: 200px; } }
    .neg { color: var(--md-sys-color-error); }
    .chip { padding: 2px 8px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-surface-container-highest);
      &[data-tipo='recarga'] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); } }
  `,
})
export default class CreditosPage {
  private com = inject(ComunicacionesService);
  private session = inject(SessionService);
  private matDialog = inject(MatDialog);
  private reports = inject(ReportService);
  readonly loading = inject(LoadingService);
  readonly dialogs = inject(DialogService);
  readonly i18n = inject(TranslationService);

  readonly s = signal<Saldo | null>(null);
  readonly movs = signal<Movimiento[]>([]);
  readonly total = signal(0);
  readonly pagina = signal(0);
  readonly desde = signal<string | null>(null);
  readonly hasta = signal<string | null>(null);
  readonly tipo = signal('');
  readonly bolsa = signal<'actual' | 'empresa' | 'sede'>('actual');
  readonly tipos = ['recarga', 'consumo', 'ajuste', 'transferencia'];
  readonly esL2 = computed(() => this.session.hasMinRole('L2'));
  readonly esL4 = computed(() => this.session.hasMinRole('L4'));
  readonly totalMes = computed(() => (this.s()?.consumo_mes ?? []).reduce((a, c) => a + c.creditos, 0));
  readonly alcances = computed<ExportAlcance[]>(() => [{ id: 'filtro', etiqueta: this.i18n.t('com.credits.export_scope', { n: this.total() }) }]);

  constructor() {
    effect(() => { this.session.sedeId(); untracked(() => void this.cargar()); });
  }

  async cargar(): Promise<void> {
    const r = await this.loading.wrap(() => this.com.getSaldo());
    if (r.action && r.data) this.s.set(r.data);
    if (this.esL2()) await this.cargarMovs();
  }

  recargar(): void { this.pagina.set(0); void this.cargarMovs(); }
  paginar(e: PageEvent): void { this.pagina.set(e.pageIndex); void this.cargarMovs(); }

  private async cargarMovs(): Promise<void> {
    const r = await this.com.listMovimientos({ bolsa: this.bolsa(), desde: this.desde(), hasta: this.hasta(), tipo: this.tipo(), pagina: this.pagina() + 1 });
    if (r.action && r.data) { this.movs.set(r.data.movimientos); this.total.set(r.data.total); if (!this.desde()) this.desde.set(r.data.desde); if (!this.hasta()) this.hasta.set(r.data.hasta); }
  }

  num(n: number): string { return n.toLocaleString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO'); }
  fecha(s: string): string { return formatDate(s); }
  detalle(m: Movimiento): string {
    const partes: string[] = [];
    if (m.tipo === 'consumo') partes.push(this.i18n.t('com.cat.' + (m.categoria || '*')));
    if (m.descripcion && m.tipo !== 'consumo') partes.push(m.descripcion);
    if (m.referencia) partes.push(m.referencia);
    if (m.sede_nombre && (this.bolsa() !== 'sede')) partes.push(m.sede_nombre);
    if (m.usuario) partes.push(m.usuario);
    return partes.join(' · ');
  }

  transferir(): void {
    const b = this.s()?.bolsas;
    if (!b) return;
    this.matDialog.open(TransferirDialogComponent, { ...dialogSize('480px'), data: b }).afterClosed().subscribe(ok => { if (ok) void this.cargar(); });
  }

  async exportar(e: ExportSolicitud): Promise<void> {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    await ejecutarExportacion(this, async () => {
      const filas: Movimiento[] = [];
      for (let p = 1; ; p++) {
        const r = await this.com.listMovimientos({ bolsa: this.bolsa(), desde: this.desde(), hasta: this.hasta(), tipo: this.tipo(), pagina: p, porPagina: 1000 });
        if (!r.action || !r.data) return { ok: false, mensaje: r.mensaje };
        filas.push(...r.data.movimientos);
        if (filas.length >= r.data.total || !r.data.movimientos.length) break;
      }
      const sal = this.s();
      await this.reports.exportar({
        titulo: t('com.credits.report_title'), nombreArchivo: 'creditos-whatsapp',
        filtros: [`${t('crm.filters.created_from')}: ${formatDate(this.desde())} — ${t('crm.filters.created_to')}: ${formatDate(this.hasta())}`,
          ...(this.tipo() ? [`${t('com.credits.type')}: ${t('com.mov.' + this.tipo())}`] : [])],
        indicadores: sal ? [{ etiqueta: t('com.credits.balance'), valor: sal.billetera.saldo, tipo: 'numero' }, { etiqueta: t('com.credits.month'), valor: this.totalMes(), tipo: 'numero' }] : [],
        detalle: [{
          columnas: [
            { clave: 'fecha', titulo: t('com.credits.date'), tipo: 'fecha' }, { clave: 'tipo', titulo: t('com.credits.type') },
            { clave: 'detalle', titulo: t('com.credits.detail'), ancho: 3 }, { clave: 'cantidad', titulo: t('com.credits.msgs_col'), tipo: 'numero' },
            { clave: 'creditos', titulo: t('com.credits.credits'), tipo: 'numero' }, { clave: 'saldo', titulo: t('com.credits.after'), tipo: 'numero' },
            { clave: 'registrado', titulo: t('com.credits.recorded'), tipo: 'fechahora', solo: 'xlsx' },
          ],
          filas: filas.map(m => ({ fecha: m.fecha, tipo: t('com.mov.' + m.tipo), detalle: this.detalle(m), cantidad: m.tipo === 'consumo' ? m.cantidad : null,
            creditos: m.creditos, saldo: m.saldo_despues, registrado: m.updated_at })),
        }],
      }, e.formato);
      return { ok: true, filas: filas.length };
    });
  }

  fmtDt(s: string): string { return formatDateTime(s); }
}
