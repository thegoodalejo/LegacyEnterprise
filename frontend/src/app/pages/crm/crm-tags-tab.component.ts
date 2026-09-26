import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { TagChipComponent } from '../../components/tag-chip.component';
import { AplicaA, CatalogoTags, CrmService, TagDef, TagGrupo } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { NOMBRE_DESTINO } from './crm-campos-tab.component';

// ─── Diálogo: grupo de etiquetas ─────────────────────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-grupo-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatInput, MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (g ? 'crm.config.edit_group' : 'crm.config.new_group') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.config.group_name' | translate }}</mat-label>
          <input matInput id="grupo-nombre" [(ngModel)]="nombre" maxlength="80" required />
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
      <button mat-flat-button id="btn-save-grupo" (click)="save()" [disabled]="saving() || !nombre.trim()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class GrupoDialogComponent {
  readonly g = inject<TagGrupo | null>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<GrupoDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly saving = signal(false);
  nombre = this.g?.nombre ?? '';
  orden = this.g?.orden ?? 0;
  activo = this.g?.activo ?? true;

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const r = await this.crm.saveTagGrupo({ id: this.g?.id ?? 0, nombre: this.nombre.trim(), orden: this.orden ?? 0, activo: this.activo ? 1 : 0 });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.config.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}

// ─── Diálogo: etiqueta ───────────────────────────────────────────────────────────────────────────────────────────
interface TagDialogData { tag: TagDef | null; grupos: TagGrupo[]; idGrupo?: number | null; destinos: AplicaA[] }

