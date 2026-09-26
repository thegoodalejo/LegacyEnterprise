import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatOption, MatSelect } from '@angular/material/select';
import { AccionDef, CatalogoEditor, ConfigAccionDef, Nodo } from '../../services/comunicaciones.service';
import { TranslatePipe } from '../../services/translation.service';
import { ICONO_NODO } from './flujo-modelo';

interface Opcion { id: string; titulo: string; descripcion?: string | null }
const VARS_CONTACTO = ['contacto.nombre', 'contacto.primer_nombre', 'contacto.telefono', 'contacto.correo', 'sede.nombre'];

/**
 * Propiedades del paso elegido en el editor. Emite los datos completos en cada cambio (el editor los guarda en el grafo y en el historial).
 */
@Component({
  selector: 'app-flujo-nodo-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgTemplateOutlet, MatButton, MatIconButton, MatFormField, MatLabel, MatHint, MatIcon, MatInput, MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger,
    MatSelect, MatOption, TranslatePipe],
  template: `
    @let n = nodo();
    @let d = n.datos;
    <header class="h"><mat-icon>{{ icono(n.tipo) }}</mat-icon><h2>{{ 'com.flow.type.' + n.tipo | translate }}</h2><span class="muted small">{{ n.id }}</span></header>
    <p class="muted small help">{{ 'com.flow.help.' + n.tipo | translate }}</p>
    <div class="form-grid">
      @switch (n.tipo) {
        @case ('inicio') { }
        @case ('mensaje') { <ng-container *ngTemplateOutlet="textoTpl; context: { campo: 'texto', label: 'com.flow.f.text', max: 4096, filas: 5 }" /> }
        @case ('botones') {
          <ng-container *ngTemplateOutlet="textoTpl; context: { campo: 'texto', label: 'com.flow.f.text', max: 1024, filas: 3 }" />
          <span class="lbl">{{ 'com.flow.f.buttons' | translate }}</span>
          @for (b of opciones('botones'); track b.id; let i = $index) {
            <div class="opt">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <input matInput [ngModel]="b.titulo" (ngModelChange)="setOpcion('botones', i, 'titulo', $event)" maxlength="20" [attr.aria-label]="'com.flow.f.button_text' | translate" />
              </mat-form-field>
              <span class="count muted">{{ b.titulo.length }}/20</span>
              <button mat-icon-button (click)="quitarOpcion('botones', i)" [disabled]="opciones('botones').length <= 1" [attr.aria-label]="'common.delete' | translate"><mat-icon>close</mat-icon></button>
            </div>
          }
          @if (opciones('botones').length < 3) { <button mat-button (click)="agregarOpcion('botones', 'b')"><mat-icon>add</mat-icon>{{ 'com.flow.f.add_button' | translate }}</button> }
          <ng-container *ngTemplateOutlet="cortoTpl; context: { campo: 'encabezado', label: 'com.flow.f.header', max: 60 }" />
          <ng-container *ngTemplateOutlet="cortoTpl; context: { campo: 'pie', label: 'com.flow.f.footer', max: 60 }" />
        }
        @case ('lista') {
          <ng-container *ngTemplateOutlet="textoTpl; context: { campo: 'texto', label: 'com.flow.f.text', max: 1024, filas: 3 }" />
          <ng-container *ngTemplateOutlet="cortoTpl; context: { campo: 'boton', label: 'com.flow.f.list_button', max: 20 }" />
          <span class="lbl">{{ 'com.flow.f.rows' | translate }}</span>
          @for (f of opciones('filas'); track f.id; let i = $index) {
            <div class="opt col">
              <div class="opt">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <input matInput [ngModel]="f.titulo" (ngModelChange)="setOpcion('filas', i, 'titulo', $event)" maxlength="24" [placeholder]="'com.flow.f.row_title' | translate" />
                </mat-form-field>
                <button mat-icon-button (click)="quitarOpcion('filas', i)" [disabled]="opciones('filas').length <= 1" [attr.aria-label]="'common.delete' | translate"><mat-icon>close</mat-icon></button>
              </div>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <input matInput [ngModel]="f.descripcion ?? ''" (ngModelChange)="setOpcion('filas', i, 'descripcion', $event)" maxlength="72" [placeholder]="'com.flow.f.row_desc' | translate" />
              </mat-form-field>
            </div>
          }
          @if (opciones('filas').length < 10) { <button mat-button (click)="agregarOpcion('filas', 'f')"><mat-icon>add</mat-icon>{{ 'com.flow.f.add_row' | translate }}</button> }
        }
        @case ('pregunta') {
          <ng-container *ngTemplateOutlet="textoTpl; context: { campo: 'texto', label: 'com.flow.f.question', max: 1024, filas: 3 }" />
          <mat-form-field appearance="outline">
            <mat-label>{{ 'com.flow.f.variable' | translate }}</mat-label>
            <input matInput [ngModel]="d['variable']" (ngModelChange)="set('variable', limpiarVar($event))" maxlength="31" />
            <mat-hint>{{ 'com.flow.f.variable_hint' | translate }}</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'com.flow.f.validation' | translate }}</mat-label>
            <mat-select [ngModel]="d['validacion'] ?? 'texto'" (ngModelChange)="set('validacion', $event)">
              @for (v of validaciones; track v) { <mat-option [value]="v">{{ 'com.flow.val.' + v | translate }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'com.flow.f.save_to' | translate }}</mat-label>
            <mat-select [ngModel]="d['guardar_en'] ?? ''" (ngModelChange)="set('guardar_en', $event || null)">
              <mat-option value="">{{ 'com.flow.f.save_none' | translate }}</mat-option>
              @for (c of camposContacto(); track c.valor) { <mat-option [value]="c.valor">{{ c.etiqueta | translate }}</mat-option> }
            </mat-select>
            <mat-hint>{{ 'com.flow.f.save_hint' | translate }}</mat-hint>
          </mat-form-field>
          <div class="form-row">
            <mat-form-field appearance="outline"><mat-label>{{ 'com.flow.f.retries' | translate }}</mat-label>
              <input matInput type="number" min="0" max="5" [ngModel]="d['reintentos'] ?? 2" (ngModelChange)="set('reintentos', +$event)" /></mat-form-field>
          </div>
          <ng-container *ngTemplateOutlet="cortoTpl; context: { campo: 'texto_invalido', label: 'com.flow.f.invalid_text', max: 500 }" />
        }
        @case ('condicion') {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'com.flow.f.variable' | translate }}</mat-label>
            <mat-select [ngModel]="d['variable']" (ngModelChange)="set('variable', $event)">
              <mat-option value="_respuesta">{{ 'com.flow.f.last_answer' | translate }}</mat-option>
              @for (v of varsContacto; track v) { @if (v !== 'sede.nombre') { <mat-option [value]="v">{{ v }}</mat-option> } }
              @for (v of variables(); track v) { <mat-option [value]="v">{{ v }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'com.flow.f.operator' | translate }}</mat-label>
            <mat-select [ngModel]="d['operador']" (ngModelChange)="set('operador', $event)">
              @for (o of operadores; track o) { <mat-option [value]="o">{{ 'com.flow.op.' + o | translate }}</mat-option> }
            </mat-select>
          </mat-form-field>
          @if (d['operador'] !== 'existe' && d['operador'] !== 'no_existe') {
            <mat-form-field appearance="outline"><mat-label>{{ 'com.flow.f.value' | translate }}</mat-label>
              <input matInput [ngModel]="d['valor'] ?? ''" (ngModelChange)="set('valor', $event)" maxlength="100" /></mat-form-field>
          }
        }
        @case ('accion') {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'com.flow.f.action' | translate }}</mat-label>
            <mat-select [ngModel]="d['accion']" (ngModelChange)="elegirAccion($event)">
              @for (a of catalogo().acciones; track a.codigo) { <mat-option [value]="a.codigo">{{ a.nombre }}</mat-option> }
            </mat-select>
            @if (accion(); as a) { <mat-hint>{{ a.descripcion }}</mat-hint> }
          </mat-form-field>
          @if (accion(); as a) {
            @for (c of a.config; track c.clave) {
              @switch (c.tipo) {
                @case ('etiqueta') { <ng-container *ngTemplateOutlet="selTpl; context: { c: c, ops: tagsOps() }" /> }
                @case ('usuario') { <ng-container *ngTemplateOutlet="selTpl; context: { c: c, ops: usuariosOps() }" /> }
                @case ('embudo_etapa') { <ng-container *ngTemplateOutlet="selTpl; context: { c: c, ops: etapasOps() }" /> }
                @case ('campo_contacto') { <ng-container *ngTemplateOutlet="selTpl; context: { c: c, ops: camposOps() }" /> }
                @case ('opcion') { <ng-container *ngTemplateOutlet="selTpl; context: { c: c, ops: opcionesDe(c) }" /> }
                @case ('variable') { <ng-container *ngTemplateOutlet="selTpl; context: { c: c, ops: varsOps() }" /> }
                @default {
                  <mat-form-field appearance="outline">
                    <mat-label>{{ c.etiqueta }}@if (c.requerida) { * }</mat-label>
                    @if (c.tipo === 'texto_largo') { <textarea matInput rows="3" [ngModel]="cfg(c.clave)" (ngModelChange)="setCfg(c.clave, $event)"></textarea> }
                    @else { <input matInput [type]="c.tipo === 'entero' ? 'number' : 'text'" [ngModel]="cfg(c.clave)" (ngModelChange)="setCfg(c.clave, $event)" /> }
                  </mat-form-field>
                }
              }
            }
            @if (a.salidas.length) { <p class="muted small">{{ 'com.flow.f.outputs' | translate: { vars: a.salidas.join(', ') } }}</p> }
          }
        }
        @case ('asesor') { <ng-container *ngTemplateOutlet="textoTpl; context: { campo: 'texto', label: 'com.flow.f.advisor_text', max: 1024, filas: 3 }" /> }
        @case ('ir_flujo') {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'com.flow.f.target_flow' | translate }}</mat-label>
            <mat-select [ngModel]="d['id_flujo']" (ngModelChange)="set('id_flujo', $event)">
              @for (f of catalogo().flujos; track f.id) { <mat-option [value]="f.id">{{ f.nombre }}@if (!f.activo) { ({{ 'com.bot.off' | translate }}) }@if (f.id === idFlujo()) { ({{ 'com.flow.f.this' | translate }}) }</mat-option> }
            </mat-select>
            <mat-hint>{{ 'com.flow.f.target_hint' | translate }}</mat-hint>
          </mat-form-field>
        }
        @case ('fin') { <ng-container *ngTemplateOutlet="textoTpl; context: { campo: 'texto', label: 'com.flow.f.end_text', max: 4096, filas: 3 }" /> }
      }
      @if (n.tipo !== 'inicio') {
        <button mat-stroked-button class="danger" (click)="eliminar.emit()"><mat-icon>delete</mat-icon>{{ 'com.flow.delete_step' | translate }}</button>
      }
    </div>

    <ng-template #textoTpl let-campo="campo" let-label="label" let-max="max" let-filas="filas">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>{{ label | translate }}</mat-label>
        <textarea matInput #ta [rows]="filas" [ngModel]="d[campo] ?? ''" (ngModelChange)="set(campo, $event)" [maxlength]="max"></textarea>
        <mat-hint align="end">{{ ($any(d[campo]) ?? '').length }}/{{ max }}</mat-hint>
      </mat-form-field>
      <button mat-button class="insvar" [matMenuTriggerFor]="varsMenu" [matMenuTriggerData]="{ el: ta, campo: campo }" [matMenuTriggerRestoreFocus]="false"><mat-icon>data_object</mat-icon>{{ 'com.flow.insert_var' | translate }}</button>
    </ng-template>
    <ng-template #cortoTpl let-campo="campo" let-label="label" let-max="max">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>{{ label | translate }}</mat-label>
        <input matInput [ngModel]="d[campo] ?? ''" (ngModelChange)="set(campo, $event || null)" [maxlength]="max" />
      </mat-form-field>
    </ng-template>
    <ng-template #selTpl let-c="c" let-ops="ops">
      <mat-form-field appearance="outline">
        <mat-label>{{ c.etiqueta }}@if (c.requerida) { * }</mat-label>
        <mat-select [ngModel]="cfg(c.clave)" (ngModelChange)="setCfg(c.clave, $event)">
          @if (!c.requerida) { <mat-option [value]="null">—</mat-option> }
          @for (o of ops; track o.valor) { <mat-option [value]="o.valor">{{ o.etiqueta }}</mat-option> }
        </mat-select>
      </mat-form-field>
    </ng-template>
    <mat-menu #varsMenu="matMenu">
      <ng-template matMenuContent let-el="el" let-campo="campo">
        @for (v of todasVars(); track v) { <button mat-menu-item (click)="insertar(el, campo, v)">{{ marca(v) }}</button> }
      </ng-template>
    </mat-menu>
  `,
  styles: `
    :host { display: block; }
    .h { display: flex; align-items: center; gap: 8px; h2 { margin: 0; font: var(--mat-sys-title-medium); flex: 1; } }
    .help { margin: 4px 0 12px; }
    .small { font: var(--mat-sys-body-small); }
    .lbl { font: var(--mat-sys-label-large); margin-top: 4px; }
    .opt { display: flex; align-items: center; gap: 4px; mat-form-field { flex: 1; } &.col { flex-direction: column; align-items: stretch; gap: 4px; padding-bottom: 8px;
      border-bottom: 1px dashed var(--md-sys-color-outline-variant); } }
    .count { font: var(--mat-sys-label-small); width: 36px; }
    .insvar { align-self: flex-start; margin-top: -8px; }
    .danger { color: var(--md-sys-color-error); margin-top: 8px; }
  `,
})
export class FlujoNodoFormComponent {
  readonly nodo = input.required<Nodo>();
  readonly catalogo = input.required<CatalogoEditor>();
  readonly variables = input<string[]>([]);
  readonly idFlujo = input(0);
  readonly cambio = output<Record<string, unknown>>();
  readonly eliminar = output<void>();

