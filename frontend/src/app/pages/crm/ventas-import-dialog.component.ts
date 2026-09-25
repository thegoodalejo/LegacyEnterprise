import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { CrmConfigService } from '../../services/crm-config.service';
import { CampoDef, CrmService, OpcionesImport, PlantillaImport, ResultadoBloque } from '../../services/crm.service';
import { DialogService } from '../../services/dialog.service';
import {
  CAMPOS_VENTA, CampoVenta, Celda, Columnas, ErrorFila, FormatoFecha, Hoja, MapeoVentas, SeparadorDecimal, VentaImport, armarVentas, bloques,
  detectarEncabezado, leerArchivo, mapeoAutomatico, parsearFecha, parsearNumero, texto,
} from '../../services/import/import-parse';
import { descargarBlob } from '../../services/reports/download.util';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDate } from './crm-format';

type Paso = 'archivo' | 'mapeo' | 'revision' | 'importando' | 'listo';
interface Resumen extends Omit<ResultadoBloque, 'errores'> { errores: ErrorFila[]; filas_leidas: number; ventas: number }

const vacio = (): Resumen => ({
  filas_ok: 0, filas_error: 0, ventas_nuevas: 0, ventas_reemplazadas: 0, ventas_omitidas: 0, items_creados: 0, total_valor: 0, fecha_desde: null, fecha_hasta: null,
  errores: [], clientes_no_encontrados: [], filas_leidas: 0, ventas: 0,
});
const OBLIGATORIOS: CampoVenta[] = ['fecha', 'cliente'];
const letra = (i: number): string => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

/**
 * Importar ventas desde Excel (.xlsx) o CSV: 1) archivo, 2) columnas y opciones (con plantillas guardadas y vista previa ya interpretada),
 * 3) revisión = simulación completa en el servidor (nada se guarda), 4) importación por bloques con progreso. Cierra con true si importó.
 */
