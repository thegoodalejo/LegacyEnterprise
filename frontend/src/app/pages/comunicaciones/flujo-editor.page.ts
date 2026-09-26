import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { AvisoFlujo, CatalogoEditor, ComunicacionesService, Disparador, Grafo, Nodo, TipoNodo } from '../../services/comunicaciones.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import {
  GRID, NODO_W, TIPOS_NODO, ICONO_NODO, TONO_NODO, altoNodo, curva, datosIniciales, grafoInicial, limpiarConexiones, nuevoId, posEntrada, posPuerto,
  puertosDe, variablesDe,
} from './flujo-modelo';
import { FlujoNodoFormComponent } from './flujo-nodo-form.component';
import { FlujoSimuladorComponent } from './flujo-simulador.component';

const CATALOGO_VACIO: CatalogoEditor = { acciones: [], etiquetas: [], campos: [], etapas: [], usuarios: [], flujos: [], lineas: [] };
type Seleccion = { tipo: 'nodo'; id: string } | { tipo: 'con'; de: string; puerto: string } | null;

/**
 * Editor visual de un flujo del chatbot: lienzo con pasos arrastrables y conexiones por salida (curvas), paleta, propiedades del paso, palabras de
 * activación, deshacer, zoom y «Probar» (simulador). Guardado explícito: el servidor valida el grafo completo; avisa si se sale con cambios.
 */