@Component({
  selector: 'app-tag-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatInput, MatSelect, MatOption, MatSlideToggle, TagChipComponent, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (d.tag ? 'crm.config.edit_tag' : 'crm.config.new_tag') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.config.tag_name' | translate }}</mat-label>
          <input matInput id="tag-nombre" [(ngModel)]="nombre" maxlength="50" required />
        </mat-form-field>
        <div class="color-row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="hex">
            <mat-label>{{ 'crm.config.color' | translate }}</mat-label>
            <input matInput id="tag-color" [(ngModel)]="color" maxlength="7" />
          </mat-form-field>
          <input type="color" class="picker" [ngModel]="color" (ngModelChange)="color = $event" [attr.aria-label]="'crm.config.color' | translate" />
          <app-tag-chip [nombre]="nombre.trim() || ('crm.config.preview' | translate)" [color]="validColor() ? color : '#607D8B'" />
        </div>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.config.group' | translate }}</mat-label>
          <mat-select [(ngModel)]="idGrupo" id="tag-grupo">
            <mat-option [value]="null">{{ 'crm.tags.no_group' | translate }}</mat-option>
            @for (g of d.grupos; track g.id) { <mat-option [value]="g.id">{{ g.nombre }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.config.applies_to' | translate }}</mat-label>
          <mat-select [(ngModel)]="aplicaA" id="tag-aplica">
            <mat-option value="">{{ 'crm.config.both' | translate }}</mat-option>
            @for (x of d.destinos; track x) { <mat-option [value]="x">{{ nombres[x] | translate }}</mat-option> }
          </mat-select>
        </mat-form-field>
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
      <button mat-flat-button id="btn-save-tag" (click)="save()" [disabled]="saving() || !nombre.trim() || !validColor()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .color-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .hex { flex: 0 1 160px; }
    .picker { width: 40px; height: 40px; border: none; padding: 0; background: none; cursor: pointer; }
  `,
})
export class TagDialogComponent {
  readonly d = inject<TagDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<TagDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly nombres = NOMBRE_DESTINO;
  readonly saving = signal(false);
  nombre = this.d.tag?.nombre ?? '';
  color = this.d.tag?.color ?? '#1E88E5';
  idGrupo: number | null = this.d.tag ? this.d.tag.id_grupo : (this.d.idGrupo ?? null);
  aplicaA: AplicaA | '' = this.d.tag?.aplica_a ?? '';
  orden = this.d.tag?.orden ?? 0;
  activo = this.d.tag?.activo ?? true;

  validColor(): boolean { return /^#[0-9a-fA-F]{6}$/.test(this.color.trim()); }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const r = await this.crm.saveTag({
        id: this.d.tag?.id ?? 0, nombre: this.nombre.trim(), color: this.color.trim(), id_grupo: this.idGrupo ?? '',
        aplica_a: this.aplicaA, orden: this.orden ?? 0, activo: this.activo ? 1 : 0,
      });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.config.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}

/**
 * Pestaña «Etiquetas» (L4+): catálogo de la empresa, compartido por el CRM y Comunicaciones (las mismas etiquetas en Contactos, la bandeja,
 * el chatbot y las campañas). `destinos`: a qué puede limitarse una etiqueta.
 */
@Component({
  selector: 'app-crm-tags-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIconButton, MatIcon, TagChipComponent, TranslatePipe],
  template: `
    <div class="tab">
      <div class="block-head">
        <p class="muted">{{ 'crm.config.tags_hint' | translate }}</p>
        <div class="actions">
          <button mat-stroked-button id="btn-new-grupo" (click)="editGrupo(null)"><mat-icon>create_new_folder</mat-icon>{{ 'crm.config.new_group' | translate }}</button>
          <button mat-flat-button id="btn-new-tag" (click)="editTag(null)"><mat-icon>add</mat-icon>{{ 'crm.config.new_tag' | translate }}</button>
        </div>
      </div>
      @for (g of catalogo().grupos; track g.id) {
        <section class="block" [class.off]="!g.activo">
          <div class="block-head">
            <h2>{{ g.nombre }}@if (!g.activo) { <span class="pill off">{{ 'common.inactive' | translate }}</span> }</h2>
            <div class="actions">
              <button mat-button (click)="editTag(null, g.id)"><mat-icon>add</mat-icon>{{ 'crm.config.new_tag' | translate }}</button>
              <button mat-icon-button (click)="editGrupo(g)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button>
            </div>
          </div>
          <div class="chips">
            @for (t of tagsDe(g.id); track t.id) { <button class="tag-btn" [class.off]="!t.activo" (click)="editTag(t)"><app-tag-chip [nombre]="t.nombre" [color]="t.color" /></button> }
            @empty { <span class="muted">—</span> }
          </div>
        </section>
      }
      <section class="block">
        <div class="block-head"><h2>{{ 'crm.tags.no_group' | translate }}</h2></div>
        <div class="chips">
          @for (t of tagsDe(null); track t.id) { <button class="tag-btn" [class.off]="!t.activo" (click)="editTag(t)"><app-tag-chip [nombre]="t.nombre" [color]="t.color" /></button> }
          @empty { <span class="muted">—</span> }
        </div>
      </section>
    </div>
  `,
  styles: `
    .tab { padding: 20px 0; display: flex; flex-direction: column; gap: 16px; }
    .block { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); &.off { opacity: 0.7; } }
    .block-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; h2 { margin: 0; font: var(--mat-sys-title-medium); display: flex; gap: 8px; align-items: center; } p { margin: 0; } }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); white-space: nowrap; }
    .pill.off { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag-btn { border: none; background: none; padding: 0; cursor: pointer; &.off { opacity: 0.45; } }
  `,
})
export class CrmTagsTabComponent {
  readonly destinos = input<AplicaA[]>(['persona', 'organizacion', 'oportunidad']);
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private matDialog = inject(MatDialog);
  readonly catalogo = signal<CatalogoTags>({ grupos: [], tags: [] });
  readonly tagsDe = (idGrupo: number | null) => this.catalogo().tags.filter(t => (idGrupo === null ? !this.catalogo().grupos.some(g => g.id === t.id_grupo) : t.id_grupo === idGrupo));

  constructor() { void this.cargar(); }

  async cargar(): Promise<void> {
    const r = await this.loading.wrap(() => this.crm.listTags(false));
    if (r.action && r.data) this.catalogo.set(r.data);
  }

  editGrupo(g: TagGrupo | null): void {
    this.matDialog.open(GrupoDialogComponent, { ...dialogSize('480px'), data: g, autoFocus: 'first-tabbable' }).afterClosed().subscribe(ok => { if (ok) void this.cargar(); });
  }

  editTag(t: TagDef | null, idGrupo?: number): void {
    this.matDialog.open(TagDialogComponent, { ...dialogSize('480px'), data: { tag: t, grupos: this.catalogo().grupos, idGrupo, destinos: this.destinos() } satisfies TagDialogData,
      autoFocus: 'first-tabbable' }).afterClosed().subscribe(ok => { if (ok) void this.cargar(); });
  }
}
