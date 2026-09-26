import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { AplicaA, CampoDef, CrmService, TipoDato } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

const TIPOS_DATO: TipoDato[] = ['entero', 'decimal', 'texto', 'booleano', 'fecha'];
export const NOMBRE_DESTINO: Record<AplicaA, string> = { persona: 'crm.tipo.personas', organizacion: 'crm.tipo.organizaciones', oportunidad: 'crm.tipo.oportunidades' };

interface CampoDialogData { campo: CampoDef | null; aplica_a: AplicaA; destinos: AplicaA[] }

// ─── Diálogo: campo personalizado ────────────────────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-campo-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatHint, MatInput, MatSelect, MatOption, MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (editing ? 'crm.config.edit_field' : 'crm.config.new_field') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.config.applies_to' | translate }}</mat-label>
          <mat-select [(ngModel)]="aplicaA" [disabled]="editing" id="campo-aplica">
            @for (d of data.destinos; track d) { <mat-option [value]="d">{{ nombres[d] | translate }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.config.label' | translate }}</mat-label>
          <input matInput id="campo-etiqueta" [(ngModel)]="etiqueta" maxlength="100" required />
        </mat-form-field>
        @if (!editing) {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.config.key' | translate }}</mat-label>
            <input matInput id="campo-clave" [(ngModel)]="clave" maxlength="50" />
            <mat-hint>{{ 'crm.config.key_hint' | translate }}</mat-hint>
          </mat-form-field>
        }
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.config.data_type' | translate }}</mat-label>
          <mat-select [(ngModel)]="tipoDato" id="campo-tipo">
            @for (t of tipos; track t) { <mat-option [value]="t">{{ 'crm.dato.' + t | translate }}</mat-option> }
          </mat-select>
          @if (editing) { <mat-hint>{{ 'crm.config.type_locked_hint' | translate }}</mat-hint> }
        </mat-form-field>
        <div class="form-row">
          <mat-slide-toggle [(ngModel)]="obligatorio" id="campo-oblig">{{ 'crm.config.required' | translate }}</mat-slide-toggle>
          <mat-slide-toggle [(ngModel)]="activo">{{ 'common.active' | translate }}</mat-slide-toggle>
        </div>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.config.order' | translate }}</mat-label>
          <input matInput type="number" [(ngModel)]="orden" />
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-campo" (click)="save()" [disabled]="saving() || !etiqueta.trim()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class CampoDialogComponent {
  readonly data = inject<CampoDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<CampoDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  private readonly c = this.data.campo;

  readonly tipos = TIPOS_DATO;
  readonly nombres = NOMBRE_DESTINO;
  readonly saving = signal(false);
  readonly editing = !!this.c?.id;
  aplicaA: AplicaA = this.c?.aplica_a ?? this.data.aplica_a;
  etiqueta = this.c?.etiqueta ?? '';
  clave = '';
  tipoDato: TipoDato = this.c?.tipo_dato ?? 'texto';
  obligatorio = this.c?.obligatorio ?? false;
  activo = this.c?.activo ?? true;
  orden = this.c?.orden ?? 0;

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const r = await this.crm.saveCampo({
        id: this.c?.id ?? 0, aplica_a: this.aplicaA, etiqueta: this.etiqueta.trim(), clave: this.clave.trim(),
        tipo_dato: this.tipoDato, obligatorio: this.obligatorio ? 1 : 0, activo: this.activo ? 1 : 0, orden: this.orden ?? 0,
      });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.config.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}

/**
 * Pestaña «Campos personalizados» (L4+): la misma en los Ajustes del CRM y de Comunicaciones (los campos son de la empresa y se comparten).
 * `destinos`: a qué se pueden aplicar (sin CRM no hay oportunidades).
 */
@Component({
  selector: 'app-crm-campos-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIconButton, MatIcon, TranslatePipe],
  template: `
    <div class="tab">
      <p class="muted">{{ 'crm.config.fields_hint' | translate }}</p>
      @for (tipo of destinos(); track tipo) {
        <section class="block">
          <div class="block-head">
            <h2>{{ nombres[tipo] | translate }}</h2>
            <button mat-stroked-button [id]="'btn-new-campo-' + tipo" (click)="editar(null, tipo)"><mat-icon>add</mat-icon>{{ 'crm.config.new_field' | translate }}</button>
          </div>
          @for (f of camposDe(tipo); track f.id) {
            <div class="row" [class.off]="!f.activo">
              <div class="row-main">
                <strong>{{ f.etiqueta }}</strong>
                <span class="muted small">{{ f.clave }}</span>
              </div>
              <span class="pill">{{ 'crm.dato.' + f.tipo_dato | translate }}</span>
              @if (f.obligatorio) { <span class="pill req">{{ 'crm.config.required' | translate }}</span> }
              @if (!f.activo) { <span class="pill off">{{ 'common.inactive' | translate }}</span> }
              <button mat-icon-button (click)="editar(f, f.aplica_a)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button>
            </div>
          } @empty { <p class="muted">{{ 'crm.config.no_fields' | translate }}</p> }
        </section>
      }
    </div>
  `,
  styles: `
    .tab { padding: 20px 0; display: flex; flex-direction: column; gap: 16px; }
    .block { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    .block-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; h2 { margin: 0; font: var(--mat-sys-title-medium); } }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); &:last-child { border: none; } &.off { opacity: 0.6; } }
    .row-main { display: flex; flex-direction: column; flex: 1 1 160px; min-width: 0; overflow-wrap: anywhere; }
    .small { font: var(--mat-sys-body-small); }
    .pill { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); white-space: nowrap; }
    .pill.req { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    .pill.off { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); }
  `,
})
export class CrmCamposTabComponent {
  readonly destinos = input<AplicaA[]>(['persona', 'organizacion', 'oportunidad']);
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private matDialog = inject(MatDialog);
  readonly nombres = NOMBRE_DESTINO;
  readonly campos = signal<CampoDef[]>([]);
  readonly camposDe = (tipo: AplicaA) => this.campos().filter(c => c.aplica_a === tipo);

  constructor() { void this.cargar(); }

  async cargar(): Promise<void> {
    const r = await this.loading.wrap(() => this.crm.listCampos(false));
    if (r.action && r.data) this.campos.set(r.data.campos);
  }

  editar(campo: CampoDef | null, aplicaA: AplicaA): void {
    this.matDialog.open(CampoDialogComponent, { ...dialogSize('480px'), data: { campo, aplica_a: aplicaA, destinos: this.destinos() } satisfies CampoDialogData, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(ok => { if (ok) void this.cargar(); });
  }
}
