import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { TagChipComponent } from '../../components/tag-chip.component';
import { CrmConfigService } from '../../services/crm-config.service';
import { ColumnaTablero, Etapa, OportunidadFila } from '../../services/crm.service';
import { TranslatePipe } from '../../services/translation.service';
import { formatDate, initials } from './crm-format';
import { hoyIso } from './oportunidad-cierre-dialog.component';

export interface MoverEvento { oportunidad: OportunidadFila; etapa: Etapa }

/**
 * Tablero de oportunidades: una columna por etapa del embudo con su conteo y valor, tarjetas que se arrastran de una columna a otra
 * (CDK; en pantallas táctiles con una pulsación larga) y un menú «Mover a…» como alternativa accesible. Una ganada lleva el botón de carrito
 * («Registrar venta», L2+) o, si ya tiene su venta, «Ver venta». No guarda nada: emite lo pedido.
 */
@Component({
  selector: 'app-oportunidades-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, MatButton, MatIconButton, MatIcon, MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger, TagChipComponent, TranslatePipe],
  template: `
    <div class="board" cdkDropListGroup id="board">
      @for (col of columnas(); track col.etapa.id) {
        <section class="col" [id]="'col-' + col.etapa.id" [class.off]="!col.etapa.activo">
          <header>
            <span class="dot" [style.background]="col.etapa.color || 'var(--md-sys-color-outline)'"></span>
            <strong class="ename">{{ col.etapa.nombre }}</strong>
            <span class="count">{{ col.total }}</span>
          </header>
          <div class="sums">
            <span>{{ cfg.money(col.valor) }}</span>
            @if (col.etapa.tipo === 'abierta' && col.etapa.probabilidad < 100) {
              <span class="muted" [title]="'crm.opp.weighted_hint' | translate: { p: col.etapa.probabilidad }">≈ {{ cfg.money(col.ponderado) }} · {{ col.etapa.probabilidad }} %</span>
            }
          </div>
          <div class="list" cdkDropList [cdkDropListData]="col" (cdkDropListDropped)="soltar($event)">
            @for (o of col.oportunidades; track o.id) {
              <article class="card" cdkDrag [cdkDragData]="o" [cdkDragStartDelay]="{ touch: 220, mouse: 0 }" [id]="'card-' + o.id" (click)="abrir.emit(o)" (keydown.enter)="abrir.emit(o)" tabindex="0">
                <div class="top">
                  <strong class="title">{{ o.titulo }}</strong>
                  <button mat-icon-button class="kebab" [matMenuTriggerFor]="menu" [matMenuTriggerData]="{ o }" (click)="$event.stopPropagation()" [attr.aria-label]="'common.more' | translate"><mat-icon>more_vert</mat-icon></button>
                </div>
                <span class="who"><mat-icon>{{ o.contacto_tipo === 'persona' ? 'person' : 'business' }}</mat-icon>{{ o.contacto_nombre }}</span>
                <span class="value">{{ cfg.money(o.valor) }}</span>
                <div class="foot">
                  @if (o.fecha_cierre_estimada) { <span class="chip" [class.late]="atrasada(o)"><mat-icon>event</mat-icon>{{ fecha(o.fecha_cierre_estimada) }}</span> }
                  <span class="end">
                    @if (o.id_venta) {
                      <button mat-icon-button class="sale done" [id]="'btn-view-sale-' + o.id" (click)="$event.stopPropagation(); verVenta.emit(o)" (keydown.enter)="$event.stopPropagation()"
                              [title]="'crm.opp.view_sale' | translate" [attr.aria-label]="'crm.opp.view_sale' | translate"><mat-icon>receipt_long</mat-icon></button>
                    } @else if (puedeVender() && o.estado === 'ganada' && o.activo) {
                      <button mat-icon-button class="sale" [id]="'btn-sale-' + o.id" (click)="$event.stopPropagation(); registrarVenta.emit(o)" (keydown.enter)="$event.stopPropagation()"
                              [title]="'crm.opp.register_sale' | translate" [attr.aria-label]="'crm.opp.register_sale' | translate"><mat-icon>add_shopping_cart</mat-icon></button>
                    }
                    @if (o.responsable_nombre) { <span class="avatar" [title]="o.responsable_nombre">{{ iniciales(o.responsable_nombre) }}</span> }
                  </span>
                </div>
                @if (o.tags.length) { <div class="tags">@for (t of o.tags.slice(0, 2); track t.id) { <app-tag-chip [nombre]="t.nombre" [color]="t.color" /> }</div> }
              </article>
            } @empty { <span class="empty muted">{{ 'crm.opp.col_empty' | translate }}</span> }
            @if (col.hay_mas) { <button mat-button class="more" (click)="verMas.emit(col)">{{ 'crm.opp.see_more' | translate: { n: col.total - col.oportunidades.length } }}</button> }
          </div>
        </section>
      }
    </div>

    <mat-menu #menu="matMenu">
      <ng-template matMenuContent let-o="o">
        <button mat-menu-item (click)="abrir.emit(o)"><mat-icon>open_in_new</mat-icon>{{ 'crm.action.view' | translate }}</button>
        <button mat-menu-item (click)="editar.emit(o)"><mat-icon>edit</mat-icon>{{ 'common.edit' | translate }}</button>
        @if (o.id_venta) { <button mat-menu-item (click)="verVenta.emit(o)"><mat-icon>receipt_long</mat-icon>{{ 'crm.opp.view_sale' | translate }}</button> }
        @else if (puedeVender() && o.estado === 'ganada' && o.activo) { <button mat-menu-item (click)="registrarVenta.emit(o)"><mat-icon>add_shopping_cart</mat-icon>{{ 'crm.opp.register_sale' | translate }}</button> }
        <div class="menu-title" role="presentation">{{ 'crm.opp.move_to' | translate }}</div>
        @for (col of columnas(); track col.etapa.id) {
          @if (col.etapa.id !== o.id_etapa && col.etapa.activo) {
            <button mat-menu-item (click)="mover.emit({ oportunidad: o, etapa: col.etapa })"><mat-icon [style.color]="col.etapa.color || null">circle</mat-icon>{{ col.etapa.nombre }}</button>
          }
        }
      </ng-template>
    </mat-menu>
  `,
  styles: `
    .board { display: flex; gap: 12px; overflow-x: auto; padding: 4px 0 12px; align-items: flex-start; scroll-snap-type: x proximity; }
    .col { flex: 0 0 290px; scroll-snap-align: start; display: flex; flex-direction: column; gap: 4px; padding: 10px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); &.off { opacity: 0.7; } }
    header { display: flex; align-items: center; gap: 8px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
    .ename { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .count { padding: 0 8px; border-radius: 999px; background: var(--md-sys-color-surface-container-highest); font: var(--mat-sys-label-medium); }
    .sums { display: flex; flex-direction: column; font: var(--mat-sys-label-large); .muted { font: var(--mat-sys-body-small); } }
    .list { display: flex; flex-direction: column; gap: 8px; min-height: 72px; max-height: calc(100vh - 380px); overflow-y: auto; padding: 4px 2px; }
    .card { display: flex; flex-direction: column; gap: 4px; padding: 10px 10px 8px; border-radius: 12px; cursor: grab; background: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-outline-variant); &:hover, &:focus-visible { border-color: var(--md-sys-color-primary); outline: none; } }
    .top { display: flex; align-items: flex-start; gap: 4px; }
    .title { flex: 1; min-width: 0; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .kebab { flex: none; margin: -8px -8px 0 0; }
    .who { display: flex; align-items: center; gap: 4px; font: var(--mat-sys-body-small); color: var(--md-sys-color-on-surface-variant); min-width: 0; overflow-wrap: anywhere; mat-icon { font-size: 16px; width: 16px; height: 16px; flex: none; } }
    .value { font: var(--mat-sys-title-small); }
    .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .chip { display: inline-flex; align-items: center; gap: 2px; font: var(--mat-sys-label-small); color: var(--md-sys-color-on-surface-variant); mat-icon { font-size: 14px; width: 14px; height: 14px; } &.late { color: var(--md-sys-color-error); } }
    .end { display: flex; align-items: center; gap: 4px; margin-left: auto; }
    .sale { margin: -8px -4px -8px 0; color: var(--md-sys-color-primary); &.done { color: var(--md-sys-color-tertiary); } }
    .avatar { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font: var(--mat-sys-label-small); background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .empty { padding: 12px 4px; font: var(--mat-sys-body-small); }
    .more { align-self: center; }
    .menu-title { padding: 10px 16px 4px; font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); }
    .cdk-drag-preview { border-radius: 12px; box-shadow: 0 6px 20px color-mix(in srgb, var(--md-sys-color-shadow) 30%, transparent); }
    .cdk-drag-placeholder { opacity: 0.35; }
    .cdk-drag-animating { transition: transform 200ms cubic-bezier(0, 0, 0.2, 1); }
    @media (max-width: 599px) { .col { flex-basis: 84vw; } .list { max-height: none; } }
  `,
})
export class OportunidadesBoardComponent {
  readonly cfg = inject(CrmConfigService);

  readonly columnas = input.required<ColumnaTablero[]>();
  readonly abrir = output<OportunidadFila>();
  readonly editar = output<OportunidadFila>();
  readonly mover = output<MoverEvento>();
  readonly verMas = output<ColumnaTablero>();
  /** L2+: puede registrar la venta de una oportunidad ganada. */
  readonly puedeVender = input(false);
  readonly registrarVenta = output<OportunidadFila>();
  readonly verVenta = output<OportunidadFila>();

  soltar(e: CdkDragDrop<ColumnaTablero, ColumnaTablero, OportunidadFila>): void {
    if (e.previousContainer === e.container) return;   // el orden dentro de una columna es automático (por valor)
    this.mover.emit({ oportunidad: e.item.data, etapa: e.container.data.etapa });
  }

  fecha(iso: string): string { return formatDate(iso); }
  iniciales(n: string): string { return initials(n); }
  /** Una oportunidad abierta cuya fecha de cierre estimada ya pasó. */
  atrasada(o: OportunidadFila): boolean { return o.estado === 'abierta' && !!o.fecha_cierre_estimada && o.fecha_cierre_estimada < hoyIso(); }
}
