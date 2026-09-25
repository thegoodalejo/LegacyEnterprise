import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { ItemPickerComponent } from '../../components/item-picker.component';
import { CategoriaItem, CrmService, FuenteMetrica, Metrica } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

const FUENTES: FuenteMetrica[] = ['ventas_valor', 'ventas_unidades', 'ventas_numero', 'clientes_compra', 'oportunidades_ganadas_valor', 'oportunidades_ganadas_numero', 'oportunidades_creadas'];
const esDinero = (f: FuenteMetrica) => f.endsWith('_valor');

interface MetricaDialogData { metrica: Metrica | null; categorias: CategoriaItem[] }

// ─── Diálogo ─────────────────────────────────────────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-metrica-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatIconButton, MatFormField, MatLabel, MatHint, MatInput, MatSelect, MatOption, MatSlideToggle, MatIcon, ItemPickerComponent, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (m ? 'crm.metrics.edit' : 'crm.metrics.new') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.metrics.name' | translate }}</mat-label>
          <input matInput id="metrica-nombre" [(ngModel)]="nombre" maxlength="80" required />
          <mat-hint>{{ 'crm.metrics.name_hint' | translate }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.metrics.source' | translate }}</mat-label>
          <mat-select id="metrica-fuente" [ngModel]="fuente()" (ngModelChange)="fuente.set($event)" [disabled]="bloqueada">
            @for (f of fuentes; track f) { <mat-option [value]="f">{{ 'crm.metrics.src_' + f | translate }}</mat-option> }
          </mat-select>
          <mat-hint>{{ (bloqueada ? 'crm.metrics.locked' : 'crm.metrics.src_' + fuente() + '_desc') | translate }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.metrics.filter' | translate }}</mat-label>
          <mat-select id="metrica-filtro" [ngModel]="filtro()" (ngModelChange)="setFiltro($event)" [disabled]="bloqueada">
            <mat-option value="ninguno">{{ 'crm.metrics.filter_none' | translate }}</mat-option>
            <mat-option value="item">{{ 'crm.metrics.filter_item' | translate }}</mat-option>
            <mat-option value="categoria">{{ 'crm.metrics.filter_category' | translate }}</mat-option>
          </mat-select>
          <mat-hint>{{ 'crm.metrics.filter_hint' | translate }}</mat-hint>
        </mat-form-field>
        @if (filtro() === 'item') {
          @if (item(); as i) {
            <div class="pick"><span class="pill" id="metrica-item">{{ i.nombre }}</span>
              @if (!bloqueada) { <button mat-icon-button type="button" (click)="item.set(null)" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button> }</div>
          } @else {
            <app-item-picker inputId="metrica-item-q" [label]="'crm.metrics.pick_item' | translate" (picked)="item.set({ id: $event.id, nombre: $event.nombre })" />
          }
        }
        @if (filtro() === 'categoria') {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.catalog.item_category' | translate }}</mat-label>
            <mat-select id="metrica-categoria" [ngModel]="idCategoria()" (ngModelChange)="idCategoria.set($event)" [disabled]="bloqueada">
              @for (c of d.categorias; track c.id) { <mat-option [value]="c.id">{{ c.nombre }}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
        @if (!dinero()) {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.metrics.unit' | translate }}</mat-label>
            <input matInput id="metrica-unidad" [(ngModel)]="unidad" maxlength="30" />
            <mat-hint>{{ 'crm.metrics.unit_hint' | translate }}</mat-hint>
          </mat-form-field>
        }
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.metrics.description' | translate }}</mat-label>
          <input matInput id="metrica-desc" [(ngModel)]="descripcion" maxlength="255" />
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
      <button mat-flat-button id="btn-save-metrica" (click)="save()" [disabled]="saving() || !valido()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .pick { display: flex; align-items: center; gap: 6px; margin-bottom: 16px; }
    .pill { padding: 4px 12px; border-radius: 999px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); font: var(--mat-sys-label-large); overflow-wrap: anywhere; }
  `,
})
export class MetricaDialogComponent {
  readonly d = inject<MetricaDialogData>(MAT_DIALOG_DATA);
  readonly m = this.d.metrica;
  private ref = inject(MatDialogRef<MetricaDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly fuentes = FUENTES;
  /** Con metas, la fuente y el filtro ya no cambian (cambiarían el significado de metas puestas). */
  readonly bloqueada = !!this.m && this.m.metas > 0;
  readonly saving = signal(false);
  nombre = this.m?.nombre ?? '';
  readonly fuente = signal<FuenteMetrica>(this.m?.fuente ?? 'ventas_valor');
  readonly filtro = signal<'ninguno' | 'item' | 'categoria'>(this.m?.id_item ? 'item' : this.m?.id_categoria ? 'categoria' : 'ninguno');
  readonly item = signal<{ id: number; nombre: string } | null>(this.m?.id_item ? { id: this.m.id_item, nombre: this.m.item_nombre ?? '' } : null);
  readonly idCategoria = signal<number | null>(this.m?.id_categoria ?? null);
  unidad = this.m?.unidad ?? '';
  descripcion = this.m?.descripcion ?? '';
  orden = this.m?.orden ?? 0;
  activo = this.m?.activo ?? true;
  readonly dinero = computed(() => esDinero(this.fuente()));
  readonly valido = computed(() => (this.filtro() !== 'item' || !!this.item()) && (this.filtro() !== 'categoria' || !!this.idCategoria()));

  setFiltro(f: 'ninguno' | 'item' | 'categoria'): void { this.filtro.set(f); if (f !== 'item') this.item.set(null); if (f !== 'categoria') this.idCategoria.set(null); }

  async save(): Promise<void> {
    if (!this.nombre.trim()) return;
    this.saving.set(true);
    try {
      const r = await this.crm.saveMetrica({
        id: this.m?.id ?? 0, nombre: this.nombre.trim(), fuente: this.fuente(), id_item: this.item()?.id ?? '', id_categoria: this.idCategoria() ?? '',
        unidad: this.dinero() ? '' : this.unidad.trim(), descripcion: this.descripcion.trim(), orden: this.orden ?? 0, activo: this.activo ? 1 : 0,
      });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.config.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}

// ─── Pestaña ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Pestaña «Métricas»: QUÉ se mide en las metas (ventas, unidades de un ítem, clientes con compra, oportunidades…). Las metas se asignan en CRM → Metas. */
@Component({
  selector: 'app-crm-metricas-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButton, MatIconButton, MatIcon, TranslatePipe],
  template: `
    <div class="tab">
      <div class="head">
        <p class="muted">{{ 'crm.metrics.hint' | translate }} <a routerLink="/m/crm/metas" class="inline-link">{{ 'crm.metrics.go_goals' | translate }}</a></p>
        <button mat-flat-button id="btn-new-metrica" (click)="editar(null)"><mat-icon>add</mat-icon>{{ 'crm.metrics.new' | translate }}</button>
      </div>
      <section class="block" id="lista-metricas">
        @for (m of metricas(); track m.id) {
          <div class="row" [class.off]="!m.activo">
            <mat-icon class="ic">{{ m.formato === 'moneda' ? 'payments' : 'tag' }}</mat-icon>
            <div class="main">
              <strong>{{ m.nombre }}</strong>
              <span class="muted small">{{ 'crm.metrics.src_' + m.fuente | translate }}@if (m.item_nombre || m.categoria_nombre) { · {{ m.item_nombre || m.categoria_nombre }} }@if (m.unidad) { · {{ m.unidad }} }</span>
            </div>
            <span class="pill">{{ 'crm.goals.n_goals' | translate: { n: m.metas } }}</span>
            @if (!m.activo) { <span class="pill off">{{ 'common.inactive' | translate }}</span> }
            <button mat-icon-button (click)="editar(m)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button>
          </div>
        } @empty { <p class="muted">{{ 'crm.metrics.empty' | translate }}</p> }
      </section>
    </div>
  `,
  styles: `
    .tab { padding: 20px 0; display: flex; flex-direction: column; gap: 16px; }
    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; p { margin: 0; flex: 1 1 320px; } }
    .inline-link { color: var(--md-sys-color-primary); }
    .block { display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); &:last-child { border: none; } &.off { opacity: 0.6; } }
    .ic { color: var(--md-sys-color-primary); }
    .main { display: flex; flex-direction: column; flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere; }
    .small { font: var(--mat-sys-body-small); }
    .pill { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); white-space: nowrap; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container);
      &.off { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); } }
  `,
})
export class CrmMetricasTabComponent {
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private matDialog = inject(MatDialog);
  readonly metricas = signal<Metrica[]>([]);
  private categorias: CategoriaItem[] = [];

  constructor() {
    void this.load();
    void this.crm.listCategoriasItem(true).then(r => { if (r.action && r.data) this.categorias = r.data.categorias; });
  }

  async load(): Promise<void> {
    const r = await this.loading.wrap(() => this.crm.listMetricas());
    if (r.action && r.data) this.metricas.set(r.data.metricas);
  }

  editar(m: Metrica | null): void {
    this.matDialog.open(MetricaDialogComponent, { ...dialogSize('560px'), data: { metrica: m, categorias: this.categorias } satisfies MetricaDialogData, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(ok => { if (ok) void this.load(); });
  }
}