@Component({
  selector: 'app-ventas-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatHint, MatLabel, MatIcon, MatInput, MatProgressBar, MatSelect, MatOption, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'crm.imp.title' | translate }}</h2>
    <mat-dialog-content>
      <ol class="steps" aria-hidden="true">
        @for (p of pasosVisibles; track p; let i = $index) { <li [class.on]="indicePaso() >= i">{{ i + 1 }}. {{ 'crm.imp.step_' + p | translate }}</li> }
      </ol>

      @switch (paso()) {
        @case ('archivo') {
          <section class="drop" [class.over]="arrastrando()" (dragover)="$event.preventDefault(); arrastrando.set(true)" (dragleave)="arrastrando.set(false)" (drop)="soltar($event)">
            <mat-icon>upload_file</mat-icon>
            <p>{{ 'crm.imp.drop' | translate }}</p>
            <input #fi type="file" id="imp-file" accept=".xlsx,.csv,.txt" hidden (change)="elegir(fi.files)" />
            <button mat-flat-button type="button" id="btn-imp-file" (click)="fi.click()"><mat-icon>folder_open</mat-icon>{{ 'crm.imp.choose' | translate }}</button>
            <p class="muted small">{{ 'crm.imp.formats' | translate }}</p>
            <button mat-button type="button" id="btn-imp-sample" (click)="ejemplo()"><mat-icon>download</mat-icon>{{ 'crm.imp.sample' | translate }}</button>
          </section>
          @if (errorArchivo()) { <p class="err" id="imp-file-error">{{ errorArchivo() }}</p> }
          <details class="help"><summary>{{ 'crm.imp.help_title' | translate }}</summary><p class="pre">{{ 'crm.imp.help' | translate }}</p></details>
        }

        @case ('mapeo') {
          <p class="muted" id="imp-file-name"><mat-icon class="mini">description</mat-icon> {{ archivo()?.name }} · {{ 'crm.imp.rows' | translate: { n: filasDatos() } }}</p>
          <div class="grid">
            @if (hojas().length > 1) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'crm.imp.sheet' | translate }}</mat-label>
                <mat-select id="imp-hoja" [ngModel]="hoja()" (ngModelChange)="cambiarHoja($event)">
                  @for (h of hojas(); track h.nombre; let i = $index) { <mat-option [value]="i">{{ h.nombre }}</mat-option> }
                </mat-select>
              </mat-form-field>
            }
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.template' | translate }}</mat-label>
              <mat-select id="imp-plantilla" [ngModel]="plantillaSel()" (ngModelChange)="usarPlantilla($event)">
                <mat-option [value]="null">{{ 'crm.imp.template_none' | translate }}</mat-option>
                @for (p of plantillas(); track p.id) { <mat-option [value]="p.id">{{ p.nombre }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.header_row' | translate }}</mat-label>
              <input matInput id="imp-encabezado" type="number" min="1" [ngModel]="filaEncabezado()" (ngModelChange)="filaEncabezado.set(+$event || 1)" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.date_format' | translate }}</mat-label>
              <mat-select id="imp-fecha" [ngModel]="formatoFecha()" (ngModelChange)="formatoFecha.set($event)">
                <mat-option value="dmy">dd/mm/aaaa</mat-option><mat-option value="ymd">aaaa-mm-dd</mat-option><mat-option value="mdy">mm/dd/aaaa</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.decimal' | translate }}</mat-label>
              <mat-select id="imp-decimal" [ngModel]="decimal()" (ngModelChange)="decimal.set($event)">
                <mat-option value="coma">{{ 'crm.imp.decimal_coma' | translate }}</mat-option><mat-option value="punto">{{ 'crm.imp.decimal_punto' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          <h3>{{ 'crm.imp.columns' | translate }}</h3>
          <div class="grid">
            @for (c of campos; track c) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'crm.imp.f_' + c | translate }}{{ obligatorio(c) ? ' *' : '' }}</mat-label>
                <mat-select [id]="'imp-col-' + c" [ngModel]="columnas()[c] ?? null" (ngModelChange)="setColumna(c, $event)">
                  <mat-option [value]="null">—</mat-option>
                  @for (e of encabezados(); track $index) { <mat-option [value]="$index">{{ e }}</mat-option> }
                </mat-select>
              </mat-form-field>
            }
          </div>
          @if (faltan().length) { <p class="err" id="imp-missing">{{ 'crm.imp.missing' | translate: { campos: faltan().join(', ') } }}</p> }

          <h3>{{ 'crm.imp.options' | translate }}</h3>
          <div class="grid">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.identify' | translate }}</mat-label>
              <mat-select id="imp-identificar" [ngModel]="identificar()" (ngModelChange)="identificar.set($event)">
                <mat-option value="documento">{{ 'crm.imp.identify_documento' | translate }}</mat-option>
                <mat-option value="nombre">{{ 'crm.imp.identify_nombre' | translate }}</mat-option>
                <mat-option value="campo" [disabled]="!camposCliente().length">{{ 'crm.imp.identify_campo' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>
            @if (identificar() === 'campo') {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'crm.imp.identify_field' | translate }}</mat-label>
                <mat-select id="imp-campo" [ngModel]="idCampo()" (ngModelChange)="idCampo.set($event)">
                  @for (c of camposCliente(); track c.id) { <mat-option [value]="c.id">{{ c.etiqueta }}</mat-option> }
                </mat-select>
              </mat-form-field>
            }
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.new_items' | translate }}</mat-label>
              <mat-select id="imp-items" [ngModel]="itemsNuevos()" (ngModelChange)="itemsNuevos.set($event)">
                <mat-option value="sin_item">{{ 'crm.imp.new_items_sin' | translate }}</mat-option><mat-option value="crear">{{ 'crm.imp.new_items_crear' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.duplicates' | translate }}</mat-label>
              <mat-select id="imp-dup" [ngModel]="duplicados()" (ngModelChange)="duplicados.set($event)">
                <mat-option value="omitir">{{ 'crm.imp.dup_omitir' | translate }}</mat-option><mat-option value="reemplazar">{{ 'crm.imp.dup_reemplazar' | translate }}</mat-option>
              </mat-select>
              <mat-hint>{{ 'crm.imp.dup_hint' | translate }}</mat-hint>
            </mat-form-field>
          </div>

          <h3>{{ 'crm.imp.preview' | translate }}</h3>
          <div class="table-scroll">
            <table class="prev" id="imp-preview">
              <thead><tr><th>#</th>@for (c of campos; track c) { @if (columnas()[c] !== null && columnas()[c] !== undefined) { <th>{{ 'crm.imp.f_' + c | translate }}</th> } }</tr></thead>
              <tbody>
                @for (f of vistaPrevia(); track f.fila) {
                  <tr><td class="muted">{{ f.fila }}</td>
                    @for (c of campos; track c) { @if (columnas()[c] !== null && columnas()[c] !== undefined) { <td [class.bad]="f.malos.has(c)">{{ f.valores[c] }}</td> } }
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="save-tpl">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'crm.imp.template_name' | translate }}</mat-label>
              <input matInput id="imp-tpl-name" maxlength="80" [ngModel]="nombrePlantilla()" (ngModelChange)="nombrePlantilla.set($event)" />
            </mat-form-field>
            <button mat-stroked-button type="button" id="btn-save-tpl" (click)="guardarPlantilla()" [disabled]="!nombrePlantilla().trim() || faltan().length > 0"><mat-icon>bookmark_add</mat-icon>{{ 'crm.imp.template_save' | translate }}</button>
          </div>
        }

        @case ('revision') {
          <div class="kpis" id="imp-review">
            <span class="kpi"><b>{{ r().filas_leidas }}</b> {{ 'crm.imp.k_rows' | translate }}</span>
            <span class="kpi ok"><b>{{ r().ventas_nuevas }}</b> {{ 'crm.imp.k_new' | translate }}</span>
            @if (r().ventas_reemplazadas) { <span class="kpi"><b>{{ r().ventas_reemplazadas }}</b> {{ 'crm.imp.k_replaced' | translate }}</span> }
            @if (r().ventas_omitidas) { <span class="kpi"><b>{{ r().ventas_omitidas }}</b> {{ 'crm.imp.k_skipped' | translate }}</span> }
            @if (r().items_creados) { <span class="kpi"><b>{{ r().items_creados }}</b> {{ 'crm.imp.k_items' | translate }}</span> }
            <span class="kpi" [class.bad]="r().filas_error > 0"><b>{{ r().filas_error }}</b> {{ 'crm.imp.k_errors' | translate }}</span>
            <span class="kpi"><b>{{ cfg.money(r().total_valor) }}</b>@if (r().fecha_desde) { · {{ fmt(r().fecha_desde!) }} – {{ fmt(r().fecha_hasta!) }} }</span>
          </div>
          @if (r().clientes_no_encontrados.length) {
            <div class="box warn" id="imp-not-found"><strong>{{ 'crm.imp.not_found' | translate: { n: r().clientes_no_encontrados.length } }}</strong>
              <span>{{ r().clientes_no_encontrados.slice(0, 20).join(', ') }}{{ r().clientes_no_encontrados.length > 20 ? '…' : '' }}</span></div>
          }
          @if (r().errores.length) {
            <div class="box" id="imp-errors"><strong>{{ 'crm.imp.errors_title' | translate }}</strong>
              <ul>@for (e of r().errores.slice(0, 50); track $index) { <li>{{ 'crm.imp.row' | translate: { n: e.fila } }}: {{ motivo(e.motivo) }}</li> }</ul>
              @if (r().errores.length > 50) { <span class="muted">{{ 'crm.imp.more_errors' | translate: { n: r().errores.length - 50 } }}</span> }
            </div>
          }
          @if (!r().ventas_nuevas && !r().ventas_reemplazadas) { <p class="err">{{ 'crm.imp.nothing' | translate }}</p> }
          <p class="muted small">{{ 'crm.imp.review_hint' | translate }}</p>
        }

        @case ('importando') {
          <p>{{ 'crm.imp.importing' | translate: { a: hechos(), b: totalBloques() } }}</p>
          <mat-progress-bar mode="determinate" [value]="totalBloques() ? (100 * hechos() / totalBloques()) : 0" />
        }

        @case ('listo') {
          <div class="done" id="imp-done">
            <mat-icon>task_alt</mat-icon>
            <strong>{{ 'crm.imp.done' | translate: { n: r().ventas_nuevas + r().ventas_reemplazadas } }}</strong>
            <span>{{ cfg.money(r().total_valor) }} · {{ 'crm.imp.k_errors' | translate }}: {{ r().filas_error }}</span>
            @if (errorImport()) { <p class="err">{{ errorImport() }}</p> }
          </div>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @switch (paso()) {
        @case ('mapeo') {
          <button mat-button type="button" (click)="reiniciar()">{{ 'crm.imp.other_file' | translate }}</button>
          <button mat-flat-button id="btn-imp-review" (click)="revisar()" [disabled]="faltan().length > 0 || trabajando()">{{ 'crm.imp.review' | translate }}</button>
        }
        @case ('revision') {
          <button mat-button type="button" (click)="paso.set('mapeo')">{{ 'crm.imp.back' | translate }}</button>
          <button mat-flat-button id="btn-imp-go" (click)="importar()" [disabled]="(!r().ventas_nuevas && !r().ventas_reemplazadas) || trabajando()">
            {{ 'crm.imp.import_n' | translate: { n: r().ventas_nuevas + r().ventas_reemplazadas } }}
          </button>
        }
        @case ('listo') { <button mat-flat-button id="btn-imp-close" [mat-dialog-close]="true">{{ 'common.close' | translate }}</button> }
        @case ('importando') { }
        @default { <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button> }
      }
    </mat-dialog-actions>
  `,
  styles: `
    .steps { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0 0 12px; padding: 0; list-style: none; font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); li.on { color: var(--md-sys-color-primary); } }
    .drop { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 16px; border: 2px dashed var(--md-sys-color-outline-variant); border-radius: 20px; text-align: center; mat-icon { font-size: 40px; width: 40px; height: 40px; color: var(--md-sys-color-primary); } p { margin: 0; } &.over { border-color: var(--md-sys-color-primary); background: var(--md-sys-color-surface-container-low); } }
    .help { margin-top: 12px; summary { cursor: pointer; color: var(--md-sys-color-primary); } }
    .pre { white-space: pre-line; font: var(--mat-sys-body-small); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin-bottom: 8px; }
    h3 { margin: 16px 0 8px; font: var(--mat-sys-title-small); }
    .prev { width: 100%; border-collapse: collapse; font: var(--mat-sys-body-small); th, td { padding: 4px 8px; border-bottom: 1px solid var(--md-sys-color-outline-variant); text-align: left; white-space: nowrap; } th { color: var(--md-sys-color-on-surface-variant); } td.bad { color: var(--md-sys-color-error); font-weight: 600; } }
    .save-tpl { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 16px; mat-form-field { flex: 1 1 220px; } }
    .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .kpi { padding: 4px 12px; border-radius: 999px; background: var(--md-sys-color-surface-container-high); font: var(--mat-sys-label-large); &.ok { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); } &.bad { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); } }
    .box { display: flex; flex-direction: column; gap: 6px; padding: 12px 16px; margin-bottom: 12px; border-radius: 12px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); overflow-wrap: anywhere; ul { margin: 0; padding-left: 18px; max-height: 220px; overflow: auto; } &.warn { border-color: var(--md-sys-color-error); } }
    .err { color: var(--md-sys-color-error); }
    .small { font: var(--mat-sys-body-small); } .mini { font-size: 16px; width: 16px; height: 16px; vertical-align: -3px; }
    .done { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px; text-align: center; mat-icon { font-size: 48px; width: 48px; height: 48px; color: var(--md-sys-color-tertiary); } }
  `,
})
export class VentasImportDialogComponent {
  private ref = inject(MatDialogRef<VentasImportDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  readonly cfg = inject(CrmConfigService);

  readonly campos = CAMPOS_VENTA;
  readonly pasosVisibles: Paso[] = ['archivo', 'mapeo', 'revision', 'listo'];
  readonly paso = signal<Paso>('archivo');
  readonly indicePaso = computed(() => ({ archivo: 0, mapeo: 1, revision: 2, importando: 3, listo: 3 })[this.paso()]);
  readonly arrastrando = signal(false);
  readonly trabajando = signal(false);
  readonly errorArchivo = signal<string | null>(null);
  readonly errorImport = signal<string | null>(null);

  readonly archivo = signal<File | null>(null);
  readonly hojas = signal<Hoja[]>([]);
  readonly hoja = signal(0);
  readonly filaEncabezado = signal(1);
  readonly formatoFecha = signal<FormatoFecha>('dmy');
  readonly decimal = signal<SeparadorDecimal>('coma');
  readonly columnas = signal<Columnas>({});
  readonly identificar = signal<OpcionesImport['identificar']>('documento');
  readonly idCampo = signal<number | null>(null);
  readonly itemsNuevos = signal<OpcionesImport['items_nuevos']>('sin_item');
  readonly duplicados = signal<OpcionesImport['duplicados']>('omitir');
  readonly plantillas = signal<PlantillaImport[]>([]);
  readonly plantillaSel = signal<number | null>(null);
  readonly nombrePlantilla = signal('');
  readonly camposCliente = signal<CampoDef[]>([]);

  readonly r = signal<Resumen>(vacio());
  private ventas: VentaImport[] = [];
  readonly hechos = signal(0);
  readonly totalBloques = signal(0);

  private readonly filas = computed<Celda[][]>(() => this.hojas()[this.hoja()]?.filas ?? []);
  readonly encabezados = computed(() => {
    const fila = this.filas()[this.filaEncabezado() - 1] ?? [];
    const ancho = Math.max(fila.length, ...this.filas().slice(this.filaEncabezado(), this.filaEncabezado() + 20).map(f => f.length));
    return Array.from({ length: ancho }, (_, i) => `${letra(i)} · ${texto(fila[i] ?? null) || '—'}`);
  });
  readonly filasDatos = computed(() => this.filas().slice(this.filaEncabezado()).filter(f => f.some(c => c !== null && String(c).trim() !== '')).length);
  readonly faltan = computed(() => {
    const c = this.columnas();
    const f = OBLIGATORIOS.filter(x => c[x] === null || c[x] === undefined).map(x => this.i18n.t('crm.imp.f_' + x));
    if ((c.precio === null || c.precio === undefined) && (c.total === null || c.total === undefined)) f.push(this.i18n.t('crm.imp.price_or_total'));
    return f;
  });
  readonly mapeo = computed<MapeoVentas>(() => ({
    columnas: this.columnas(), fila_encabezado: this.filaEncabezado(), formato_fecha: this.formatoFecha(), decimal: this.decimal(), hoja: this.hojas()[this.hoja()]?.nombre,
  }));
  readonly opciones = computed<OpcionesImport>(() => ({ identificar: this.identificar(), id_campo: this.idCampo(), items_nuevos: this.itemsNuevos(), duplicados: this.duplicados() }));

  /** Las primeras filas como se van a interpretar; en rojo lo que no se puede leer. */
  readonly vistaPrevia = computed(() => {
    const m = this.mapeo();
    const out: { fila: number; valores: Partial<Record<CampoVenta, string>>; malos: Set<CampoVenta> }[] = [];
    for (let i = m.fila_encabezado; i < this.filas().length && out.length < 8; i++) {
      const f = this.filas()[i] ?? [];
      if (!f.some(c => c !== null && String(c).trim() !== '')) continue;
      const valores: Partial<Record<CampoVenta, string>> = {}, malos = new Set<CampoVenta>();
      for (const c of CAMPOS_VENTA) {
        const idx = m.columnas[c];
        if (idx === null || idx === undefined) continue;
        const v = f[idx] ?? null;
        if (c === 'fecha') { const d = parsearFecha(v, m.formato_fecha); valores[c] = d ? formatDate(d) : texto(v); if (!d) malos.add(c); }
        else if (c === 'cantidad' || c === 'precio' || c === 'total') {
          const n = parsearNumero(v, m.decimal);
          valores[c] = n === null ? '' : Number.isNaN(n) ? texto(v) : n.toLocaleString(this.i18n.lang() === 'en' ? 'en-US' : 'es-CO');
          if (n !== null && Number.isNaN(n)) malos.add(c);
        } else { valores[c] = texto(v); if (c === 'cliente' && !valores[c]) malos.add(c); }
      }
      out.push({ fila: i + 1, valores, malos });
    }
    return out;
  });

  constructor() {
    void this.cargarCatalogos();
  }

  private async cargarCatalogos(): Promise<void> {
    const [p, c] = await Promise.all([this.crm.listImportPlantillas(), this.crm.listCampos(true)]);
    if (p.action && p.data) this.plantillas.set(p.data.plantillas);
    if (c.action && c.data) this.camposCliente.set(c.data.campos.filter(x => x.aplica_a !== 'oportunidad' && (x.tipo_dato === 'texto' || x.tipo_dato === 'entero')));
  }

  t(k: string, p?: Record<string, string | number>): string { return this.i18n.t(k, p); }
  fmt(iso: string): string { return formatDate(iso); }
  obligatorio(c: CampoVenta): boolean { return OBLIGATORIOS.includes(c); }
  motivo(m: string): string { const k = 'crm.imp.err_' + m; const s = this.t(k); return s === k ? m : s; }

  // ─── Paso 1: archivo ───────────────────────────────────────────────────────────────────────────────────────────
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
    this.columnas.set(mapeoAutomatico((this.filas()[enc - 1] ?? []).map(c => texto(c))));
  }

  reiniciar(): void {
    this.archivo.set(null); this.hojas.set([]); this.r.set(vacio()); this.paso.set('archivo');
  }

  /** Formato de ejemplo en Excel: los encabezados que se reconocen solos y dos filas. */
  async ejemplo(): Promise<void> {
    const mod = await import('exceljs');
    const EJ = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const wb = new EJ.Workbook();
    const ws = wb.addWorksheet(this.t('crm.imp.sample_sheet'));
    ws.columns = [
      { header: 'Fecha', width: 12 }, { header: 'NIT cliente', width: 16 }, { header: 'Factura', width: 12 }, { header: 'Código', width: 12 },
      { header: 'Descripción', width: 32 }, { header: 'Cantidad', width: 10 }, { header: 'Precio unitario', width: 16 }, { header: 'Total', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRow([new Date(Date.UTC(2026, 8, 1)), '900123456-7', 'FV-1001', 'P-001', 'Producto o servicio de ejemplo', 10, 25000, 250000]);
    ws.addRow([new Date(Date.UTC(2026, 8, 1)), '900123456-7', 'FV-1001', 'P-002', 'Otro producto de la misma factura', 2, 80000, 160000]);
    for (const r of [2, 3]) { ws.getCell(r, 1).numFmt = 'dd/mm/yyyy'; for (const c of [7, 8]) ws.getCell(r, c).numFmt = '#,##0'; }
    const buf = await wb.xlsx.writeBuffer();
    descargarBlob(new Blob([buf as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'formato-importacion-ventas.xlsx');
  }

  // ─── Paso 2: columnas y plantillas ─────────────────────────────────────────────────────────────────────────────
  setColumna(c: CampoVenta, i: number | null): void { this.columnas.update(m => ({ ...m, [c]: i })); }

  usarPlantilla(id: number | null): void {
    this.plantillaSel.set(id);
    const p = this.plantillas().find(x => x.id === id);
    if (!p) return;
    const m = p.mapeo as { columnas?: Columnas; fila_encabezado?: number; formato_fecha?: FormatoFecha; decimal?: SeparadorDecimal; opciones?: Partial<OpcionesImport> };
    if (m.fila_encabezado) this.filaEncabezado.set(m.fila_encabezado);
    if (m.columnas) this.columnas.set({ ...m.columnas });
    if (m.formato_fecha) this.formatoFecha.set(m.formato_fecha);
    if (m.decimal) this.decimal.set(m.decimal);
    const o = m.opciones ?? {};
    if (o.identificar) this.identificar.set(o.identificar);
    this.idCampo.set(o.id_campo ?? null);
    if (o.items_nuevos) this.itemsNuevos.set(o.items_nuevos);
    if (o.duplicados) this.duplicados.set(o.duplicados);
    this.nombrePlantilla.set(p.nombre);
  }

  async guardarPlantilla(): Promise<void> {
    const nombre = this.nombrePlantilla().trim();
    const mapeo: Partial<MapeoVentas> = { ...this.mapeo() };
    delete mapeo.hoja;   // la hoja cambia de un archivo a otro: no se guarda
    const r = await this.crm.saveImportPlantilla(nombre, { ...mapeo, opciones: this.opciones() });
    if (!r.action) { await this.dialogs.error({ title: this.t('crm.imp.template_error'), message: r.mensaje }); return; }
    await this.cargarCatalogos();
    this.plantillaSel.set(this.plantillas().find(p => p.nombre === nombre)?.id ?? null);
    await this.dialogs.success({ title: this.t('crm.imp.template_saved'), message: nombre });
  }

  // ─── Paso 3: revisión (simulación) ─────────────────────────────────────────────────────────────────────────────
  async revisar(): Promise<void> {
    if (this.identificar() === 'campo' && !this.idCampo()) { await this.dialogs.error({ title: this.t('crm.imp.title'), message: this.t('crm.imp.pick_field') }); return; }
    this.trabajando.set(true);
    try {
      const armado = armarVentas(this.filas(), this.mapeo());
      this.ventas = armado.ventas;
      const acc = vacio();
      acc.filas_leidas = armado.filas;
      acc.ventas = armado.ventas.length;
      acc.errores = [...armado.errores];
      acc.filas_error = armado.errores.length;
      for (const b of bloques(this.ventas)) {
        const r = await this.crm.importarVentas('simular', b, this.opciones());
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

  private acumular(acc: Resumen, d: ResultadoBloque): void {
    acc.filas_ok += d.filas_ok; acc.filas_error += d.filas_error; acc.ventas_nuevas += d.ventas_nuevas; acc.ventas_reemplazadas += d.ventas_reemplazadas;
    acc.ventas_omitidas += d.ventas_omitidas; acc.items_creados += d.items_creados; acc.total_valor += d.total_valor;
    if (d.fecha_desde && (!acc.fecha_desde || d.fecha_desde < acc.fecha_desde)) acc.fecha_desde = d.fecha_desde;
    if (d.fecha_hasta && (!acc.fecha_hasta || d.fecha_hasta > acc.fecha_hasta)) acc.fecha_hasta = d.fecha_hasta;
    acc.errores.push(...d.errores);
    acc.clientes_no_encontrados = [...new Set([...acc.clientes_no_encontrados, ...d.clientes_no_encontrados])];
  }

  // ─── Paso 4: importar por bloques ──────────────────────────────────────────────────────────────────────────────
  async importar(): Promise<void> {
    const partes = bloques(this.ventas);
    this.trabajando.set(true);
    this.totalBloques.set(partes.length);
    this.hechos.set(0);
    this.paso.set('importando');
    this.ref.disableClose = true;
    const previo = this.r();
    const acc = vacio();
    acc.filas_leidas = previo.filas_leidas;
    acc.ventas = previo.ventas;
    const erroresCliente = previo.errores.filter(e => typeof e.motivo === 'string' && ['fecha', 'cliente', 'numero', 'precio', 'documento_mixto'].includes(e.motivo));
    acc.errores = [...erroresCliente];
    acc.filas_error = erroresCliente.length;
    try {
      const ini = await this.crm.iniciarImportacion(this.archivo()?.name ?? '', previo.filas_leidas, this.opciones(), this.mapeo());
      if (!ini.action || !ini.data) throw new Error(ini.mensaje);
      const id = ini.data.id;
      for (const b of partes) {
        const r = await this.crm.importarVentas('bloque', b, this.opciones(), id);
        if (!r.action || !r.data) throw new Error(r.mensaje);
        this.acumular(acc, r.data);
        this.hechos.update(n => n + 1);
      }
      const fin = await this.crm.finalizarImportacion(id);
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
}
