import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTab, MatTabContent, MatTabGroup } from '@angular/material/tabs';
import { TagChipComponent } from '../../components/tag-chip.component';
import { AplicaA, CampoDef, CatalogoTags, CrmService, TagDef, TagGrupo, TipoDato } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { CrmCatalogoTabComponent } from './crm-catalogo-tab.component';
import { CrmEmbudoTabComponent } from './crm-embudo-tab.component';
import { CrmMetricasTabComponent } from './crm-metricas-tab.component';
import { CrmRolesTabComponent } from './crm-roles-tab.component';
import { CrmTemplatesTabComponent } from './crm-templates-tab.component';
import { CrmVocabTabComponent } from './crm-vocab-tab.component';

const TIPOS_DATO: TipoDato[] = ['entero', 'decimal', 'texto', 'booleano', 'fecha'];

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
            <mat-option value="persona">{{ 'crm.tipo.personas' | translate }}</mat-option>
            <mat-option value="organizacion">{{ 'crm.tipo.organizaciones' | translate }}</mat-option>
            <mat-option value="oportunidad">{{ 'crm.tipo.oportunidades' | translate }}</mat-option>
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
  readonly c = inject<CampoDef | { aplica_a: AplicaA } | null>(MAT_DIALOG_DATA) as (CampoDef & { id?: number }) | null;
  private ref = inject(MatDialogRef<CampoDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly tipos = TIPOS_DATO;
  readonly saving = signal(false);
  readonly editing = !!this.c?.id;
  aplicaA: AplicaA = this.c?.aplica_a ?? 'persona';
  etiqueta = this.editing ? this.c!.etiqueta : '';
  clave = '';
  tipoDato: TipoDato = this.editing ? this.c!.tipo_dato : 'texto';
  obligatorio = this.editing ? this.c!.obligatorio : false;
  activo = this.editing ? this.c!.activo : true;
  orden = this.editing ? this.c!.orden : 0;

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const r = await this.crm.saveCampo({
        id: this.editing ? this.c!.id : 0, aplica_a: this.aplicaA, etiqueta: this.etiqueta.trim(), clave: this.clave.trim(),
        tipo_dato: this.tipoDato, obligatorio: this.obligatorio ? 1 : 0, activo: this.activo ? 1 : 0, orden: this.orden ?? 0,
      });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.config.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}

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
interface TagDialogData { tag: TagDef | null; grupos: TagGrupo[]; idGrupo?: number | null }

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
            <mat-option value="persona">{{ 'crm.tipo.personas' | translate }}</mat-option>
            <mat-option value="organizacion">{{ 'crm.tipo.organizaciones' | translate }}</mat-option>
            <mat-option value="oportunidad">{{ 'crm.tipo.oportunidades' | translate }}</mat-option>
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

// ─── Página ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** Configuración del CRM por empresa (L4+): campos personalizados, etiquetas, embudo, catálogo, métricas de metas, roles, vocabulario y plantillas. */
@Component({
  selector: 'app-crm-config-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIconButton, MatIcon, MatTab, MatTabContent, MatTabGroup, TagChipComponent, CrmRolesTabComponent, CrmTemplatesTabComponent, CrmVocabTabComponent, CrmEmbudoTabComponent, CrmCatalogoTabComponent, CrmMetricasTabComponent, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header"><h1>{{ 'crm.config.title' | translate }}</h1></header>
      <mat-tab-group animationDuration="0ms" mat-stretch-tabs="false" mat-align-tabs="start">
        <mat-tab [label]="'crm.config.fields' | translate">
          <div class="tab">
            <p class="muted">{{ 'crm.config.fields_hint' | translate }}</p>
            @for (tipo of destinos; track tipo) {
              <section class="block">
                <div class="block-head">
                  <h2>{{ nombreDestino(tipo) | translate }}</h2>
                  <button mat-stroked-button [id]="'btn-new-campo-' + tipo" (click)="editCampo({ aplica_a: tipo })"><mat-icon>add</mat-icon>{{ 'crm.config.new_field' | translate }}</button>
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
                    <button mat-icon-button (click)="editCampo(f)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button>
                  </div>
                } @empty { <p class="muted">{{ 'crm.config.no_fields' | translate }}</p> }
              </section>
            }
          </div>
        </mat-tab>
        <mat-tab [label]="'crm.config.tags' | translate">
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
        </mat-tab>
        <!-- Con matTabContent cada pestaña se crea al abrirla: siempre muestra lo último (p. ej. tras aplicar una plantilla). -->
        <mat-tab [label]="'crm.config.funnel' | translate"><ng-template matTabContent><app-crm-embudo-tab /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.catalog' | translate"><ng-template matTabContent><app-crm-catalogo-tab /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.metrics' | translate"><ng-template matTabContent><app-crm-metricas-tab /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.roles' | translate"><ng-template matTabContent><app-crm-roles-tab /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.vocab' | translate"><app-crm-vocab-tab /></mat-tab>
        <mat-tab [label]="'crm.config.templates' | translate"><app-crm-templates-tab (applied)="load()" /></mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    .tab { padding: 20px 0; display: flex; flex-direction: column; gap: 16px; }
    .block { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); &.off { opacity: 0.7; } }
    .block-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; h2 { margin: 0; font: var(--mat-sys-title-medium); display: flex; gap: 8px; align-items: center; } p { margin: 0; } }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); &:last-child { border: none; } &.off { opacity: 0.6; } }
    .row-main { display: flex; flex-direction: column; flex: 1 1 160px; min-width: 0; overflow-wrap: anywhere; }
    .small { font: var(--mat-sys-body-small); }
    .pill { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); white-space: nowrap; }
    .pill.req { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    .pill.off { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag-btn { border: none; background: none; padding: 0; cursor: pointer; &.off { opacity: 0.45; } }
  `,
})
export default class CrmConfigPage {
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private matDialog = inject(MatDialog);

  readonly destinos: AplicaA[] = ['persona', 'organizacion', 'oportunidad'];
  readonly campos = signal<CampoDef[]>([]);
  readonly catalogo = signal<CatalogoTags>({ grupos: [], tags: [] });
  readonly camposDe = (tipo: AplicaA) => this.campos().filter(c => c.aplica_a === tipo);
  readonly nombreDestino = (t: AplicaA): string => (t === 'persona' ? 'crm.tipo.personas' : t === 'organizacion' ? 'crm.tipo.organizaciones' : 'crm.tipo.oportunidades');
  readonly tagsDe = (idGrupo: number | null) => this.catalogo().tags.filter(t => (idGrupo === null ? !this.catalogo().grupos.some(g => g.id === t.id_grupo) : t.id_grupo === idGrupo));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const [c, t] = await this.loading.wrap(() => Promise.all([this.crm.listCampos(false), this.crm.listTags(false)]));
    if (c.action && c.data) this.campos.set(c.data.campos);
    if (t.action && t.data) this.catalogo.set(t.data);
  }

  private open<T>(component: new () => unknown, data: T, size: '480px' | '560px' = '480px'): void {
    this.matDialog.open(component, { ...dialogSize(size), data, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(saved => { if (saved) void this.load(); });
  }

  editCampo(c: CampoDef | { aplica_a: AplicaA }): void { this.open(CampoDialogComponent, c); }
  editGrupo(g: TagGrupo | null): void { this.open(GrupoDialogComponent, g); }
  editTag(t: TagDef | null, idGrupo?: number): void {
    this.open(TagDialogComponent, { tag: t, grupos: this.catalogo().grupos, idGrupo } satisfies TagDialogData);
  }
}
