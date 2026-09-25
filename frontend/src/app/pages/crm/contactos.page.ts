import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatFormField, MatLabel, MatPrefix, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatPaginator, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { ContactoPickerComponent } from '../../components/contacto-picker.component';
import { DateInputComponent } from '../../components/date-input.component';
import { TagChipComponent } from '../../components/tag-chip.component';
import { TagPickerDialogComponent, TagPickerResult } from '../../components/tag-picker-dialog.component';
import {
  AccionLote, CampoDef, ContactoFila, CrmService, CrmTag, EstadoFiltro, FiltroCampo, Filtros, ResultadoLote, Seleccion,
  TipoContacto, UsuarioSede,
} from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { ContactoDialogComponent, ContactoDialogResult } from './contacto-dialog.component';
import { formatDate } from './crm-format';
import { TranslatedPaginatorIntl } from './translated-paginator-intl';

interface FiltroCampoUI { key: number; id_campo: number | null; op: string; valor: string; valor2: string }

const OPS: Record<string, string[]> = {
  texto: ['contiene', 'igual'],
  entero: ['=', '>', '<', '>=', '<=', 'entre'],
  decimal: ['=', '>', '<', '>=', '<=', 'entre'],
  fecha: ['=', '>', '<', '>=', '<=', 'entre'],
  booleano: ['es'],
};
const OP_KEY: Record<string, string> = {
  '=': 'eq', '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte', entre: 'between', contiene: 'contains', igual: 'equals', es: 'is',
};