@Component({
  selector: 'app-flujo-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, MatButton, MatIconButton, MatFormField, MatLabel, MatIcon, MatInput, MatSelect, MatOption, MatSlideToggle, MatTooltip,
    FlujoNodoFormComponent, FlujoSimuladorComponent, TranslatePipe],
  template: `
    <div class="editor">
      <header class="bar">
        <a mat-icon-button routerLink="/m/comunicaciones/chatbot" [attr.aria-label]="'com.back' | translate"><mat-icon>arrow_back</mat-icon></a>
        <input class="name" id="flow-name" [ngModel]="nombre()" (ngModelChange)="nombre.set($event)" maxlength="100" [placeholder]="'com.flow.name' | translate"
               [attr.aria-label]="'com.flow.name' | translate" />
        <mat-slide-toggle id="flow-active" [checked]="activo()" (change)="activo.set($event.checked)">{{ (activo() ? 'com.bot.on' : 'com.bot.off') | translate }}</mat-slide-toggle>
        <span class="spacer"></span>
        <button mat-icon-button (click)="deshacer()" [disabled]="!historial().length" [matTooltip]="'com.flow.undo' | translate" [attr.aria-label]="'com.flow.undo' | translate"><mat-icon>undo</mat-icon></button>
        <button mat-icon-button (click)="zoomar(-0.1)" [attr.aria-label]="'com.flow.zoom_out' | translate"><mat-icon>zoom_out</mat-icon></button>
        <span class="zoom">{{ (zoom() * 100).toFixed(0) }}%</span>
        <button mat-icon-button (click)="zoomar(0.1)" [attr.aria-label]="'com.flow.zoom_in' | translate"><mat-icon>zoom_in</mat-icon></button>
        <button mat-icon-button (click)="sel.set(null); simulador.set(false)" [matTooltip]="'com.flow.settings' | translate" [attr.aria-label]="'com.flow.settings' | translate"><mat-icon>tune</mat-icon></button>
        <button mat-stroked-button id="btn-test-flow" (click)="simulador.set(!simulador())"><mat-icon>science</mat-icon>{{ 'com.flow.test' | translate }}</button>
        <button mat-flat-button id="btn-save-flow" [disabled]="guardando() || !puedeGuardar()" (click)="guardar()"><mat-icon>save</mat-icon>{{ 'common.save' | translate }}</button>
      </header>
      <div class="body">
        <aside class="palette" [attr.aria-label]="'com.flow.palette' | translate">
          @for (t of tipos; track t.tipo) {
            <button class="pal" [attr.data-tono]="t.tono" [id]="'add-' + t.tipo" (click)="agregar(t.tipo)" [matTooltip]="'com.flow.help.' + t.tipo | translate" matTooltipPosition="right">
              <mat-icon>{{ t.icon }}</mat-icon><span>{{ 'com.flow.type.' + t.tipo | translate }}</span>
            </button>
          }
        </aside>
        <div class="wrap" #wrap (pointermove)="mover($event)" (pointerup)="soltar($event)" (pointerdown)="fondo()">
          <div class="sizer" [style.width.px]="tam().w * zoom()" [style.height.px]="tam().h * zoom()">
            <div class="inner" #inner [style.width.px]="tam().w" [style.height.px]="tam().h" [style.transform]="'scale(' + zoom() + ')'">
              <svg class="wires" [attr.width]="tam().w" [attr.height]="tam().h">
                @for (c of cables(); track c.key) {
                  <path class="hit" [attr.d]="c.d" (pointerdown)="$event.stopPropagation()" (click)="selCon(c.de, c.puerto)" />
                  <path class="wire" [class.sel]="esConSel(c.de, c.puerto)" [attr.d]="c.d" />
                }
                @if (cableTemp(); as d) { <path class="wire temp" [attr.d]="d" /> }
              </svg>
              @for (n of grafo().nodos; track n.id) {
                <div class="node" [attr.data-nodo]="n.id" [attr.data-tono]="tono(n.tipo)" [class.sel]="esNodoSel(n.id)" [class.warn]="conAviso(n.id)"
                     [style.left.px]="n.x" [style.top.px]="n.y" (pointerdown)="$event.stopPropagation(); seleccionar(n.id)">
                  @if (n.tipo !== 'inicio') { <span class="in" aria-hidden="true"></span> }
                  <div class="nhead" (pointerdown)="arrastrar($event, n)">
                    <mat-icon>{{ icono(n.tipo) }}</mat-icon><span class="nt">{{ 'com.flow.type.' + n.tipo | translate }}</span>
                    @if (conAviso(n.id)) { <mat-icon class="wicon" [matTooltip]="'com.flow.has_warning' | translate">warning</mat-icon> }
                  </div>
                  <div class="nres">{{ resumen(n) }}</div>
                  @for (p of puertos(n); track p.id; let i = $index) {
                    <div class="port">
                      <span class="pl">{{ p.literal ? (p.etiqueta || '…') : (p.etiqueta | translate) }}</span>
                      <span class="out" [class.con]="conectado(n.id, p.id)" (pointerdown)="empezarCable($event, n, i, p.id)" [attr.aria-label]="'com.flow.connect' | translate"></span>
                    </div>
                  }
                </div>
              }
              @if (medioConSel(); as m) {
                <button class="delcon" [style.left.px]="m.mx - 14" [style.top.px]="m.my - 14" (pointerdown)="$event.stopPropagation()" (click)="borrarSeleccion()"
                        [attr.aria-label]="'com.flow.delete_connection' | translate"><mat-icon>close</mat-icon></button>
              }
            </div>
          </div>
        </div>
        <aside class="side" [class.abierto]="panelAbierto()">
          @if (simulador()) {
            <app-flujo-simulador [grafo]="grafoLimpio()" [idFlujo]="idFlujo()" [nombre]="nombre()" [disparadores]="disparadores()" (cerrar)="simulador.set(false)" />
          } @else if (nodoSel(); as n) {
            <div class="pad">
              <button mat-button class="mclose" (click)="sel.set(null)"><mat-icon>close</mat-icon>{{ 'common.close' | translate }}</button>
              <app-flujo-nodo-form [nodo]="n" [catalogo]="catalogo()" [variables]="vars()" [idFlujo]="idFlujo()" (cambio)="cambiarDatos(n.id, $event)" (eliminar)="borrarNodo(n.id)" />
            </div>
          } @else {
            <div class="pad form-grid">
              <h2>{{ 'com.flow.settings' | translate }}</h2>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'com.flow.description' | translate }}</mat-label>
                <textarea matInput rows="2" [ngModel]="descripcion()" (ngModelChange)="descripcion.set($event)" maxlength="255"></textarea>
              </mat-form-field>
              <h3>{{ 'com.flow.triggers' | translate }}</h3>
              <p class="muted small">{{ 'com.flow.triggers_help' | translate }}</p>
              @for (d of disparadores(); track $index; let i = $index) {
                <div class="trig">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="tt">
                    <mat-select [ngModel]="d.tipo" (ngModelChange)="setTrig(i, 'tipo', $event)" [attr.aria-label]="'com.flow.trigger_type' | translate">
                      @for (t of tiposTrig; track t) { <mat-option [value]="t">{{ 'com.bot.trig.' + t | translate }}</mat-option> }
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="tx">
                    <input matInput [id]="'trig-' + i" [ngModel]="d.texto" (ngModelChange)="setTrig(i, 'texto', $event)" maxlength="100" [placeholder]="'com.flow.trigger_word' | translate" />
                  </mat-form-field>
                  <button mat-icon-button (click)="quitarTrig(i)" [attr.aria-label]="'common.delete' | translate"><mat-icon>close</mat-icon></button>
                  @if (avanzado()) {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="tp"><mat-label>{{ 'com.flow.priority' | translate }}</mat-label>
                      <input matInput type="number" [ngModel]="d.prioridad" (ngModelChange)="setTrig(i, 'prioridad', +$event)" /></mat-form-field>
                    @if (catalogo().lineas.length > 1) {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="tl"><mat-label>{{ 'com.line' | translate }}</mat-label>
                        <mat-select [ngModel]="d.id_linea" (ngModelChange)="setTrig(i, 'id_linea', $event)">
                          <mat-option [value]="null">{{ 'com.all_lines' | translate }}</mat-option>
                          @for (l of catalogo().lineas; track l.id) { <mat-option [value]="l.id">{{ l.nombre }}</mat-option> }
                        </mat-select></mat-form-field>
                    }
                  }
                </div>
              }
              <div class="row-btns">
                <button mat-button id="btn-add-trigger" (click)="agregarTrig()"><mat-icon>add</mat-icon>{{ 'com.flow.add_trigger' | translate }}</button>
                <button mat-button (click)="avanzado.set(!avanzado())">{{ (avanzado() ? 'com.flow.less' : 'com.flow.more') | translate }}</button>
              </div>
              @if (!disparadores().length) { <p class="muted small">{{ 'com.flow.no_triggers_hint' | translate }}</p> }
              @if (avisos().length) {
                <h3>{{ 'com.flow.warnings' | translate }}</h3>
                @for (a of avisos(); track $index) {
                  <button class="aviso" (click)="seleccionar(a.nodo)"><mat-icon>warning</mat-icon>{{ 'com.flow.warn.' + a.aviso | translate: { nodo: a.nodo, puerto: a.puerto || '' } }}</button>
                }
              }
              <p class="muted small">{{ 'com.flow.canvas_help' | translate }}</p>
            </div>
          }
        </aside>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; height: calc(100dvh - 64px); @media (max-width: 599px) { height: calc(100dvh - 56px); } }
    .editor { display: flex; flex-direction: column; height: 100%; }
    .bar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--md-sys-color-outline-variant); flex-wrap: wrap; background: var(--md-sys-color-surface); }
    .name { flex: 1 1 180px; min-width: 0; font: var(--mat-sys-title-medium); padding: 6px 10px; border-radius: 8px; border: 1px solid transparent; background: none; color: inherit;
      &:hover, &:focus { border-color: var(--md-sys-color-outline-variant); outline: none; background: var(--md-sys-color-surface-container); } }
    .zoom { font: var(--mat-sys-label-medium); width: 40px; text-align: center; }
    .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 148px minmax(0, 1fr) 340px; position: relative; }
    .palette { display: flex; flex-direction: column; gap: 4px; padding: 8px; overflow-y: auto; border-right: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface); }
    .pal { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 10px; border: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface-container-low);
      color: inherit; font: var(--mat-sys-label-large); cursor: pointer; text-align: left; mat-icon { flex: none; } &:hover { background: var(--md-sys-color-surface-container-high); } }
    .wrap { overflow: auto; position: relative; background-color: var(--md-sys-color-surface-container-low);
      background-image: radial-gradient(color-mix(in srgb, var(--md-sys-color-outline) 35%, transparent) 1px, transparent 1px); background-size: 24px 24px; touch-action: none; }
    .sizer { position: relative; }
    .inner { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
    .wires { position: absolute; top: 0; left: 0; overflow: visible; }
    .wire { fill: none; stroke: var(--md-sys-color-outline); stroke-width: 2; pointer-events: none; &.sel { stroke: var(--md-sys-color-primary); stroke-width: 3; } &.temp { stroke: var(--md-sys-color-primary); stroke-dasharray: 6 4; } }
    .hit { fill: none; stroke: transparent; stroke-width: 14; cursor: pointer; pointer-events: stroke; }
    .node { position: absolute; width: 248px; border-radius: 12px; background: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-outline-variant);
      box-shadow: 0 1px 3px color-mix(in srgb, var(--md-sys-color-shadow) 18%, transparent); user-select: none;
      &.sel { outline: 2px solid var(--md-sys-color-primary); } &.warn { border-color: var(--md-sys-color-error); } }
    .nhead { height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border-radius: 12px 12px 0 0; cursor: grab; touch-action: none;
      font: var(--mat-sys-label-large); background: var(--md-sys-color-surface-container-high); .nt { flex: 1; } }
    .node[data-tono='primary'] .nhead { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
    .node[data-tono='secondary'] .nhead { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
    .node[data-tono='tertiary'] .nhead { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    .node[data-tono='error'] .nhead { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }
    .pal[data-tono='primary'] mat-icon { color: var(--md-sys-color-primary); } .pal[data-tono='secondary'] mat-icon { color: var(--md-sys-color-secondary); }
    .pal[data-tono='tertiary'] mat-icon { color: var(--md-sys-color-tertiary); } .pal[data-tono='error'] mat-icon { color: var(--md-sys-color-error); }
    .wicon { color: var(--md-sys-color-error); width: 18px; height: 18px; font-size: 18px; }
    .nres { height: 52px; padding: 6px 10px; font: var(--mat-sys-body-small); color: var(--md-sys-color-on-surface-variant); overflow: hidden; display: -webkit-box;
      -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow-wrap: anywhere; box-sizing: border-box; }
    .port { position: relative; height: 28px; display: flex; align-items: center; justify-content: flex-end; padding-right: 16px; border-top: 1px dashed var(--md-sys-color-outline-variant);
      font: var(--mat-sys-label-medium); }
    .pl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
    .out, .in { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: var(--md-sys-color-surface); border: 2px solid var(--md-sys-color-outline); box-sizing: border-box; }
    .out { right: -8px; top: 7px; cursor: crosshair; touch-action: none; &.con { background: var(--md-sys-color-primary); border-color: var(--md-sys-color-primary); } &:hover { transform: scale(1.3); } }
    .in { left: -8px; top: 13px; }
    .delcon { position: absolute; width: 28px; height: 28px; border-radius: 50%; border: none; display: grid; place-items: center; cursor: pointer;
      background: var(--md-sys-color-error); color: var(--md-sys-color-on-error); mat-icon { width: 18px; height: 18px; font-size: 18px; } }
    .side { min-height: 0; overflow-y: auto; border-left: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface); }
    .pad { padding: 12px 16px; h2 { margin: 0; font: var(--mat-sys-title-medium); } h3 { margin: 8px 0 0; font: var(--mat-sys-title-small); } }
    .mclose { display: none; }
    .small { font: var(--mat-sys-body-small); margin: 0; }
    .trig { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; .tt { flex: 0 0 120px; } .tx { flex: 1 1 120px; } .tp { flex: 0 0 110px; } .tl { flex: 1 1 140px; } }
    .row-btns { display: flex; flex-wrap: wrap; gap: 4px; }
    .aviso { display: flex; align-items: center; gap: 6px; padding: 6px; border: none; background: none; color: var(--md-sys-color-error); text-align: left; cursor: pointer; font: inherit; }
    @media (max-width: 1099px) {
      .body { grid-template-columns: 120px minmax(0, 1fr); }
      .side { position: absolute; top: 0; right: 0; bottom: 0; width: min(360px, 100%); z-index: 4; display: none; box-shadow: -4px 0 16px color-mix(in srgb, var(--md-sys-color-shadow) 25%, transparent);
        &.abierto { display: block; } }
      .mclose { display: inline-flex; }
    }
    @media (max-width: 599px) {
      .body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
      .palette { flex-direction: row; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--md-sys-color-outline-variant); .pal span { display: none; } }
    }
  `,
})
export default class FlujoEditorPage {
  /** :id de la ruta ('nuevo' = flujo nuevo). */
  readonly id = input<string>('');
  private com = inject(ComunicacionesService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private i18n = inject(TranslationService);
  private inner = viewChild<ElementRef<HTMLElement>>('inner');
  private wrap = viewChild<ElementRef<HTMLElement>>('wrap');
  private readonly angosto = toSignal(inject(BreakpointObserver).observe('(max-width: 1099px)').pipe(map(r => r.matches)), { initialValue: false });

  readonly tipos = TIPOS_NODO;
  readonly tiposTrig = ['exacta', 'empieza', 'contiene'] as const;
  readonly idFlujo = signal(0);
  readonly nombre = signal('');
  readonly descripcion = signal<string | null>(null);
  readonly activo = signal(false);
  readonly disparadores = signal<Disparador[]>([]);
  readonly grafo = signal<Grafo>({ nodos: [], conexiones: [] });
  readonly catalogo = signal<CatalogoEditor>(CATALOGO_VACIO);
  readonly sel = signal<Seleccion>(null);
  readonly simulador = signal(false);
  readonly avanzado = signal(false);
  readonly zoom = signal(1);
  readonly historial = signal<Grafo[]>([]);
  readonly avisos = signal<AvisoFlujo[]>([]);
  readonly guardando = signal(false);
  readonly cableTemp = signal<string | null>(null);
  private version = 0;
  private guardado = '';
  private confirmado: Grafo | null = null;
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private arrastre: { id: string; dx: number; dy: number; movido: boolean } | null = null;
  private cable: { de: string; puerto: string; desde: { x: number; y: number } } | null = null;

  readonly acciones = computed(() => this.catalogo().acciones);
  readonly vars = computed(() => variablesDe(this.grafo(), this.acciones()));
  readonly nodoSel = computed<Nodo | null>(() => { const s = this.sel(); return s?.tipo === 'nodo' ? this.grafo().nodos.find(n => n.id === s.id) ?? null : null; });
  readonly panelAbierto = computed(() => this.simulador() || !!this.nodoSel() || !this.angosto());
  readonly grafoLimpio = computed(() => limpiarConexiones(this.grafo(), this.acciones()));
  readonly tam = computed(() => {
    let w = 1600, h = 1000;
    for (const n of this.grafo().nodos) { w = Math.max(w, n.x + NODO_W + 400); h = Math.max(h, n.y + altoNodo(n, this.acciones()) + 300); }
    return { w, h };
  });
  readonly cables = computed(() => {
    const g = this.grafo();
    const porId = new Map(g.nodos.map(n => [n.id, n]));
    const out: { key: string; de: string; puerto: string; d: string; mx: number; my: number }[] = [];
    for (const c of g.conexiones) {
      const a = porId.get(c.de), b = porId.get(c.a);
      if (!a || !b) continue;
      const i = puertosDe(a, this.acciones()).findIndex(p => p.id === c.puerto);
      if (i < 0) continue;
      const p1 = posPuerto(a, i), p2 = posEntrada(b);
      out.push({ key: `${c.de}|${c.puerto}`, de: c.de, puerto: c.puerto, d: curva(p1, p2), mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 });
    }
    return out;
  });
  readonly medioConSel = computed(() => { const s = this.sel(); return s?.tipo === 'con' ? this.cables().find(c => c.de === s.de && c.puerto === s.puerto) ?? null : null; });
  /** Cambios desde que se abrió o se guardó (abrir uno nuevo y salir sin tocarlo no pregunta). */
  readonly sucio = computed(() => this.firma() !== this.guardadoSig());
  /** Uno nuevo se puede guardar tal cual (arranca con la plantilla de menú); uno existente, solo con cambios. */
  readonly puedeGuardar = computed(() => !this.idFlujo() || this.sucio());
  private readonly guardadoSig = signal('');
  private readonly firma = computed(() => JSON.stringify([this.nombre(), this.descripcion(), this.activo(), this.disparadores(), this.grafo()]));

  constructor() {
    effect(() => { const r = this.id(); untracked(() => void this.cargar(r)); });
  }

  @HostListener('window:beforeunload', ['$event'])
  antesDeSalir(ev: BeforeUnloadEvent): void { if (this.sucio()) ev.preventDefault(); }

  /** canDeactivate de la ruta: confirma si hay cambios sin guardar. */
  async puedeSalir(): Promise<boolean> {
    if (!this.sucio()) return true;
    return this.dialogs.confirm({ title: this.i18n.t('com.flow.leave_title'), message: this.i18n.t('com.flow.leave_msg'), confirmText: this.i18n.t('com.flow.leave'), danger: true });
  }

  @HostListener('window:keydown', ['$event'])
  tecla(ev: KeyboardEvent): void {
    const t = ev.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.closest('.cdk-overlay-container'))) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); this.deshacer(); }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') { if (this.sel()) { ev.preventDefault(); this.borrarSeleccion(); } }
  }

  private async cargar(ruta: string): Promise<void> {
    const cat = await this.com.catalogoEditor();
    if (cat.action && cat.data) this.catalogo.set(cat.data);
    const id = Number(ruta);
    if (id > 0) {
      const r = await this.loading.wrap(() => this.com.getFlujo(id));
      if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.bot.load_error'), message: r.mensaje }); void this.router.navigateByUrl('/m/comunicaciones/chatbot'); return; }
      const f = r.data.flujo;
      this.idFlujo.set(f.id); this.version = f.version; this.nombre.set(f.nombre); this.descripcion.set(f.descripcion); this.activo.set(f.activo);
      this.disparadores.set(f.disparadores); this.grafo.set(f.grafo);
    } else {
      this.idFlujo.set(0); this.version = 0; this.nombre.set(this.i18n.t('com.flow.new_name')); this.descripcion.set(null); this.activo.set(false);
      this.disparadores.set([{ tipo: 'exacta', texto: this.i18n.t('com.flow.starter.trigger'), prioridad: 0, id_linea: null }]);
      this.grafo.set(grafoInicial(k => this.i18n.t(k)));
    }
    this.confirmado = this.grafo();
    this.historial.set([]);
    this.guardadoSig.set(this.firma());
    if (this.angosto()) this.zoom.set(0.8);
  }

  // ─── Geometría y dibujo ────────────────────────────────────────────────────────────────────────────────────────
  icono(t: TipoNodo): string { return ICONO_NODO[t]; }
  tono(t: TipoNodo): string { return TONO_NODO[t]; }
  puertos(n: Nodo) { return puertosDe(n, this.acciones()); }
  conectado(de: string, puerto: string): boolean { return this.grafo().conexiones.some(c => c.de === de && c.puerto === puerto); }
  esNodoSel(id: string): boolean { const s = this.sel(); return s?.tipo === 'nodo' && s.id === id; }
  esConSel(de: string, puerto: string): boolean { const s = this.sel(); return s?.tipo === 'con' && s.de === de && s.puerto === puerto; }
  conAviso(id: string): boolean { return this.avisos().some(a => a.nodo === id); }

  resumen(n: Nodo): string {
    const d = n.datos;
    const t = (k: string) => this.i18n.t(k);
    switch (n.tipo) {
      case 'inicio': return t('com.flow.sum.start');
      case 'mensaje': case 'botones': case 'lista': case 'pregunta': return String(d['texto'] ?? '');
      case 'condicion': return `${d['variable'] === '_respuesta' ? t('com.flow.f.last_answer') : d['variable']} ${t('com.flow.op.' + d['operador'])} ${d['valor'] ?? ''}`;
      case 'accion': return this.acciones().find(a => a.codigo === d['accion'])?.nombre ?? t('com.flow.sum.pick_action');
      case 'asesor': return String(d['texto'] ?? t('com.flow.sum.advisor'));
      case 'ir_flujo': return this.catalogo().flujos.find(f => f.id === d['id_flujo'])?.nombre ?? t('com.flow.sum.pick_flow');
      case 'fin': return String(d['texto'] ?? t('com.flow.sum.end'));
      default: return '';
    }
  }

  private punto(ev: PointerEvent): { x: number; y: number } {
    const r = this.inner()!.nativeElement.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / this.zoom(), y: (ev.clientY - r.top) / this.zoom() };
  }

  zoomar(d: number): void { this.zoom.update(z => Math.min(1.6, Math.max(0.4, Math.round((z + d) * 10) / 10))); }

  // ─── Interacción ───────────────────────────────────────────────────────────────────────────────────────────────
  seleccionar(id: string): void { this.sel.set({ tipo: 'nodo', id }); this.simulador.set(false); }
  selCon(de: string, puerto: string): void { this.sel.set({ tipo: 'con', de, puerto }); }
  /** Un toque en el fondo (los pasos y las conexiones detienen el evento) quita la selección. */
  fondo(): void { this.sel.set(null); }

  arrastrar(ev: PointerEvent, n: Nodo): void {
    ev.stopPropagation();
    this.seleccionar(n.id);
    const p = this.punto(ev);
    this.arrastre = { id: n.id, dx: p.x - n.x, dy: p.y - n.y, movido: false };
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  }

  empezarCable(ev: PointerEvent, n: Nodo, i: number, puerto: string): void {
    ev.stopPropagation();
    ev.preventDefault();
    const desde = posPuerto(n, i);
    this.cable = { de: n.id, puerto, desde };
    this.cableTemp.set(curva(desde, desde));
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  }

  mover(ev: PointerEvent): void {
    if (this.arrastre) {
      const p = this.punto(ev);
      const a = this.arrastre;
      const x = Math.max(0, Math.round((p.x - a.dx) / GRID) * GRID), y = Math.max(0, Math.round((p.y - a.dy) / GRID) * GRID);
      this.grafo.update(g => ({ ...g, nodos: g.nodos.map(n => (n.id === a.id ? (n.x === x && n.y === y ? n : { ...n, x, y }) : n)) }));
      a.movido = true;
    } else if (this.cable) {
      this.cableTemp.set(curva(this.cable.desde, this.punto(ev)));
    }
  }

  soltar(ev: PointerEvent): void {
    if (this.arrastre) {
      if (this.arrastre.movido) this.confirmar();
      this.arrastre = null;
    }
    if (this.cable) {
      const destino = (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-nodo]') as HTMLElement | null)?.dataset['nodo'];
      const c = this.cable;
      this.cable = null;
      this.cableTemp.set(null);
      const nodoDestino = this.grafo().nodos.find(n => n.id === destino);
      if (nodoDestino && nodoDestino.tipo !== 'inicio') {
        this.grafo.update(g => ({ ...g, conexiones: [...g.conexiones.filter(x => !(x.de === c.de && x.puerto === c.puerto)), { de: c.de, puerto: c.puerto, a: nodoDestino.id }] }));
        this.confirmar();
      }
    }
  }

  agregar(tipo: TipoNodo): void {
    const w = this.wrap()?.nativeElement;
    const z = this.zoom();
    const x = w ? Math.round((w.scrollLeft + w.clientWidth / 2) / z / GRID) * GRID - NODO_W / 2 : 200;
    const y = w ? Math.round((w.scrollTop + w.clientHeight / 3) / z / GRID) * GRID : 200;
    const id = nuevoId(this.grafo().nodos);
    const desplazo = this.grafo().nodos.filter(n => Math.abs(n.x - x) < 24 && Math.abs(n.y - y) < 24).length * 24;
    this.grafo.update(g => ({ ...g, nodos: [...g.nodos, { id, tipo, x: Math.max(0, x + desplazo), y: Math.max(0, y + desplazo), datos: datosIniciales(tipo, k => this.i18n.t(k)) }] }));
    this.confirmar();
    this.seleccionar(id);
  }

  cambiarDatos(id: string, datos: Record<string, unknown>): void {
    this.grafo.update(g => limpiarConexiones({ ...g, nodos: g.nodos.map(n => (n.id === id ? { ...n, datos } : n)) }, this.acciones()));
    // Escribir no llena el historial letra por letra: se confirma tras una pausa.
    if (this.commitTimer) clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => this.confirmar(), 700);
  }

  borrarNodo(id: string): void {
    const n = this.grafo().nodos.find(x => x.id === id);
    if (!n || n.tipo === 'inicio') return;
    this.grafo.update(g => ({ nodos: g.nodos.filter(x => x.id !== id), conexiones: g.conexiones.filter(c => c.de !== id && c.a !== id) }));
    this.sel.set(null);
    this.confirmar();
  }

  borrarSeleccion(): void {
    const s = this.sel();
    if (s?.tipo === 'nodo') this.borrarNodo(s.id);
    else if (s?.tipo === 'con') {
      this.grafo.update(g => ({ ...g, conexiones: g.conexiones.filter(c => !(c.de === s.de && c.puerto === s.puerto)) }));
      this.sel.set(null);
      this.confirmar();
    }
  }

  /** Guarda en el historial el estado anterior (para deshacer). */
  private confirmar(): void {
    const actual = this.grafo();
    if (this.confirmado && this.confirmado !== actual && JSON.stringify(this.confirmado) !== JSON.stringify(actual)) {
      this.historial.update(h => [...h.slice(-59), this.confirmado!]);
    }
    this.confirmado = actual;
  }

  deshacer(): void {
    const h = this.historial();
    if (!h.length) return;
    const prev = h[h.length - 1];
    this.historial.set(h.slice(0, -1));
    this.grafo.set(prev);
    this.confirmado = prev;
    const s = this.sel();
    if (s?.tipo === 'nodo' && !prev.nodos.some(n => n.id === s.id)) this.sel.set(null);
  }

  // ─── Palabras de activación ────────────────────────────────────────────────────────────────────────────────────
  agregarTrig(): void { this.disparadores.update(l => [...l, { tipo: 'exacta', texto: '', prioridad: 0, id_linea: null }]); }
  quitarTrig(i: number): void { this.disparadores.update(l => l.filter((_, j) => j !== i)); }
  setTrig<K extends keyof Disparador>(i: number, k: K, v: Disparador[K]): void { this.disparadores.update(l => l.map((d, j) => (j === i ? { ...d, [k]: v } : d))); }

  // ─── Guardar ───────────────────────────────────────────────────────────────────────────────────────────────────
  async guardar(): Promise<void> {
    if (!this.nombre().trim()) { await this.dialogs.error({ title: this.i18n.t('com.bot.save_error'), message: this.i18n.t('com.flow.name_required') }); return; }
    this.guardando.set(true);
    try {
      const disp = this.disparadores().filter(d => d.texto.trim());
      const r = await this.loading.wrap(() => this.com.saveFlujo({ id: this.idFlujo() || undefined, nombre: this.nombre().trim(), descripcion: this.descripcion(), activo: this.activo(),
        grafo: this.grafoLimpio(), disparadores: disp, version: this.version || undefined }));
      if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.bot.save_error'), message: r.mensaje }); return; }
      const nuevo = !this.idFlujo();
      this.idFlujo.set(r.data.id); this.version = r.data.version; this.disparadores.set(disp);
      this.avisos.set(r.data.avisos);
      this.guardadoSig.set(this.firma());
      this.snack.open(this.i18n.t(r.data.avisos.length ? 'com.flow.saved_warn' : 'com.flow.saved', { n: r.data.avisos.length }), this.i18n.t('common.close'), { duration: 3500 });
      if (nuevo) void this.router.navigate(['/m/comunicaciones/chatbot', r.data.id], { replaceUrl: true });
    } finally { this.guardando.set(false); }
  }
}
