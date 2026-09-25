import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { CrmConfigService } from '../../services/crm-config.service';
import { CrmService, Embudo, Etapa, MotivoCierre, TipoEtapa } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

// ─── Diálogos ────────────────────────────────────────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-embudo-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatInput, MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (e ? 'crm.funnel.edit_funnel' : 'crm.funnel.new_funnel') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.funnel.funnel_name' | translate }}</mat-label>
          <input matInput id="embudo-nombre" [(ngModel)]="nombre" maxlength="80" required />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.config.order' | translate }}</mat-label>
          <input matInput type="number" [(ngModel)]="orden" />
        </mat-form-field>
        <mat-slide-toggle [(ngModel)]="activo">{{ 'common.active' | translate }}</mat-slide-toggle>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-embudo" (click)="save()" [disabled]="saving() || !nombre.trim()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class EmbudoDialogComponent {
  readonly e = inject<Embudo | null>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<EmbudoDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly saving = signal(false);
  nombre = this.e?.nombre ?? '';
  orden = this.e?.orden ?? 0;
  activo = this.e?.activo ?? true;

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const r = await this.crm.saveEmbudo({ id: this.e?.id ?? 0, nombre: this.nombre.trim(), orden: this.orden ?? 0, activo: this.activo ? 1 : 0 });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.config.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}

interface EtapaDialogData { etapa: Etapa | null; idEmbudo: number }