  readonly validaciones = ['texto', 'numero', 'correo', 'fecha', 'telefono'];
  readonly operadores = ['igual', 'distinto', 'contiene', 'empieza', 'existe', 'no_existe', 'mayor', 'menor'];
  readonly varsContacto = VARS_CONTACTO;
  readonly todasVars = computed(() => [...VARS_CONTACTO, ...this.variables()]);
  readonly accion = computed<AccionDef | null>(() => this.catalogo().acciones.find(a => a.codigo === this.nodo().datos['accion']) ?? null);
  readonly camposContacto = computed(() => [
    { valor: 'nombre', etiqueta: 'com.flow.field.nombre' }, { valor: 'correo', etiqueta: 'com.flow.field.correo' }, { valor: 'documento', etiqueta: 'com.flow.field.documento' },
    ...this.catalogo().campos.map(c => ({ valor: 'campo:' + c.id, etiqueta: c.etiqueta })),
  ]);
  readonly tagsOps = computed(() => this.catalogo().etiquetas.map(t => ({ valor: t.id, etiqueta: t.nombre })));
  readonly usuariosOps = computed(() => this.catalogo().usuarios.map(u => ({ valor: u.id, etiqueta: u.nombre })));
  readonly etapasOps = computed(() => this.catalogo().etapas.map(e => ({ valor: e.id, etiqueta: `${e.embudo} · ${e.nombre}` })));
  readonly camposOps = computed(() => this.camposContacto().map(c => ({ valor: c.valor, etiqueta: c.etiqueta.startsWith('com.') ? c.valor : c.etiqueta })));
  readonly varsOps = computed(() => this.variables().map(v => ({ valor: v, etiqueta: v })));

