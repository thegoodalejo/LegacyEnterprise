import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatPrefix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { ComunicacionesService, ConteosBandeja, Conversacion, ConversacionFila, Linea, VistaBandeja } from '../../services/comunicaciones.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { BandejaHiloComponent } from './bandeja-hilo.component';
import { BandejaPanelComponent } from './bandeja-panel.component';
import { fechaRelativa, iconoEstado, iconoTipo } from './wa-format';

const POLL_MS = 5000;

/**
 * Bandeja de WhatsApp: vistas (cola, mis chats y, para L2+, todas, chatbot y cerradas), búsqueda, filtro por línea, el hilo y el panel del
 * contacto. En móvil muestra una cosa a la vez (lista o hilo). ?c=<id> abre una conversación (desde un aviso o el perfil del contacto).
 */
@Component({
  selector: 'app-bandeja-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatIcon, MatFormField, MatPrefix, MatInput, MatSelect, MatOption, BandejaHiloComponent, BandejaPanelComponent, TranslatePipe],
  host: { '[class.solo]': 'movil()' },
  template: `
    <div class="inbox" [class.con-panel]="panel() && !estrecho()">
      @if (!movil() || !abierta()) {
        <aside class="list">
          <div class="views" role="tablist">
            @for (v of vistas(); track v) {
              <button role="tab" class="view" [id]="'view-' + v" [class.on]="vista() === v" [attr.aria-selected]="vista() === v" (click)="cambiarVista(v)">
                {{ 'com.view.' + v | translate }}
                @if (badge(v); as n) { <span class="count" [class.alert]="v === 'mias' && (conteos()?.mias_sin_leer ?? 0) > 0">{{ n }}</span> }
              </button>
            }
          </div>
          <div class="tools">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
              <mat-icon matPrefix>search</mat-icon>
              <input matInput id="inbox-search" [ngModel]="q()" (ngModelChange)="buscar($event)" [placeholder]="'com.inbox.search' | translate" />
            </mat-form-field>
            @if (lineas().length > 1) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="line">
                <mat-select [ngModel]="idLinea()" (ngModelChange)="idLinea.set($event); cargarLista()" [placeholder]="'com.all_lines' | translate">
                  <mat-option [value]="null">{{ 'com.all_lines' | translate }}</mat-option>
                  @for (l of lineas(); track l.id) { <mat-option [value]="l.id">{{ l.nombre }}</mat-option> }
                </mat-select>
              </mat-form-field>
            }
          </div>
          <div class="items" role="list">
            @for (c of convs(); track c.id) {
              <button class="item" role="listitem" [class.sel]="c.id === seleccion()" [class.unread]="c.no_leidos > 0" (click)="abrir(c.id)" [attr.data-id]="c.id">
                <span class="avatar" aria-hidden="true">{{ inicial(c.nombre) }}</span>
                <span class="main">
                  <span class="row1"><strong class="nm">{{ c.nombre }}</strong><span class="time">{{ fecha(c.ultimo_mensaje_at) }}</span></span>
                  <span class="row2">
                    @if (c.ultimo?.direccion === 'saliente') { <mat-icon class="st" [class]="estado(c.ultimo!.estado).clase">{{ estado(c.ultimo!.estado).icon }}</mat-icon> }
                    @if (tipoIcono(c.ultimo?.tipo); as ic) { <mat-icon class="st">{{ ic }}</mat-icon> }
                    <span class="prev">{{ c.resumen || ('com.type.' + (c.ultimo?.tipo ?? 'text') | translate) }}</span>
                    @if (c.no_leidos > 0) { <span class="unread-n">{{ c.no_leidos }}</span> }
                  </span>
                  @if (vista() === 'todas' || vista() === 'cerradas') {
                    <span class="row3 muted">{{ 'com.state.' + c.estado | translate }}@if (c.asignado_nombre) { · {{ c.asignado_nombre }} }@if (lineas().length > 1) { · {{ c.linea_nombre }} }</span>
                  } @else if (!c.ventana_abierta) { <span class="row3 muted"><mat-icon class="mini">schedule</mat-icon>{{ 'com.inbox.window_closed_short' | translate }}</span> }
                </span>
              </button>
            } @empty {
              <div class="empty-state">
                <mat-icon>{{ vista() === 'cola' ? 'inbox' : 'forum' }}</mat-icon>
                <span>{{ (q() ? 'com.inbox.no_results' : 'com.inbox.empty_' + vista()) | translate }}</span>
                @if (!lineas().length && !cargando()) { <span class="small">{{ 'com.inbox.no_lines' | translate }}</span> }
              </div>
            }
          </div>
        </aside>
      }
      @if (!movil() || abierta()) {
        <main class="thread">
          <app-bandeja-hilo [idConversacion]="seleccion()" (cambio)="cargarLista()" (volver)="cerrarHilo()" (panel)="panel.set(!panel())"
                            (conversacion)="conv.set($event)" />
        </main>
      }
      @if (panel() && seleccion()) {
        <div class="side" [class.overlay]="estrecho()">
          <app-bandeja-panel [conv]="conv()" (cerrar)="panel.set(false)" />
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; height: calc(100dvh - 64px); @media (max-width: 599px) { height: calc(100dvh - 56px); } }
    .inbox { position: relative; display: grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); height: 100%; min-height: 0;
      &.con-panel { grid-template-columns: minmax(280px, 340px) minmax(0, 1fr) 320px; } }
    :host(.solo) .inbox { grid-template-columns: 1fr; }
    .list { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface); }
    .views { display: flex; gap: 4px; padding: 8px; overflow-x: auto; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
    .view { flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 16px; border: 1px solid var(--md-sys-color-outline-variant);
      background: none; color: var(--md-sys-color-on-surface-variant); font: var(--mat-sys-label-large); cursor: pointer;
      &.on { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); border-color: transparent; } }
    .count { min-width: 18px; padding: 0 6px; border-radius: 9px; font: var(--mat-sys-label-small); background: var(--md-sys-color-surface-container-highest); text-align: center;
      &.alert { background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); } }
    .tools { display: flex; gap: 8px; padding: 8px; flex-wrap: wrap; .search { flex: 1 1 160px; } .line { flex: 0 1 140px; } }
    .items { flex: 1; overflow-y: auto; }
    .item { width: 100%; display: flex; gap: 12px; padding: 10px 12px; border: none; border-bottom: 1px solid var(--md-sys-color-outline-variant); background: none; color: inherit;
      font: inherit; text-align: left; cursor: pointer; &:hover { background: var(--md-sys-color-surface-container-low); } &.sel { background: var(--md-sys-color-secondary-container); } }
    .avatar { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; flex: none; font: var(--mat-sys-title-small);
      background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .row1, .row2 { display: flex; align-items: center; gap: 4px; min-width: 0; }
    .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--mat-sys-title-small); }
    .unread .nm { font-weight: 700; }
    .time { flex: none; font: var(--mat-sys-label-small); color: var(--md-sys-color-on-surface-variant); }
    .unread .time { color: var(--md-sys-color-primary); }
    .prev { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--mat-sys-body-medium); color: var(--md-sys-color-on-surface-variant); }
    .st { width: 16px; height: 16px; font-size: 16px; flex: none; color: var(--md-sys-color-on-surface-variant); }
    .st-read { color: var(--md-sys-color-primary); } .st-fail { color: var(--md-sys-color-error); }
    .unread-n { flex: none; min-width: 20px; padding: 0 6px; border-radius: 10px; text-align: center; font: var(--mat-sys-label-small); background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
    .row3 { display: flex; align-items: center; gap: 4px; font: var(--mat-sys-label-small); }
    .mini { width: 14px; height: 14px; font-size: 14px; }
    .thread { min-width: 0; min-height: 0; }
    .side { min-height: 0; border-left: 1px solid var(--md-sys-color-outline-variant);
      &.overlay { position: absolute; top: 0; right: 0; bottom: 0; width: min(360px, 100%); z-index: 3; box-shadow: -4px 0 16px color-mix(in srgb, var(--md-sys-color-shadow) 25%, transparent); } }
    .small { font: var(--mat-sys-body-small); }
  `,
})
export default class BandejaPage implements OnDestroy {
  /** ?c=<id>: conversación a abrir (component input binding del query param). */
  readonly c = input<string>();
  private com = inject(ComunicacionesService);
  private session = inject(SessionService);
  private router = inject(Router);
  private i18n = inject(TranslationService);
  private bp = inject(BreakpointObserver);

