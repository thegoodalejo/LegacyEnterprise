import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatPaginator, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { ExportAlcance, ExportMenuComponent, ExportSolicitud } from '../../components/export-menu.component';
import { CrmConfigService } from '../../services/crm-config.service';
import { CrmOppReportService } from '../../services/crm-opp-report.service';
import { ejecutarExportacion } from '../../services/crm-report.service';
import { CategoriaItem, CrmService, ItemCatalogo } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { TranslatedPaginatorIntl } from './translated-paginator-intl';

// ─── Diálogos ────────────────────────────────────────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-categoria-item-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatInput, MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (c ? 'crm.catalog.edit_category' : 'crm.catalog.new_category') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.catalog.category_name' | translate }}</mat-label>
          <input matInput id="categoria-nombre" [(ngModel)]="nombre" maxlength="80" required />
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
      <button mat-flat-button id="btn-save-categoria" (click)="save()" [disabled]="saving() || !nombre.trim()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class CategoriaItemDialogComponent {
  readonly c = inject<CategoriaItem | null>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<CategoriaItemDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly saving = signal(false);
  nombre = this.c?.nombre ?? '';
  orden = this.c?.orden ?? 0;
  activo = this.c?.activo ?? true;

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const r = await this.crm.saveCategoriaItem({ id: this.c?.id ?? 0, nombre: this.nombre.trim(), orden: this.orden ?? 0, activo: this.activo ? 1 : 0 });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.config.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}

interface ItemDialogData { item: ItemCatalogo | null; categorias: CategoriaItem[] }

@Component({
  selector: 'app-item-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatInput, MatSelect, MatOption, MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (d.item ? 'crm.catalog.edit_item' : 'crm.catalog.new_item') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.catalog.item_name' | translate }}</mat-label>
          <input matInput id="item-nombre" [(ngModel)]="nombre" maxlength="150" required />
        </mat-form-field>
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.catalog.item_code' | translate }}</mat-label>
            <input matInput id="item-codigo" [(ngModel)]="codigo" maxlength="40" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.catalog.item_unit' | translate }}</mat-label>
            <input matInput id="item-unidad" [(ngModel)]="unidad" maxlength="30" />
          </mat-form-field>
        </div>
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.catalog.item_category' | translate }}</mat-label>
            <mat-select [(ngModel)]="idCategoria" id="item-categoria">
              <mat-option [value]="null">{{ 'crm.catalog.no_category' | translate }}</mat-option>
              @for (c of d.categorias; track c.id) { <mat-option [value]="c.id">{{ c.nombre }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'crm.catalog.item_price' | translate }}</mat-label>
            <input matInput id="item-precio" inputmode="decimal" [(ngModel)]="precio" />
          </mat-form-field>
        </div>
        <mat-slide-toggle [(ngModel)]="activo">{{ 'common.active' | translate }}</mat-slide-toggle>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-item" (click)="save()" [disabled]="saving() || !nombre.trim()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class ItemDialogComponent {
  readonly d = inject<ItemDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ItemDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly saving = signal(false);
  nombre = this.d.item?.nombre ?? '';
  codigo = this.d.item?.codigo ?? '';
  unidad = this.d.item?.unidad ?? '';
  idCategoria: number | null = this.d.item?.id_categoria ?? null;
  precio = this.d.item?.precio_ref !== null && this.d.item?.precio_ref !== undefined ? String(this.d.item.precio_ref) : '';
  activo = this.d.item?.activo ?? true;

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const r = await this.crm.saveItem({
        id: this.d.item?.id ?? 0, nombre: this.nombre.trim(), codigo: this.codigo.trim(), unidad: this.unidad.trim(), id_categoria: this.idCategoria ?? '',
        precio_ref: this.precio.trim().replace(',', '.'), activo: this.activo ? 1 : 0,
      });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.config.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}