@Component({
  selector: 'app-etapa-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatHint, MatInput, MatSelect, MatOption, MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (d.etapa ? 'crm.funnel.edit_stage' : 'crm.funnel.new_stage') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.funnel.stage_name' | translate }}</mat-label>
          <input matInput id="etapa-nombre" [(ngModel)]="nombre" maxlength="80" required />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.funnel.stage_type' | translate }}</mat-label>
          <mat-select [(ngModel)]="tipo" id="etapa-tipo">
            @for (t of tipos; track t) { <mat-option [value]="t">{{ 'crm.funnel.type_' + t | translate }}</mat-option> }
          </mat-select>
          @if (d.etapa) { <mat-hint>{{ 'crm.funnel.type_locked_hint' | translate }}</mat-hint> }
        </mat-form-field>
        @if (tipo === 'abierta') {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.funnel.stage_prob' | translate }}</mat-label>
            <input matInput id="etapa-prob" type="number" min="0" max="100" [(ngModel)]="probabilidad" />
            <mat-hint>{{ 'crm.funnel.stage_prob_hint' | translate }}</mat-hint>
          </mat-form-field>
        }
        <div class="color-row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="hex">
            <mat-label>{{ 'crm.config.color' | translate }}</mat-label>
            <input matInput id="etapa-color" [(ngModel)]="color" maxlength="7" placeholder="#RRGGBB" />
          </mat-form-field>
          <input type="color" class="picker" [ngModel]="validColor() ? color : '#607D8B'" (ngModelChange)="color = $event" [attr.aria-label]="'crm.config.color' | translate" />
        </div>
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.config.order' | translate }}</mat-label>
            <input matInput type="number" [(ngModel)]="orden" />
          </mat-form-field>
          <mat-slide-toggle [(ngModel)]="activo">{{ 'common.active' | translate }}</mat-slide-toggle>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-etapa" (click)="save()" [disabled]="saving() || !nombre.trim() || !colorOk()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .color-row { display: flex; align-items: center; gap: 12px; }
    .hex { flex: 0 1 180px; }
    .picker { width: 40px; height: 40px; border: none; padding: 0; background: none; cursor: pointer; }
  `,
})
export class EtapaDialogComponent {
  readonly d = inject<EtapaDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<EtapaDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly tipos: TipoEtapa[] = ['abierta', 'ganada', 'perdida'];
  readonly saving = signal(false);
  nombre = this.d.etapa?.nombre ?? '';
  tipo: TipoEtapa = this.d.etapa?.tipo ?? 'abierta';
  probabilidad = this.d.etapa?.probabilidad ?? 50;
  color = this.d.etapa?.color ?? '';
  orden = this.d.etapa?.orden ?? 0;
  activo = this.d.etapa?.activo ?? true;

  validColor(): boolean { return /^#[0-9a-fA-F]{6}$/.test(this.color.trim()); }
  colorOk(): boolean { return !this.color.trim() || this.validColor(); }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const r = await this.crm.saveEtapa({
        id: this.d.etapa?.id ?? 0, id_embudo: this.d.idEmbudo, nombre: this.nombre.trim(), tipo: this.tipo,
        probabilidad: this.tipo === 'abierta' ? (this.probabilidad ?? 0) : 0, color: this.color.trim(), orden: this.orden ?? 0, activo: this.activo ? 1 : 0,
      });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.config.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}

interface MotivoDialogData { motivo: MotivoCierre | null; tipo: 'ganada' | 'perdida' }

@Component({
  selector: 'app-motivo-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatInput, MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (d.motivo ? 'crm.funnel.edit_reason' : 'crm.funnel.new_reason') | translate }} · {{ 'crm.funnel.reasons_' + d.tipo | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.funnel.reason_name' | translate }}</mat-label>
          <input matInput id="motivo-nombre" [(ngModel)]="nombre" maxlength="80" required />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.config.order' | translate }}</mat-label>
          <input matInput type="number" [(ngModel)]="orden" />
        </mat-form-field>
        <mat-slide-toggle [(ngModel)]="activo">{{ 'common.active' | translate }}</mat-slide-toggle>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-motivo" (click)="save()" [disabled]="saving() || !nombre.trim()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class MotivoDialogComponent {
  readonly d = inject<MotivoDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<MotivoDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly saving = signal(false);
  nombre = this.d.motivo?.nombre ?? '';
  orden = this.d.motivo?.orden ?? 0;
  activo = this.d.motivo?.activo ?? true;

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const r = await this.crm.saveMotivo({ id: this.d.motivo?.id ?? 0, tipo: this.d.tipo, nombre: this.nombre.trim(), orden: this.orden ?? 0, activo: this.activo ? 1 : 0 });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.config.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}

// ─── Pestaña ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Pestaña «Embudo»: moneda de los montos, embudos con sus etapas (tipo y probabilidad) y motivos de cierre. */
@Component({
  selector: 'app-crm-embudo-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatIconButton, MatIcon, MatFormField, MatLabel, MatHint, MatInput, MatSelect, MatOption, TranslatePipe],
  template: `
    <div class="tab">
      <p class="muted">{{ 'crm.funnel.hint' | translate }}</p>

      <section class="block">
        <div class="head"><h2>{{ 'crm.funnel.currency_title' | translate }}</h2></div>
        <div class="form-row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cur">
            <mat-label>{{ 'crm.funnel.currency' | translate }}</mat-label>
            <input matInput id="cfg-moneda" [ngModel]="moneda()" (ngModelChange)="moneda.set($event.toUpperCase())" maxlength="3" />
            <mat-hint>{{ 'crm.funnel.currency_hint' | translate }}</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cur">
            <mat-label>{{ 'crm.funnel.decimals' | translate }}</mat-label>
            <mat-select id="cfg-decimales" [ngModel]="decimales()" (ngModelChange)="decimales.set($event)">
              @for (n of [0, 1, 2, 3, 4]; track n) { <mat-option [value]="n">{{ n }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <button mat-flat-button id="btn-save-cfg" (click)="saveConfig()" [disabled]="moneda().length !== 3">{{ 'common.save' | translate }}</button>
          <span class="muted">{{ cfg.money(1234567.891) }}</span>
        </div>
      </section>

      <div class="head">
        <h2>{{ 'crm.funnel.stages_title' | translate }}</h2>
        <button mat-flat-button id="btn-new-embudo" (click)="editEmbudo(null)"><mat-icon>add</mat-icon>{{ 'crm.funnel.new_funnel' | translate }}</button>
      </div>
      @for (e of embudos(); track e.id) {
        <section class="block" [class.off]="!e.activo" [id]="'embudo-' + e.id">
          <div class="head">
            <h2>{{ e.nombre }}@if (!e.activo) { <span class="pill off">{{ 'common.inactive' | translate }}</span> }</h2>
            <div class="actions">
              <button mat-button [id]="'btn-new-etapa-' + e.id" (click)="editEtapa(null, e.id)"><mat-icon>add</mat-icon>{{ 'crm.funnel.new_stage' | translate }}</button>
              <button mat-icon-button (click)="editEmbudo(e)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button>
            </div>
          </div>
          @for (t of e.etapas; track t.id) {
            <div class="row" [class.off]="!t.activo">
              <span class="dot" [style.background]="t.color || 'var(--md-sys-color-outline)'"></span>
              <strong class="name">{{ t.nombre }}</strong>
              <span class="pill">{{ 'crm.funnel.type_' + t.tipo | translate }}</span>
              @if (t.tipo === 'abierta') { <span class="muted small">{{ t.probabilidad }} %</span> }
              @if (!t.activo) { <span class="pill off">{{ 'common.inactive' | translate }}</span> }
              <button mat-icon-button (click)="editEtapa(t, e.id)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button>
            </div>
          } @empty { <p class="muted">{{ 'crm.funnel.no_stages' | translate }}</p> }
        </section>
      } @empty { <p class="muted">{{ 'crm.funnel.no_funnels' | translate }}</p> }

      <div class="head"><h2>{{ 'crm.funnel.reasons' | translate }}</h2></div>
      <p class="muted">{{ 'crm.funnel.reasons_hint' | translate }}</p>
      @for (tipo of tiposMotivo; track tipo) {
        <section class="block">
          <div class="head">
            <h2>{{ 'crm.funnel.reasons_' + tipo | translate }}</h2>
            <button mat-button [id]="'btn-new-motivo-' + tipo" (click)="editMotivo(null, tipo)"><mat-icon>add</mat-icon>{{ 'crm.funnel.new_reason' | translate }}</button>
          </div>
          @for (m of motivosDe(tipo); track m.id) {
            <div class="row" [class.off]="!m.activo">
              <strong class="name">{{ m.nombre }}</strong>
              @if (!m.activo) { <span class="pill off">{{ 'common.inactive' | translate }}</span> }
              <button mat-icon-button (click)="editMotivo(m, tipo)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button>
            </div>
          } @empty { <p class="muted">{{ 'crm.funnel.no_reasons' | translate }}</p> }
        </section>
      }
    </div>
  `,
  styles: `
    .tab { padding: 20px 0; display: flex; flex-direction: column; gap: 16px; }
    p { margin: 0; }
    .block { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); &.off { opacity: 0.7; } }
    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; h2 { margin: 0; font: var(--mat-sys-title-medium); display: flex; gap: 8px; align-items: center; } }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .cur { flex: 0 1 200px; }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); &:last-child { border: none; } &.off { opacity: 0.6; } }
    .name { flex: 1 1 160px; min-width: 0; overflow-wrap: anywhere; }
    .dot { width: 14px; height: 14px; border-radius: 50%; flex: none; }
    .small { font: var(--mat-sys-body-small); }
    .pill { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); white-space: nowrap; }
    .pill.off { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); }
  `,
})
export class CrmEmbudoTabComponent {
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private matDialog = inject(MatDialog);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);

  readonly tiposMotivo: ('ganada' | 'perdida')[] = ['ganada', 'perdida'];
  readonly embudos = signal<Embudo[]>([]);
  readonly motivos = signal<MotivoCierre[]>([]);
  readonly moneda = signal('COP');
  readonly decimales = signal(0);
  readonly motivosDe = (tipo: 'ganada' | 'perdida') => this.motivos().filter(m => m.tipo === tipo);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const [e, m] = await this.loading.wrap(() => Promise.all([this.crm.listEmbudos(false), this.crm.listMotivos(false)]));
    if (e.action && e.data) {
      this.embudos.set(e.data.embudos);
      this.moneda.set(e.data.config.moneda);
      this.decimales.set(e.data.config.decimales);
      this.cfg.set(e.data.config);
    }
    if (m.action && m.data) this.motivos.set(m.data.motivos);
  }

  async saveConfig(): Promise<void> {
    const r = await this.loading.wrap(() => this.crm.saveConfig({ moneda: this.moneda(), decimales: this.decimales() }));
    if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('crm.config.save_error'), message: r.mensaje }); return; }
    this.cfg.set(r.data);
    await this.dialogs.success({ title: this.i18n.t('crm.funnel.saved'), message: '' });
  }

  private open(component: new () => unknown, data: unknown): void {
    this.matDialog.open(component, { ...dialogSize('480px'), data, autoFocus: 'first-tabbable' }).afterClosed().subscribe(saved => { if (saved) void this.load(); });
  }

  editEmbudo(e: Embudo | null): void { this.open(EmbudoDialogComponent, e); }
  editEtapa(etapa: Etapa | null, idEmbudo: number): void { this.open(EtapaDialogComponent, { etapa, idEmbudo } satisfies EtapaDialogData); }
  editMotivo(motivo: MotivoCierre | null, tipo: 'ganada' | 'perdida'): void { this.open(MotivoDialogComponent, { motivo, tipo } satisfies MotivoDialogData); }
}
