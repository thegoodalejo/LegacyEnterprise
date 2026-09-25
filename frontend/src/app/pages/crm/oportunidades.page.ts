import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatFormField, MatLabel, MatPrefix, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatPaginator, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { firstValueFrom } from 'rxjs';
import { ContactoPickerComponent } from '../../components/contacto-picker.component';
import { DateInputComponent } from '../../components/date-input.component';
import { ExportAlcance, ExportMenuComponent, ExportSolicitud } from '../../components/export-menu.component';
import { TagChipComponent } from '../../components/tag-chip.component';
import { TagPickerDialogComponent, TagPickerResult } from '../../components/tag-picker-dialog.component';
import { CrmConfigService } from '../../services/crm-config.service';
import { CrmOppReportService } from '../../services/crm-opp-report.service';
import { ejecutarExportacion } from '../../services/crm-report.service';
import {
  AccionLote, CampoDef, ColumnaTablero, CrmService, CrmTag, Embudo, Etapa, FiltroCampo, FiltrosOp, ListaOportunidades, OportunidadFila, OrdenOp,
  ResultadoLote, SeleccionOp, SeleccionOpExport, Tablero, UsuarioSede,
} from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDate } from './crm-format';
import { OportunidadCierreDialogComponent, CierreDialogResult, hoyIso } from './oportunidad-cierre-dialog.component';
import { abrirOportunidadDialog } from './oportunidad-dialog.component';
import { MetasPanelComponent } from './metas-panel.component';
import { MoverEvento, OportunidadesBoardComponent } from './oportunidades-board.component';
import { TranslatedPaginatorIntl } from './translated-paginator-intl';

type Vista = 'tablero' | 'lista';
type EstadoUI = '' | 'abiertas' | 'ganadas' | 'perdidas';
interface FiltroCampoUI { key: number; id_campo: number | null; op: string; valor: string; valor2: string }

const OPS: Record<string, string[]> = {
  texto: ['contiene', 'igual'], entero: ['=', '>', '<', '>=', '<=', 'entre'], decimal: ['=', '>', '<', '>=', '<=', 'entre'],
  fecha: ['=', '>', '<', '>=', '<=', 'entre'], booleano: ['es'],
};
const OP_KEY: Record<string, string> = { '=': 'eq', '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte', entre: 'between', contiene: 'contains', igual: 'equals', es: 'is' };
const VISTA_KEY = 'crm_opp_vista';

