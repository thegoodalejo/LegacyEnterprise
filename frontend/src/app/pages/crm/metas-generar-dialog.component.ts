import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TagChipComponent } from '../../components/tag-chip.component';
import { TagPickerDialogComponent, TagPickerResult } from '../../components/tag-picker-dialog.component';
import { CrmConfigService } from '../../services/crm-config.service';
import { CrmService, CrmTag, Metrica, ResultadoGenerar } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { hoyIso } from './oportunidad-cierre-dialog.component';
import { parseNumero } from './crm-format';
import { etiquetaPeriodo, rangoMeta } from './metas-periodo';
import { PeriodoPickerComponent, PeriodoSel, valorMetrica } from './metas-ui';

const REDONDEOS = [0, 1, 10, 100, 1000, 10000, 100000, 1000000];

/**
 * Genera metas de organización en lote (L4+): la misma para todas o según el histórico de cada una con un crecimiento.
 * Primero se revisa (simulación: cuántas nuevas, reemplazadas, omitidas y sin histórico, con la lista) y luego se guarda.
 */
@Component({
  selector: 'app-metas-generar-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButton, MatButtonToggleGroup, MatButtonToggle, MatFormField, MatLabel, MatHint, MatSuffix, MatInput, MatSelect, MatOption, MatIcon,
    TagChipComponent, PeriodoPickerComponent, TranslatePipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'crm.goals.gen_title' | translate }}</h2>
    <mat-dialog-content>
      <p class="muted intro">{{ 'crm.goals.gen_intro' | translate }}</p>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.goals.metric' | translate }}</mat-label>
          <mat-select id="gen-metrica" [ngModel]="idMetrica()" (ngModelChange)="idMetrica.set($event)">
            @for (x of metricas(); track x.id) { <mat-option [value]="x.id">{{ x.nombre }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <app-periodo-picker prefijo="gen" [(value)]="periodo" />

        <div class="field">
          <span class="label">{{ 'crm.goals.gen_who' | translate }}</span>
          <mat-button-toggle-group id="gen-destino" [value]="destino()" (change)="destino.set($event.value)" hideSingleSelectionIndicator>
            <mat-button-toggle value="todas">{{ 'crm.goals.gen_all' | translate }}</mat-button-toggle>
            <mat-button-toggle value="principales" id="gen-principales">{{ 'crm.goals.gen_top' | translate }}</mat-button-toggle>
          </mat-button-toggle-group>
          <span class="muted small">{{ 'crm.goals.gen_' + (destino() === 'todas' ? 'all' : 'top') + '_hint' | translate }}</span>
          <div class="chips">
            @for (t of tags(); track t.id) { <app-tag-chip [nombre]="t.nombre" [color]="t.color" /> }
            <button mat-button type="button" id="btn-gen-tags" (click)="elegirTags()"><mat-icon>label</mat-icon>{{ (tags().length ? 'crm.goals.gen_tags_change' : 'crm.goals.gen_tags') | translate }}</button>
          </div>
        </div>

        <div class="field">
          <span class="label">{{ 'crm.goals.gen_base' | translate }}</span>
          <mat-button-toggle-group id="gen-base" [value]="base()" (change)="base.set($event.value)" hideSingleSelectionIndicator>
            <mat-button-toggle value="historico" id="gen-base-historico">{{ 'crm.goals.gen_history' | translate }}</mat-button-toggle>
            <mat-button-toggle value="fijo" id="gen-base-fijo">{{ 'crm.goals.gen_fixed' | translate }}</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        @if (base() === 'fijo') {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.goals.target' | translate }}</mat-label>
            <input matInput id="gen-valor" inputmode="decimal" autocomplete="off" [ngModel]="valorTxt()" (ngModelChange)="valorTxt.set($event)" />
            <mat-hint>{{ hint(valorTxt()) }}</mat-hint>
          </mat-form-field>
        } @else {
          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'crm.goals.gen_ref' | translate }}</mat-label>
              <mat-select id="gen-referencia" [ngModel]="referencia()" (ngModelChange)="referencia.set($event)">
                <mat-option value="anio_anterior">{{ 'crm.goals.ref_last_year' | translate }}</mat-option>
                <mat-option value="anterior">{{ 'crm.goals.ref_previous' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'crm.goals.gen_growth' | translate }}</mat-label>
              <input matInput id="gen-crecimiento" inputmode="decimal" autocomplete="off" [ngModel]="crecimientoTxt()" (ngModelChange)="crecimientoTxt.set($event)" />
              <span matSuffix class="suffix">%</span>
            </mat-form-field>
          </div>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.goals.gen_min' | translate }}</mat-label>
            <input matInput id="gen-minimo" inputmode="decimal" autocomplete="off" [ngModel]="minimoTxt()" (ngModelChange)="minimoTxt.set($event)" />
            <mat-hint>{{ minimoTxt().trim() ? hint(minimoTxt()) : ('crm.goals.gen_min_hint' | translate) }}</mat-hint>
          </mat-form-field>
        }
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.goals.gen_round' | translate }}</mat-label>
            <mat-select id="gen-redondeo" [ngModel]="redondeo()" (ngModelChange)="redondeo.set($event)">
              @for (r of redondeos; track r) { <mat-option [value]="r">{{ r ? num(r) : ('crm.goals.gen_round_none' | translate) }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.goals.gen_existing' | translate }}</mat-label>
            <mat-select id="gen-existentes" [ngModel]="existentes()" (ngModelChange)="existentes.set($event)">
              <mat-option value="omitir">{{ 'crm.goals.gen_keep' | translate }}</mat-option>
              <mat-option value="reemplazar">{{ 'crm.goals.gen_replace' | translate }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </div>

      @if (res(); as r) {
        <section class="review" id="gen-review">
          <div class="kpis">
            <span class="kpi"><b>{{ r.nuevas }}</b> {{ 'crm.goals.gen_k_new' | translate }}</span>
            @if (r.reemplazadas) { <span class="kpi"><b>{{ r.reemplazadas }}</b> {{ 'crm.goals.gen_k_replaced' | translate }}</span> }
            @if (r.omitidas) { <span class="kpi"><b>{{ r.omitidas }}</b> {{ 'crm.goals.gen_k_kept' | translate }}</span> }
            @if (r.sin_base) { <span class="kpi warn"><b>{{ r.sin_base }}</b> {{ 'crm.goals.gen_k_nobase' | translate }}</span> }
            <span class="kpi"><b>{{ fmt(r.suma_meta) }}</b> {{ 'crm.goals.gen_k_sum' | translate }}</span>
          </div>
          @if (r.base) { <span class="muted small">{{ 'crm.goals.gen_base_used' | translate: { a: dmy(r.base.inicio), b: dmy(r.base.fin) } }}</span> }
          <div class="table-scroll">
            <table class="t" id="gen-table">
              <thead><tr><th>{{ 'crm.tipo.organizacion' | translate }}</th>@if (r.base) { <th class="n">{{ 'crm.goals.gen_col_base' | translate }}</th> }<th class="n">{{ 'crm.goals.target' | translate }}</th><th class="n hide-md">{{ 'crm.goals.gen_col_current' | translate }}</th><th>{{ 'crm.goals.gen_col_action' | translate }}</th></tr></thead>
              <tbody>
                @for (f of r.filas; track f.id_contacto) {
                  <tr [class.off]="f.accion === 'omitir' || f.accion === 'sin_base'"><td>{{ f.nombre }}</td>@if (r.base) { <td class="n">{{ f.base ? fmt(f.base) : '—' }}</td> }
                    <td class="n">{{ f.meta ? fmt(f.meta) : '—' }}</td><td class="n hide-md">{{ f.actual !== null ? fmt(f.actual) : '—' }}</td><td>{{ 'crm.goals.gen_a_' + f.accion | translate }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          @if (r.organizaciones > r.filas.length) { <span class="muted small">{{ 'crm.goals.gen_more' | translate: { n: r.organizaciones - r.filas.length } }}</span> }
        </section>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      @if (res(); as r) {
        <button mat-flat-button id="btn-gen-save" (click)="guardar()" [disabled]="!(r.nuevas + r.reemplazadas)">{{ 'crm.goals.gen_save' | translate: { n: r.nuevas + r.reemplazadas } }}</button>
      } @else {
        <button mat-flat-button id="btn-gen-review" (click)="revisar()" [disabled]="!valido()">{{ 'crm.goals.gen_review' | translate }}</button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .intro { margin: 0 0 12px; }
    .field { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; margin-bottom: 12px; }
    .label { font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); }
    mat-button-toggle-group { flex-wrap: wrap; max-width: 100%; }
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .form-row > * { flex: 1 1 170px; min-width: 0; }
    .suffix { padding-right: 12px; }
    .review { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    .kpis { display: flex; flex-wrap: wrap; gap: 8px; }
    .kpi { padding: 4px 12px; border-radius: 999px; background: var(--md-sys-color-surface-container-high); font: var(--mat-sys-label-large); &.warn { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); } }
    .t { width: 100%; border-collapse: collapse; th, td { padding: 6px 8px; border-bottom: 1px solid var(--md-sys-color-outline-variant); text-align: left; } th { font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); } .n { text-align: right; white-space: nowrap; } tr.off td { opacity: 0.55; } }
    .table-scroll { max-height: 320px; overflow: auto; }
    .small { font: var(--mat-sys-body-small); }
    @media (max-width: 599px) { .hide-md { display: none; } }
  `,
})
export class MetasGenerarDialogComponent {
  readonly d = inject<{ fecha?: string } | null>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<MetasGenerarDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private matDialog = inject(MatDialog);
  private loading = inject(LoadingService);
  readonly i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);
  readonly redondeos = REDONDEOS;
  private host = inject(ElementRef<HTMLElement>);
  private injector = inject(Injector);

  readonly metricas = signal<Metrica[]>([]);
  readonly idMetrica = signal<number | null>(null);
  readonly periodo = signal<PeriodoSel>({ periodo: 'mes', fecha: this.d?.fecha ?? hoyIso(), fechaFin: null });
  readonly destino = signal<'todas' | 'principales'>('todas');
  readonly tags = signal<CrmTag[]>([]);
  readonly base = signal<'historico' | 'fijo'>('historico');
  readonly valorTxt = signal('');
  readonly referencia = signal<'anio_anterior' | 'anterior'>('anio_anterior');
  readonly crecimientoTxt = signal('10');
  readonly minimoTxt = signal('');
  readonly redondeo = signal(1000);
  readonly existentes = signal<'omitir' | 'reemplazar'>('omitir');
  readonly res = signal<ResultadoGenerar | null>(null);

  readonly metrica = computed(() => this.metricas().find(m => m.id === this.idMetrica()) ?? null);
  private readonly params = computed<Record<string, unknown> | null>(() => {
    const p = this.periodo();
    if (!this.idMetrica() || !rangoMeta(p.periodo, p.fecha, p.fechaFin)) return null;
    const lang = this.i18n.lang();
    const out: Record<string, unknown> = {
      id_metrica: this.idMetrica(), periodo: p.periodo, fecha: p.fecha, fecha_fin: p.periodo === 'personalizado' ? p.fechaFin : undefined,
      destino: this.destino(), tags: this.tags().map(t => t.id), base: this.base(), redondeo: this.redondeo(), existentes: this.existentes(),
    };
    if (this.base() === 'fijo') {
      const v = parseNumero(this.valorTxt(), lang);
      if (v === null || Number.isNaN(v) || v <= 0) return null;
      out['valor'] = String(v);
    } else {
      const c = parseNumero(this.crecimientoTxt(), lang) ?? 0;
      const min = parseNumero(this.minimoTxt(), lang);
      if (Number.isNaN(c) || (min !== null && (Number.isNaN(min) || min <= 0))) return null;
      out['referencia'] = this.referencia(); out['crecimiento'] = String(c);
      if (min !== null) out['minimo'] = String(min);
    }
    return out;
  });
  readonly valido = computed(() => this.params() !== null);

  constructor() {
    void this.crm.listMetricas(true).then(r => { if (r.action && r.data) { this.metricas.set(r.data.metricas); if (r.data.metricas.length) this.idMetrica.set(r.data.metricas[0].id); } });
    // Cualquier cambio invalida la revisión: hay que volver a revisar antes de guardar.
    effect(() => { this.params(); untracked(() => this.res.set(null)); });
    // El redondeo por defecto sigue al formato de la métrica (dinero: miles; número: unidades).
    effect(() => { const m = this.metrica(); if (m) untracked(() => this.redondeo.set(m.formato === 'moneda' ? 1000 : 1)); });
  }

  fmt(n: number): string { const m = this.metrica(); return valorMetrica(this.cfg, this.i18n.lang(), m?.formato ?? 'moneda', m?.unidad ?? null, n); }
  num(n: number): string { return n.toLocaleString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO'); }
  dmy(s: string): string { return s.split('-').reverse().join('-'); }
  hint(txt: string): string {
    const v = parseNumero(txt, this.i18n.lang());
    return v === null ? '' : Number.isNaN(v) || v <= 0 ? this.i18n.t('crm.goals.target_invalid') : '= ' + this.fmt(v);
  }

  elegirTags(): void {
    this.matDialog.open(TagPickerDialogComponent, { ...dialogSize('480px'), data: { seleccion: this.tags().map(t => t.id), actuales: this.tags(), tipo: 'organizacion' } })
      .afterClosed().subscribe((r: TagPickerResult | undefined) => { if (r) this.tags.set(r.tags); });
  }

  async revisar(): Promise<void> {
    const p = this.params();
    if (!p) return;
    const r = await this.loading.wrap(() => this.crm.generarMetas('simular', p));
    if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('crm.goals.gen_error'), message: r.mensaje }); return; }
    this.res.set(r.data);
    afterNextRender(() => this.host.nativeElement.querySelector('#gen-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), { injector: this.injector });
  }

  async guardar(): Promise<void> {
    const p = this.params();
    if (!p) return;
    const r = await this.loading.wrap(() => this.crm.generarMetas('guardar', p));
    if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('crm.goals.gen_error'), message: r.mensaje }); return; }
    const per = etiquetaPeriodo(this.periodo().periodo, r.data.inicio, r.data.fin, (k, x) => this.i18n.t(k, x), this.i18n.lang());
    await this.dialogs.success({ title: this.i18n.t('crm.goals.gen_done_title'), message: this.i18n.t('crm.goals.gen_done_msg', { n: r.data.nuevas, r: r.data.reemplazadas, period: per }) });
    this.ref.close(true);
  }
}
