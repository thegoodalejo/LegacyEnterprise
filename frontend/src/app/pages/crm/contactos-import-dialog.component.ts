import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { CampoDef, CrmService, OpcionesImportContactos, PlantillaImport, ResultadoBloqueContactos, TipoContacto, UsuarioSede } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import {
  CAMPOS_CONTACTO, CampoContacto, CampoPersonalizadoImport, ColumnasContacto, FilaContacto, IdentificarImport, MapeoContactos, OBLIGATORIOS_CONTACTO,
  armarContactos, bloquesContactos, claveCampo, mapeoContactos, ordenarPorMatriz, padresPorBloque, parsearBooleano,
} from '../../services/import/import-contactos';
import { Celda, FormatoFecha, Hoja, SeparadorDecimal, detectarEncabezado, leerArchivo, parsearFecha, parsearNumero, texto } from '../../services/import/import-parse';
import { descargarBlob } from '../../services/reports/download.util';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDate } from './crm-format';

type Paso = 'archivo' | 'mapeo' | 'revision' | 'importando' | 'listo';
interface Resumen extends ResultadoBloqueContactos { filas_leidas: number }
export interface ContactosImportData { tipo?: TipoContacto }
/** `lote`: el usuario pidió ver los contactos importados; `true`: importó y cerró. */
export type ContactosImportResult = { lote: { id: number; archivo: string } } | true;
interface Columna { clave: string; etiqueta: string; tipo_dato?: CampoPersonalizadoImport['tipo_dato'] }

const vacio = (): Resumen => ({
  filas_ok: 0, filas_error: 0, contactos_nuevos: 0, contactos_actualizados: 0, contactos_omitidos: 0, personas_creadas: 0, vinculos_creados: 0, errores: [],
  organizaciones_no_encontradas: [], etiquetas_desconocidas: [], roles_desconocidos: [], responsables_desconocidos: [], filas_leidas: 0,
});
const letra = (i: number): string => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const unir = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])].slice(0, 50);

/**
 * Importar contactos (Personas u Organizaciones) desde Excel (.xlsx) o CSV: 1) qué se importa y el archivo, 2) columnas y opciones (plantillas,
 * campos personalizados, cómo reconocer existentes, vista previa ya interpretada), 3) revisión = simulación completa en el servidor (nada se
 * guarda), 4) importación por bloques con progreso (un lote revertible). Diseño: docs/modulos/crm.md («Importar contactos»).
 */
