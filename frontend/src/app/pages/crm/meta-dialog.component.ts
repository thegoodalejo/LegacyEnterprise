import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { ContactoPickerComponent } from '../../components/contacto-picker.component';
import { CrmConfigService } from '../../services/crm-config.service';
import { AmbitoMeta, CrmService, Meta, Metrica, ReferenciaMeta } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { hoyIso } from './oportunidad-cierre-dialog.component';
import { parseNumero } from './crm-format';
import { rangoMeta } from './metas-periodo';
import { MetaBarComponent, MetaEstadoComponent, PeriodoPickerComponent, PeriodoSel, periodoDe, valorMetrica } from './metas-ui';

export interface MetaDialogData {
  /** Editar esta meta (valor, nota, eliminar/restaurar). */
  meta?: Meta;
  /** Crear una meta de esta organización (el ámbito queda fijo). */
  contacto?: { id: number; nombre: string };
  /** Valores iniciales al crear. */
  ambito?: AmbitoMeta;
  fecha?: string;
}

/** Crear o editar una meta (L4+). Al crear muestra el real del período anterior y del mismo período del año anterior para decidir cuánto pedir. */
@Component({
  selector: 'app-meta-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButton, MatIconButton, MatButtonToggleGroup, MatButtonToggle, MatFormField, MatLabel, MatHint, MatInput, MatSelect, MatSelectTrigger, MatOption, MatIcon,
    ContactoPickerComponent, PeriodoPickerComponent, MetaBarComponent, MetaEstadoComponent, TranslatePipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ (m ? 'crm.goals.edit' : 'crm.goals.new') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        @if (!m) {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.goals.metric' | translate }}</mat-label>
            <mat-select id="meta-metrica" [ngModel]="idMetrica()" (ngModelChange)="idMetrica.set($event)" required>
              <mat-select-trigger>{{ metrica()?.nombre }}</mat-select-trigger>
              @for (x of metricas(); track x.id) {
                <mat-option [value]="x.id">{{ x.nombre }}<span class="muted small"> · {{ 'crm.metrics.src_' + x.fuente | translate }}{{ x.item_nombre || x.categoria_nombre ? ' · ' + (x.item_nombre || x.categoria_nombre) : '' }}</span></mat-option>
              }
            </mat-select>
            @if (!metricas().length && cargado()) { <mat-hint>{{ 'crm.goals.no_metrics' | translate }}</mat-hint> }
          </mat-form-field>
          @if (!d.contacto) {
            <div class="field">
              <span class="label">{{ 'crm.goals.scope' | translate }}</span>
              <mat-button-toggle-group id="meta-ambito" [value]="ambito()" (change)="setAmbito($event.value)" hideSingleSelectionIndicator>
                <mat-button-toggle value="empresa" id="meta-ambito-empresa"><mat-icon>domain</mat-icon>{{ 'crm.goals.scope_empresa' | translate }}</mat-button-toggle>
                <mat-button-toggle value="sede" id="meta-ambito-sede"><mat-icon>store</mat-icon>{{ 'crm.goals.scope_sede' | translate }}</mat-button-toggle>
                <mat-button-toggle value="organizacion" id="meta-ambito-organizacion"><mat-icon>business</mat-icon>{{ 'crm.goals.scope_organizacion' | translate }}</mat-button-toggle>
              </mat-button-toggle-group>
              <span class="muted small">{{ 'crm.goals.scope_hint_' + ambito() | translate }}</span>
            </div>
          }
          @if (ambito() === 'organizacion') {
            @if (contacto(); as c) {
              <div class="owner"><mat-icon>business</mat-icon><strong id="meta-contacto">{{ c.nombre }}</strong>
                @if (!d.contacto) { <button mat-icon-button type="button" (click)="contacto.set(null)" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button> }
              </div>
            } @else {
              <app-contacto-picker tipo="organizacion" inputId="meta-org" [label]="'crm.goals.pick_org' | translate" (picked)="contacto.set({ id: $event.id, nombre: $event.nombre_completo })" />
            }
          }
          <app-periodo-picker prefijo="meta" [(value)]="periodo" />
        } @else {
          <dl class="ro" id="meta-ro">
            <div><dt>{{ 'crm.goals.metric' | translate }}</dt><dd>{{ m.metrica_nombre }}@if (m.filtro) { <span class="muted"> · {{ m.filtro }}</span> }</dd></div>
            <div><dt>{{ 'crm.goals.owner' | translate }}</dt><dd>{{ duenoDe(m) }}</dd></div>
            <div><dt>{{ 'crm.goals.period' | translate }}</dt><dd>{{ periodoTexto(m) }}</dd></div>
            <div class="progress"><dt>{{ 'crm.goals.progress' | translate }}</dt>
              <dd><app-meta-bar [porcentaje]="m.porcentaje" [tiempoPct]="m.tiempo_pct" [estado]="m.estado" />
                <span class="muted small">{{ fmt(m.real) }} {{ 'crm.goals.of' | translate }} {{ fmt(m.valor_meta) }} · {{ m.porcentaje }} %</span> <app-meta-estado [estado]="m.estado" /></dd></div>
          </dl>
        }

        @if (ref(); as r) {
          <div class="ref" id="meta-ref">
            <span class="label">{{ 'crm.goals.ref_title' | translate }}</span>
            <div class="ref-row">
              <button type="button" class="ref-chip" id="btn-ref-anio" (click)="usar(r.anio_anterior.real)" [disabled]="!r.anio_anterior.real">
                <span class="muted small">{{ 'crm.goals.ref_last_year' | translate }}</span><strong>{{ fmt(r.anio_anterior.real) }}</strong>
              </button>
              <button type="button" class="ref-chip" id="btn-ref-ant" (click)="usar(r.anterior.real)" [disabled]="!r.anterior.real">
                <span class="muted small">{{ 'crm.goals.ref_previous' | translate }}</span><strong>{{ fmt(r.anterior.real) }}</strong>
              </button>
              <div class="ref-chip static"><span class="muted small">{{ 'crm.goals.ref_current' | translate }}</span><strong>{{ fmt(r.actual) }}</strong></div>
            </div>
            <span class="muted small">{{ 'crm.goals.ref_hint' | translate }}</span>
          </div>
        }

        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.goals.target' | translate }}{{ unidad() ? ' (' + unidad() + ')' : '' }}</mat-label>
          <input matInput id="meta-valor" inputmode="decimal" autocomplete="off" [ngModel]="valorTxt()" (ngModelChange)="valorTxt.set($event)" required />
          <mat-hint>{{ valorHint() }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.goals.note' | translate }}</mat-label>
          <input matInput id="meta-nota" maxlength="255" [ngModel]="nota()" (ngModelChange)="nota.set($event)" />
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (m) {
        <button mat-button class="danger-t" id="btn-meta-toggle" (click)="toggleActivo()" [disabled]="saving()">
          <mat-icon>{{ m.activo ? 'delete' : 'restore_from_trash' }}</mat-icon>{{ (m.activo ? 'common.delete' : 'crm.restore') | translate }}
        </button>
        <span class="spacer"></span>
      }
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-meta" (click)="save()" [disabled]="saving() || !valido()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .field { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .label { font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); }
    mat-button-toggle-group { flex-wrap: wrap; max-width: 100%; }
    .owner { display: flex; align-items: center; gap: 8px; padding: 4px 0 12px; overflow-wrap: anywhere; }
    .ro { margin: 0 0 16px; display: flex; flex-direction: column; gap: 10px; > div { display: flex; flex-direction: column; } dt { font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); } dd { margin: 0; overflow-wrap: anywhere; } }
    .progress dd { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; app-meta-bar { width: 100%; } }
    .ref { display: flex; flex-direction: column; gap: 6px; padding: 12px; margin-bottom: 16px; border-radius: 12px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    .ref-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .ref-chip { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 6px 12px; border-radius: 10px; border: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface); color: inherit; font: inherit; cursor: pointer; text-align: left;
      &:hover:not([disabled]):not(.static) { background: var(--md-sys-color-secondary-container); } &[disabled] { cursor: default; opacity: 0.6; } &.static { cursor: default; } }
    .small { font: var(--mat-sys-body-small); }
    .spacer { flex: 1; }
    .danger-t { color: var(--md-sys-color-error); }
  `,
})
export class MetaDialogComponent {
  readonly d = inject<MetaDialogData>(MAT_DIALOG_DATA);
  readonly m = this.d.meta ?? null;
  private ref_ = inject(MatDialogRef<MetaDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  readonly i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);

  readonly metricas = signal<Metrica[]>([]);
  readonly cargado = signal(false);
  readonly idMetrica = signal<number | null>(null);
  readonly ambito = signal<AmbitoMeta>(this.d.contacto ? 'organizacion' : (this.d.ambito ?? 'sede'));
  readonly contacto = signal<{ id: number; nombre: string } | null>(this.d.contacto ?? null);
  readonly periodo = signal<PeriodoSel>({ periodo: 'mes', fecha: this.d.fecha ?? hoyIso(), fechaFin: null });
  readonly valorTxt = signal(this.m ? String(this.m.valor_meta).replace('.', this.i18n.lang() === 'en' ? '.' : ',') : '');
  readonly nota = signal(this.m?.nota ?? '');
  readonly saving = signal(false);
  readonly ref = signal<ReferenciaMeta | null>(null);
  private refId = 0;

  readonly metrica = computed(() => (this.m ? null : this.metricas().find(x => x.id === this.idMetrica()) ?? null));
  readonly formato = computed(() => this.m?.formato ?? this.metrica()?.formato ?? 'moneda');
  readonly unidad = computed(() => (this.formato() === 'moneda' ? null : (this.m?.unidad ?? this.metrica()?.unidad ?? null)));
  readonly valor = computed(() => parseNumero(this.valorTxt(), this.i18n.lang()));
  readonly valorHint = computed(() => {
    const v = this.valor();
    if (v === null) return this.i18n.t(this.formato() === 'moneda' ? 'crm.goals.target_hint_money' : 'crm.goals.target_hint_number');
    return Number.isNaN(v) || v <= 0 ? this.i18n.t('crm.goals.target_invalid') : '= ' + this.fmt(v);
  });
  readonly valido = computed(() => {
    const v = this.valor();
    if (v === null || Number.isNaN(v) || v <= 0) return false;
    if (this.m) return true;
    return !!this.idMetrica() && !!rangoMeta(this.periodo().periodo, this.periodo().fecha, this.periodo().fechaFin) && (this.ambito() !== 'organizacion' || !!this.contacto());
  });

  constructor() {
    if (!this.m) {
      void this.crm.listMetricas(true).then(r => {
        if (r.action && r.data) { this.metricas.set(r.data.metricas); if (r.data.metricas.length === 1) this.idMetrica.set(r.data.metricas[0].id); }
        this.cargado.set(true);
      });
    }
    // Referencia: se vuelve a pedir cuando cambia la métrica, el dueño o el período.
    effect(() => {
      const p = this.m
        ? { idMetrica: this.m.id_metrica, ambito: this.m.ambito, idContacto: this.m.id_contacto, periodo: this.m.periodo, fecha: this.m.fecha_inicio, fechaFin: this.m.fecha_fin }
        : { idMetrica: this.idMetrica(), ambito: this.ambito(), idContacto: this.contacto()?.id ?? null, ...this.periodo() };
      untracked(() => void this.cargarReferencia(p));
    });
  }

  private async cargarReferencia(p: { idMetrica: number | null; ambito: AmbitoMeta; idContacto: number | null; periodo: PeriodoSel['periodo']; fecha: string; fechaFin: string | null }): Promise<void> {
    const id = ++this.refId;
    this.ref.set(null);
    if (!p.idMetrica || (p.ambito === 'organizacion' && !p.idContacto) || !rangoMeta(p.periodo, p.fecha, p.fechaFin)) return;
    try {
      const r = await this.crm.referenciaMeta({ ...p, idMetrica: p.idMetrica });
      if (id === this.refId && r.action && r.data) this.ref.set(r.data);
    } catch { /* sin referencia: se puede guardar igual */ }
  }

  fmt(n: number | null | undefined): string { return valorMetrica(this.cfg, this.i18n.lang(), this.formato(), this.unidad(), n); }
  periodoTexto(m: Meta): string { return periodoDe(this.i18n, m); }
  duenoDe(m: Meta): string {
    return m.ambito === 'organizacion' ? (m.contacto_nombre ?? '—') : this.i18n.t('crm.goals.scope_' + m.ambito) + (m.ambito === 'sede' && m.sede_nombre ? ' · ' + m.sede_nombre : '');
  }
  setAmbito(a: AmbitoMeta): void { this.ambito.set(a); }
  usar(v: number): void {
    if (v > 0) this.valorTxt.set(v.toLocaleString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 2 }));
  }

  async save(): Promise<void> {
    const v = this.valor();
    if (v === null || Number.isNaN(v)) return;
    this.saving.set(true);
    try {
      const data: Record<string, unknown> = this.m
        ? { id: this.m.id, valor_meta: String(v), nota: this.nota().trim() }
        : {
          id: 0, id_metrica: this.idMetrica(), ambito: this.ambito(), id_contacto: this.ambito() === 'organizacion' ? this.contacto()?.id : undefined,
          periodo: this.periodo().periodo, fecha: this.periodo().fecha, fecha_fin: this.periodo().periodo === 'personalizado' ? this.periodo().fechaFin : undefined,
          valor_meta: String(v), nota: this.nota().trim(),
        };
      const r = await this.crm.saveMeta(data);
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.goals.save_error'), message: r.mensaje }); return; }
      this.ref_.close(true);
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActivo(): Promise<void> {
    const m = this.m;
    if (!m) return;
    if (m.activo && !(await this.dialogs.confirm({
      title: this.i18n.t('crm.goals.delete_title'), message: this.i18n.t('crm.goals.delete_msg', { metric: m.metrica_nombre, owner: this.duenoDe(m), period: this.periodoTexto(m) }),
      confirmText: this.i18n.t('common.delete'), danger: true,
    }))) return;
    this.saving.set(true);
    try {
      const r = await this.crm.saveMeta({ id: m.id, activo: m.activo ? 0 : 1 });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.goals.save_error'), message: r.mensaje }); return; }
      this.ref_.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}

/** Abre el diálogo de meta con el tamaño estándar. */
export function abrirMetaDialog(dialog: MatDialog, data: MetaDialogData) {
  return dialog.open<MetaDialogComponent, MetaDialogData, boolean>(MetaDialogComponent, { ...dialogSize('720px'), data, autoFocus: 'first-tabbable' });
}