/** Oportunidades del CRM: tablero por etapas del embudo o lista, con filtros, resumen, acciones en lote y acceso a la ficha. */
@Component({
  selector: 'app-oportunidades-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl }],
  imports: [
    FormsModule, RouterLink, MatButton, MatIconButton, MatButtonToggleGroup, MatButtonToggle, MatCheckbox, MatFormField, MatLabel, MatPrefix, MatSuffix, MatIcon, MatInput,
    MatMenu, MatMenuItem, MatMenuTrigger, MatPaginator, MatSelect, MatOption, MatSlideToggle, MatTableModule, ContactoPickerComponent, DateInputComponent, ExportMenuComponent, TagChipComponent,
    OportunidadesBoardComponent, MetasPanelComponent, TranslatePipe,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ 'crm.opp.title' | translate }}</h1>
        <div class="actions">
          <mat-button-toggle-group id="vista-toggle" [value]="vista()" (change)="setVista($event.value)" hideSingleSelectionIndicator [attr.aria-label]="'crm.opp.view' | translate">
            <mat-button-toggle value="tablero" id="vista-tablero"><mat-icon>view_kanban</mat-icon>{{ 'crm.opp.view_board' | translate }}</mat-button-toggle>
            <mat-button-toggle value="lista" id="vista-lista"><mat-icon>view_list</mat-icon>{{ 'crm.opp.view_list' | translate }}</mat-button-toggle>
          </mat-button-toggle-group>
          @if (!sinEmbudo()) { <app-export-menu [alcances]="exportAlcances()" [disabled]="!totalVisible()" (exportar)="exportar($event)" /> }
          @if (vista() === 'lista') {
            <button mat-stroked-button id="btn-select-mode" (click)="toggleSelecting()" [attr.aria-pressed]="seleccionando()">
              <mat-icon>{{ seleccionando() ? 'close' : 'checklist' }}</mat-icon>{{ (seleccionando() ? 'crm.select.cancel' : 'crm.select.mode') | translate }}
            </button>
          }
          <button mat-flat-button id="btn-new-op" (click)="crear()" [disabled]="sinEmbudo()"><mat-icon>add</mat-icon>{{ 'crm.opp.new' | translate }}</button>
        </div>
      </header>

      <!-- Metas vigentes hoy (empresa, sede y organizaciones), plegable. -->
      <app-metas-panel [compacto]="true" [editable]="esAdmin()" />

      @if (sinEmbudo()) {
        <div class="empty-state" id="sin-embudo">
          <mat-icon>filter_alt_off</mat-icon>
          <strong>{{ 'crm.opp.no_funnel' | translate }}</strong>
          @if (esAdmin()) { <a mat-flat-button routerLink="/m/crm/configuracion">{{ 'crm.opp.go_config' | translate }}</a> }
          @else { <span class="muted">{{ 'crm.opp.no_funnel_user' | translate }}</span> }
        </div>
      } @else {
        <section class="filters" aria-label="Filtros">
          <div class="filter-main">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
              <mat-label>{{ 'crm.filters.search' | translate }}</mat-label>
              <mat-icon matPrefix>search</mat-icon>
              <input matInput id="filter-q" type="search" autocomplete="off" [placeholder]="'crm.opp.search_hint' | translate" [ngModel]="qInput()" (ngModelChange)="onSearch($event)" />
              @if (qInput()) { <button matSuffix mat-icon-button type="button" (click)="onSearch('')" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button> }
            </mat-form-field>
            @if (embudos().length > 1) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="narrow">
                <mat-label>{{ 'crm.opp.funnel' | translate }}</mat-label>
                <mat-select id="filter-embudo" [ngModel]="idEmbudo()" (ngModelChange)="idEmbudo.set($event)">
                  @for (e of embudos(); track e.id) { <mat-option [value]="e.id">{{ e.nombre }}</mat-option> }
                </mat-select>
              </mat-form-field>
            }
            @if (vista() === 'lista') {
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="narrow">
                <mat-label>{{ 'crm.opp.status' | translate }}</mat-label>
                <mat-select id="filter-estado" [ngModel]="estado()" (ngModelChange)="estado.set($event)">
                  <mat-option value="">{{ 'crm.filters.all' | translate }}</mat-option>
                  <mat-option value="abiertas">{{ 'crm.opp.status_abiertas' | translate }}</mat-option>
                  <mat-option value="ganadas">{{ 'crm.opp.status_ganadas' | translate }}</mat-option>
                  <mat-option value="perdidas">{{ 'crm.opp.status_perdidas' | translate }}</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="narrow">
                <mat-label>{{ 'crm.opp.sort' | translate }}</mat-label>
                <mat-select id="filter-orden" [ngModel]="orden()" (ngModelChange)="orden.set($event)">
                  @for (o of ordenes; track o) { <mat-option [value]="o">{{ 'crm.opp.sort_' + o | translate }}</mat-option> }
                </mat-select>
              </mat-form-field>
              <button mat-icon-button id="btn-dir" (click)="dir.set(dir() === 'asc' ? 'desc' : 'asc')" [attr.aria-label]="'crm.opp.sort_dir' | translate"><mat-icon>{{ dir() === 'asc' ? 'arrow_upward' : 'arrow_downward' }}</mat-icon></button>
            }
            <button mat-stroked-button id="btn-more-filters" (click)="showFilters.set(!showFilters())" [attr.aria-expanded]="showFilters()">
              <mat-icon>tune</mat-icon>{{ 'crm.filters.more' | translate }}@if (moreCount()) { <span class="badge">{{ moreCount() }}</span> }
            </button>
            @if (anyFilter()) { <button mat-button id="btn-clear-filters" (click)="clearFilters()">{{ 'crm.filters.clear' | translate }}</button> }
          </div>

          @if (showFilters()) {
            <div class="filter-more" id="filters-panel">
              <div class="form-row">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>{{ 'crm.filters.owner' | translate }}</mat-label>
                  <mat-select [ngModel]="responsable()" (ngModelChange)="responsable.set($event)">
                    <mat-option [value]="null">{{ 'crm.filters.all' | translate }}</mat-option>
                    @for (u of responsables(); track u.id) { <mat-option [value]="u.id">{{ u.nombre }}</mat-option> }
                  </mat-select>
                </mat-form-field>
                <app-date-input [label]="'crm.opp.close_from' | translate" [value]="cierreDesde()" (valueChange)="cierreDesde.set($event)" />
                <app-date-input [label]="'crm.opp.close_to' | translate" [value]="cierreHasta()" (valueChange)="cierreHasta.set($event)" />
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>{{ 'crm.opp.value_min' | translate }}</mat-label>
                  <input matInput inputmode="decimal" [ngModel]="valorMin()" (ngModelChange)="valorMin.set($event)" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>{{ 'crm.opp.value_max' | translate }}</mat-label>
                  <input matInput inputmode="decimal" [ngModel]="valorMax()" (ngModelChange)="valorMax.set($event)" />
                </mat-form-field>
              </div>
              <div class="form-row">
                <div class="client-filter">
                  <span class="label">{{ 'crm.opp.client' | translate }}</span>
                  @if (cliente(); as c) {
                    <div class="chips"><span class="pill" id="client-filter-chip">{{ c.nombre }}</span>
                      <button mat-icon-button type="button" (click)="cliente.set(null)" [attr.aria-label]="'common.clear' | translate"><mat-icon>close</mat-icon></button></div>
                  } @else {
                    <app-contacto-picker tipo="organizacion" inputId="filter-client" [label]="'crm.opp.client_search' | translate" (picked)="cliente.set({ id: $event.id, nombre: $event.nombre_completo })" />
                  }
                </div>
                <div class="tags-filter">
                  <span class="label">{{ 'crm.filters.tags' | translate }}</span>
                  <div class="chips">
                    @for (t of tagsSel(); track t.id) { <app-tag-chip [nombre]="t.nombre" [color]="t.color" /> }
                    <button mat-button id="btn-filter-tags" (click)="pickFilterTags()"><mat-icon>label</mat-icon>{{ 'crm.filters.pick_tags' | translate }}</button>
                  </div>
                </div>
                <mat-slide-toggle id="toggle-archived" [checked]="archivo() === 'archivadas'" (change)="archivo.set($event.checked ? 'archivadas' : 'activas')">{{ 'crm.opp.archived' | translate }}</mat-slide-toggle>
              </div>
              <div class="cf">
                <span class="label">{{ 'crm.filters.custom' | translate }}</span>
                @for (f of camposFiltro(); track f.key) {
                  <div class="cf-row">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ 'crm.filters.field' | translate }}</mat-label>
                      <mat-select [ngModel]="f.id_campo" (ngModelChange)="setCampoFiltro(f.key, $event)">
                        @for (c of camposDef(); track c.id) { <mat-option [value]="c.id">{{ c.etiqueta }}</mat-option> }
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
                          @if (f.op === 'entre') { <app-date-input [label]="'crm.filters.value_to' | translate" [value]="f.valor2 || null" (valueChange)="patchCampoFiltro(f.key, { valor2: $event ?? '' })" /> }
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
                <button mat-button id="btn-add-cf" (click)="addCampoFiltro()" [disabled]="!camposDef().length"><mat-icon>add</mat-icon>{{ 'crm.filters.add_field' | translate }}</button>
              </div>
            </div>
          }
        </section>

        @if (resumen(); as r) {
          <div class="kpis" id="kpis">
            <span class="kpi"><b>{{ r.abierta.n }}</b> {{ 'crm.opp.kpi_open' | translate }} · {{ cfg.money(r.abierta.valor) }}</span>
            <span class="kpi"><b>{{ cfg.money(r.abierta.ponderado) }}</b> {{ 'crm.opp.kpi_weighted' | translate }}</span>
            <span class="kpi won"><b>{{ r.ganada.n }}</b> {{ 'crm.opp.kpi_won' | translate }} · {{ cfg.money(r.ganada.valor) }}</span>
            <span class="kpi lost"><b>{{ r.perdida.n }}</b> {{ 'crm.opp.kpi_lost' | translate }}</span>
          </div>
        }

        @if (error()) {
          <div class="empty-state"><mat-icon>error</mat-icon><span>{{ error() }}</span><button mat-button (click)="load()">{{ 'common.retry' | translate }}</button></div>
        } @else if (vista() === 'tablero') {
          @if (tablero(); as t) {
            @if (t.columnas.length) {
              <app-oportunidades-board [columnas]="t.columnas" (abrir)="abrir($event)" (editar)="editar($event)" (mover)="onMover($event)" (verMas)="verMasColumna($event)" />
            }
          }
        } @else {
          @if (seleccionando()) {
            <div class="select-banner" id="select-banner" role="status">
              @if (modoFiltro()) {
                <span>{{ 'crm.select.all_filter' | translate: { n: countSel() } }}</span>
                <button mat-button (click)="clearSelection()">{{ 'crm.select.clear' | translate }}</button>
              } @else if (pageAllSel() && total() > rows().length) {
                <span>{{ 'crm.select.page_selected' | translate: { n: rows().length } }}</span>
                <button mat-button id="btn-select-all-filter" (click)="selectAllFilter()">{{ 'crm.select.all_results' | translate: { n: total() } }}</button>
              } @else { <span>{{ 'crm.select.count' | translate: { n: countSel() } }}</span> }
            </div>
          }
          @if (rows().length) {
            <div class="table-scroll">
              <table mat-table [dataSource]="rows()" id="opps-table">
                <ng-container matColumnDef="sel">
                  <th mat-header-cell *matHeaderCellDef class="col-sel"><mat-checkbox id="chk-all-page" [checked]="pageAllSel()" [indeterminate]="pageSomeSel() && !pageAllSel()" (change)="toggleAllPage()" [aria-label]="'crm.select.page' | translate" /></th>
                  <td mat-cell *matCellDef="let o" class="col-sel"><mat-checkbox [checked]="isSel(o.id)" (change)="toggleRow(o.id)" (click)="$event.stopPropagation()" [aria-label]="o.titulo" /></td>
                </ng-container>
                <ng-container matColumnDef="titulo">
                  <th mat-header-cell *matHeaderCellDef>{{ 'crm.opp.col_title' | translate }}</th>
                  <td mat-cell *matCellDef="let o">
                    <div class="name-text"><strong>{{ o.titulo }}</strong>
                      <span class="muted small"><mat-icon class="mini">{{ o.contacto_tipo === 'persona' ? 'person' : 'business' }}</mat-icon>{{ o.contacto_nombre }}@if (!o.activo) { · <em>{{ 'crm.filters.archived_one' | translate }}</em> }</span></div>
                  </td>
                </ng-container>
                <ng-container matColumnDef="etapa">
                  <th mat-header-cell *matHeaderCellDef>{{ 'crm.opp.col_stage' | translate }}</th>
                  <td mat-cell *matCellDef="let o"><span class="stage"><span class="dot" [style.background]="o.etapa_color || 'var(--md-sys-color-outline)'"></span>{{ o.etapa_nombre }}</span></td>
                </ng-container>
                <ng-container matColumnDef="valor">
                  <th mat-header-cell *matHeaderCellDef class="num">{{ 'crm.opp.col_value' | translate }}</th>
                  <td mat-cell *matCellDef="let o" class="num">{{ cfg.money(o.valor) }}</td>
                </ng-container>
                <ng-container matColumnDef="cierre">
                  <th mat-header-cell *matHeaderCellDef class="hide-md">{{ 'crm.opp.col_close' | translate }}</th>
                  <td mat-cell *matCellDef="let o" class="hide-md"><span [class.late]="atrasada(o)">{{ o.fecha_cierre_estimada ? fmtDate(o.fecha_cierre_estimada) : '—' }}</span></td>
                </ng-container>
                <ng-container matColumnDef="responsable">
                  <th mat-header-cell *matHeaderCellDef class="hide-lg">{{ 'crm.opp.col_owner' | translate }}</th>
                  <td mat-cell *matCellDef="let o" class="hide-lg">{{ o.responsable_nombre || '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="tags">
                  <th mat-header-cell *matHeaderCellDef class="hide-md">{{ 'crm.col.tags' | translate }}</th>
                  <td mat-cell *matCellDef="let o" class="hide-md"><div class="chips">@for (t of o.tags.slice(0, 2); track t.id) { <app-tag-chip [nombre]="t.nombre" [color]="t.color" /> }@if (o.tags.length > 2) { <span class="muted small">+{{ o.tags.length - 2 }}</span> }</div></td>
                </ng-container>
                <ng-container matColumnDef="acciones">
                  <th mat-header-cell *matHeaderCellDef class="col-act"></th>
                  <td mat-cell *matCellDef="let o" class="col-act"><button mat-icon-button [matMenuTriggerFor]="rowMenu" [matMenuTriggerData]="{ o }" (click)="$event.stopPropagation()" [attr.aria-label]="'common.more' | translate"><mat-icon>more_vert</mat-icon></button></td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="columns()"></tr>
                <tr mat-row *matRowDef="let o; columns: columns()" class="row" [class.archived]="!o.activo" [class.selected]="isSel(o.id)" (click)="rowClick(o)"></tr>
              </table>
            </div>
            <mat-paginator [length]="total()" [pageSize]="pageSize()" [pageIndex]="page()" [pageSizeOptions]="[10, 25, 50, 100]" (page)="onPage($event)" showFirstLastButtons />
          } @else if (!loadingList()) {
            <div class="empty-state"><mat-icon>trending_up</mat-icon><strong>{{ (anyFilter() ? 'crm.opp.empty_filtered' : 'crm.opp.empty') | translate }}</strong></div>
          }
        }
      }

      <mat-menu #rowMenu="matMenu">
        <ng-template matMenuContent let-o="o">
          <button mat-menu-item (click)="abrir(o)"><mat-icon>open_in_new</mat-icon>{{ 'crm.action.view' | translate }}</button>
          <button mat-menu-item (click)="editar(o)"><mat-icon>edit</mat-icon>{{ 'common.edit' | translate }}</button>
          @if (o.activo) {
            @for (e of etapasDe(o); track e.id) { @if (e.id !== o.id_etapa) { <button mat-menu-item (click)="onMover({ oportunidad: o, etapa: e })"><mat-icon [style.color]="e.color || null">circle</mat-icon>{{ 'crm.opp.move_to' | translate }} {{ e.nombre }}</button> } }
          }
          @if (canDelete()) { <button mat-menu-item (click)="archivarUna(o)"><mat-icon>{{ o.activo ? 'inventory_2' : 'restore_from_trash' }}</mat-icon>{{ (o.activo ? 'crm.opp.archive' : 'crm.restore') | translate }}</button> }
        </ng-template>
      </mat-menu>

      @if (seleccionando() && countSel() > 0) {
        <div class="bulk-bar" id="bulk-bar" role="toolbar" [attr.aria-label]="'crm.bulk.bar' | translate">
          <strong>{{ 'crm.select.count' | translate: { n: countSel() } }}</strong>
          <button mat-button id="btn-bulk-tag" (click)="bulkTags('tags_agregar')"><mat-icon>label</mat-icon>{{ 'crm.bulk.tag' | translate }}</button>
          <button mat-button id="btn-bulk-untag" (click)="bulkTags('tags_quitar')"><mat-icon>label_off</mat-icon>{{ 'crm.bulk.untag' | translate }}</button>
          @if (canDelete()) {
            <button mat-flat-button id="btn-bulk-archive" class="danger" (click)="bulkArchivar()"><mat-icon>{{ archivo() === 'archivadas' ? 'restore_from_trash' : 'inventory_2' }}</mat-icon>{{ (archivo() === 'archivadas' ? 'crm.restore' : 'crm.opp.archive') | translate }}</button>
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
    .form-row > * { flex: 1 1 170px; min-width: 0; }
    .label { font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); }
    .client-filter, .tags-filter, .cf { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .cf { width: 100%; }
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .pill { padding: 4px 12px; border-radius: 999px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); font: var(--mat-sys-label-large); }
    .cf-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; width: 100%; > mat-form-field, > app-date-input { flex: 1 1 180px; min-width: 0; } .op { flex: 0 1 150px; } }
    .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .kpi { padding: 4px 12px; border-radius: 999px; background: var(--md-sys-color-surface-container-high); font: var(--mat-sys-label-large); &.won { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); } &.lost { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); } }
    .select-banner { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; padding: 8px 16px; margin-bottom: 8px; border-radius: 12px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
    table { width: 100%; }
    .row { cursor: pointer; &:hover { background: var(--md-sys-color-surface-container-low); } &.archived td { opacity: 0.6; } &.selected { background: var(--md-sys-color-secondary-container); } }
    .col-sel { width: 56px; padding-right: 0; } .col-act { width: 56px; text-align: right; } .num { text-align: right; white-space: nowrap; }
    .name-text { display: flex; flex-direction: column; min-width: 180px; padding: 8px 0; overflow-wrap: anywhere; }
    .small { font: var(--mat-sys-body-small); } .mini { font-size: 14px; width: 14px; height: 14px; vertical-align: -2px; margin-right: 2px; }
    .stage { display: inline-flex; align-items: center; gap: 6px; } .dot { width: 10px; height: 10px; border-radius: 50%; }
    .late { color: var(--md-sys-color-error); }
    @media (max-width: 839px) { .hide-lg { display: none; } }
    @media (max-width: 599px) { .hide-md { display: none; } .narrow { flex: 1 1 140px; } }
    .bulk-bar { position: sticky; bottom: 16px; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; margin: 16px auto 0; padding: 8px 16px; width: fit-content; max-width: 100%; border-radius: 20px; background: var(--md-sys-color-surface-container-high); box-shadow: 0 4px 16px color-mix(in srgb, var(--md-sys-color-shadow) 25%, transparent); border: 1px solid var(--md-sys-color-outline-variant); }
    .danger { --mat-button-filled-container-color: var(--md-sys-color-error); --mat-button-filled-label-text-color: var(--md-sys-color-on-error); }
  `,
})
export default class OportunidadesPage {
  private crm = inject(CrmService);
  readonly loading = inject(LoadingService);
  readonly dialogs = inject(DialogService);
  private matDialog = inject(MatDialog);
  private router = inject(Router);
  private session = inject(SessionService);
  readonly i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);
  private reportes = inject(CrmOppReportService);

  readonly ordenes: OrdenOp[] = ['creado', 'valor', 'cierre', 'etapa', 'titulo'];

  // ─── Filtros ───────────────────────────────────────────────────────────────────────────────────────────────────
  readonly vista = signal<Vista>(this.vistaGuardada());
  readonly qInput = signal('');
  private readonly q = signal('');
  private qTimer: ReturnType<typeof setTimeout> | null = null;
  readonly estado = signal<EstadoUI>('abiertas');
  readonly archivo = signal<'activas' | 'archivadas'>('activas');
  readonly idEmbudo = signal<number | null>(null);
  readonly responsable = signal<number | null>(null);
  readonly cierreDesde = signal<string | null>(null);
  readonly cierreHasta = signal<string | null>(null);
  readonly valorMin = signal('');
  readonly valorMax = signal('');
  readonly cliente = signal<{ id: number; nombre: string } | null>(null);
  readonly tagsSel = signal<CrmTag[]>([]);
  readonly camposFiltro = signal<FiltroCampoUI[]>([]);
  private nextKey = 1;
  readonly showFilters = signal(false);
  readonly orden = signal<OrdenOp>('creado');
  readonly dir = signal<'asc' | 'desc'>('desc');

  readonly embudos = signal<Embudo[]>([]);
  readonly embudosCargados = signal(false);
  readonly camposDef = signal<CampoDef[]>([]);
  readonly responsables = signal<UsuarioSede[]>([]);
  readonly sinEmbudo = computed(() => this.embudosCargados() && !this.embudos().length);
  readonly esAdmin = computed(() => this.session.hasMinRole('L4'));
  readonly canDelete = computed(() => this.session.hasMinRole('L2'));

  readonly filtros = computed<FiltrosOp>(() => {
    const f: FiltrosOp = { archivo: this.archivo() };
    if (this.q()) f.q = this.q();
    if (this.vista() === 'lista' && this.estado()) f.estado = this.estado() as 'abiertas' | 'ganadas' | 'perdidas';
    if (this.idEmbudo()) f.id_embudo = this.idEmbudo()!;
    if (this.responsable()) f.responsable = this.responsable()!;
    if (this.cierreDesde()) f.cierre_desde = this.cierreDesde()!;
    if (this.cierreHasta()) f.cierre_hasta = this.cierreHasta()!;
    if (this.valorMin().trim()) f.valor_min = this.valorMin().trim().replace(',', '.');
    if (this.valorMax().trim()) f.valor_max = this.valorMax().trim().replace(',', '.');
    if (this.cliente()) f.contacto = this.cliente()!.id;
    if (this.tagsSel().length) { f.tags = this.tagsSel().map(t => t.id); f.tags_modo = 'cualquiera'; }
    const campos = this.camposFiltro().map(c => this.campoFiltroApi(c)).filter((c): c is FiltroCampo => c !== null);
    if (campos.length) f.campos = campos;
    return f;
  });
  readonly moreCount = computed(() => {
    const f = this.filtros();
    return [f.responsable, f.cierre_desde, f.cierre_hasta, f.valor_min, f.valor_max, f.contacto, f.tags, f.campos].filter(Boolean).length + (f.archivo === 'archivadas' ? 1 : 0);
  });
  readonly anyFilter = computed(() => this.moreCount() > 0 || !!this.q() || !!this.qInput() || (this.vista() === 'lista' && this.estado() !== 'abiertas'));

  // ─── Datos ─────────────────────────────────────────────────────────────────────────────────────────────────────
  readonly tablero = signal<Tablero | null>(null);
  readonly lista = signal<ListaOportunidades | null>(null);
  readonly rows = computed(() => this.lista()?.oportunidades ?? []);
  readonly total = computed(() => this.lista()?.total ?? 0);
  readonly resumen = computed(() => (this.vista() === 'tablero' ? this.tablero()?.resumen : this.lista()?.resumen) ?? null);
  readonly page = signal(0);
  readonly pageSize = signal(25);
  readonly error = signal<string | null>(null);
  readonly loadingList = signal(true);
  private reqId = 0;
  private lastKey = '';

  // ─── Selección (lista) ─────────────────────────────────────────────────────────────────────────────────────────
  readonly seleccionando = signal(false);
  private readonly ids = signal<Set<number>>(new Set());
  readonly modoFiltro = signal(false);
  private readonly excluidos = signal<Set<number>>(new Set());
  private readonly totalEsperado = signal(0);
  readonly countSel = computed(() => (this.modoFiltro() ? this.totalEsperado() - this.excluidos().size : this.ids().size));
  readonly pageAllSel = computed(() => this.rows().length > 0 && this.rows().every(r => this.isSel(r.id)));
  readonly pageSomeSel = computed(() => this.rows().some(r => this.isSel(r.id)));
  readonly columns = computed(() => [...(this.seleccionando() ? ['sel'] : []), 'titulo', 'etapa', 'valor', 'cierre', 'responsable', 'tags', 'acciones']);
  /** Oportunidades que se ven con los filtros actuales (en el tablero: todas las del embudo, de cualquier estado). */
  readonly totalVisible = computed(() => (this.vista() === 'tablero' ? this.tablero()?.resumen.total ?? 0 : this.total()));
  readonly exportAlcances = computed<ExportAlcance[]>(() => {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const l: ExportAlcance[] = [];
    if (this.vista() === 'lista' && this.seleccionando() && this.countSel() > 0) l.push({ id: 'seleccion', etiqueta: t('crm.export.scope_selection', { n: this.countSel() }) });
    l.push({ id: 'filtro', etiqueta: t(this.vista() === 'tablero' ? 'crm.oreport.scope_board' : 'crm.export.scope_filter', { n: this.totalVisible() }), deshabilitado: !this.totalVisible() });
    l.push({ id: 'todos', etiqueta: t('crm.export.menu_all') });
    return l;
  });

  constructor() {
    void this.loadCatalogs();
    // Recarga al cambiar cualquier filtro, la vista, el orden, el tamaño o la página; un cambio de filtro vuelve a la página 1 y reinicia la selección.
    effect(() => {
      const key = JSON.stringify([this.vista(), this.filtros(), this.pageSize(), this.orden(), this.dir()]);
      const p = this.page();
      const listo = this.embudosCargados();
      untracked(() => {
        if (!listo) return;
        if (key !== this.lastKey) {
          this.lastKey = key;
          this.clearSelection();
          if (p !== 0) { this.page.set(0); return; }
        }
        void this.load();
      });
    });
  }

  private vistaGuardada(): Vista {
    try { return localStorage.getItem(VISTA_KEY) === 'lista' ? 'lista' : 'tablero'; } catch { return 'tablero'; }
  }

  private async loadCatalogs(): Promise<void> {
    const [e, u, c] = await Promise.all([this.crm.listEmbudos(true), this.crm.listResponsables(), this.crm.listCampos(true, 'oportunidad')]);
    if (e.action && e.data) {
      this.embudos.set(e.data.embudos);
      if (e.data.embudos.length) this.idEmbudo.set(e.data.embudos[0].id);
    }
    if (u.action && u.data) this.responsables.set(u.data.usuarios);
    if (c.action && c.data) this.camposDef.set(c.data.campos);
    this.embudosCargados.set(true);
  }

  setVista(v: Vista): void {
    this.vista.set(v);
    try { localStorage.setItem(VISTA_KEY, v); } catch { /* storage bloqueado: solo se pierde la preferencia */ }
    if (v === 'tablero') this.seleccionando.set(false);
  }

  async load(quiet = false): Promise<void> {
    const id = ++this.reqId;
    this.error.set(null);
    this.loadingList.set(true);
    try {
      const op = this.vista() === 'tablero'
        ? () => this.crm.tableroOportunidades(this.filtros()).then(r => { if (id === this.reqId) { if (r.action && r.data) this.tablero.set(r.data); else this.error.set(r.mensaje); } })
        : () => this.crm.listOportunidades(this.filtros(), this.page() + 1, this.pageSize(), this.orden(), this.dir()).then(r => { if (id === this.reqId) { if (r.action && r.data) this.lista.set(r.data); else this.error.set(r.mensaje); } });
      await (quiet ? op() : this.loading.wrap(op));
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
  onPage(e: PageEvent): void { this.pageSize.set(e.pageSize); this.page.set(e.pageIndex); }

  clearFilters(): void {
    this.qInput.set(''); this.q.set(''); this.estado.set('abiertas'); this.archivo.set('activas'); this.responsable.set(null);
    this.cierreDesde.set(null); this.cierreHasta.set(null); this.valorMin.set(''); this.valorMax.set(''); this.cliente.set(null);
    this.tagsSel.set([]); this.camposFiltro.set([]);
  }

  pickFilterTags(): void {
    this.matDialog.open(TagPickerDialogComponent, { ...dialogSize('480px'), data: { seleccion: this.tagsSel().map(t => t.id), actuales: this.tagsSel(), tipo: 'oportunidad' } })
      .afterClosed().subscribe((r: TagPickerResult | undefined) => { if (r) this.tagsSel.set(r.tags); });
  }

  // ─── Filtros por campo personalizado ───────────────────────────────────────────────────────────────────────────
  campoTipo(id: number): string | undefined { return this.camposDef().find(c => c.id === id)?.tipo_dato; }
  opsFor(id: number): string[] { return OPS[this.campoTipo(id) ?? 'texto']; }
  opKey(op: string): string { return OP_KEY[op] ?? op; }
  addCampoFiltro(): void { this.camposFiltro.update(l => [...l, { key: this.nextKey++, id_campo: null, op: '', valor: '', valor2: '' }]); }
  removeCampoFiltro(key: number): void { this.camposFiltro.update(l => l.filter(f => f.key !== key)); }
  setCampoFiltro(key: number, idCampo: number): void { this.patchCampoFiltro(key, { id_campo: idCampo, op: OPS[this.campoTipo(idCampo) ?? 'texto'][0], valor: '', valor2: '' }); }
  patchCampoFiltro(key: number, patch: Partial<FiltroCampoUI>): void { this.camposFiltro.update(l => l.map(f => (f.key === key ? { ...f, ...patch } : f))); }
  private campoFiltroApi(f: FiltroCampoUI): FiltroCampo | null {
    if (!f.id_campo || !f.op || !f.valor.trim()) return null;
    if (f.op === 'entre' && !f.valor2.trim()) return null;
    const t = this.campoTipo(f.id_campo);
    const conv = (v: string) => (t === 'entero' ? Number(v) : t === 'booleano' ? v === 'true' : v.trim());
    return { id_campo: f.id_campo, op: f.op, valor: conv(f.valor), ...(f.op === 'entre' ? { valor2: conv(f.valor2) } : {}) };
  }

  fmtDate(sql: string): string { return formatDate(sql); }
  atrasada(o: OportunidadFila): boolean { return o.estado === 'abierta' && !!o.fecha_cierre_estimada && o.fecha_cierre_estimada < hoyIso(); }
  etapasDe(o: OportunidadFila): Etapa[] { return (this.embudos().find(e => e.id === o.id_embudo)?.etapas ?? []).filter(t => t.activo); }

  // ─── Selección ─────────────────────────────────────────────────────────────────────────────────────────────────
  toggleSelecting(): void { if (this.seleccionando()) this.clearSelection(); this.seleccionando.update(v => !v); }
  isSel(id: number): boolean { return this.modoFiltro() ? !this.excluidos().has(id) : this.ids().has(id); }
  toggleRow(id: number): void {
    const set = this.modoFiltro() ? this.excluidos : this.ids;
    set.update(s => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  }
  toggleAllPage(): void {
    const marcar = !this.pageAllSel();
    const enFiltro = this.modoFiltro();
    const set = enFiltro ? this.excluidos : this.ids;
    const agregar = enFiltro ? !marcar : marcar;
    set.update(s => { const n = new Set(s); for (const r of this.rows()) { if (agregar) n.add(r.id); else n.delete(r.id); } return n; });
  }
  selectAllFilter(): void { this.totalEsperado.set(this.total()); this.excluidos.set(new Set()); this.modoFiltro.set(true); }
  clearSelection(): void { this.ids.set(new Set()); this.excluidos.set(new Set()); this.modoFiltro.set(false); this.totalEsperado.set(0); }
  private seleccion(): SeleccionOp {
    return this.modoFiltro() ? { filtros: this.filtros(), excluidos: [...this.excluidos()], total_esperado: this.totalEsperado() } : { ids: [...this.ids()] };
  }
  rowClick(o: OportunidadFila): void { if (this.seleccionando()) this.toggleRow(o.id); else this.abrir(o); }

  // ─── Exportar ──────────────────────────────────────────────────────────────────────────────────────────────────
  async exportar(e: ExportSolicitud): Promise<void> {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    let seleccion: SeleccionOpExport;
    let filtrosTexto: string[];
    if (e.alcance === 'seleccion') {
      seleccion = this.seleccion();
      filtrosTexto = this.modoFiltro() ? [...this.describirFiltros(), ...(this.excluidos().size ? [t('crm.export.excluded', { n: this.excluidos().size })] : [])]
        : [t('crm.export.selection_manual', { n: this.countSel() })];
    } else if (e.alcance === 'filtro') {
      seleccion = { filtros: this.filtros(), excluidos: [], total_esperado: this.totalVisible() };
      filtrosTexto = this.describirFiltros();
    } else {
      seleccion = { filtros: { archivo: 'todas' }, excluidos: [] };
      filtrosTexto = [t('crm.oreport.scope_all')];
    }
    await ejecutarExportacion(this, () => this.reportes.exportarOportunidades({ seleccion, formato: e.formato, filtrosTexto }));
  }

  /** Los filtros activos en lenguaje natural, para el encabezado del reporte. */
  private describirFiltros(): string[] {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const f = this.filtros();
    const l: string[] = [t(this.vista() === 'tablero' ? 'crm.oreport.scope_board_text' : 'crm.export.filter_scope')];
    if (f.id_embudo && this.embudos().length > 1) l.push(`${t('crm.opp.funnel')}: ${this.embudos().find(x => x.id === f.id_embudo)?.nombre ?? ''}`);
    if (f.q) l.push(`${t('crm.filters.search')}: «${f.q}»`);
    if (f.estado) l.push(`${t('crm.opp.status')}: ${t('crm.opp.status_' + f.estado)}`);
    if (f.archivo === 'archivadas') l.push(t('crm.opp.archived'));
    if (f.responsable) l.push(`${t('crm.filters.owner')}: ${this.responsables().find(u => u.id === f.responsable)?.nombre ?? f.responsable}`);
    if (f.cierre_desde) l.push(`${t('crm.opp.close_from')}: ${formatDate(f.cierre_desde)}`);
    if (f.cierre_hasta) l.push(`${t('crm.opp.close_to')}: ${formatDate(f.cierre_hasta)}`);
    if (f.valor_min) l.push(`${t('crm.opp.value_min')}: ${this.cfg.money(Number(f.valor_min))}`);
    if (f.valor_max) l.push(`${t('crm.opp.value_max')}: ${this.cfg.money(Number(f.valor_max))}`);
    if (this.cliente()) l.push(`${t('crm.opp.client')}: ${this.cliente()!.nombre}`);
    if (this.tagsSel().length) l.push(`${t('crm.filters.tags')}: ${this.tagsSel().map(x => x.nombre).join(', ')}`);
    for (const c of f.campos ?? []) {
      const def = this.camposDef().find(d => d.id === c.id_campo);
      const valor = c.op === 'entre' ? `${c.valor} - ${c.valor2}` : typeof c.valor === 'boolean' ? t(c.valor ? 'common.yes' : 'common.no') : String(c.valor);
      l.push(`${def?.etiqueta ?? c.id_campo} ${t('crm.op.' + this.opKey(c.op))} ${valor}`);
    }
    return l;
  }

  // ─── Acciones ──────────────────────────────────────────────────────────────────────────────────────────────────
  abrir(o: OportunidadFila): void { void this.router.navigate(['/m/crm/oportunidades', o.id]); }
  crear(): void { abrirOportunidadDialog(this.matDialog, {}).afterClosed().subscribe(r => { if (r) void this.load(); }); }
  editar(o: OportunidadFila): void { abrirOportunidadDialog(this.matDialog, { id: o.id }).afterClosed().subscribe(r => { if (r) void this.load(); }); }

  async onMover(e: MoverEvento): Promise<void> {
    const { oportunidad: o, etapa } = e;
    if (o.id_etapa === etapa.id) return;
    if (etapa.tipo === 'abierta') { await this.aplicarMover(o, etapa, null); return; }
    const res = await firstValueFrom(this.matDialog.open(OportunidadCierreDialogComponent, {
      ...dialogSize('480px'), data: { etapa, titulo: o.titulo }, autoFocus: 'first-tabbable',
    }).afterClosed()) as CierreDialogResult | undefined;
    if (res) await this.aplicarMover(o, etapa, res);
  }

  /** Mueve en pantalla al instante (tablero) y confirma con el servidor; si falla, vuelve a cargar. */
  private async aplicarMover(o: OportunidadFila, etapa: Etapa, cierre: CierreDialogResult | null): Promise<void> {
    if (this.vista() === 'tablero') this.moverLocal(o, etapa);
    try {
      const r = await this.crm.moveOportunidad({ id: o.id, idEtapa: etapa.id, idMotivo: cierre?.idMotivo, fechaCierre: cierre?.fechaCierre, nota: cierre?.nota });
      if (!r.action) await this.dialogs.error({ title: this.i18n.t('crm.opp.move_error'), message: r.mensaje });
    } catch {
      await this.dialogs.error({ title: this.i18n.t('crm.opp.move_error'), message: this.i18n.t('common.error') });
    }
    await this.load(true);
  }

  private moverLocal(o: OportunidadFila, etapa: Etapa): void {
    const t = this.tablero();
    if (!t) return;
    const movida: OportunidadFila = { ...o, id_etapa: etapa.id, etapa_nombre: etapa.nombre, etapa_tipo: etapa.tipo, etapa_probabilidad: etapa.probabilidad, etapa_color: etapa.color, estado: etapa.tipo, etapa_desde: new Date().toISOString() };
    const recalc = (c: ColumnaTablero, n: number, valor: number): ColumnaTablero => ({ ...c, total: c.total + n, valor: c.valor + valor, ponderado: (c.valor + valor) * c.etapa.probabilidad / 100 });
    this.tablero.set({
      ...t,
      columnas: t.columnas.map(c => {
        if (c.etapa.id === o.id_etapa) return { ...recalc(c, -1, -o.valor), oportunidades: c.oportunidades.filter(x => x.id !== o.id) };
        if (c.etapa.id === etapa.id) return { ...recalc(c, 1, o.valor), oportunidades: [movida, ...c.oportunidades] };
        return c;
      }),
    });
  }

  async verMasColumna(col: ColumnaTablero): Promise<void> {
    const pagina = Math.floor(col.oportunidades.length / 25) + 1;
    const orden: OrdenOp = col.etapa.tipo === 'abierta' ? 'valor' : 'cierre_real';
    const r = await this.loading.wrap(() => this.crm.listOportunidades({ ...this.filtros(), etapas: [col.etapa.id] }, pagina, 25, orden, 'desc'));
    if (!r.action || !r.data) return;
    const t = this.tablero();
    if (!t) return;
    const nuevas = r.data.oportunidades.filter(x => !col.oportunidades.some(y => y.id === x.id));
    this.tablero.set({ ...t, columnas: t.columnas.map(c => (c.etapa.id === col.etapa.id ? { ...c, oportunidades: [...c.oportunidades, ...nuevas], hay_mas: c.oportunidades.length + nuevas.length < c.total } : c)) });
  }

  async archivarUna(o: OportunidadFila): Promise<void> {
    const archivar = o.activo;
    const ok = await this.dialogs.confirm({
      title: this.i18n.t(archivar ? 'crm.opp.archive_title' : 'crm.opp.restore_title'), message: this.i18n.t(archivar ? 'crm.opp.archive_msg' : 'crm.opp.restore_msg', { name: o.titulo }),
      confirmText: this.i18n.t(archivar ? 'crm.opp.archive' : 'crm.restore'), danger: archivar,
    });
    if (ok) await this.runBulk(archivar ? 'archivar' : 'restaurar', { ids: [o.id] });
  }

  async bulkArchivar(): Promise<void> {
    const n = this.countSel();
    const restaurar = this.archivo() === 'archivadas';
    const ok = await this.dialogs.confirm({
      title: this.i18n.t(restaurar ? 'crm.opp.bulk_restore_title' : 'crm.opp.bulk_archive_title', { n }), message: this.i18n.t(restaurar ? 'crm.opp.bulk_restore_msg' : 'crm.opp.bulk_archive_msg', { n }),
      confirmText: this.i18n.t(restaurar ? 'crm.restore' : 'crm.opp.archive'), danger: !restaurar, confirmWord: !restaurar && n > 5 ? this.i18n.t('crm.bulk.delete_word') : undefined,
    });
    if (ok) await this.runBulk(restaurar ? 'restaurar' : 'archivar', this.seleccion());
  }

  bulkTags(accion: 'tags_agregar' | 'tags_quitar'): void {
    const agregar = accion === 'tags_agregar';
    this.matDialog.open(TagPickerDialogComponent, {
      ...dialogSize('480px'), data: { tipo: 'oportunidad', title: this.i18n.t(agregar ? 'crm.bulk.tag_title' : 'crm.bulk.untag_title'), confirmText: this.i18n.t('crm.bulk.continue') },
    }).afterClosed().subscribe(async (r: TagPickerResult | undefined) => {
      if (!r?.ids.length) return;
      const ok = await this.dialogs.confirm({
        title: this.i18n.t(agregar ? 'crm.bulk.tag_confirm_title' : 'crm.bulk.untag_confirm_title'),
        message: this.i18n.t(agregar ? 'crm.bulk.tag_confirm_msg' : 'crm.bulk.untag_confirm_msg', { tags: r.tags.map(t => `«${t.nombre}»`).join(', '), n: this.countSel() }), confirmText: this.i18n.t('crm.bulk.apply'),
      });
      if (ok) await this.runBulk(accion, this.seleccion(), r.ids);
    });
  }

  private async runBulk(accion: AccionLote, seleccion: SeleccionOp, tagIds?: number[]): Promise<void> {
    try {
      const r = await this.loading.wrap(() => this.crm.bulkOportunidades(accion, seleccion, tagIds));
      if (!r.action || !r.data) await this.dialogs.error({ title: this.i18n.t('crm.bulk.error'), message: r.mensaje });
      else await this.dialogs.info({ title: this.i18n.t('crm.bulk.done_title'), message: this.resumenLote(accion, r.data) });
    } catch {
      await this.dialogs.error({ title: this.i18n.t('crm.bulk.error'), message: this.i18n.t('common.error') });
    }
    this.clearSelection();
    await this.load();
  }

  private resumenLote(accion: AccionLote, r: ResultadoLote): string {
    const l = [this.i18n.t(`crm.opp.bulk_done_${accion}`, { n: r.procesados })];
    if (r.sin_cambios) l.push(this.i18n.t('crm.bulk.unchanged', { n: r.sin_cambios }));
    return l.join('\n');
  }
}