  icono(t: string): string { return ICONO_NODO[t as keyof typeof ICONO_NODO]; }
  marca(v: string): string { return '{' + '{' + v + '}' + '}'; }
  opcionesDe(c: ConfigAccionDef) { return (c.opciones ?? []).map(o => ({ valor: o.valor, etiqueta: o.etiqueta })); }
  limpiarVar(v: string): string { return v.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[0-9]/, '_$&').slice(0, 31); }

  set(k: string, v: unknown): void { this.cambio.emit({ ...this.nodo().datos, [k]: v }); }
  cfg(k: string): unknown { return (this.nodo().datos['config'] as Record<string, unknown> | undefined)?.[k] ?? null; }
  setCfg(k: string, v: unknown): void { this.set('config', { ...((this.nodo().datos['config'] as Record<string, unknown>) ?? {}), [k]: v }); }
  elegirAccion(codigo: string): void {
    const a = this.catalogo().acciones.find(x => x.codigo === codigo);
    const config: Record<string, unknown> = {};
    for (const c of a?.config ?? []) if (c.tipo === 'opcion' && c.opciones?.length) config[c.clave] = c.opciones[0].valor;
    this.cambio.emit({ ...this.nodo().datos, accion: codigo, config });
  }

  opciones(campo: 'botones' | 'filas'): Opcion[] { return (this.nodo().datos[campo] as Opcion[] | undefined) ?? []; }
  setOpcion(campo: 'botones' | 'filas', i: number, k: 'titulo' | 'descripcion', v: string): void {
    this.set(campo, this.opciones(campo).map((o, j) => (j === i ? { ...o, [k]: v } : o)));
  }
  agregarOpcion(campo: 'botones' | 'filas', pref: string): void {
    const ops = this.opciones(campo);
    let n = ops.length + 1;
    while (ops.some(o => o.id === pref + n)) n++;
    this.set(campo, [...ops, { id: pref + n, titulo: '' }]);
  }
  quitarOpcion(campo: 'botones' | 'filas', i: number): void { this.set(campo, this.opciones(campo).filter((_, j) => j !== i)); }

  /** Inserta {{variable}} donde está el cursor del texto. */
  insertar(el: HTMLTextAreaElement, campo: string, v: string): void {
    const txt = String(this.nodo().datos[campo] ?? '');
    const pos = el?.selectionStart ?? txt.length;
    const ins = `{{${v}}}`;
    const nuevo = txt.slice(0, pos) + ins + txt.slice(el?.selectionEnd ?? pos);
    this.set(campo, nuevo);
    if (!el) return;
    // Ya mismo en el textarea (ngModel lo escribe en el siguiente render): lo que se teclee enseguida no pisa la variable.
    el.value = nuevo;
    el.focus();
    el.setSelectionRange(pos + ins.length, pos + ins.length);
  }
}