@Component({
  selector: 'app-contactos-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatButtonToggleGroup, MatButtonToggle, MatFormField, MatHint, MatLabel, MatIcon, MatInput, MatProgressBar, MatSelect, MatOption, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'crm.cimp.title' | translate }}</h2>
    <mat-dialog-content>
      <ol class="steps" aria-hidden="true">
        @for (p of pasosVisibles; track p; let i = $index) { <li [class.on]="indicePaso() >= i">{{ i + 1 }}. {{ 'crm.imp.step_' + p | translate }}</li> }
      </ol>

      @switch (paso()) {
        @case ('archivo') {
          <div class="tipo">
            <span>{{ 'crm.cimp.what' | translate }}</span>
            <mat-button-toggle-group id="cimp-tipo" [value]="tipo()" (change)="cambiarTipo($event.value)" hideSingleSelectionIndicator [attr.aria-label]="'crm.cimp.what' | translate">
              <mat-button-toggle value="persona" id="cimp-tipo-persona"><mat-icon>person</mat-icon> {{ 'crm.tipo.personas' | translate }}</mat-button-toggle>
              <mat-button-toggle value="organizacion" id="cimp-tipo-org"><mat-icon>business</mat-icon> {{ 'crm.tipo.organizaciones' | translate }}</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
          <section class="drop" [class.over]="arrastrando()" (dragover)="$event.preventDefault(); arrastrando.set(true)" (dragleave)="arrastrando.set(false)" (drop)="soltar($event)">
            <mat-icon>upload_file</mat-icon>
            <p>{{ 'crm.imp.drop' | translate }}</p>
            <input #fi type="file" id="cimp-file" accept=".xlsx,.csv,.txt" hidden (change)="elegir(fi.files)" />
            <button mat-flat-button type="button" id="btn-cimp-file" (click)="fi.click()" [disabled]="trabajando()"><mat-icon>folder_open</mat-icon>{{ 'crm.imp.choose' | translate }}</button>
            <p class="muted small">{{ 'crm.imp.formats' | translate }}</p>
            <button mat-button type="button" id="btn-cimp-sample" (click)="ejemplo()"><mat-icon>download</mat-icon>{{ 'crm.imp.sample' | translate }}</button>
          </section>
          @if (errorArchivo()) { <p class="err" id="cimp-file-error">{{ errorArchivo() }}</p> }
          <details class="help"><summary>{{ 'crm.imp.help_title' | translate }}</summary><p class="pre">{{ 'crm.cimp.help_' + tipo() | translate }}</p></details>
        }

        @case ('mapeo') {
          <p class="muted" id="cimp-file-name"><mat-icon class="mini">description</mat-icon> {{ archivo()?.name }} · {{ 'crm.imp.rows' | translate: { n: filasDatos() } }}
            · <strong>{{ (tipo() === 'persona' ? 'crm.tipo.personas' : 'crm.tipo.organizaciones') | translate }}</strong></p>
          <div class="grid">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.cimp.what' | translate }}</mat-label>
              <mat-select id="cimp-tipo-sel" [ngModel]="tipo()" (ngModelChange)="cambiarTipo($event)">
                <mat-option value="persona">{{ 'crm.tipo.personas' | translate }}</mat-option>
                <mat-option value="organizacion">{{ 'crm.tipo.organizaciones' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>
            @if (hojas().length > 1) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'crm.imp.sheet' | translate }}</mat-label>
                <mat-select id="cimp-hoja" [ngModel]="hoja()" (ngModelChange)="cambiarHoja($event)">
                  @for (h of hojas(); track h.nombre; let i = $index) { <mat-option [value]="i">{{ h.nombre }}</mat-option> }
                </mat-select>
              </mat-form-field>
            }
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.template' | translate }}</mat-label>
              <mat-select id="cimp-plantilla" [ngModel]="plantillaSel()" (ngModelChange)="usarPlantilla($event)">
                <mat-option [value]="null">{{ 'crm.imp.template_none' | translate }}</mat-option>
                @for (p of plantillas(); track p.id) { <mat-option [value]="p.id">{{ p.nombre }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.header_row' | translate }}</mat-label>
              <input matInput id="cimp-encabezado" type="number" min="1" [ngModel]="filaEncabezado()" (ngModelChange)="filaEncabezado.set(+$event || 1)" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.date_format' | translate }}</mat-label>
              <mat-select id="cimp-fecha" [ngModel]="formatoFecha()" (ngModelChange)="formatoFecha.set($event)">
                <mat-option value="dmy">dd/mm/aaaa</mat-option><mat-option value="ymd">aaaa-mm-dd</mat-option><mat-option value="mdy">mm/dd/aaaa</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.decimal' | translate }}</mat-label>
              <mat-select id="cimp-decimal" [ngModel]="decimal()" (ngModelChange)="decimal.set($event)">
                <mat-option value="coma">{{ 'crm.imp.decimal_coma' | translate }}</mat-option><mat-option value="punto">{{ 'crm.imp.decimal_punto' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          <h3>{{ 'crm.imp.columns' | translate }}</h3>
          @for (g of gruposColumnas(); track g.titulo) {
            @if (g.cols.length) {
              <h4>{{ g.titulo | translate }}</h4>
              <div class="grid">
                @for (c of g.cols; track c.clave) {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>{{ c.etiqueta }}{{ esObligatorio(c.clave) ? ' *' : '' }}</mat-label>
                    <mat-select [id]="'cimp-col-' + c.clave.replace(':', '-')" [ngModel]="columnas()[c.clave] ?? null" (ngModelChange)="setColumna(c.clave, $event)">
                      <mat-option [value]="null">—</mat-option>
                      @for (e of encabezados(); track $index) { <mat-option [value]="$index">{{ e }}</mat-option> }
                    </mat-select>
                  </mat-form-field>
                }
              </div>
            }
          }
          @if (faltan().length) { <p class="err" id="cimp-missing">{{ 'crm.imp.missing' | translate: { campos: faltan().join(', ') } }}</p> }
          @for (a of avisosMapeo(); track a) { <p class="warn-t small"><mat-icon class="mini">warning</mat-icon> {{ a }}</p> }

          <h3>{{ 'crm.imp.options' | translate }}</h3>
          <div class="grid">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.cimp.identify' | translate }}</mat-label>
              <mat-select id="cimp-identificar" [ngModel]="identificar()" (ngModelChange)="identificar.set($event)">
                <mat-option value="documento">{{ 'crm.cimp.identify_documento' | translate }}</mat-option>
                <mat-option value="nombre">{{ 'crm.cimp.identify_nombre' | translate }}</mat-option>
                <mat-option value="campo" [disabled]="!camposIdentificar().length">{{ 'crm.cimp.identify_campo' | translate }}</mat-option>
                <mat-option value="ninguno">{{ 'crm.cimp.identify_ninguno' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>
            @if (identificar() === 'campo') {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'crm.imp.identify_field' | translate }}</mat-label>
                <mat-select id="cimp-campo" [ngModel]="idCampo()" (ngModelChange)="idCampo.set($event)">
                  @for (c of camposIdentificar(); track c.id) { <mat-option [value]="c.id">{{ c.etiqueta }}</mat-option> }
                </mat-select>
              </mat-form-field>
            }
            @if (identificar() !== 'ninguno') {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'crm.cimp.existing' | translate }}</mat-label>
                <mat-select id="cimp-existentes" [ngModel]="existentes()" (ngModelChange)="existentes.set($event)">
                  <mat-option value="omitir">{{ 'crm.cimp.existing_omitir' | translate }}</mat-option>
                  <mat-option value="actualizar">{{ 'crm.cimp.existing_actualizar' | translate }}</mat-option>
                </mat-select>
                <mat-hint>{{ 'crm.cimp.existing_hint' | translate }}</mat-hint>
              </mat-form-field>
            }
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.cimp.default_owner' | translate }}</mat-label>
              <mat-select id="cimp-responsable" [ngModel]="idResponsable()" (ngModelChange)="idResponsable.set($event)">
                <mat-option [value]="null">—</mat-option>
                @for (u of usuarios(); track u.id) { <mat-option [value]="u.id">{{ u.nombre }}</mat-option> }
              </mat-select>
              <mat-hint>{{ 'crm.cimp.default_owner_hint' | translate }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.cimp.country_code' | translate }}</mat-label>
              <input matInput id="cimp-indicativo" inputmode="numeric" maxlength="6" [ngModel]="indicativo()" (ngModelChange)="indicativo.set($event)" />
              <mat-hint>{{ 'crm.cimp.country_code_hint' | translate }}</mat-hint>
            </mat-form-field>
          </div>

          <h3>{{ 'crm.imp.preview' | translate }}</h3>
          <div class="table-scroll">
            <table class="prev" id="cimp-preview">
              <thead><tr><th>#</th>@for (c of columnasUsadas(); track c.clave) { <th>{{ c.etiqueta }}</th> }</tr></thead>
              <tbody>
                @for (f of vistaPrevia(); track f.fila) {
                  <tr><td class="muted">{{ f.fila }}</td>@for (c of columnasUsadas(); track c.clave) { <td [class.bad]="f.malos.has(c.clave)">{{ f.valores[c.clave] }}</td> }</tr>
                }
              </tbody>
            </table>
          </div>

          <div class="save-tpl">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.template_name' | translate }}</mat-label>
              <input matInput id="cimp-tpl-name" maxlength="80" [ngModel]="nombrePlantilla()" (ngModelChange)="nombrePlantilla.set($event)" />
            </mat-form-field>
            <button mat-stroked-button type="button" id="btn-cimp-save-tpl" (click)="guardarPlantilla()" [disabled]="!nombrePlantilla().trim() || faltan().length > 0"><mat-icon>bookmark_add</mat-icon>{{ 'crm.imp.template_save' | translate }}</button>
          </div>
        }

        @case ('revision') {
          <div class="kpis" id="cimp-review">
            <span class="kpi"><b>{{ r().filas_leidas }}</b> {{ 'crm.imp.k_rows' | translate }}</span>
            <span class="kpi ok"><b>{{ r().contactos_nuevos }}</b> {{ 'crm.cimp.k_new' | translate }}</span>
            @if (r().contactos_actualizados) { <span class="kpi"><b>{{ r().contactos_actualizados }}</b> {{ 'crm.cimp.k_updated' | translate }}</span> }
            @if (r().contactos_omitidos) { <span class="kpi"><b>{{ r().contactos_omitidos }}</b> {{ 'crm.cimp.k_skipped' | translate }}</span> }
            @if (r().personas_creadas) { <span class="kpi"><b>{{ r().personas_creadas }}</b> {{ 'crm.cimp.k_people' | translate }}</span> }
            @if (r().vinculos_creados) { <span class="kpi"><b>{{ r().vinculos_creados }}</b> {{ 'crm.cimp.k_links' | translate }}</span> }
            <span class="kpi" [class.bad]="r().filas_error > 0"><b>{{ r().filas_error }}</b> {{ 'crm.imp.k_errors' | translate }}</span>
          </div>
          @if (r().organizaciones_no_encontradas.length) {
            <div class="box warn" id="cimp-orgs"><strong>{{ 'crm.cimp.orgs_not_found' | translate: { n: r().organizaciones_no_encontradas.length } }}</strong><span>{{ r().organizaciones_no_encontradas.join(', ') }}</span></div>
          }
          @if (r().etiquetas_desconocidas.length) {
            <div class="box" id="cimp-tags"><strong>{{ 'crm.cimp.tags_unknown' | translate }}</strong><span>{{ r().etiquetas_desconocidas.join(', ') }}</span></div>
          }
          @if (r().roles_desconocidos.length) {
            <div class="box" id="cimp-roles"><strong>{{ 'crm.cimp.roles_unknown' | translate }}</strong><span>{{ r().roles_desconocidos.join(', ') }}</span></div>
          }
          @if (r().responsables_desconocidos.length) {
            <div class="box" id="cimp-owners"><strong>{{ 'crm.cimp.owners_unknown' | translate }}</strong><span>{{ r().responsables_desconocidos.join(', ') }}</span></div>
          }
          @if (r().errores.length) {
            <div class="box" id="cimp-errors"><strong>{{ 'crm.imp.errors_title' | translate }}</strong>
              <ul>@for (e of r().errores.slice(0, 50); track $index) { <li>{{ 'crm.imp.row' | translate: { n: e.fila } }}: {{ motivo(e.motivo) }}</li> }</ul>
              @if (r().errores.length > 50) { <span class="muted">{{ 'crm.imp.more_errors' | translate: { n: r().errores.length - 50 } }}</span> }
            </div>
          }
          @if (!aplicables()) { <p class="err">{{ 'crm.cimp.nothing' | translate }}</p> }
          <p class="muted small">{{ 'crm.imp.review_hint' | translate }}</p>
        }

        @case ('importando') {
          <p>{{ 'crm.imp.importing' | translate: { a: hechos(), b: totalBloques() } }}</p>
          <mat-progress-bar mode="determinate" [value]="totalBloques() ? (100 * hechos() / totalBloques()) : 0" />
        }

        @case ('listo') {
          <div class="done" id="cimp-done">
            <mat-icon>task_alt</mat-icon>
            <strong>{{ 'crm.cimp.done' | translate: { n: r().contactos_nuevos, u: r().contactos_actualizados } }}</strong>
            <span>{{ 'crm.cimp.done_detail' | translate: { p: r().personas_creadas, v: r().vinculos_creados, e: r().filas_error } }}</span>
            @if (errorImport()) { <p class="err">{{ errorImport() }}</p> }
          </div>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @switch (paso()) {
        @case ('mapeo') {
          <button mat-button type="button" (click)="reiniciar()">{{ 'crm.imp.other_file' | translate }}</button>
          <button mat-flat-button id="btn-cimp-review" (click)="revisar()" [disabled]="faltan().length > 0 || trabajando()">{{ 'crm.imp.review' | translate }}</button>
        }
        @case ('revision') {
          <button mat-button type="button" (click)="paso.set('mapeo')">{{ 'crm.imp.back' | translate }}</button>
          <button mat-flat-button id="btn-cimp-go" (click)="importar()" [disabled]="!aplicables() || trabajando()">{{ 'crm.cimp.import_n' | translate: { n: aplicables() } }}</button>
        }
        @case ('listo') {
          @if (idLote() && (r().contactos_nuevos || r().personas_creadas)) {
            <button mat-button id="btn-cimp-see" (click)="verImportados()"><mat-icon>filter_list</mat-icon>{{ 'crm.cimp.see_imported' | translate }}</button>
          }
          <button mat-flat-button id="btn-cimp-close" [mat-dialog-close]="true">{{ 'common.close' | translate }}</button>
        }
        @case ('importando') { }
        @default { <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button> }
      }
    </mat-dialog-actions>
  `,
  styles: `
    .steps { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0 0 12px; padding: 0; list-style: none; font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); li.on { color: var(--md-sys-color-primary); } }
    .tipo { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin-bottom: 12px; span { font: var(--mat-sys-title-small); } }
    .drop { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 16px; border: 2px dashed var(--md-sys-color-outline-variant); border-radius: 20px; text-align: center; mat-icon { font-size: 40px; width: 40px; height: 40px; color: var(--md-sys-color-primary); } p { margin: 0; } &.over { border-color: var(--md-sys-color-primary); background: var(--md-sys-color-surface-container-low); } }
    .help { margin-top: 12px; summary { cursor: pointer; color: var(--md-sys-color-primary); } }
    .pre { white-space: pre-line; font: var(--mat-sys-body-small); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin-bottom: 8px; }
    h3 { margin: 16px 0 8px; font: var(--mat-sys-title-small); }
    h4 { margin: 8px 0 6px; font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); }
    .prev { width: 100%; border-collapse: collapse; font: var(--mat-sys-body-small); th, td { padding: 4px 8px; border-bottom: 1px solid var(--md-sys-color-outline-variant); text-align: left; white-space: nowrap; } th { color: var(--md-sys-color-on-surface-variant); } td.bad { color: var(--md-sys-color-error); font-weight: 600; } }
    .save-tpl { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 16px; mat-form-field { flex: 1 1 220px; } }
    .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .kpi { padding: 4px 12px; border-radius: 999px; background: var(--md-sys-color-surface-container-high); font: var(--mat-sys-label-large); &.ok { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); } &.bad { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); } }
    .box { display: flex; flex-direction: column; gap: 6px; padding: 12px 16px; margin-bottom: 12px; border-radius: 12px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); overflow-wrap: anywhere; ul { margin: 0; padding-left: 18px; max-height: 220px; overflow: auto; } &.warn { border-color: var(--md-sys-color-error); } }
    .err { color: var(--md-sys-color-error); }
    .warn-t { display: flex; align-items: center; gap: 4px; margin: 4px 0; color: var(--md-sys-color-on-surface-variant); }
    .small { font: var(--mat-sys-body-small); } .mini { font-size: 16px; width: 16px; height: 16px; vertical-align: -3px; }
    .done { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px; text-align: center; mat-icon { font-size: 48px; width: 48px; height: 48px; color: var(--md-sys-color-tertiary); } }
  `,
})
export class ContactosImportDialogComponent {
  private ref = inject(MatDialogRef<ContactosImportDialogComponent, ContactosImportResult>);
  private d = inject<ContactosImportData | null>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly pasosVisibles: Paso[] = ['archivo', 'mapeo', 'revision', 'listo'];
  readonly paso = signal<Paso>('archivo');
  readonly indicePaso = computed(() => ({ archivo: 0, mapeo: 1, revision: 2, importando: 3, listo: 3 })[this.paso()]);
  readonly arrastrando = signal(false);
  readonly trabajando = signal(false);
  readonly errorArchivo = signal<string | null>(null);
  readonly errorImport = signal<string | null>(null);

  readonly tipo = signal<TipoContacto>(this.d.tipo ?? 'persona');
  readonly archivo = signal<File | null>(null);
  readonly hojas = signal<Hoja[]>([]);
  readonly hoja = signal(0);
  readonly filaEncabezado = signal(1);
  readonly formatoFecha = signal<FormatoFecha>('dmy');
  readonly decimal = signal<SeparadorDecimal>('coma');
  readonly columnas = signal<ColumnasContacto>({});
  readonly identificar = signal<IdentificarImport>('documento');
  readonly idCampo = signal<number | null>(null);
  readonly existentes = signal<OpcionesImportContactos['existentes']>('omitir');
  readonly indicativo = signal('57');
  readonly idResponsable = signal<number | null>(null);
  readonly plantillas = signal<PlantillaImport[]>([]);
  readonly plantillaSel = signal<number | null>(null);
  readonly nombrePlantilla = signal('');
  private readonly camposDef = signal<CampoDef[]>([]);
  readonly usuarios = signal<UsuarioSede[]>([]);

  readonly r = signal<Resumen>(vacio());
  private filasListas: FilaContacto[] = [];
  private erroresLocales: { fila: number; motivo: string }[] = [];
  readonly hechos = signal(0);
  readonly totalBloques = signal(0);
  readonly idLote = signal<number | null>(null);

  /** Campos personalizados activos del tipo que se importa. */
  readonly personalizados = computed<CampoPersonalizadoImport[]>(() =>
    this.camposDef().filter(c => c.activo && c.aplica_a === this.tipo()).map(c => ({ id: c.id, etiqueta: c.etiqueta, clave: c.clave, tipo_dato: c.tipo_dato as CampoPersonalizadoImport['tipo_dato'] })));
  readonly camposIdentificar = computed(() => this.camposDef().filter(c => c.activo && c.aplica_a === this.tipo() && (c.tipo_dato === 'texto' || c.tipo_dato === 'entero')));
  readonly gruposColumnas = computed(() => {
    const t = (c: CampoContacto): Columna => ({ clave: c, etiqueta: this.i18n.t('crm.cimp.f_' + c) });
    const fijos = CAMPOS_CONTACTO[this.tipo()];
    const ref = fijos.filter(c => c.startsWith('ref_'));
    return [
      { titulo: 'crm.cimp.g_data', cols: fijos.filter(c => !c.startsWith('ref_')).map(t) },
      { titulo: 'crm.cimp.g_ref', cols: ref.map(t) },
      { titulo: 'crm.form.custom', cols: this.personalizados().map(c => ({ clave: claveCampo(c.id), etiqueta: c.etiqueta, tipo_dato: c.tipo_dato })) },
    ];
  });
  private readonly todasColumnas = computed<Columna[]>(() => this.gruposColumnas().flatMap(g => g.cols));
  readonly columnasUsadas = computed(() => this.todasColumnas().filter(c => this.columnas()[c.clave] !== null && this.columnas()[c.clave] !== undefined));

  private readonly filas = computed<Celda[][]>(() => this.hojas()[this.hoja()]?.filas ?? []);
  readonly encabezados = computed(() => {
    const fila = this.filas()[this.filaEncabezado() - 1] ?? [];
    const ancho = Math.max(fila.length, ...this.filas().slice(this.filaEncabezado(), this.filaEncabezado() + 20).map(f => f.length));
    return Array.from({ length: ancho }, (_, i) => `${letra(i)} · ${texto(fila[i] ?? null) || '—'}`);
  });
  readonly filasDatos = computed(() => this.filas().slice(this.filaEncabezado()).filter(f => f.some(c => c !== null && String(c).trim() !== '')).length);
  readonly faltan = computed(() => OBLIGATORIOS_CONTACTO[this.tipo()].filter(x => this.columnas()[x] === null || this.columnas()[x] === undefined).map(x => this.i18n.t('crm.cimp.f_' + x)));
  readonly avisosMapeo = computed(() => {
    const out: string[] = [];
    const c = this.columnas();
    if (this.tipo() === 'organizacion' && (c['ref_nombres'] === null || c['ref_nombres'] === undefined)) out.push(this.i18n.t('crm.cimp.warn_ref'));
    const oblig = this.camposDef().filter(x => x.activo && x.obligatorio && x.aplica_a === this.tipo() && (c[claveCampo(x.id)] === null || c[claveCampo(x.id)] === undefined));
    if (oblig.length) out.push(this.i18n.t('crm.cimp.warn_required', { campos: oblig.map(x => x.etiqueta).join(', ') }));
    return out;
  });
  readonly mapeo = computed<MapeoContactos>(() => ({
    tipo: this.tipo(), columnas: this.columnas(), fila_encabezado: this.filaEncabezado(), formato_fecha: this.formatoFecha(), decimal: this.decimal(), hoja: this.hojas()[this.hoja()]?.nombre,
  }));
  readonly opciones = computed<OpcionesImportContactos>(() => ({
    tipo: this.tipo(), identificar: this.identificar(), id_campo: this.idCampo(), existentes: this.existentes(), indicativo: this.indicativo().replace(/\D/g, '') || '57', id_responsable: this.idResponsable(),
  }));
  /** Cuántos contactos cambiarían (nuevos + actualizados). */
  readonly aplicables = computed(() => this.r().contactos_nuevos + this.r().contactos_actualizados);

  /** Las primeras filas como se van a interpretar; en rojo lo que no se puede leer. */
  readonly vistaPrevia = computed(() => {
    const m = this.mapeo();
    const out: { fila: number; valores: Record<string, string>; malos: Set<string> }[] = [];
    const cols = this.columnasUsadas();
    for (let i = m.fila_encabezado; i < this.filas().length && out.length < 8; i++) {
      const f = this.filas()[i] ?? [];
      if (!f.some(c => c !== null && String(c).trim() !== '')) continue;
      const valores: Record<string, string> = {}, malos = new Set<string>();
      for (const c of cols) {
        const v = f[m.columnas[c.clave]!] ?? null;
        const esFecha = c.clave === 'fecha_nacimiento' || c.tipo_dato === 'fecha';
        const esNum = c.clave === 'lat' || c.clave === 'lng' || c.tipo_dato === 'entero' || c.tipo_dato === 'decimal';
        if (esFecha) { const d = parsearFecha(v, m.formato_fecha); valores[c.clave] = d ? formatDate(d) : texto(v); if (!d && texto(v)) malos.add(c.clave); }
        else if (esNum) {
          const n = parsearNumero(v, m.decimal);
          valores[c.clave] = n === null ? '' : Number.isNaN(n) ? texto(v) : n.toLocaleString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 6 });
          if (n !== null && Number.isNaN(n)) malos.add(c.clave);
        } else if (c.tipo_dato === 'booleano') {
          const b = parsearBooleano(v);
          valores[c.clave] = b === null ? '' : typeof b === 'number' ? texto(v) : this.i18n.t(b === 'true' ? 'common.yes' : 'common.no');
          if (typeof b === 'number') malos.add(c.clave);
        } else { valores[c.clave] = texto(v); }
      }
      const nombre = m.tipo === 'persona' ? 'nombres' : 'razon_social';
      if (m.columnas[nombre] !== null && m.columnas[nombre] !== undefined && !valores[nombre]) malos.add(nombre);
      out.push({ fila: i + 1, valores, malos });
    }
    return out;
  });

  constructor() {
    void this.cargarCatalogos();
  }

  private async cargarCatalogos(): Promise<void> {
    const [p, c, u] = await Promise.all([this.crm.listImportPlantillas('contactos'), this.crm.listCampos(true), this.crm.listResponsables()]);
    if (p.action && p.data) this.plantillas.set(p.data.plantillas);
    if (c.action && c.data) this.camposDef.set(c.data.campos);
    if (u.action && u.data) this.usuarios.set(u.data.usuarios);
  }

  t(k: string, p?: Record<string, string | number>): string { return this.i18n.t(k, p); }
  esObligatorio(clave: string): boolean {
    if ((OBLIGATORIOS_CONTACTO[this.tipo()] as readonly string[]).includes(clave)) return true;
    const id = clave.startsWith('campo:') ? Number(clave.slice(6)) : 0;
    return !!id && !!this.camposDef().find(c => c.id === id && c.obligatorio);
  }
  motivo(m: string): string {
    if (m.startsWith('repetido:')) return this.t('crm.cimp.err_repetido', { n: m.slice(9) });
    const k = 'crm.cimp.err_' + m;
    const s = this.t(k);
    return s === k ? m : s;
  }

  // ─── Paso 1: qué y archivo ─────────────────────────────────────────────────────────────────────────────────────
  cambiarTipo(t: TipoContacto): void {
    this.tipo.set(t);
    this.idCampo.set(null);
    if (this.identificar() === 'campo') this.identificar.set('documento');
    if (this.hojas().length) this.cambiarHoja(this.hoja());
  }

  soltar(e: DragEvent): void {
    e.preventDefault();
    this.arrastrando.set(false);
    void this.elegir(e.dataTransfer?.files ?? null);
  }

  async elegir(files: FileList | null): Promise<void> {
    const f = files?.[0];
    if (!f) return;
    this.errorArchivo.set(null);
    if (f.size > 25 * 1024 * 1024) { this.errorArchivo.set(this.t('crm.imp.too_big')); return; }
    this.trabajando.set(true);
    try {
      const hojas = await leerArchivo(f);
      if (!hojas.length) { this.errorArchivo.set(this.t('crm.imp.empty')); return; }
      this.archivo.set(f);
      this.hojas.set(hojas);
      this.cambiarHoja(0);
      this.paso.set('mapeo');
    } catch (e) {
      this.errorArchivo.set(this.t(e instanceof Error && e.message === 'xls' ? 'crm.imp.xls' : 'crm.imp.unreadable'));
    } finally {
      this.trabajando.set(false);
    }
  }

  cambiarHoja(i: number): void {
    this.hoja.set(i);
    const enc = detectarEncabezado(this.filas());
    this.filaEncabezado.set(enc);
    this.columnas.set(mapeoContactos((this.filas()[enc - 1] ?? []).map(c => texto(c)), this.tipo(), this.personalizados()));
  }

  reiniciar(): void {
    this.archivo.set(null); this.hojas.set([]); this.r.set(vacio()); this.paso.set('archivo');
  }

  /** Formato de ejemplo en Excel del tipo elegido: los encabezados que se reconocen solos (con los campos personalizados) y dos filas. */
  async ejemplo(): Promise<void> {
    const mod = await import('exceljs');
    const EJ = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const wb = new EJ.Workbook();
    const ws = wb.addWorksheet(this.t('crm.imp.sample_sheet'));
    const persona = this.tipo() === 'persona';
    const base: [string, number][] = persona
      ? [['Nombres', 14], ['Apellidos', 16], ['Tipo de documento', 10], ['Documento', 14], ['Correo', 24], ['Teléfono', 14], ['WhatsApp', 14], ['Fecha de nacimiento', 12],
         ['Dirección', 22], ['Ciudad', 12], ['Responsable', 16], ['Etiquetas', 16], ['Empresa', 14], ['Cargo', 14]]
      : [['Razón social', 26], ['Tipo de documento', 10], ['NIT', 14], ['Correo de facturación', 24], ['Teléfono', 14], ['Dirección', 22], ['Ciudad', 12],
         ['Responsable', 16], ['Etiquetas', 16], ['Pertenece a', 14], ['Contacto', 14], ['Apellidos contacto', 16], ['Cargo contacto', 14], ['Teléfono contacto', 14],
         ['Correo contacto', 22], ['Cédula contacto', 14], ['WhatsApp contacto', 14]];
    const pers = this.personalizados();
    ws.columns = [...base.map(([header, width]) => ({ header, width })), ...pers.map(c => ({ header: c.etiqueta, width: 16 }))];
    ws.getRow(1).font = { bold: true };
    const extra = pers.map(() => null);
    if (persona) {
      ws.addRow(['Laura', 'Gómez Ruiz', 'CC', '1098765432', 'laura@ejemplo.com', '6015550001', '3001234567', new Date(Date.UTC(1990, 4, 20)), 'Calle 1 # 2-3', 'Bogotá', '', 'VIP', '', '', ...extra]);
      ws.addRow(['Carlos', 'Mejía', 'CC', '80111222', 'carlos@ejemplo.com', '', '3109998877', null, '', 'Medellín', '', '', '900123456-7', 'Compras', ...extra]);
      ws.getCell(2, 8).numFmt = 'dd/mm/yyyy';
    } else {
      ws.addRow(['Grupo Pinturas SAS', 'NIT', '900123456-7', 'facturacion@ejemplo.com', '6014440001', 'Cra 10 # 20-30', 'Medellín', '', '', '', 'Jorge', 'Pérez', 'Dueño', '3104445566', 'jorge@ejemplo.com', '71000111', '3104445566', ...extra]);
      ws.addRow(['Tienda Pinturas Centro', 'NIT', '900123457-1', '', '6014440002', 'Calle 50 # 45-10', 'Medellín', '', '', '900123456-7', 'Lina', 'Ramírez', 'Administrador', '3001112233', '', '', '', ...extra]);
    }
    const buf = await wb.xlsx.writeBuffer();
    descargarBlob(new Blob([buf as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), persona ? 'formato-importacion-personas.xlsx' : 'formato-importacion-organizaciones.xlsx');
  }

  // ─── Paso 2: columnas y plantillas ─────────────────────────────────────────────────────────────────────────────
  setColumna(c: string, i: number | null): void { this.columnas.update(m => ({ ...m, [c]: i })); }

  usarPlantilla(id: number | null): void {
    this.plantillaSel.set(id);
    const p = this.plantillas().find(x => x.id === id);
    if (!p) return;
    const m = p.mapeo as Partial<MapeoContactos> & { opciones?: Partial<OpcionesImportContactos> };
    if (m.tipo) this.tipo.set(m.tipo);
    if (m.fila_encabezado) this.filaEncabezado.set(m.fila_encabezado);
    if (m.columnas) this.columnas.set({ ...m.columnas });
    if (m.formato_fecha) this.formatoFecha.set(m.formato_fecha);
    if (m.decimal) this.decimal.set(m.decimal);
    const o = m.opciones ?? {};
    if (o.identificar) this.identificar.set(o.identificar);
    this.idCampo.set(o.id_campo ?? null);
    if (o.existentes) this.existentes.set(o.existentes);
    if (o.indicativo) this.indicativo.set(o.indicativo);
    this.idResponsable.set(o.id_responsable ?? null);
    this.nombrePlantilla.set(p.nombre);
  }

  async guardarPlantilla(): Promise<void> {
    const nombre = this.nombrePlantilla().trim();
    const mapeo: Partial<MapeoContactos> = { ...this.mapeo() };
    delete mapeo.hoja;   // la hoja cambia de un archivo a otro: no se guarda
    const r = await this.crm.saveImportPlantilla(nombre, { ...mapeo, opciones: this.opciones() }, true, 'contactos');
    if (!r.action) { await this.dialogs.error({ title: this.t('crm.imp.template_error'), message: r.mensaje }); return; }
    const p = await this.crm.listImportPlantillas('contactos');
    if (p.action && p.data) this.plantillas.set(p.data.plantillas);
    this.plantillaSel.set(this.plantillas().find(x => x.nombre === nombre)?.id ?? null);
    await this.dialogs.success({ title: this.t('crm.imp.template_saved'), message: nombre });
  }

  // ─── Paso 3: revisión (simulación) ─────────────────────────────────────────────────────────────────────────────
  async revisar(): Promise<void> {
    if (this.identificar() === 'campo' && !this.idCampo()) { await this.dialogs.error({ title: this.t('crm.cimp.title'), message: this.t('crm.imp.pick_field') }); return; }
    this.trabajando.set(true);
    try {
      const armado = armarContactos(this.filas(), this.mapeo(), this.personalizados(), this.identificar(), this.idCampo());
      this.filasListas = this.tipo() === 'organizacion' ? ordenarPorMatriz(armado.filas) : armado.filas;
      this.erroresLocales = armado.errores;
      const acc = vacio();
      acc.filas_leidas = armado.total;
      acc.errores = [...armado.errores];
      acc.filas_error = armado.errores.length;
      const partes = bloquesContactos(this.filasListas);
      const padres = padresPorBloque(partes);
      for (let i = 0; i < partes.length; i++) {
        const r = await this.crm.importarContactos('simular', partes[i], this.opciones(), { padres: padres[i], archivo: this.archivo()?.name });
        if (!r.action || !r.data) { await this.dialogs.error({ title: this.t('crm.imp.review_error'), message: r.mensaje }); return; }
        this.acumular(acc, r.data);
      }
      acc.errores.sort((a, b) => a.fila - b.fila);
      this.r.set(acc);
      this.paso.set('revision');
    } catch {
      await this.dialogs.error({ title: this.t('crm.imp.review_error'), message: this.t('common.error') });
    } finally {
      this.trabajando.set(false);
    }
  }

  private acumular(acc: Resumen, d: ResultadoBloqueContactos): void {
    acc.filas_ok += d.filas_ok; acc.filas_error += d.filas_error; acc.contactos_nuevos += d.contactos_nuevos; acc.contactos_actualizados += d.contactos_actualizados;
    acc.contactos_omitidos += d.contactos_omitidos; acc.personas_creadas += d.personas_creadas; acc.vinculos_creados += d.vinculos_creados;
    acc.errores.push(...d.errores);
    acc.organizaciones_no_encontradas = unir(acc.organizaciones_no_encontradas, d.organizaciones_no_encontradas);
    acc.etiquetas_desconocidas = unir(acc.etiquetas_desconocidas, d.etiquetas_desconocidas);
    acc.roles_desconocidos = unir(acc.roles_desconocidos, d.roles_desconocidos);
    acc.responsables_desconocidos = unir(acc.responsables_desconocidos, d.responsables_desconocidos);
  }

  // ─── Paso 4: importar por bloques ──────────────────────────────────────────────────────────────────────────────
  async importar(): Promise<void> {
    const partes = bloquesContactos(this.filasListas);
    this.trabajando.set(true);
    this.totalBloques.set(partes.length);
    this.hechos.set(0);
    this.paso.set('importando');
    this.ref.disableClose = true;
    const acc = vacio();
    acc.filas_leidas = this.r().filas_leidas;
    acc.errores = [...this.erroresLocales];
    acc.filas_error = this.erroresLocales.length;
    try {
      const ini = await this.crm.iniciarImportacionContactos(this.archivo()?.name ?? '', acc.filas_leidas, this.opciones(), this.mapeo());
      if (!ini.action || !ini.data) throw new Error(ini.mensaje);
      this.idLote.set(ini.data.id);
      for (const b of partes) {
        const r = await this.crm.importarContactos('bloque', b, this.opciones(), { idImportacion: ini.data.id });
        if (!r.action || !r.data) throw new Error(r.mensaje);
        this.acumular(acc, r.data);
        this.hechos.update(n => n + 1);
      }
      const fin = await this.crm.finalizarImportacionContactos(ini.data.id);
      if (!fin.action) throw new Error(fin.mensaje);
    } catch (e) {
      this.errorImport.set(this.t('crm.imp.partial', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      this.r.set(acc);
      this.ref.disableClose = false;
      this.trabajando.set(false);
      this.paso.set('listo');
    }
  }

  verImportados(): void {
    const id = this.idLote();
    if (id) this.ref.close({ lote: { id, archivo: this.archivo()?.name ?? '#' + id } });
  }
}

/** Abre el asistente de importación de contactos con el tamaño estándar. */
export function abrirImportarContactos(matDialog: MatDialog, data: ContactosImportData = {}): MatDialogRef<ContactosImportDialogComponent, ContactosImportResult> {
  return matDialog.open(ContactosImportDialogComponent, { ...dialogSize('960px'), data, autoFocus: 'first-tabbable' });
}
