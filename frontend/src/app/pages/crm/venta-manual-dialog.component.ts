import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatHint, MatLabel, MatPrefix, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { ContactoPickerComponent } from '../../components/contacto-picker.component';
import { DateInputComponent } from '../../components/date-input.component';
import { CrmConfigService } from '../../services/crm-config.service';
import { CategoriaItem, CrmService, ItemCatalogo, TipoContacto, VentaManual } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDate, parseNumero } from './crm-format';

export interface VentaManualDialogData {
  /** Cliente ya elegido (al registrar desde su perfil). */
  contacto?: { id: number; nombre: string; tipo: TipoContacto };
}
export interface VentaManualDialogResult { id: number; total: number; cliente: string }

interface LineaCarrito { key: number; id_item: number | null; nombre: string; codigo: string | null; unidad: string | null; descripcion: string; cantidad: string; precio: string }

const CATALOGO_POR_PAGINA = 20;
const r2 = (n: number): number => Math.round(n * 100) / 100;
const hoyIso = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Registrar una venta a mano, como un carrito: se elige el cliente, la fecha y (opcional) el número de factura, se agregan {items} del catálogo
 * (tocar uno que ya está suma uno a su cantidad) o líneas libres, y al final «Revisar venta» la valida en el servidor sin guardar
 * y muestra el resumen; «Confirmar venta» la registra. Queda como venta manual (sin importación): cuenta de inmediato en indicadores y metas.
 */