  readonly movil = toSignal(this.bp.observe('(max-width: 839px)').pipe(map(r => r.matches)), { initialValue: false });
  readonly estrecho = toSignal(this.bp.observe('(max-width: 1199px)').pipe(map(r => r.matches)), { initialValue: false });
  readonly vista = signal<VistaBandeja>('cola');
  readonly convs = signal<ConversacionFila[]>([]);
  readonly conteos = signal<ConteosBandeja | null>(null);
  readonly lineas = signal<Linea[]>([]);
  readonly idLinea = signal<number | null>(null);
  readonly q = signal('');
  readonly seleccion = signal<number | null>(null);
  readonly abierta = computed(() => this.seleccion() !== null);
  readonly panel = signal(false);
  readonly conv = signal<Conversacion | null>(null);
  readonly cargando = signal(true);
  readonly vistas = computed<VistaBandeja[]>(() => this.session.hasMinRole('L2') ? ['cola', 'mias', 'todas', 'bot', 'cerradas'] : ['cola', 'mias']);
  private timer: ReturnType<typeof setInterval> | null = null;
  private qTimer: ReturnType<typeof setTimeout> | null = null;
  private pidiendo = false;

  constructor() {
    effect(() => {
      const id = Number(this.c() ?? 0);
      untracked(() => { if (id > 0) { this.seleccion.set(id); this.panel.set(!this.estrecho()); } });
    });
    void this.init();
    this.timer = setInterval(() => { if (document.visibilityState === 'visible') void this.cargarLista(); }, POLL_MS);
  }

