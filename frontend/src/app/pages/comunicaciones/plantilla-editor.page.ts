import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import {
  BotonPlantilla, CategoriaPlantilla, ComunicacionesService, EstadoPlantilla, Linea, PlantillaCom, RevisionCategoria, TipoEncabezado, VariableDef,
} from '../../services/comunicaciones.service';
import { CampoDef, CrmService } from '../../services/crm.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { WaPreviewComponent } from './wa-preview.component';

const IDIOMAS = ['es', 'es_CO', 'es_MX', 'es_AR', 'es_ES', 'es_PE', 'en', 'en_US', 'en_GB', 'pt_BR'];
const ORIGENES = ['primer_nombre', 'nombre', 'telefono', 'correo', 'fijo', 'manual'];
const RE_VAR = /\{\{\s*(\d+)\s*\}\}/g;

/** Nombre de Meta como lo deja el servidor (comNombrePlantilla): minúsculas sin tildes, números y _. */
export function nombreMeta(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 100);
}
function numeros(t: string): number[] { return [...t.matchAll(RE_VAR)].map(m => Number(m[1])); }
function varVacia(n: number): VariableDef { return { n, ejemplo: '', origen: 'primer_nombre', valor: null, defecto: null }; }

/**
 * Constructor de plantillas: todo en una pantalla con la vista previa tipo WhatsApp siempre a la vista y la revisión de categoría mientras se
 * escribe (reglas del servidor). Variables como fichas numeradas solas, con ejemplo y de dónde sale el valor al enviar. El botón de enlace usa
 * solo la URL de seguimiento del sistema (se muestra y se explica). Borradores y rechazadas se editan libres; una aprobada se cambia enviándola
 * otra vez a revisión (nombre, idioma y categoría quedan fijos).
 */