@Component({
  selector: 'app-venta-manual-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButton, MatIconButton, MatButtonToggleGroup, MatButtonToggle, MatFormField, MatHint, MatLabel, MatPrefix, MatSuffix,
    MatIcon, MatInput, MatSelect, MatOption, ContactoPickerComponent, DateInputComponent, TranslatePipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ (paso() === 'carrito' ? 'crm.cart.title' : 'crm.cart.review_title') | translate }}</h2>
    <mat-dialog-content>
      @if (paso() === 'carrito') {
        <div class="form">
          <section class="block">
            <div class="row">
              <div class="client">
                <h3>{{ 'crm.opp.client' | translate }}</h3>
                @if (contacto(); as c) {
                  <div class="chips"><span class="pill" id="sale-client-chip">{{ c.nombre }}</span>
                    <button mat-icon-button type="button" (click)="contacto.set(null)" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button></div>
                } @else {
                  <mat-button-toggle-group [value]="tipoBusqueda()" (change)="tipoBusqueda.set($event.value)" hideSingleSelectionIndicator [attr.aria-label]="'crm.opp.client' | translate">
                    <mat-button-toggle value="organizacion">{{ 'crm.tipo.organizacion' | translate }}</mat-button-toggle>
                    <mat-button-toggle value="persona">{{ 'crm.tipo.persona' | translate }}</mat-button-toggle>
                  </mat-button-toggle-group>
                  <app-contacto-picker [tipo]="tipoBusqueda()" inputId="sale-client" [label]="'crm.opp.client_search' | translate" (picked)="contacto.set({ id: $event.id, nombre: $event.nombre_completo })" />
                }
              </div>
            </div>
            <div class="row">
              <app-date-input [label]="'crm.sales.date' | translate" [value]="fecha()" (valueChange)="fecha.set($event)" />
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'crm.cart.document' | translate }}</mat-label>
                <input matInput id="sale-doc" maxlength="60" autocomplete="off" [ngModel]="documento()" (ngModelChange)="documento.set($event)" />
                <mat-hint>{{ 'crm.cart.document_hint' | translate }}</mat-hint>
              </mat-form-field>
            </div>
          </section>

          <div class="shop">
            <section class="block catalog" aria-labelledby="cart-catalog-h">
              <h3 id="cart-catalog-h">{{ 'crm.cart.catalog' | translate }}</h3>
              <div class="row">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>{{ 'crm.cart.search' | translate }}</mat-label>
                  <mat-icon matPrefix>search</mat-icon>
                  <input matInput id="cart-q" type="search" autocomplete="off" [ngModel]="qInput()" (ngModelChange)="buscar($event)" />
                  @if (qInput()) { <button matSuffix mat-icon-button type="button" (click)="buscar('')" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button> }
                </mat-form-field>
                @if (categorias().length) {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cat">
                    <mat-label>{{ 'crm.catalog.item_category' | translate }}</mat-label>
                    <mat-select id="cart-cat" [ngModel]="categoria()" (ngModelChange)="categoria.set($event)">
                      <mat-option [value]="null">{{ 'crm.filters.all' | translate }}</mat-option>
                      @for (c of categorias(); track c.id) { <mat-option [value]="c.id">{{ c.nombre }}</mat-option> }
                    </mat-select>
                  </mat-form-field>
                }
              </div>
              <div class="items" id="cart-catalog">
                @for (i of catalogo(); track i.id) {
                  <button type="button" class="it" [id]="'cat-item-' + i.id" (click)="agregar(i)" [attr.aria-label]="'crm.cart.add_aria' | translate: { name: i.nombre }">
                    <span class="it-t"><strong>{{ i.nombre }}</strong><span class="muted small">{{ i.codigo }}{{ i.codigo && i.categoria ? ' · ' : '' }}{{ i.categoria }}</span></span>
                    <span class="it-p">{{ i.precio_ref !== null ? cfg.money(i.precio_ref) : '—' }}@if (i.unidad) { <span class="muted small">/ {{ i.unidad }}</span> }</span>
                    @if (enCarrito().get(i.id); as n) { <span class="badge" [attr.aria-label]="'crm.cart.in_cart' | translate: { n: fmtNum(n) }">{{ fmtNum(n) }}</span> }
                    <mat-icon class="it-add" aria-hidden="true">add_shopping_cart</mat-icon>
                  </button>
                } @empty {
                  @if (!buscando()) {
                    <p class="muted small empty">{{ (qInput() || categoria() ? 'crm.cart.no_results' : 'crm.cart.catalog_empty') | translate }}</p>
                  }
                }
                @if (catalogo().length < totalCatalogo()) {
                  <button mat-button type="button" id="btn-cart-more" (click)="cargarCatalogo(false)" [disabled]="buscando()">{{ 'crm.cart.more' | translate }}</button>
                }
              </div>
              <button mat-stroked-button type="button" id="btn-cart-free" (click)="agregarLibre()"><mat-icon>add</mat-icon>{{ 'crm.opp.add_free' | translate }}</button>
            </section>

            <section class="block cart" aria-labelledby="cart-h">
              <h3 id="cart-h">{{ 'crm.cart.cart' | translate }} @if (lineas().length) { <span class="muted">({{ lineas().length }})</span> }</h3>
              @for (l of lineas(); track l.key; let i = $index) {
                <div class="cl" [id]="'cart-line-' + i">
                  <div class="cl-top">
                    @if (l.id_item) {
                      <div class="cl-name"><strong>{{ l.nombre }}</strong><span class="muted small">{{ l.codigo }}{{ l.codigo && l.unidad ? ' · ' : '' }}{{ l.unidad }}</span></div>
                    } @else {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cl-name">
                        <mat-label>{{ 'crm.opp.line_desc' | translate }}</mat-label>
                        <input matInput [id]="'cart-desc-' + i" maxlength="255" [ngModel]="l.descripcion" (ngModelChange)="setLinea(l.key, { descripcion: $event })" />
                      </mat-form-field>
                    }
                    <button mat-icon-button type="button" (click)="quitar(l.key)" [attr.aria-label]="'crm.cart.remove' | translate"><mat-icon>delete</mat-icon></button>
                  </div>
                  <div class="cl-bottom">
                    <div class="qty">
                      <button mat-icon-button type="button" (click)="sumar(l.key, -1)" [disabled]="!(cant(l) > 1)" [attr.aria-label]="'crm.cart.minus' | translate"><mat-icon>remove</mat-icon></button>
                      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="qf">
                        <mat-label>{{ 'crm.opp.qty' | translate }}</mat-label>
                        <input matInput [id]="'cart-qty-' + i" inputmode="decimal" autocomplete="off" [ngModel]="l.cantidad" (ngModelChange)="setLinea(l.key, { cantidad: $event })" [attr.aria-invalid]="!(cant(l) > 0)" />
                        @if (malCant(l)) { <mat-hint class="err">{{ 'crm.cart.invalid_qty' | translate }}</mat-hint> }
                      </mat-form-field>
                      <button mat-icon-button type="button" (click)="sumar(l.key, 1)" [attr.aria-label]="'crm.cart.plus' | translate"><mat-icon>add</mat-icon></button>
                    </div>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="pf">
                      <mat-label>{{ 'crm.cart.price' | translate }}</mat-label>
                      <input matInput [id]="'cart-price-' + i" inputmode="decimal" autocomplete="off" [ngModel]="l.precio" (ngModelChange)="setLinea(l.key, { precio: $event })" [attr.aria-invalid]="!(precio(l) >= 0)" />
                      @if (malPrecio(l)) { <mat-hint class="err">{{ 'crm.cart.invalid_price' | translate }}</mat-hint> }
                    </mat-form-field>
                    <span class="cl-total">{{ cfg.money(totalLinea(l)) }}</span>
                  </div>
                </div>
              } @empty {
                <div class="empty-state"><mat-icon>shopping_cart</mat-icon><span>{{ 'crm.cart.cart_empty' | translate }}</span></div>
              }
              @if (faltante(); as f) { <p class="need small" id="cart-need"><mat-icon>info</mat-icon>{{ f | translate }}</p> }
            </section>
          </div>
        </div>
      } @else {
        <div class="review" id="sale-review">
          <dl class="head">
            <div><dt>{{ 'crm.opp.client' | translate }}</dt><dd><strong>{{ contacto()?.nombre }}</strong></dd></div>
            <div><dt>{{ 'crm.sales.date' | translate }}</dt><dd>{{ fmtFecha(fecha()) }}</dd></div>
            <div><dt>{{ 'crm.sales.document' | translate }}</dt><dd>{{ documento().trim() || ('crm.cart.no_document' | translate) }}</dd></div>
          </dl>
          <div class="table-scroll">
            <table class="t">
              <thead><tr><th>{{ 'crm.oreport.item' | translate }}</th><th class="n">{{ 'crm.opp.qty' | translate }}</th><th class="n">{{ 'crm.cart.price' | translate }}</th><th class="n">{{ 'crm.opp.total' | translate }}</th></tr></thead>
              <tbody>
                @for (l of lineas(); track l.key) {
                  <tr><td><strong>{{ l.id_item ? l.nombre : l.descripcion }}</strong>@if (l.id_item && l.codigo) { <br /><span class="muted small">{{ l.codigo }}</span> }
                    @if (!l.id_item) { <br /><span class="muted small">{{ 'crm.sales.no_item' | translate }}</span> }</td>
                    <td class="n">{{ fmtNum(cant(l)) }}{{ l.unidad ? ' ' + l.unidad : '' }}</td><td class="n">{{ cfg.money(precio(l)) }}</td><td class="n">{{ cfg.money(totalLinea(l)) }}</td></tr>
                }
              </tbody>
              <tfoot><tr><td>{{ 'crm.opp.total' | translate }}</td><td class="n">{{ fmtNum(unidades()) }}</td><td></td><td class="n" id="sale-review-total">{{ cfg.money(total()) }}</td></tr></tfoot>
            </table>
          </div>
          <p class="note"><mat-icon>flag</mat-icon><span>{{ 'crm.cart.review_note' | translate }}</span></p>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <div class="sum" id="cart-sum"><strong>{{ cfg.money(total()) }}</strong><span class="muted small">{{ 'crm.cart.summary' | translate: { n: lineas().length, u: fmtNum(unidades()) } }}</span></div>
      @if (paso() === 'carrito') {
        <button mat-button type="button" (click)="cancelar()">{{ 'common.cancel' | translate }}</button>
        <button mat-flat-button type="button" id="btn-sale-review" (click)="revisar()" [disabled]="!!faltante() || ocupado()"><mat-icon>fact_check</mat-icon>{{ 'crm.cart.review' | translate }}</button>
      } @else {
        <button mat-button type="button" id="btn-sale-back" (click)="paso.set('carrito')" [disabled]="ocupado()"><mat-icon>arrow_back</mat-icon>{{ 'crm.cart.back' | translate }}</button>
        <button mat-flat-button type="button" id="btn-sale-confirm" (click)="confirmar()" [disabled]="ocupado()"><mat-icon>check</mat-icon>{{ (ocupado() ? 'crm.cart.confirming' : 'crm.cart.confirm') | translate }}</button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; }
    .block { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); min-width: 0; }
    h3 { margin: 0; font: var(--mat-sys-title-small); color: var(--md-sys-color-on-surface-variant); }
    .row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; > * { flex: 1 1 200px; min-width: 0; } > .cat { flex: 0 1 180px; } }
    .client { display: flex; flex-direction: column; gap: 10px; }
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .pill { padding: 4px 12px; border-radius: 999px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); font: var(--mat-sys-label-large); overflow-wrap: anywhere; }
    .shop { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 14px; align-items: start; }
    .items { display: flex; flex-direction: column; gap: 4px; max-height: 360px; overflow-y: auto; }
    .it { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: 12px; cursor: pointer; text-align: left;
      background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); font: inherit;
      &:hover { background: var(--md-sys-color-surface-container-high); } &:focus-visible { outline: 2px solid var(--md-sys-color-primary); outline-offset: 1px; } }
    .it-t { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .it-p { white-space: nowrap; font: var(--mat-sys-label-large); }
    .it-add { color: var(--md-sys-color-primary); flex: none; }
    .badge { min-width: 22px; padding: 0 6px; border-radius: 999px; text-align: center; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); font: var(--mat-sys-label-medium); }
    .empty { margin: 8px 0; }
    .cl { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-top: 1px solid var(--md-sys-color-outline-variant); &:first-of-type { border-top: 0; } }
    .cl-top { display: flex; align-items: flex-start; gap: 8px; } .cl-name { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow-wrap: anywhere; }
    .cl-bottom { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; }
    .qty { display: flex; align-items: flex-start; gap: 2px; } .qf { width: 104px; } .pf { flex: 1 1 130px; min-width: 110px; }
    .cl-total { flex: 1 0 auto; align-self: center; text-align: right; font: var(--mat-sys-label-large); white-space: nowrap; }
    .err { color: var(--md-sys-color-error); }
    .need { display: flex; align-items: center; gap: 6px; margin: 4px 0 0; color: var(--md-sys-color-on-surface-variant); mat-icon { flex: none; font-size: 18px; width: 18px; height: 18px; } }
    .head { display: flex; flex-wrap: wrap; gap: 12px 32px; margin: 0 0 12px; div { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; } dt { font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); } dd { margin: 0; } }
    .t { width: 100%; border-collapse: collapse; th, td { padding: 6px 8px; border-bottom: 1px solid var(--md-sys-color-outline-variant); text-align: left; } .n { text-align: right; white-space: nowrap; }
      tfoot td { font: var(--mat-sys-title-small); border-bottom: 0; } }
    .note { display: flex; gap: 8px; align-items: flex-start; margin: 14px 0 0; padding: 10px 12px; border-radius: 12px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container);
      mat-icon { flex: none; } }
    mat-dialog-actions { gap: 8px; flex-wrap: wrap; }
    .sum { display: flex; flex-direction: column; margin-right: auto; padding-left: 8px; strong { font: var(--mat-sys-title-medium); } }
    .small { font: var(--mat-sys-body-small); }
    @media (max-width: 839px) { .shop { grid-template-columns: minmax(0, 1fr); } .items { max-height: 280px; } }
  `,
})
export class VentaManualDialogComponent {
  readonly d = inject<VentaManualDialogData | null>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private ref = inject(MatDialogRef<VentaManualDialogComponent, VentaManualDialogResult>);
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);

  readonly paso = signal<'carrito' | 'revision'>('carrito');
  readonly ocupado = signal(false);
  readonly contacto = signal<{ id: number; nombre: string } | null>(this.d.contacto ? { id: this.d.contacto.id, nombre: this.d.contacto.nombre } : null);
  readonly tipoBusqueda = signal<TipoContacto>('organizacion');
  readonly fecha = signal<string | null>(hoyIso());
  readonly documento = signal('');
  readonly lineas = signal<LineaCarrito[]>([]);
  private nextKey = 1;

  // Catálogo
  readonly qInput = signal('');
  private readonly q = signal('');
  private qTimer: ReturnType<typeof setTimeout> | null = null;
  readonly categoria = signal<number | null>(null);
  readonly categorias = signal<CategoriaItem[]>([]);
  readonly catalogo = signal<ItemCatalogo[]>([]);
  readonly totalCatalogo = signal(0);
  readonly buscando = signal(false);
  private paginaCatalogo = 0;
  private seq = 0;

  readonly total = computed(() => r2(this.lineas().reduce((s, l) => s + this.totalLinea(l), 0)));
  readonly unidades = computed(() => this.lineas().reduce((s, l) => s + (this.cant(l) > 0 ? this.cant(l) : 0), 0));
  /** Cantidad en el carrito por ítem del catálogo (para la insignia de la lista). */
  readonly enCarrito = computed(() => {
    const m = new Map<number, number>();
    for (const l of this.lineas()) if (l.id_item) m.set(l.id_item, (m.get(l.id_item) ?? 0) + (this.cant(l) > 0 ? this.cant(l) : 0));
    return m;
  });
  /** Lo primero que falta para poder revisar la venta (clave de i18n), o null. */
  readonly faltante = computed<string | null>(() => {
    if (!this.contacto()) return 'crm.cart.need_client';
    const f = this.fecha();
    if (!f) return 'crm.cart.need_date';
    if (f > hoyIso()) return 'crm.cart.need_past_date';
    const ls = this.lineas();
    if (!ls.length) return 'crm.cart.need_lines';
    if (ls.some(l => !l.id_item && !l.descripcion.trim())) return 'crm.cart.need_desc';
    if (ls.some(l => !(this.cant(l) > 0))) return 'crm.cart.need_qty';
    if (ls.some(l => !l.precio.trim())) return 'crm.cart.need_price_empty';
    if (ls.some(l => !(this.precio(l) >= 0))) return 'crm.cart.need_price';
    return null;
  });

  constructor() {
    // Cerrar con Esc o tocando fuera pasa por cancelar(): si ya hay algo en el carrito, pregunta antes de descartarlo.
    this.ref.disableClose = true;
    this.ref.backdropClick().subscribe(() => void this.cancelar());
    this.ref.keydownEvents().subscribe(e => { if (e.key === 'Escape') { e.preventDefault(); void this.cancelar(); } });
    void this.crm.listCategoriasItem(true).then(r => { if (r.action && r.data) this.categorias.set(r.data.categorias); });
    effect(() => {
      this.q(); this.categoria();
      untracked(() => void this.cargarCatalogo(true));
    });
  }

  // ─── Catálogo ──────────────────────────────────────────────────────────────────────────────────────────────────
  buscar(v: string): void {
    this.qInput.set(v);
    if (this.qTimer) clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => this.q.set(v.trim()), 250);
  }

  async cargarCatalogo(reset: boolean): Promise<void> {
    const id = ++this.seq;
    const pagina = reset ? 1 : this.paginaCatalogo + 1;
    this.buscando.set(true);
    try {
      const r = await this.crm.listItems({ q: this.q() || undefined, idCategoria: this.categoria(), soloActivos: true, pagina, porPagina: CATALOGO_POR_PAGINA });
      if (id !== this.seq || !r.action || !r.data) return;   // una búsqueda más nueva ya está en camino
      this.paginaCatalogo = pagina;
      this.catalogo.update(l => (reset ? r.data!.items : [...l, ...r.data!.items]));
      this.totalCatalogo.set(r.data.total);
    } finally {
      if (id === this.seq) this.buscando.set(false);
    }
  }

  // ─── Carrito ───────────────────────────────────────────────────────────────────────────────────────────────────
  /** Número de lo escrito, con el formato del idioma («78.000» en español = 78 000). NaN si no se entiende. */
  private leer(s: string): number { return parseNumero(s, this.i18n.lang()) ?? NaN; }
  /** Número → texto con el formato del idioma, que leer() vuelve a entender igual: «78.000», «2,5» (nunca «2.5», que en español sería otra cosa). */
  private texto(n: number): string { return this.fmtNum(n); }
  /** Aviso en el campo solo si escribieron algo que no sirve (el vacío lo señala el mensaje del carrito). */
  malCant(l: LineaCarrito): boolean { return l.cantidad.trim() !== '' && !(this.cant(l) > 0); }
  malPrecio(l: LineaCarrito): boolean { return l.precio.trim() !== '' && !(this.precio(l) >= 0); }
  cant(l: LineaCarrito): number { return this.leer(l.cantidad); }
  precio(l: LineaCarrito): number { return this.leer(l.precio); }
  totalLinea(l: LineaCarrito): number { const c = this.cant(l), p = this.precio(l); return c > 0 && p >= 0 ? r2(c * p) : 0; }

  /** Del catálogo: si el ítem ya está en el carrito, suma uno a su cantidad; si no, entra con cantidad 1 y su precio de referencia. */
  agregar(i: ItemCatalogo): void {
    const ya = this.lineas().find(l => l.id_item === i.id);
    if (ya) { this.sumar(ya.key, 1); return; }
    this.lineas.update(ls => [...ls, {
      key: this.nextKey++, id_item: i.id, nombre: i.nombre, codigo: i.codigo, unidad: i.unidad, descripcion: '', cantidad: '1',
      precio: i.precio_ref !== null ? this.texto(i.precio_ref) : '',
    }]);
  }

  agregarLibre(): void {
    const key = this.nextKey++;
    this.lineas.update(ls => [...ls, { key, id_item: null, nombre: '', codigo: null, unidad: null, descripcion: '', cantidad: '1', precio: '' }]);
    setTimeout(() => document.getElementById('cart-desc-' + (this.lineas().length - 1))?.focus());
  }

  sumar(key: number, delta: number): void {
    this.lineas.update(ls => ls.map(l => {
      if (l.key !== key) return l;
      const c = this.cant(l);
      return { ...l, cantidad: this.texto(Math.max(1, (c > 0 ? c : 0) + delta)) };
    }));
  }

  setLinea(key: number, patch: Partial<LineaCarrito>): void { this.lineas.update(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l))); }
  quitar(key: number): void { this.lineas.update(ls => ls.filter(l => l.key !== key)); }

  // ─── Revisar y confirmar ───────────────────────────────────────────────────────────────────────────────────────
  private payload(): VentaManual {
    return {
      id_contacto: this.contacto()!.id, fecha: this.fecha()!, documento: this.documento().trim(),
      lineas: this.lineas().map(l => ({ id_item: l.id_item, descripcion: l.id_item ? '' : l.descripcion.trim(), cantidad: this.cant(l), precio_unitario: this.precio(l) })),
    };
  }

  /** Valida en el servidor sin guardar (cliente activo, documento libre, {items} activos…) y pasa al resumen. */
  async revisar(): Promise<void> {
    if (this.faltante() || this.ocupado()) return;
    this.ocupado.set(true);
    try {
      const r = await this.loading.wrap(() => this.crm.saveVenta(this.payload(), true));
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.cart.error'), message: r.mensaje }); return; }
      this.paso.set('revision');
    } catch {
      await this.dialogs.error({ title: this.i18n.t('crm.cart.error'), message: this.i18n.t('common.error') });
    } finally {
      this.ocupado.set(false);
    }
  }

  async confirmar(): Promise<void> {
    if (this.faltante() || this.ocupado()) return;
    this.ocupado.set(true);
    try {
      const r = await this.loading.wrap(() => this.crm.saveVenta(this.payload()));
      if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('crm.cart.error'), message: r.mensaje }); return; }
      this.ref.close({ id: r.data.id, total: r.data.total, cliente: this.contacto()!.nombre });
    } catch {
      await this.dialogs.error({ title: this.i18n.t('crm.cart.error'), message: this.i18n.t('common.error') });
    } finally {
      this.ocupado.set(false);
    }
  }

  async cancelar(): Promise<void> {
    if (this.ocupado()) return;
    if (this.lineas().length) {
      const ok = await this.dialogs.confirm({
        title: this.i18n.t('crm.cart.discard_title'), message: this.i18n.t('crm.cart.discard_msg'), confirmText: this.i18n.t('crm.cart.discard'), danger: true,
      });
      if (!ok) return;
    }
    this.ref.close();
  }

  fmtFecha(s: string | null): string { return formatDate(s); }
  fmtNum(n: number): string { return n.toLocaleString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 4 }); }
}

/** Abre el carrito de venta manual con el tamaño estándar. */
export function abrirVentaManualDialog(matDialog: MatDialog, data: VentaManualDialogData = {}): MatDialogRef<VentaManualDialogComponent, VentaManualDialogResult> {
  return matDialog.open(VentaManualDialogComponent, { ...dialogSize('960px'), data, autoFocus: 'first-tabbable', disableClose: true });
}