  ngOnDestroy(): void { if (this.timer) clearInterval(this.timer); if (this.qTimer) clearTimeout(this.qTimer); }

  private async init(): Promise<void> {
    try {
      const r = await this.com.listLineasSede();
      if (r.action && r.data) this.lineas.set(r.data.lineas);
    } catch { /* sin líneas visibles */ }
    // Primera vista: «Mis chats» si tiene alguno sin leer; si no, la cola.
    await this.cargarLista();
    if ((this.conteos()?.mias ?? 0) > 0 && (this.conteos()?.cola ?? 0) === 0) { this.vista.set('mias'); await this.cargarLista(); }
  }

  async cargarLista(): Promise<void> {
    if (this.pidiendo) return;
    this.pidiendo = true;
    try {
      const r = await this.com.listConversaciones({ vista: this.vista(), idLinea: this.idLinea(), q: this.q() });
      if (r.action && r.data) { this.convs.set(r.data.conversaciones); this.conteos.set(r.data.conteos); }
    } catch { /* sin red: el siguiente intento */ } finally { this.pidiendo = false; this.cargando.set(false); }
  }

  cambiarVista(v: VistaBandeja): void { this.vista.set(v); this.convs.set([]); void this.cargarLista(); }

  buscar(v: string): void {
    this.q.set(v);
    if (this.qTimer) clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => void this.cargarLista(), 300);
  }

  badge(v: VistaBandeja): number | null {
    const k = this.conteos();
    if (!k) return null;
    const n = v === 'cola' ? k.cola : v === 'mias' ? k.mias : v === 'bot' ? k.bot : v === 'todas' ? k.todas : null;
    return n || null;
  }

  abrir(id: number): void {
    this.seleccion.set(id);
    void this.router.navigate([], { queryParams: { c: id }, replaceUrl: true });
  }

  cerrarHilo(): void {
    this.seleccion.set(null);
    this.conv.set(null);
    this.panel.set(false);
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    void this.cargarLista();
  }

  inicial(n: string): string { return (n.trim()[0] ?? '?').toUpperCase(); }
  fecha(s: string | null): string { return fechaRelativa(s, k => this.i18n.t(k)); }
  estado(e: string) { return iconoEstado(e); }
  tipoIcono(t: string | undefined): string { return t && t !== 'text' ? iconoTipo(t) : ''; }
}