@Component({
  selector: 'app-plantilla-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, MatButton, MatIconButton, MatButtonToggleGroup, MatButtonToggle, MatFormField, MatLabel, MatHint, MatIcon, MatInput, MatSelect,
    MatOption, MatTooltip, WaPreviewComponent, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="tt">
          <a mat-icon-button routerLink="/m/comunicaciones/plantillas" [attr.aria-label]="'com.back' | translate"><mat-icon>arrow_back</mat-icon></a>
          <h1>{{ (idPlantilla() ? 'com.tpl.edit_title' : 'com.tpl.new_title') | translate }}</h1>
          @if (estado() !== 'borrador' || idPlantilla()) { <span class="estado" [attr.data-estado]="estado()">{{ 'com.tpl.st.' + estado() | translate }}</span> }
        </div>
        @if (editable()) {
          <div class="actions">
            @if (puedeBorrador()) { <button mat-stroked-button id="btn-save-draft" [disabled]="ocupado()" (click)="guardarBorrador()"><mat-icon>save</mat-icon>{{ 'com.tpl.save_draft' | translate }}</button> }
            <button mat-flat-button id="btn-submit-tpl" [disabled]="ocupado() || bloqueada()" (click)="enviar()" [matTooltip]="bloqueada() ? ('com.tpl.blocked' | translate) : ''">
              <mat-icon>send</mat-icon>{{ (metaId() ? 'com.tpl.resubmit' : 'com.tpl.submit') | translate }}</button>
          </div>
        }
      </header>

      @if (motivoRechazo() && estado() === 'rechazada') { <div class="banner err"><mat-icon>block</mat-icon><span>{{ 'com.tpl.rejected_reason' | translate: { r: motivoRechazo()! } }}</span></div> }
      @if (reclasificada()) { <div class="banner err"><mat-icon>warning</mat-icon><span>{{ 'com.tpl.reclassified_long' | translate: { cat: ('com.tpl.cat.' + categoriaMeta() | translate) } }}</span></div> }
      @if (!editable()) { <div class="banner"><mat-icon>lock</mat-icon><span>{{ 'com.tpl.readonly_' + estado() | translate }}</span></div> }
      @if (estado() === 'aprobada' || estado() === 'pausada') { <div class="banner"><mat-icon>info</mat-icon><span>{{ 'com.tpl.edit_approved' | translate }}</span></div> }

      <div class="layout">
        <div class="form">
          <!-- 1. Datos -->
          <section class="block">
            <h2><span class="num">1</span>{{ 'com.tpl.s_data' | translate }}</h2>
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'com.tpl.name' | translate }}</mat-label>
                <input matInput id="tpl-name" [ngModel]="nombre()" (ngModelChange)="nombre.set($event)" maxlength="100" [disabled]="fijos()" />
                <mat-hint>{{ 'com.tpl.name_hint' | translate: { n: nombreNormal() || '…' } }}</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'com.tpl.language' | translate }}</mat-label>
                <mat-select id="tpl-lang" [ngModel]="idioma()" (ngModelChange)="idioma.set($event)" [disabled]="fijos()">
                  @for (l of idiomas; track l) { <mat-option [value]="l">{{ 'com.lang.' + l | translate }}</mat-option> }
                </mat-select>
              </mat-form-field>
            </div>
            @if (lineas().length > 1) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'com.tpl.line' | translate }}</mat-label>
                <mat-select id="tpl-line" [ngModel]="idLinea()" (ngModelChange)="idLinea.set($event)" [disabled]="fijos()">
                  @for (l of lineas(); track l.id) { <mat-option [value]="l.id">{{ l.nombre }}</mat-option> }
                </mat-select>
                <mat-hint>{{ 'com.tpl.line_hint' | translate }}</mat-hint>
              </mat-form-field>
            }
            <span class="lbl">{{ 'com.tpl.category' | translate }}</span>
            <div class="cats">
              @for (c of categorias; track c) {
                <button type="button" class="cat" [id]="'cat-' + c" [class.on]="categoria() === c" [disabled]="fijos() && categoria() !== c" (click)="categoria.set(c)">
                  <strong>{{ 'com.tpl.cat.' + c | translate }}</strong>
                  <span class="credits">{{ (c === 'UTILITY' ? tarifas().utility : tarifas().marketing) }} {{ 'com.credits_short' | translate }}</span>
                  <span class="muted small">{{ 'com.tpl.cat_desc.' + c | translate }}</span>
                </button>
              }
            </div>
          </section>

          <!-- 2. Encabezado -->
          <section class="block">
            <h2><span class="num">2</span>{{ 'com.tpl.s_header' | translate }} <span class="opt">{{ 'com.tpl.optional' | translate }}</span></h2>
            <mat-button-toggle-group [ngModel]="encTipo()" (ngModelChange)="encTipo.set($event)" [disabled]="!editable()" [hideSingleSelectionIndicator]="true" class="toggles">
              @for (e of encabezados; track e) { <mat-button-toggle [value]="e" [id]="'hdr-' + e">{{ 'com.tpl.hdr.' + e | translate }}</mat-button-toggle> }
            </mat-button-toggle-group>
            @if (encTipo() === 'texto') {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'com.tpl.header_text' | translate }}</mat-label>
                <input matInput id="tpl-header" [ngModel]="encTexto()" (ngModelChange)="encTexto.set($event)" maxlength="60" [disabled]="!editable()" />
                <mat-hint align="end">{{ encTexto().length }}/60</mat-hint>
              </mat-form-field>
              @if (!numeros(encTexto()).length && editable()) { <button mat-button class="insvar" (click)="encTexto.set(encTexto() + ' {{1}}')"><mat-icon>data_object</mat-icon>{{ 'com.tpl.add_var' | translate }}</button> }
              @if (numeros(encTexto()).length) {
                <div class="var"><span class="chip">{{ marca(1) }}</span>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>{{ 'com.tpl.example' | translate }}</mat-label>
                    <input matInput [ngModel]="encVar().ejemplo" (ngModelChange)="encVar.set({ ...encVar(), ejemplo: $event })" maxlength="100" [disabled]="!editable()" /></mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>{{ 'com.tpl.origin' | translate }}</mat-label>
                    <mat-select [ngModel]="encVar().origen" (ngModelChange)="encVar.set({ ...encVar(), origen: $event })" [disabled]="!editable()">
                      @for (o of origenes(); track o.v) { <mat-option [value]="o.v">{{ o.l }}</mat-option> }
                    </mat-select></mat-form-field>
                  @if (encVar().origen === 'fijo') {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>{{ 'com.tpl.fixed' | translate }}</mat-label>
                      <input matInput [ngModel]="encVar().valor ?? ''" (ngModelChange)="encVar.set({ ...encVar(), valor: $event })" maxlength="200" [disabled]="!editable()" /></mat-form-field>
                  }
                </div>
              }
            } @else if (encTipo() !== 'ninguno') {
              <div class="file">
                <button mat-stroked-button type="button" (click)="ejemploInput.click()" [disabled]="!editable()"><mat-icon>upload_file</mat-icon>{{ 'com.tpl.example_file' | translate }}</button>
                <span class="muted">{{ ejemplo()?.name || ('com.tpl.example_file_hint' | translate) }}</span>
                <input #ejemploInput type="file" hidden [accept]="aceptar()" (change)="elegirEjemplo($event)" />
              </div>
              <p class="muted small">{{ 'com.tpl.media_hint' | translate }}</p>
            }
          </section>

          <!-- 3. Cuerpo -->
          <section class="block">
            <h2><span class="num">3</span>{{ 'com.tpl.s_body' | translate }}</h2>
            @if (editable()) {
              <div class="toolbar">
                <button mat-icon-button (click)="formato('*')" [matTooltip]="'com.tpl.bold' | translate" [attr.aria-label]="'com.tpl.bold' | translate"><mat-icon>format_bold</mat-icon></button>
                <button mat-icon-button (click)="formato('_')" [matTooltip]="'com.tpl.italic' | translate" [attr.aria-label]="'com.tpl.italic' | translate"><mat-icon>format_italic</mat-icon></button>
                <button mat-icon-button (click)="formato('~')" [matTooltip]="'com.tpl.strike' | translate" [attr.aria-label]="'com.tpl.strike' | translate"><mat-icon>strikethrough_s</mat-icon></button>
                <span class="sep"></span>
                <button mat-stroked-button id="btn-add-var" (click)="insertarVariable()"><mat-icon>data_object</mat-icon>{{ 'com.tpl.add_var' | translate }}</button>
              </div>
            }
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'com.tpl.body' | translate }}</mat-label>
              <textarea matInput #body id="tpl-body" rows="7" [ngModel]="cuerpo()" (ngModelChange)="cuerpo.set($event)" maxlength="1024" [disabled]="!editable()"></textarea>
              <mat-hint align="end">{{ cuerpo().length }}/1024</mat-hint>
            </mat-form-field>
            @if (desordenadas()) {
              <div class="warn"><mat-icon>warning</mat-icon><span>{{ 'com.tpl.var_order' | translate }}</span>
                <button mat-button (click)="renumerar()">{{ 'com.tpl.renumber' | translate }}</button></div>
            }
            @for (v of varsCuerpo(); track v.n) {
              <div class="var" [attr.data-var]="v.n">
                <span class="chip">{{ marca(v.n) }}</span>
                <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>{{ 'com.tpl.example' | translate }}</mat-label>
                  <input matInput [id]="'var-ej-' + v.n" [ngModel]="v.ejemplo" (ngModelChange)="setVar(v.n, 'ejemplo', $event)" maxlength="100" [disabled]="!editable()" /></mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>{{ 'com.tpl.origin' | translate }}</mat-label>
                  <mat-select [id]="'var-or-' + v.n" [ngModel]="v.origen" (ngModelChange)="setVar(v.n, 'origen', $event)" [disabled]="!editable()">
                    @for (o of origenes(); track o.v) { <mat-option [value]="o.v">{{ o.l }}</mat-option> }
                  </mat-select></mat-form-field>
                @if (v.origen === 'fijo') {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>{{ 'com.tpl.fixed' | translate }}</mat-label>
                    <input matInput [ngModel]="v.valor ?? ''" (ngModelChange)="setVar(v.n, 'valor', $event)" maxlength="200" [disabled]="!editable()" /></mat-form-field>
                } @else if (v.origen !== 'manual') {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>{{ 'com.tpl.default' | translate }}</mat-label>
                    <input matInput [ngModel]="v.defecto ?? ''" (ngModelChange)="setVar(v.n, 'defecto', $event)" maxlength="100" [disabled]="!editable()" /></mat-form-field>
                }
              </div>
            }
            @if (varsCuerpo().length) { <p class="muted small">{{ 'com.tpl.vars_hint' | translate }}</p> }
          </section>

          <!-- 4. Pie -->
          <section class="block">
            <h2><span class="num">4</span>{{ 'com.tpl.s_footer' | translate }} <span class="opt">{{ 'com.tpl.optional' | translate }}</span></h2>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'com.tpl.footer' | translate }}</mat-label>
              <input matInput id="tpl-footer" [ngModel]="pie()" (ngModelChange)="pie.set($event)" maxlength="60" [disabled]="!editable()" />
              <mat-hint>{{ (categoria() === 'MARKETING' ? 'com.tpl.footer_mkt' : 'com.tpl.footer_hint') | translate }}</mat-hint>
            </mat-form-field>
          </section>

          <!-- 5. Botones -->
          <section class="block">
            <h2><span class="num">5</span>{{ 'com.tpl.s_buttons' | translate }} <span class="opt">{{ 'com.tpl.optional' | translate }}</span></h2>
            @for (b of botones(); track $index; let i = $index) {
              <div class="btnrow">
                <mat-icon>{{ b.tipo === 'enlace' ? 'open_in_new' : 'reply' }}</mat-icon>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>{{ (b.tipo === 'enlace' ? 'com.tpl.btn_link' : 'com.tpl.btn_reply') | translate }}</mat-label>
                  <input matInput [id]="'btn-text-' + i" [ngModel]="b.texto" (ngModelChange)="setBoton(i, $event)" maxlength="25" [disabled]="!editable() || b.tipo === 'otro'" />
                </mat-form-field>
                @if (editable()) { <button mat-icon-button (click)="quitarBoton(i)" [attr.aria-label]="'common.delete' | translate"><mat-icon>close</mat-icon></button> }
              </div>
              @if (b.tipo === 'enlace' && !b.externa) {
                <div class="tracking">
                  <mat-icon>link</mat-icon>
                  <div><strong>{{ 'com.tpl.tracking_title' | translate }}</strong>
                    <code>{{ urlSeguimiento() }}{{ marca(1) }}</code>
                    <p class="small">{{ 'com.tpl.tracking_help' | translate }}</p></div>
                </div>
              }
            }
            @if (editable()) {
              <div class="row-btns">
                <button mat-button id="btn-add-reply" [disabled]="cuantos('respuesta') >= 3" (click)="agregarBoton('respuesta')"><mat-icon>reply</mat-icon>{{ 'com.tpl.add_reply' | translate }}</button>
                <button mat-button id="btn-add-link" [disabled]="cuantos('enlace') >= 1" (click)="agregarBoton('enlace')"><mat-icon>add_link</mat-icon>{{ 'com.tpl.add_link' | translate }}</button>
              </div>
            }
          </section>
        </div>

        <aside class="side">
          <div class="sticky">
            <h3>{{ 'com.tpl.preview' | translate }}</h3>
            <app-wa-preview [encabezadoTipo]="encTipo()" [encabezadoTexto]="encPreview()" [cuerpo]="cuerpoPreview()" [pie]="pie() || null" [botones]="botones()"
                            [mediaUrl]="ejemploUrl()" [mediaNombre]="ejemplo()?.name ?? null" />
            <section class="review" [attr.data-riesgo]="revision()?.riesgo" id="category-review">
              <h3><mat-icon>fact_check</mat-icon>{{ 'com.tpl.review' | translate }}</h3>
              @if (categoria() === 'MARKETING') {
                <p class="small">{{ 'com.tpl.review_marketing' | translate: { n: tarifas().marketing } }}</p>
              } @else if (revision(); as r) {
                <p class="riesgo"><span class="dot"></span>{{ 'com.tpl.risk.' + r.riesgo | translate }}</p>
                @for (m of r.motivos; track m.codigo) {
                  <p class="motivo small"><mat-icon>chevron_right</mat-icon>{{ 'com.tpl.rev.' + m.codigo | translate: { w: (m.palabras ?? []).join(', ') } }}</p>
                }
                @if (r.transaccional && !r.motivos.length) { <p class="small">{{ 'com.tpl.rev.ok' | translate }}</p> }
                <p class="muted small">{{ 'com.tpl.review_cost' | translate: { u: tarifas().utility, m: tarifas().marketing } }}</p>
                @if (r.riesgo === 'alto' && editable() && !fijos()) {
                  <button mat-stroked-button (click)="categoria.set('MARKETING')">{{ 'com.tpl.switch_marketing' | translate }}</button>
                }
              } @else { <p class="muted small">{{ 'com.tpl.review_wait' | translate }}</p> }
              <p class="muted small disclaimer">{{ 'com.tpl.review_note' | translate }}</p>
            </section>
          </div>
        </aside>
      </div>
    </div>
  `,
  styles: `
    .tt { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .estado { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-surface-container-highest);
      &[data-estado='aprobada'] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      &[data-estado='pendiente'] { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
      &[data-estado='rechazada'], &[data-estado='pausada'] { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); } }
    .banner { display: flex; gap: 10px; align-items: flex-start; padding: 12px 16px; border-radius: 12px; margin-bottom: 12px;
      background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container);
      &.err { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); } }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; align-items: start; }
    @media (max-width: 959px) { .layout { grid-template-columns: 1fr; } .side { order: -1; } .sticky { position: static !important; } }
    .form { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .block { display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 16px; background: var(--md-sys-color-surface-container-low);
      border: 1px solid var(--md-sys-color-outline-variant);
      h2 { margin: 0; font: var(--mat-sys-title-medium); display: flex; align-items: center; gap: 10px; } }
    .num { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font: var(--mat-sys-label-large);
      background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
    .opt { font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); }
    .lbl { font: var(--mat-sys-label-large); }
    .cats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .cat { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px 14px; border-radius: 12px; text-align: left; cursor: pointer;
      border: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface); color: inherit; font: inherit;
      &.on { border: 2px solid var(--md-sys-color-primary); background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      &:disabled { cursor: default; opacity: .5; } .credits { font: var(--mat-sys-label-large); } }
    .toggles { flex-wrap: wrap; align-self: flex-start; }
    .toolbar { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; .sep { width: 1px; height: 24px; background: var(--md-sys-color-outline-variant); margin: 0 6px; } }
    .var { display: grid; grid-template-columns: 56px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr); gap: 8px; align-items: center;
      @media (max-width: 599px) { grid-template-columns: 1fr; } }
    .chip { justify-self: start; padding: 4px 8px; border-radius: 8px; font: var(--mat-sys-label-large); font-family: monospace;
      background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    .insvar { align-self: flex-start; }
    .warn { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--md-sys-color-error); }
    .file { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .btnrow { display: flex; align-items: center; gap: 8px; mat-form-field { flex: 1; } }
    .tracking { display: flex; gap: 10px; padding: 12px; border-radius: 12px; background: var(--md-sys-color-surface-container-high); overflow-wrap: anywhere;
      code { display: block; margin: 4px 0; padding: 4px 8px; border-radius: 6px; background: var(--md-sys-color-surface); } p { margin: 0; } }
    .row-btns { display: flex; flex-wrap: wrap; gap: 8px; }
    .small { font: var(--mat-sys-body-small); margin: 0; }
    .sticky { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 16px; h3 { margin: 0; font: var(--mat-sys-title-small); } }
    .review { padding: 16px; border-radius: 16px; border: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface-container-low);
      display: flex; flex-direction: column; gap: 6px; h3 { display: flex; align-items: center; gap: 6px; }
      .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; background: var(--md-sys-color-primary); }
      &[data-riesgo='medio'] .dot { background: var(--md-sys-color-tertiary); }
      &[data-riesgo='alto'] { border-color: var(--md-sys-color-error); .dot { background: var(--md-sys-color-error); } .riesgo { color: var(--md-sys-color-error); } } }
    .riesgo { margin: 0; font: var(--mat-sys-title-small); display: flex; align-items: center; }
    .motivo { display: flex; gap: 2px; mat-icon { width: 18px; height: 18px; font-size: 18px; flex: none; } }
    .disclaimer { margin-top: 4px; }
  `,
})
export default class PlantillaEditorPage implements OnDestroy {
  readonly id = input<string>('');
  readonly duplicar = input<string>();
  private com = inject(ComunicacionesService);
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private i18n = inject(TranslationService);
  private body = viewChild<ElementRef<HTMLTextAreaElement>>('body');

  readonly idiomas = IDIOMAS;
  readonly categorias: CategoriaPlantilla[] = ['UTILITY', 'MARKETING'];
  readonly encabezados: TipoEncabezado[] = ['ninguno', 'texto', 'imagen', 'video', 'documento'];
  readonly numeros = numeros;

  readonly idPlantilla = signal(0);
  readonly estado = signal<EstadoPlantilla>('borrador');
  readonly metaId = signal<string | null>(null);
  readonly motivoRechazo = signal<string | null>(null);
  readonly reclasificada = signal(false);
  readonly categoriaMeta = signal<string | null>(null);
  readonly nombre = signal('');
  readonly idioma = signal('es');
  readonly idLinea = signal<number | null>(null);
  readonly categoria = signal<CategoriaPlantilla>('UTILITY');
  readonly encTipo = signal<TipoEncabezado>('ninguno');
  readonly encTexto = signal('');
  readonly encVar = signal<VariableDef>(varVacia(1));
  readonly cuerpo = signal('');
  readonly pie = signal('');
  readonly botones = signal<BotonPlantilla[]>([]);
  readonly defs = signal<Record<number, VariableDef>>({});
  readonly ejemplo = signal<File | null>(null);
  readonly ejemploUrl = signal<string | null>(null);
  readonly lineas = signal<Linea[]>([]);
  readonly campos = signal<CampoDef[]>([]);
  readonly tarifas = signal({ utility: 1, marketing: 20 });
  readonly urlSeguimiento = signal('');
  readonly revision = signal<RevisionCategoria | null>(null);
  readonly ocupado = signal(false);
  private firmaGuardada = '';
  private revTimer: ReturnType<typeof setTimeout> | null = null;

  readonly editable = computed(() => ['borrador', 'rechazada', 'aprobada', 'pausada'].includes(this.estado()));
  /** Nombre, idioma, línea y categoría ya no cambian una vez en Meta. */
  readonly fijos = computed(() => !!this.metaId());
  readonly puedeBorrador = computed(() => ['borrador', 'rechazada'].includes(this.estado()));
  readonly nombreNormal = computed(() => nombreMeta(this.nombre()));
  readonly varsCuerpo = computed(() => {
    const ns = [...new Set(numeros(this.cuerpo()))];
    return ns.map(n => this.defs()[n] ?? varVacia(n));
  });
  readonly desordenadas = computed(() => { const ns = numeros(this.cuerpo()); return ns.some((n, i) => n !== i + 1); });
  readonly bloqueada = computed(() => this.categoria() === 'UTILITY' && this.revision()?.riesgo === 'alto');
  readonly origenes = computed(() => [
    ...ORIGENES.map(o => ({ v: o, l: this.i18n.t('com.tpl.origin.' + o) })),
    ...this.campos().map(c => ({ v: 'campo:' + c.id, l: c.etiqueta })),
  ]);
  readonly cuerpoPreview = computed(() => this.cuerpo().replace(RE_VAR, (_m, n) => this.defs()[Number(n)]?.ejemplo || `[${n}]`));
  readonly encPreview = computed(() => this.encTexto().replace(RE_VAR, () => this.encVar().ejemplo || '[1]'));
  private readonly firma = computed(() => JSON.stringify([this.nombre(), this.idioma(), this.idLinea(), this.categoria(), this.encTipo(), this.encTexto(), this.encVar(),
    this.cuerpo(), this.pie(), this.botones(), this.varsCuerpo()]));

  constructor() {
    effect(() => { const id = this.id(); const dup = this.duplicar(); untracked(() => void this.cargar(id, dup)); });
    // Revisión de categoría mientras se escribe (con pausa): una sola fuente de reglas, las del servidor.
    effect(() => {
      const d = { encabezado: this.encTipo() === 'texto' ? this.encTexto() : '', cuerpo: this.cuerpo(), pie: this.pie(), botones: this.botones().map(b => b.texto) };
      untracked(() => {
        if (this.revTimer) clearTimeout(this.revTimer);
        if (!d.cuerpo.trim()) { this.revision.set(null); return; }
        this.revTimer = setTimeout(async () => {
          try { const r = await this.com.revisarCategoria(d); if (r.action && r.data) this.revision.set(r.data); } catch { /* sin revisión */ }
        }, 600);
      });
    });
  }

  ngOnDestroy(): void { if (this.revTimer) clearTimeout(this.revTimer); if (this.ejemploUrl()) URL.revokeObjectURL(this.ejemploUrl()!); }

  @HostListener('window:beforeunload', ['$event'])
  antesDeSalir(ev: BeforeUnloadEvent): void { if (this.sucio()) ev.preventDefault(); }
  private sucio(): boolean { return this.editable() && this.firma() !== this.firmaGuardada; }
  async puedeSalir(): Promise<boolean> {
    if (!this.sucio()) return true;
    return this.dialogs.confirm({ title: this.i18n.t('com.flow.leave_title'), message: this.i18n.t('com.flow.leave_msg'), confirmText: this.i18n.t('com.flow.leave'), danger: true });
  }

  private async cargar(ruta: string, duplicar?: string): Promise<void> {
    const [l, c, t] = await this.loading.wrap(() => Promise.all([this.com.listLineasSede(), this.crm.listCampos(true, 'persona'), this.com.listPlantillas()]));
    if (l.action && l.data) { this.lineas.set(l.data.lineas); if (!this.idLinea() && l.data.lineas.length) this.idLinea.set(l.data.lineas[0].id); }
    if (c.action && c.data) this.campos.set(c.data.campos);
    if (t.action && t.data) { this.tarifas.set({ utility: t.data.tarifas.utility, marketing: t.data.tarifas.marketing }); this.urlSeguimiento.set(t.data.url_seguimiento); }
    const idCargar = Number(ruta) > 0 ? Number(ruta) : Number(duplicar ?? 0);
    if (idCargar > 0) {
      const r = await this.loading.wrap(() => this.com.getPlantilla(idCargar));
      if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.tpl.load_error'), message: r.mensaje }); void this.router.navigateByUrl('/m/comunicaciones/plantillas'); return; }
      this.llenar(r.data.plantilla, Number(ruta) > 0);
    }
    if (!this.lineas().length) await this.dialogs.info({ title: this.i18n.t('com.tpl.no_lines_title'), message: this.i18n.t('com.inbox.no_lines') });
    this.firmaGuardada = this.firma();   // abrir una nueva (o un duplicado) y salir sin tocarla no pregunta

  }

  private llenar(p: PlantillaCom, misma: boolean): void {
    if (misma) {
      this.idPlantilla.set(p.id); this.estado.set(p.estado); this.metaId.set(p.meta_id); this.motivoRechazo.set(p.motivo_rechazo);
      this.reclasificada.set(p.reclasificada); this.categoriaMeta.set(p.categoria); this.nombre.set(p.nombre);
    } else {
      this.nombre.set((p.nombre + '_copia').slice(0, 100));
    }
    this.idioma.set(p.idioma); this.idLinea.set(p.id_linea);
    this.categoria.set(p.categoria_solicitada === 'AUTHENTICATION' ? 'UTILITY' : p.categoria_solicitada);
    this.encTipo.set(p.encabezado?.tipo ?? 'ninguno'); this.encTexto.set(p.encabezado?.texto ?? '');
    this.encVar.set(p.encabezado?.variable ?? varVacia(1));
    this.cuerpo.set(p.cuerpo); this.pie.set(p.pie ?? '');
    this.botones.set(misma ? p.botones : p.botones.filter(b => b.tipo !== 'otro').map(b => ({ tipo: b.tipo, texto: b.texto })));
    this.defs.set(Object.fromEntries(p.variables.map(v => [v.n, { ...v }])));
  }

  marca(n: number): string { return '{' + '{' + n + '}' + '}'; }
  cuantos(t: string): number { return this.botones().filter(b => b.tipo === t).length; }
  aceptar(): string { return this.encTipo() === 'imagen' ? 'image/jpeg,image/png' : this.encTipo() === 'video' ? 'video/mp4' : 'application/pdf'; }

  setVar(n: number, k: keyof VariableDef, v: string): void {
    this.defs.update(d => ({ ...d, [n]: { ...(d[n] ?? varVacia(n)), [k]: v === '' && k !== 'ejemplo' ? null : v } }));
  }

  insertarVariable(): void {
    const el = this.body()?.nativeElement;
    const txt = this.cuerpo();
    const n = Math.max(0, ...numeros(txt)) + 1;
    const pos = el?.selectionStart ?? txt.length;
    const ins = this.marca(n);
    const antes = txt.slice(0, pos), despues = txt.slice(el?.selectionEnd ?? pos);
    const sep = antes && !/\s$/.test(antes) ? ' ' : '';
    this.escribirCuerpo(el, antes + sep + ins + (despues && !/^\s/.test(despues) ? ' ' : '') + despues, pos + sep.length + ins.length);
  }

  formato(m: string): void {
    const el = this.body()?.nativeElement;
    if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd, t = this.cuerpo();
    this.escribirCuerpo(el, t.slice(0, a) + m + t.slice(a, b) + m + t.slice(b), a + 1, b + 1);
  }

  /** Cambia el cuerpo y el cursor ya mismo en el textarea: ngModel lo escribe en el siguiente render y lo que se tecleara
   *  antes (justo después de «Insertar variable») lo pisaría con el texto viejo. */
  private escribirCuerpo(el: HTMLTextAreaElement | undefined, texto: string, desde: number, hasta = desde): void {
    this.cuerpo.set(texto);
    if (!el) return;
    el.value = texto;
    el.focus();
    el.setSelectionRange(desde, hasta);
  }

  /** Renumera las variables en el orden en que aparecen ({{1}}, {{2}}…) y reordena sus definiciones. */
  renumerar(): void {
    const orden: number[] = [];
    for (const n of numeros(this.cuerpo())) if (!orden.includes(n)) orden.push(n);
    const mapa = new Map(orden.map((n, i) => [n, i + 1]));
    this.cuerpo.set(this.cuerpo().replace(RE_VAR, (_m, n) => this.marca(mapa.get(Number(n)) ?? Number(n))));
    const viejas = this.defs();
    this.defs.set(Object.fromEntries(orden.map((n, i) => [i + 1, { ...(viejas[n] ?? varVacia(n)), n: i + 1 }])));
  }

  agregarBoton(tipo: 'respuesta' | 'enlace'): void {
    this.botones.update(l => [...l, { tipo, texto: tipo === 'enlace' ? this.i18n.t('com.tpl.btn_link_default') : '' }]);
  }
  setBoton(i: number, texto: string): void { this.botones.update(l => l.map((b, j) => (j === i ? { ...b, texto } : b))); }
  quitarBoton(i: number): void { this.botones.update(l => l.filter((_, j) => j !== i)); }

  elegirEjemplo(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0] ?? null;
    this.ejemplo.set(f);
    if (this.ejemploUrl()) URL.revokeObjectURL(this.ejemploUrl()!);
    this.ejemploUrl.set(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  }

  private datos(): Record<string, unknown> {
    const enc = this.encTipo() === 'ninguno' ? { tipo: 'ninguno' } : this.encTipo() === 'texto'
      ? { tipo: 'texto', texto: this.encTexto(), variable: numeros(this.encTexto()).length ? this.encVar() : undefined } : { tipo: this.encTipo() };
    return { id_linea: this.idLinea(), nombre: this.nombre(), idioma: this.idioma(), categoria: this.categoria(), encabezado: enc, cuerpo: this.cuerpo(),
      pie: this.pie(), botones: this.botones().filter(b => b.tipo !== 'otro'), variables: this.varsCuerpo() };
  }

  async guardarBorrador(): Promise<boolean> {
    this.ocupado.set(true);
    try {
      const r = await this.loading.wrap(() => this.com.savePlantilla({ id: this.idPlantilla(), ...this.datos() }));
      if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.tpl.save_error'), message: r.mensaje }); return false; }
      const nuevo = !this.idPlantilla();
      this.idPlantilla.set(r.data.id); this.nombre.set(r.data.nombre);
      this.firmaGuardada = this.firma();
      this.snack.open(this.i18n.t('com.tpl.draft_saved'), this.i18n.t('common.close'), { duration: 3000 });
      if (nuevo) void this.router.navigate(['/m/comunicaciones/plantillas', r.data.id], { replaceUrl: true });
      return true;
    } finally { this.ocupado.set(false); }
  }

  async enviar(): Promise<void> {
    const enc = this.encTipo();
    if (enc !== 'ninguno' && enc !== 'texto' && !this.ejemplo()) {
      await this.dialogs.error({ title: this.i18n.t('com.tpl.submit_error'), message: this.i18n.t('com.tpl.example_required') }); return;
    }
    const ok = await this.dialogs.confirm({ title: this.i18n.t('com.tpl.submit_title'), message: this.i18n.t('com.tpl.submit_msg', {
      cat: this.i18n.t('com.tpl.cat.' + this.categoria()), n: this.categoria() === 'UTILITY' ? this.tarifas().utility : this.tarifas().marketing }), confirmText: this.i18n.t('com.tpl.submit') });
    if (!ok) return;
    // Borrador o rechazada: primero se guarda (así existe aunque Meta rechace el envío); aprobada/pausada: los cambios viajan con el envío.
    if (this.puedeBorrador() && !(await this.guardarBorrador())) return;
    this.ocupado.set(true);
    try {
      const r = await this.loading.wrap(() => this.com.enviarPlantillaAMeta(this.idPlantilla(), this.puedeBorrador() ? undefined : this.datos(), this.ejemplo()));
      if (!r.action || !r.data) {
        if (r.data?.revision) this.revision.set(r.data.revision);
        await this.dialogs.error({ title: this.i18n.t('com.tpl.submit_error'), message: r.mensaje });
        return;
      }
      this.firmaGuardada = this.firma();
      this.snack.open(r.mensaje, this.i18n.t('common.close'), { duration: 4000 });
      void this.router.navigate(['/m/comunicaciones/plantillas'], { queryParams: { p: this.idPlantilla() } });
    } finally { this.ocupado.set(false); }
  }
}