/** Contactos del CRM (Personas y Organizaciones): filtros, modo selección con acciones en lote y acceso al perfil. */
@Component({
  selector: 'app-contactos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl }],
  imports: [
    FormsModule, MatButton, MatIconButton, MatCheckbox, MatFormField, MatLabel, MatPrefix, MatSuffix, MatIcon, MatInput,
    MatMenu, MatMenuItem, MatMenuTrigger, MatPaginator, MatSelect, MatOption, MatSlideToggle, MatTableModule, ContactoPickerComponent,
    DateInputComponent, TagChipComponent, TranslatePipe,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ 'crm.contacts.title' | translate }}</h1>
        <div class="actions">
          <button mat-stroked-button id="btn-select-mode" (click)="toggleSelecting()" [attr.aria-pressed]="seleccionando()">
            <mat-icon>{{ seleccionando() ? 'close' : 'checklist' }}</mat-icon>{{ (seleccionando() ? 'crm.select.cancel' : 'crm.select.mode') | translate }}
          </button>
          <button mat-flat-button id="btn-new-contact" [matMenuTriggerFor]="newMenu"><mat-icon>add</mat-icon>{{ 'crm.contacts.new' | translate }}</button>
          <mat-menu #newMenu="matMenu">
            <button mat-menu-item id="btn-new-persona" (click)="create('persona')"><mat-icon>person</mat-icon>{{ 'crm.tipo.persona' | translate }}</button>
            <button mat-menu-item id="btn-new-org" (click)="create('organizacion')"><mat-icon>business</mat-icon>{{ 'crm.tipo.organizacion' | translate }}</button>
          </mat-menu>
        </div>
      </header>

      <section class="filters" aria-label="Filtros">
        <div class="filter-main">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
            <mat-label>{{ 'crm.filters.search' | translate }}</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput id="filter-q" type="search" autocomplete="off" [placeholder]="'crm.filters.search_hint' | translate" [ngModel]="qInput()" (ngModelChange)="onSearch($event)" />
            @if (qInput()) {
              <button matSuffix mat-icon-button type="button" (click)="onSearch('')" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="narrow">
            <mat-label>{{ 'crm.filters.type' | translate }}</mat-label>
            <mat-select id="filter-tipo" [ngModel]="tipo()" (ngModelChange)="tipo.set($event)">
              <mat-option value="">{{ 'crm.filters.all' | translate }}</mat-option>
              <mat-option value="persona">{{ 'crm.tipo.personas' | translate }}</mat-option>
              <mat-option value="organizacion">{{ 'crm.tipo.organizaciones' | translate }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="narrow">
            <mat-label>{{ 'crm.filters.status' | translate }}</mat-label>
            <mat-select id="filter-estado" [ngModel]="estado()" (ngModelChange)="estado.set($event)">
              <mat-option value="activos">{{ 'crm.filters.active' | translate }}</mat-option>
              <mat-option value="archivados">{{ 'crm.filters.archived' | translate }}</mat-option>
              <mat-option value="todos">{{ 'crm.filters.all' | translate }}</mat-option>
            </mat-select>
          </mat-form-field>
          <button mat-stroked-button id="btn-more-filters" (click)="showFilters.set(!showFilters())" [attr.aria-expanded]="showFilters()">
            <mat-icon>tune</mat-icon>{{ 'crm.filters.more' | translate }}@if (moreCount()) { <span class="badge">{{ moreCount() }}</span> }
          </button>
          @if (anyFilter()) {
            <button mat-button id="btn-clear-filters" (click)="clearFilters()">{{ 'crm.filters.clear' | translate }}</button>
          }
        </div>

        @if (showFilters()) {
          <div class="filter-more" id="filters-panel">
            <div class="form-row">
              <mat-slide-toggle id="toggle-related" [checked]="relacionados()" (change)="relacionados.set($event.checked)">{{ 'crm.filters.related' | translate }}</mat-slide-toggle>
              <div class="parent-filter">
                <span class="label">{{ 'crm.filters.parent' | translate }}</span>
                @if (padre(); as p) {
                  <div class="chips">
                    <span class="pill" id="parent-filter-chip">{{ p.nombre }}</span>
                    <button mat-icon-button type="button" (click)="padre.set(null)" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button>
                  </div>
                } @else {
                  <app-contacto-picker tipo="organizacion" inputId="filter-parent" [label]="'crm.filters.parent_search' | translate"
                                       (picked)="padre.set({ id: $event.id, nombre: $event.nombre_completo })" />
                }
              </div>
            </div>
            <div class="form-row">
              <div class="tags-filter">
                <span class="label">{{ 'crm.filters.tags' | translate }}</span>
                <div class="chips">
                  @for (t of tagsSel(); track t.id) { <app-tag-chip [nombre]="t.nombre" [color]="t.color" /> }
                  <button mat-button id="btn-filter-tags" (click)="pickFilterTags()"><mat-icon>label</mat-icon>{{ 'crm.filters.pick_tags' | translate }}</button>
                </div>
                @if (tagsSel().length > 1) {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>{{ 'crm.filters.tags_mode' | translate }}</mat-label>
                    <mat-select [ngModel]="tagsModo()" (ngModelChange)="tagsModo.set($event)">
                      <mat-option value="cualquiera">{{ 'crm.filters.tags_any' | translate }}</mat-option>
                      <mat-option value="todos">{{ 'crm.filters.tags_all' | translate }}</mat-option>
                    </mat-select>
                  </mat-form-field>
                }
              </div>
            </div>
            <div class="form-row">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'crm.filters.owner' | translate }}</mat-label>
                <mat-select [ngModel]="responsable()" (ngModelChange)="responsable.set($event)">
                  <mat-option [value]="null">{{ 'crm.filters.all' | translate }}</mat-option>
                  @for (u of responsables(); track u.id) { <mat-option [value]="u.id">{{ u.nombre }}</mat-option> }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'crm.filters.created_by' | translate }}</mat-label>
                <mat-select [ngModel]="creadoPor()" (ngModelChange)="creadoPor.set($event)">
                  <mat-option [value]="null">{{ 'crm.filters.all' | translate }}</mat-option>
                  @for (u of responsables(); track u.id) { <mat-option [value]="u.id">{{ u.nombre }}</mat-option> }
                </mat-select>
              </mat-form-field>
              <app-date-input [label]="'crm.filters.created_from' | translate" [value]="desde()" (valueChange)="desde.set($event)" />
              <app-date-input [label]="'crm.filters.created_to' | translate" [value]="hasta()" (valueChange)="hasta.set($event)" />
            </div>

            <div class="cf">
              <span class="label">{{ 'crm.filters.custom' | translate }}</span>
              @for (f of camposFiltro(); track f.key) {
                <div class="cf-row">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>{{ 'crm.filters.field' | translate }}</mat-label>
                    <mat-select [ngModel]="f.id_campo" (ngModelChange)="setCampoFiltro(f.key, $event)">
                      @for (c of camposDef(); track c.id) {
                        <mat-option [value]="c.id">{{ c.etiqueta }} ({{ 'crm.tipo.' + c.aplica_a | translate }})</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  @if (f.id_campo; as idc) {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op">
                      <mat-label>{{ 'crm.filters.operator' | translate }}</mat-label>
                      <mat-select [ngModel]="f.op" (ngModelChange)="patchCampoFiltro(f.key, { op: $event })">
                        @for (o of opsFor(idc); track o) { <mat-option [value]="o">{{ 'crm.op.' + opKey(o) | translate }}</mat-option> }
                      </mat-select>
                    </mat-form-field>
                    @switch (campoTipo(idc)) {
                      @case ('fecha') {
                        <app-date-input [label]="'crm.filters.value' | translate" [value]="f.valor || null" (valueChange)="patchCampoFiltro(f.key, { valor: $event ?? '' })" />
                        @if (f.op === 'entre') {
                          <app-date-input [label]="'crm.filters.value_to' | translate" [value]="f.valor2 || null" (valueChange)="patchCampoFiltro(f.key, { valor2: $event ?? '' })" />
                        }
                      }
                      @case ('booleano') {
                        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op">
                          <mat-label>{{ 'crm.filters.value' | translate }}</mat-label>
                          <mat-select [ngModel]="f.valor" (ngModelChange)="patchCampoFiltro(f.key, { valor: $event })">
                            <mat-option value="true">{{ 'common.yes' | translate }}</mat-option>
                            <mat-option value="false">{{ 'common.no' | translate }}</mat-option>
                          </mat-select>
                        </mat-form-field>
                      }
                      @default {
                        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op">
                          <mat-label>{{ 'crm.filters.value' | translate }}</mat-label>
                          <input matInput [attr.inputmode]="campoTipo(idc) === 'texto' ? 'text' : 'decimal'" [ngModel]="f.valor" (ngModelChange)="patchCampoFiltro(f.key, { valor: $event })" />
                        </mat-form-field>
                        @if (f.op === 'entre') {
                          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op">
                            <mat-label>{{ 'crm.filters.value_to' | translate }}</mat-label>
                            <input matInput inputmode="decimal" [ngModel]="f.valor2" (ngModelChange)="patchCampoFiltro(f.key, { valor2: $event })" />
                          </mat-form-field>
                        }
                      }
                    }
                  }
                  <button mat-icon-button type="button" (click)="removeCampoFiltro(f.key)" [attr.aria-label]="'common.delete' | translate"><mat-icon>close</mat-icon></button>
                </div>
              }
              <button mat-button id="btn-add-cf" (click)="addCampoFiltro()" [disabled]="!camposDef().length">
                <mat-icon>add</mat-icon>{{ 'crm.filters.add_field' | translate }}
              </button>
            </div>
          </div>
        }
      </section>

      @if (seleccionando()) {
        <div class="select-banner" id="select-banner" role="status">
          @if (modoFiltro()) {
            <span>{{ 'crm.select.all_filter' | translate: { n: countSel() } }}</span>
            <button mat-button (click)="clearSelection()">{{ 'crm.select.clear' | translate }}</button>
          } @else if (pageAllSel() && total() > rows().length) {
            <span>{{ 'crm.select.page_selected' | translate: { n: rows().length } }}</span>
            <button mat-button id="btn-select-all-filter" (click)="selectAllFilter()">{{ 'crm.select.all_results' | translate: { n: total() } }}</button>
          } @else {
            <span>{{ 'crm.select.count' | translate: { n: countSel() } }}</span>
          }
        </div>
      }

      @if (error()) {
        <div class="empty-state">
          <mat-icon>error</mat-icon><span>{{ error() }}</span>
          <button mat-button (click)="load()">{{ 'common.retry' | translate }}</button>
        </div>
      } @else if (rows().length) {
        <div class="table-scroll">
          <table mat-table [dataSource]="rows()" id="contacts-table">
            <ng-container matColumnDef="sel">
              <th mat-header-cell *matHeaderCellDef class="col-sel">
                <mat-checkbox id="chk-all-page" [checked]="pageAllSel()" [indeterminate]="pageSomeSel() && !pageAllSel()" (change)="toggleAllPage()"
                              [aria-label]="'crm.select.page' | translate" />
              </th>
              <td mat-cell *matCellDef="let c" class="col-sel">
                <mat-checkbox [checked]="isSel(c.id)" (change)="toggleRow(c.id)" (click)="$event.stopPropagation()" [aria-label]="c.nombre_completo" />
              </td>
            </ng-container>
            <ng-container matColumnDef="nombre">
              <th mat-header-cell *matHeaderCellDef>{{ 'crm.col.name' | translate }}</th>
              <td mat-cell *matCellDef="let c">
                <div class="name">
                  <mat-icon class="kind" [attr.aria-label]="'crm.tipo.' + c.tipo | translate">{{ c.tipo === 'persona' ? 'person' : 'business' }}</mat-icon>
                  <div class="name-text">
                    <strong>{{ c.nombre_completo }}</strong>
                    <span class="muted small">{{ c.documento_numero || ('crm.col.no_doc' | translate) }}@if (!c.activo) { · <em>{{ 'crm.filters.archived_one' | translate }}</em> }</span>
                    @if (c.padre_nombre) { <span class="muted small parent-line">↳ {{ 'crm.contacts.belongs' | translate: { name: c.padre_nombre } }}</span> }
                  </div>
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="contacto">
              <th mat-header-cell *matHeaderCellDef class="hide-md">{{ 'crm.col.contact' | translate }}</th>
              <td mat-cell *matCellDef="let c" class="hide-md">
                <div class="two-lines"><span>{{ c.telefono || '—' }}</span><span class="muted small">{{ c.correo || '' }}</span></div>
              </td>
            </ng-container>
            <ng-container matColumnDef="relacion">
              <th mat-header-cell *matHeaderCellDef class="hide-md">{{ 'crm.col.related' | translate }}</th>
              <td mat-cell *matCellDef="let c" class="hide-md">
                @if (c.relacion.total) {
                  <div class="two-lines">
                    <span>{{ c.relacion.nombres.join(', ') }}</span>
                    @if (c.relacion.total > c.relacion.nombres.length) { <span class="muted small">+{{ c.relacion.total - c.relacion.nombres.length }}</span> }
                  </div>
                } @else { <span class="muted">—</span> }
              </td>
            </ng-container>
            <ng-container matColumnDef="tags">
              <th mat-header-cell *matHeaderCellDef>{{ 'crm.col.tags' | translate }}</th>
              <td mat-cell *matCellDef="let c">
                <div class="chips">
                  @for (t of c.tags.slice(0, 3); track t.id) { <app-tag-chip [nombre]="t.nombre" [color]="t.color" /> }
                  @if (c.tags.length > 3) { <span class="muted small">+{{ c.tags.length - 3 }}</span> }
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="creado">
              <th mat-header-cell *matHeaderCellDef class="hide-lg">{{ 'crm.col.created' | translate }}</th>
              <td mat-cell *matCellDef="let c" class="hide-lg">
                <div class="two-lines"><span>{{ fmtDate(c.created_at) }}</span><span class="muted small">{{ c.creado_por_nombre || '' }}</span></div>
              </td>
            </ng-container>
            <ng-container matColumnDef="acciones">
              <th mat-header-cell *matHeaderCellDef class="col-act"></th>
              <td mat-cell *matCellDef="let c" class="col-act">
                <button mat-icon-button [matMenuTriggerFor]="rowMenu" [matMenuTriggerData]="{ c }" (click)="$event.stopPropagation()" [attr.aria-label]="'common.more' | translate">
                  <mat-icon>more_vert</mat-icon>
                </button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns()"></tr>
            <tr mat-row *matRowDef="let c; columns: columns()" class="row" [class.archived]="!c.activo" [class.selected]="isSel(c.id)" (click)="open(c)"></tr>
          </table>
        </div>
        <mat-paginator [length]="total()" [pageSize]="pageSize()" [pageIndex]="page()" [pageSizeOptions]="[10, 25, 50, 100]" (page)="onPage($event)" showFirstLastButtons />
      } @else if (!loadingList()) {
        <div class="empty-state">
          <mat-icon>contacts</mat-icon>
          <strong>{{ (anyFilter() ? 'crm.contacts.empty_filtered' : 'crm.contacts.empty') | translate }}</strong>
        </div>
      }

      <mat-menu #rowMenu="matMenu">
        <ng-template matMenuContent let-c="c">
          <button mat-menu-item (click)="open(c)"><mat-icon>badge</mat-icon>{{ 'crm.action.view' | translate }}</button>
          <button mat-menu-item (click)="edit(c)"><mat-icon>edit</mat-icon>{{ 'common.edit' | translate }}</button>
          @if (canDelete()) {
            <button mat-menu-item (click)="deleteOne(c)"><mat-icon>{{ c.activo ? 'delete' : 'restore_from_trash' }}</mat-icon>{{ (c.activo ? 'crm.delete' : 'crm.restore') | translate }}</button>
          }
        </ng-template>
      </mat-menu>

      @if (seleccionando() && countSel() > 0) {
        <div class="bulk-bar" id="bulk-bar" role="toolbar" [attr.aria-label]="'crm.bulk.bar' | translate">
          <strong class="bulk-count">{{ 'crm.select.count' | translate: { n: countSel() } }}</strong>
          <button mat-button id="btn-bulk-tag" (click)="bulkTags('tags_agregar')"><mat-icon>label</mat-icon>{{ 'crm.bulk.tag' | translate }}</button>
          <button mat-button id="btn-bulk-untag" (click)="bulkTags('tags_quitar')"><mat-icon>label_off</mat-icon>{{ 'crm.bulk.untag' | translate }}</button>
          @if (canDelete()) {
            <button mat-flat-button id="btn-bulk-delete" class="danger" (click)="bulkDelete()">
              <mat-icon>{{ estado() === 'archivados' ? 'restore_from_trash' : 'delete' }}</mat-icon>{{ (estado() === 'archivados' ? 'crm.restore' : 'crm.delete') | translate }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .filters { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
    .filter-main { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .search { flex: 1 1 260px; min-width: 0; }
    .narrow { flex: 0 1 170px; }
    .badge { margin-left: 8px; padding: 0 8px; border-radius: 999px; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); font: var(--mat-sys-label-small); }
    .filter-more { display: flex; flex-direction: column; gap: 16px; padding: 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    .label { font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); }
    .parent-filter { display: flex; flex-direction: column; gap: 4px; flex: 1 1 260px; min-width: 0; }
    .pill { padding: 4px 12px; border-radius: 999px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); font: var(--mat-sys-label-large); }
    .tags-filter, .cf { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; width: 100%; }
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .cf-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; width: 100%; > mat-form-field, > app-date-input { flex: 1 1 180px; min-width: 0; } .op { flex: 0 1 150px; } }
    .select-banner {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; padding: 8px 16px; margin-bottom: 8px;
      border-radius: 12px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container);
    }
    table { width: 100%; }
    .row { cursor: pointer; &:hover { background: var(--md-sys-color-surface-container-low); } &.archived td { opacity: 0.6; } &.selected { background: var(--md-sys-color-secondary-container); } }
    .col-sel { width: 56px; padding-right: 0; }
    .col-act { width: 56px; text-align: right; }
    .name { display: flex; align-items: center; gap: 12px; min-width: 200px; padding: 8px 0; }
    .kind { flex: none; color: var(--md-sys-color-on-surface-variant); }
    .name-text, .two-lines { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
    .small { font: var(--mat-sys-body-small); }
    @media (max-width: 839px) { .hide-lg { display: none; } }
    @media (max-width: 599px) { .hide-md { display: none; } .narrow { flex: 1 1 140px; } }
    .bulk-bar {
      position: sticky; bottom: 16px; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px;
      margin: 16px auto 0; padding: 8px 16px; width: fit-content; max-width: 100%; border-radius: 20px;
      background: var(--md-sys-color-surface-container-high); color: var(--md-sys-color-on-surface);
      box-shadow: 0 4px 16px color-mix(in srgb, var(--md-sys-color-shadow) 25%, transparent); border: 1px solid var(--md-sys-color-outline-variant);
    }
    .bulk-count { margin-right: 8px; }
    .danger { --mat-button-filled-container-color: var(--md-sys-color-error); --mat-button-filled-label-text-color: var(--md-sys-color-on-error); }
  `,
})
export default class ContactosPage {
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private matDialog = inject(MatDialog);
  private router = inject(Router);
  private session = inject(SessionService);
  private i18n = inject(TranslationService);

  // ─── Filtros ───────────────────────────────────────────────────────────────────────────────────────────────────
  readonly qInput = signal('');
  private readonly q = signal('');
  private qTimer: ReturnType<typeof setTimeout> | null = null;
  readonly tipo = signal<TipoContacto | ''>('');
  readonly estado = signal<EstadoFiltro>('activos');
  readonly responsable = signal<number | null>(null);
  readonly creadoPor = signal<number | null>(null);
  readonly desde = signal<string | null>(null);
  readonly hasta = signal<string | null>(null);
  readonly tagsSel = signal<CrmTag[]>([]);
  /** Buscar también en los registros vinculados (personas de una organización y al revés). */
  readonly relacionados = signal(true);
  /** Organización a la que pertenecen los que se buscan. */
  readonly padre = signal<{ id: number; nombre: string } | null>(null);
  readonly tagsModo = signal<'cualquiera' | 'todos'>('cualquiera');
  readonly camposFiltro = signal<FiltroCampoUI[]>([]);
  private nextKey = 1;
  readonly showFilters = signal(false);

  readonly camposDef = signal<CampoDef[]>([]);
  readonly responsables = signal<UsuarioSede[]>([]);

  readonly filtros = computed<Filtros>(() => {
    const f: Filtros = { estado: this.estado() };
    if (this.q()) f.q = this.q();
    if (!this.relacionados()) f.relacionados = false;
    if (this.padre()) f.padre = this.padre()!.id;
    if (this.tipo()) f.tipo = this.tipo();
    if (this.responsable()) f.responsable = this.responsable()!;
    if (this.creadoPor()) f.creado_por = this.creadoPor()!;
    if (this.desde()) f.creado_desde = this.desde()!;
    if (this.hasta()) f.creado_hasta = this.hasta()!;
    if (this.tagsSel().length) { f.tags = this.tagsSel().map(t => t.id); f.tags_modo = this.tagsModo(); }
    const campos = this.camposFiltro().map(c => this.campoFiltroApi(c)).filter((c): c is FiltroCampo => c !== null);
    if (campos.length) f.campos = campos;
    return f;
  });
  /** Filtros del panel "Más filtros" (contador del botón). */
  readonly moreCount = computed(() => {
    const f = this.filtros();
    return [f.responsable, f.creado_por, f.creado_desde, f.creado_hasta, f.tags, f.campos, f.padre].filter(Boolean).length + (f.relacionados === false ? 1 : 0);
  });
  /** Hay algún filtro activo (búsqueda, tipo, estado distinto de Activos o los del panel). */
  readonly anyFilter = computed(() => {
    const f = this.filtros();
    return this.moreCount() > 0 || !!f.q || !!f.tipo || f.estado !== 'activos' || !!this.qInput();
  });

  // ─── Datos y paginación ────────────────────────────────────────────────────────────────────────────────────────
  readonly rows = signal<ContactoFila[]>([]);
  readonly total = signal(0);
  readonly page = signal(0);
  readonly pageSize = signal(25);
  readonly error = signal<string | null>(null);
  readonly loadingList = signal(true);
  private reqId = 0;
  private lastKey = '';

  // ─── Selección ─────────────────────────────────────────────────────────────────────────────────────────────────
  readonly seleccionando = signal(false);
  private readonly ids = signal<Set<number>>(new Set());
  readonly modoFiltro = signal(false);
  private readonly excluidos = signal<Set<number>>(new Set());
  private readonly totalEsperado = signal(0);

  readonly countSel = computed(() => (this.modoFiltro() ? this.totalEsperado() - this.excluidos().size : this.ids().size));
  readonly pageAllSel = computed(() => this.rows().length > 0 && this.rows().every(r => this.isSel(r.id)));
  readonly pageSomeSel = computed(() => this.rows().some(r => this.isSel(r.id)));
  readonly columns = computed(() => [...(this.seleccionando() ? ['sel'] : []), 'nombre', 'contacto', 'relacion', 'tags', 'creado', 'acciones']);
  readonly canDelete = computed(() => this.session.hasMinRole('L2'));

  constructor() {
    void this.loadCatalogs();
    // Recarga al cambiar cualquier filtro, el orden, el tamaño o la página. Un filtro/orden nuevo vuelve a la página 1
    // y reinicia la selección (para no operar sobre algo que el usuario ya no ve).
    effect(() => {
      const key = JSON.stringify([this.filtros(), this.pageSize()]);
      const p = this.page();
      untracked(() => {
        if (key !== this.lastKey) {
          this.lastKey = key;
          this.clearSelection();
          if (p !== 0) { this.page.set(0); return; }
        }
        void this.load();
      });
    });
  }

  private async loadCatalogs(): Promise<void> {
    const [c, u] = await Promise.all([this.crm.listCampos(true), this.crm.listResponsables()]);
    if (c.action && c.data) this.camposDef.set(c.data.campos);
    if (u.action && u.data) this.responsables.set(u.data.usuarios);
  }

  async load(): Promise<void> {
    const id = ++this.reqId;
    this.error.set(null);
    this.loadingList.set(true);
    try {
      const r = await this.loading.wrap(() => this.crm.listContactos(this.filtros(), this.page() + 1, this.pageSize(), 'nombre', 'asc'));
      if (id !== this.reqId) return;   // respuesta vieja: ya hay otra en camino
      if (r.action && r.data) { this.rows.set(r.data.contactos); this.total.set(r.data.total); }
      else this.error.set(r.mensaje);
    } catch {
      if (id === this.reqId) this.error.set(this.i18n.t('common.error'));
    } finally {
      if (id === this.reqId) this.loadingList.set(false);
    }
  }

  onSearch(v: string): void {
    this.qInput.set(v);
    if (this.qTimer) clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => this.q.set(v.trim()), 300);
  }

  onPage(e: PageEvent): void {
    this.pageSize.set(e.pageSize);
    this.page.set(e.pageIndex);
  }

  clearFilters(): void {
    this.qInput.set(''); this.q.set('');
    this.tipo.set(''); this.estado.set('activos'); this.responsable.set(null); this.creadoPor.set(null);
    this.relacionados.set(true); this.padre.set(null);
    this.desde.set(null); this.hasta.set(null); this.tagsSel.set([]); this.tagsModo.set('cualquiera'); this.camposFiltro.set([]);
  }

  pickFilterTags(): void {
    this.matDialog.open(TagPickerDialogComponent, {
      ...dialogSize('480px'), data: { seleccion: this.tagsSel().map(t => t.id), actuales: this.tagsSel(), tipo: null },
    }).afterClosed().subscribe((r: TagPickerResult | undefined) => { if (r) this.tagsSel.set(r.tags); });
  }

  // ─── Filtros por campo personalizado ───────────────────────────────────────────────────────────────────────────
  campoTipo(id: number): string | undefined { return this.camposDef().find(c => c.id === id)?.tipo_dato; }
  opsFor(id: number): string[] { return OPS[this.campoTipo(id) ?? 'texto']; }
  opKey(op: string): string { return OP_KEY[op] ?? op; }

  addCampoFiltro(): void {
    this.camposFiltro.update(l => [...l, { key: this.nextKey++, id_campo: null, op: '', valor: '', valor2: '' }]);
  }
  removeCampoFiltro(key: number): void {
    this.camposFiltro.update(l => l.filter(f => f.key !== key));
  }
  setCampoFiltro(key: number, idCampo: number): void {
    const op = OPS[this.campoTipo(idCampo) ?? 'texto'][0];
    this.patchCampoFiltro(key, { id_campo: idCampo, op, valor: '', valor2: '' });
  }
  patchCampoFiltro(key: number, patch: Partial<FiltroCampoUI>): void {
    this.camposFiltro.update(l => l.map(f => (f.key === key ? { ...f, ...patch } : f)));
  }

  /** Fila de la UI → filtro del API (null si está incompleta). */
  private campoFiltroApi(f: FiltroCampoUI): FiltroCampo | null {
    if (!f.id_campo || !f.op || !f.valor.trim()) return null;
    if (f.op === 'entre' && !f.valor2.trim()) return null;
    const t = this.campoTipo(f.id_campo);
    const conv = (v: string) => (t === 'entero' ? Number(v) : t === 'booleano' ? v === 'true' : v.trim());
    return { id_campo: f.id_campo, op: f.op, valor: conv(f.valor), ...(f.op === 'entre' ? { valor2: conv(f.valor2) } : {}) };
  }

  fmtDate(sql: string): string { return formatDate(sql); }

  // ─── Selección ─────────────────────────────────────────────────────────────────────────────────────────────────
  toggleSelecting(): void {
    if (this.seleccionando()) this.clearSelection();
    this.seleccionando.update(v => !v);
  }

  isSel(id: number): boolean {
    return this.modoFiltro() ? !this.excluidos().has(id) : this.ids().has(id);
  }

  toggleRow(id: number): void {
    const set = this.modoFiltro() ? this.excluidos : this.ids;
    set.update(s => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  }

  toggleAllPage(): void {
    const marcar = !this.pageAllSel();
    const enFiltro = this.modoFiltro();
    // En modo filtro "marcado" = no excluido; en modo ids "marcado" = incluido.
    const set = enFiltro ? this.excluidos : this.ids;
    const agregar = enFiltro ? !marcar : marcar;
    set.update(s => {
      const n = new Set(s);
      for (const r of this.rows()) { if (agregar) n.add(r.id); else n.delete(r.id); }
      return n;
    });
  }

  selectAllFilter(): void {
    this.totalEsperado.set(this.total());
    this.excluidos.set(new Set());
    this.modoFiltro.set(true);
  }

  clearSelection(): void {
    this.ids.set(new Set());
    this.excluidos.set(new Set());
    this.modoFiltro.set(false);
    this.totalEsperado.set(0);
  }

  private seleccion(): Seleccion {
    return this.modoFiltro()
      ? { filtros: this.filtros(), excluidos: [...this.excluidos()], total_esperado: this.totalEsperado() }
      : { ids: [...this.ids()] };
  }

  // ─── Acciones sobre contactos ──────────────────────────────────────────────────────────────────────────────────
  create(tipo: TipoContacto): void {
    this.openForm({ tipo });
  }

  edit(c: ContactoFila): void {
    this.openForm({ id: c.id });
  }

  private openForm(data: { id?: number; tipo?: TipoContacto }): void {
    this.matDialog.open(ContactoDialogComponent, { ...dialogSize('720px'), data, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(async (r: ContactoDialogResult | undefined) => {
        if (!r) return;
        await this.load();
        const dup = r.advertencias?.find(a => a.tipo === 'documento_duplicado');
        if (dup) {
          await this.dialogs.info({
            title: this.i18n.t('crm.warn.dup_title'),
            message: this.i18n.t('crm.warn.dup_msg', { names: dup.contactos.map(c => c.nombre_completo).join(', ') }),
          });
        }
      });
  }

  open(c: ContactoFila): void {
    if (this.seleccionando()) { this.toggleRow(c.id); return; }
    void this.router.navigate(['/m/crm/contactos', c.id]);
  }

  async deleteOne(c: ContactoFila): Promise<void> {
    const archivar = c.activo;
    const ok = await this.dialogs.confirm({
      title: this.i18n.t(archivar ? 'crm.delete_one_title' : 'crm.restore_one_title'),
      message: this.i18n.t(archivar ? 'crm.delete_one_msg' : 'crm.restore_one_msg', { name: c.nombre_completo }),
      confirmText: this.i18n.t(archivar ? 'crm.delete' : 'crm.restore'), danger: archivar,
    });
    if (!ok) return;
    await this.runBulk(archivar ? 'archivar' : 'restaurar', { ids: [c.id] });
  }

  async bulkDelete(): Promise<void> {
    const n = this.countSel();
    const restaurar = this.estado() === 'archivados';
    const ok = await this.dialogs.confirm({
      title: this.i18n.t(restaurar ? 'crm.bulk.restore_title' : 'crm.bulk.delete_title', { n }),
      message: this.i18n.t(restaurar ? 'crm.bulk.restore_msg' : 'crm.bulk.delete_msg', { n }),
      confirmText: this.i18n.t(restaurar ? 'crm.restore' : 'crm.delete'), danger: !restaurar,
      // Más de 5: hay que escribir la palabra (evita borrados masivos por un clic).
      confirmWord: !restaurar && n > 5 ? this.i18n.t('crm.bulk.delete_word') : undefined,
    });
    if (ok) await this.runBulk(restaurar ? 'restaurar' : 'archivar', this.seleccion());
  }

  bulkTags(accion: 'tags_agregar' | 'tags_quitar'): void {
    const agregar = accion === 'tags_agregar';
    this.matDialog.open(TagPickerDialogComponent, {
      ...dialogSize('480px'),
      data: { tipo: null, title: this.i18n.t(agregar ? 'crm.bulk.tag_title' : 'crm.bulk.untag_title'), confirmText: this.i18n.t('crm.bulk.continue') },
    }).afterClosed().subscribe(async (r: TagPickerResult | undefined) => {
      if (!r?.ids.length) return;
      const ok = await this.dialogs.confirm({
        title: this.i18n.t(agregar ? 'crm.bulk.tag_confirm_title' : 'crm.bulk.untag_confirm_title'),
        message: this.i18n.t(agregar ? 'crm.bulk.tag_confirm_msg' : 'crm.bulk.untag_confirm_msg', { tags: r.tags.map(t => `«${t.nombre}»`).join(', '), n: this.countSel() }),
        confirmText: this.i18n.t('crm.bulk.apply'),
      });
      if (ok) await this.runBulk(accion, this.seleccion(), r.ids);
    });
  }

  private async runBulk(accion: AccionLote, seleccion: Seleccion, tagIds?: number[]): Promise<void> {
    try {
      const r = await this.loading.wrap(() => this.crm.bulk(accion, seleccion, tagIds));
      if (!r.action || !r.data) {
        await this.dialogs.error({ title: this.i18n.t('crm.bulk.error'), message: r.mensaje });
      } else {
        await this.dialogs.info({ title: this.i18n.t('crm.bulk.done_title'), message: this.resumen(accion, r.data) });
      }
    } catch {
      await this.dialogs.error({ title: this.i18n.t('crm.bulk.error'), message: this.i18n.t('common.error') });
    }
    this.clearSelection();
    await this.load();
  }

  /** "118 etiquetados. 4 omitidos: «Alérgico» solo aplica a personas (2)…" */
  private resumen(accion: AccionLote, r: ResultadoLote): string {
    const lineas = [this.i18n.t(`crm.bulk.done_${accion}`, { n: r.procesados })];
    if (r.sin_cambios) lineas.push(this.i18n.t('crm.bulk.unchanged', { n: r.sin_cambios }));
    const porTag = new Map<string, number>();
    let noEncontrados = 0;
    for (const o of r.omitidos) {
      if (o.motivo === 'tag_no_aplica') porTag.set(o.tag ?? '', (porTag.get(o.tag ?? '') ?? 0) + 1);
      else noEncontrados++;
    }
    for (const [tag, n] of porTag) lineas.push(this.i18n.t('crm.bulk.skip_scope', { tag, n }));
    if (noEncontrados) lineas.push(this.i18n.t('crm.bulk.skip_missing', { n: noEncontrados }));
    return lineas.join('\n');
  }
}