// ─── Pestaña ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Pestaña «Catálogo»: lo que vende la empresa (productos, servicios, tratamientos…), con categorías, código, unidad y precio de referencia. */
@Component({
  selector: 'app-crm-catalogo-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl }],
  imports: [FormsModule, MatButton, MatIconButton, MatIcon, MatFormField, MatLabel, MatPrefix, MatInput, MatSelect, MatOption, MatPaginator, ExportMenuComponent, TranslatePipe],
  template: `
    <div class="tab">
      <p class="muted">{{ 'crm.catalog.hint' | translate }}</p>

      <section class="block">
        <div class="head">
          <h2>{{ 'crm.catalog.categories' | translate }}</h2>
          <button mat-button id="btn-new-categoria" (click)="editCategoria(null)"><mat-icon>add</mat-icon>{{ 'crm.catalog.new_category' | translate }}</button>
        </div>
        <div class="chips">
          @for (c of categorias(); track c.id) {
            <button class="chip" [class.off]="!c.activo" (click)="editCategoria(c)">{{ c.nombre }}</button>
          } @empty { <span class="muted">{{ 'crm.catalog.no_categories' | translate }}</span> }
        </div>
      </section>

      <section class="block">
        <div class="head">
          <h2>{{ 'crm.catalog.items' | translate }}</h2>
          <div class="acts">
            <app-export-menu [alcances]="alcanceCatalogo()" [disabled]="!total()" (exportar)="exportar($event)" />
            <button mat-flat-button id="btn-new-item" (click)="editItem(null)"><mat-icon>add</mat-icon>{{ 'crm.catalog.new_item' | translate }}</button>
          </div>
        </div>
        <div class="form-row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
            <mat-label>{{ 'crm.filters.search' | translate }}</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput id="catalog-q" type="search" autocomplete="off" [ngModel]="qInput()" (ngModelChange)="onSearch($event)" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cat">
            <mat-label>{{ 'crm.catalog.item_category' | translate }}</mat-label>
            <mat-select [ngModel]="idCategoria()" (ngModelChange)="idCategoria.set($event); page.set(0)">
              <mat-option [value]="null">{{ 'crm.filters.all' | translate }}</mat-option>
              @for (c of categorias(); track c.id) { <mat-option [value]="c.id">{{ c.nombre }}</mat-option> }
            </mat-select>
          </mat-form-field>
        </div>
        @for (i of items(); track i.id) {
          <div class="row" [class.off]="!i.activo">
            <div class="main">
              <strong>{{ i.nombre }}</strong>
              <span class="muted small">{{ i.codigo }}{{ i.codigo && i.categoria ? ' · ' : '' }}{{ i.categoria }}</span>
            </div>
            <span class="muted">{{ i.precio_ref !== null ? cfg.money(i.precio_ref) : '' }}{{ i.unidad ? ' / ' + i.unidad : '' }}</span>
            @if (!i.activo) { <span class="pill off">{{ 'common.inactive' | translate }}</span> }
            <button mat-icon-button (click)="editItem(i)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button>
          </div>
        } @empty { <p class="muted">{{ 'crm.catalog.no_items' | translate }}</p> }
        <mat-paginator [length]="total()" [pageSize]="pageSize" [pageIndex]="page()" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
      </section>
    </div>
  `,
  styles: `
    .tab { padding: 20px 0; display: flex; flex-direction: column; gap: 16px; }
    p { margin: 0; }
    .block { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; h2 { margin: 0; font: var(--mat-sys-title-medium); } }
    .acts { display: flex; flex-wrap: wrap; gap: 8px; }
    .search { flex: 1 1 240px; min-width: 0; }
    .cat { flex: 0 1 220px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { border: none; cursor: pointer; padding: 4px 14px; border-radius: 999px; font: var(--mat-sys-label-large); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); &.off { opacity: 0.5; } }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); &.off { opacity: 0.6; } }
    .main { display: flex; flex-direction: column; flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere; }
    .small { font: var(--mat-sys-body-small); }
    .pill { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); }
  `,
})
export class CrmCatalogoTabComponent {
  private crm = inject(CrmService);
  readonly loading = inject(LoadingService);
  private matDialog = inject(MatDialog);
  readonly dialogs = inject(DialogService);
  readonly i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);
  private reportes = inject(CrmOppReportService);
  readonly alcanceCatalogo = computed<ExportAlcance[]>(() => [{ id: 'todos', etiqueta: this.i18n.t('crm.export.menu_all') }]);

  readonly categorias = signal<CategoriaItem[]>([]);
  readonly items = signal<ItemCatalogo[]>([]);
  readonly total = signal(0);
  readonly page = signal(0);
  readonly pageSize = 25;
  readonly qInput = signal('');
  private readonly q = signal('');
  readonly idCategoria = signal<number | null>(null);
  private qTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.loadCategorias();
    effect(() => {
      this.q(); this.idCategoria(); this.page();
      untracked(() => void this.load());
    });
  }

  private async loadCategorias(): Promise<void> {
    const r = await this.crm.listCategoriasItem(false);
    if (r.action && r.data) this.categorias.set(r.data.categorias);
  }

  async load(): Promise<void> {
    const r = await this.loading.wrap(() => this.crm.listItems({ q: this.q(), idCategoria: this.idCategoria(), pagina: this.page() + 1, porPagina: this.pageSize }));
    if (r.action && r.data) { this.items.set(r.data.items); this.total.set(r.data.total); }
  }

  onSearch(v: string): void {
    this.qInput.set(v);
    if (this.qTimer) clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => { this.page.set(0); this.q.set(v.trim()); }, 300);
  }

  onPage(e: PageEvent): void { this.page.set(e.pageIndex); }

  async exportar(e: ExportSolicitud): Promise<void> {
    const c = this.cfg.config();
    await ejecutarExportacion(this, () => this.reportes.exportarCatalogo(e.formato, c.moneda, c.decimales));
  }

  editCategoria(c: CategoriaItem | null): void {
    this.matDialog.open(CategoriaItemDialogComponent, { ...dialogSize('480px'), data: c, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(saved => { if (saved) { void this.loadCategorias(); void this.load(); } });
  }

  editItem(i: ItemCatalogo | null): void {
    this.matDialog.open(ItemDialogComponent, { ...dialogSize('560px'), data: { item: i, categorias: this.categorias().filter(c => c.activo || c.id === i?.id_categoria) } satisfies ItemDialogData, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(saved => { if (saved) void this.load(); });
  }
}
