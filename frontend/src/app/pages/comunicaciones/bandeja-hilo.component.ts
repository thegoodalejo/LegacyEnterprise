import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatDialog, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDivider } from '@angular/material/divider';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { ComunicacionesService, Conversacion, Mensaje, RespuestaRapida, UsuarioModulo } from '../../services/comunicaciones.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { ComMediaComponent } from './com-media.component';
import { abrirEnviarPlantilla } from './enviar-plantilla-dialog.component';
import { RespuestasEditorComponent } from './respuestas-editor.component';
import { diaSeparador, horaCorta, iconoEstado, waHtml } from './wa-format';

interface Item { key: string; dia?: string; m?: Mensaje }
const POLL_MS = 4000;

/**
 * Hilo de una conversación: mensajes con día, hora y palomitas; medios; respuestas de botones; notas del sistema; y el compositor
 * (texto con respuestas rápidas «/», adjuntos, plantilla cuando la ventana de 24 h está cerrada). Se actualiza solo cada 4 s con la
 * pestaña visible (solo lo nuevo y lo que cambió de estado).
 */
@Component({
  selector: 'app-bandeja-hilo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, MatButton, MatIconButton, MatDivider, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, MatTooltip, ComMediaComponent, TranslatePipe],
  template: `
    @if (conv(); as c) {
      <header class="thead">
        <button mat-icon-button class="back" (click)="volver.emit()" [attr.aria-label]="'com.back' | translate"><mat-icon>arrow_back</mat-icon></button>
        <div class="who">
          @if (c.id_contacto) {
            <a class="name" [routerLink]="['/m/comunicaciones/contactos', c.id_contacto]">{{ c.contacto_nombre || c.nombre_perfil || ('+' + c.wa_id) }}</a>
          } @else { <span class="name">{{ c.nombre_perfil || ('+' + c.wa_id) }}</span> }
          <span class="muted small">+{{ c.wa_id }} · {{ c.linea_nombre }}</span>
        </div>
        <span class="state" [attr.data-estado]="c.estado">{{ 'com.state.' + c.estado | translate }}@if (c.estado === 'atencion' && c.asignado_nombre) { · {{ c.asignado_nombre }} }</span>
        <div class="tactions">
          @if (c.estado === 'cola' || c.estado === 'bot') {
            <button mat-flat-button id="btn-take" (click)="tomar()"><mat-icon>pan_tool</mat-icon>{{ 'com.inbox.take' | translate }}</button>
          }
          @if (puedeGestionar()) {
            <button mat-icon-button id="btn-transfer" [matMenuTriggerFor]="transferMenu" (menuOpened)="cargarUsuarios()" [matTooltip]="'com.inbox.transfer' | translate"
                    [attr.aria-label]="'com.inbox.transfer' | translate"><mat-icon>forward</mat-icon></button>
            <button mat-icon-button id="btn-close-conv" (click)="cerrar()" [matTooltip]="'com.inbox.close' | translate" [attr.aria-label]="'com.inbox.close' | translate"><mat-icon>task_alt</mat-icon></button>
          }
          <button mat-icon-button id="btn-panel" (click)="panel.emit()" [matTooltip]="'com.inbox.contact_panel' | translate" [attr.aria-label]="'com.inbox.contact_panel' | translate"><mat-icon>contact_page</mat-icon></button>
        </div>
      </header>
      <mat-menu #transferMenu="matMenu">
        @if (c.estado === 'atencion') { <button mat-menu-item (click)="aCola()"><mat-icon>move_to_inbox</mat-icon>{{ 'com.inbox.to_queue' | translate }}</button><mat-divider /> }
        @for (u of usuarios(); track u.id) {
          @if (u.id !== c.id_asignado) { <button mat-menu-item (click)="transferir(u)"><mat-icon>person</mat-icon>{{ u.nombre }}</button> }
        }
      </mat-menu>

      <div class="scroll" #scroller (scroll)="alScroll()">
        @if (hayAnteriores()) { <button mat-button class="older" (click)="anteriores()">{{ 'com.inbox.older' | translate }}</button> }
        @for (it of items(); track it.key) {
          @if (it.dia) {
            <div class="day"><span>{{ it.dia }}</span></div>
          } @else {
            @let m = it.m!;
            @if (m.origen === 'sistema' && m.tipo === 'nota') {
              <div class="sys"><mat-icon>info</mat-icon>{{ m.texto }} · {{ hora(m.created_at) }}</div>
            } @else {
              <div class="msg" [class.out]="m.direccion === 'saliente'" [class.fail]="m.estado === 'fallido'" [attr.data-id]="m.id">
                <div class="bubble">
                  @if (m.direccion === 'saliente' && m.origen !== 'asesor') {
                    <span class="origin"><mat-icon>{{ m.origen === 'bot' ? 'smart_toy' : m.origen === 'campana' ? 'campaign' : 'settings' }}</mat-icon>
                      {{ m.origen === 'campana' && m.contenido?.campana ? m.contenido!.campana!.nombre : ('com.origin.' + m.origen | translate) }}</span>
                  } @else if (m.direccion === 'saliente' && m.usuario) { <span class="origin">{{ m.usuario }}</span> }
                  @if (m.tipo === 'template') { <span class="tpl-badge"><mat-icon>article</mat-icon>{{ m.contenido?.plantilla?.nombre }}</span> }
                  @if (m.media) { <app-com-media [mensaje]="m" /> }
                  @switch (m.tipo) {
                    @case ('location') {
                      <a class="loc" [href]="'https://maps.google.com/?q=' + m.contenido?.ubicacion?.lat + ',' + m.contenido?.ubicacion?.lng" target="_blank" rel="noopener">
                        <mat-icon>location_on</mat-icon>{{ m.texto || ('com.media.location' | translate) }}</a>
                    }
                    @case ('reaction') { <span class="muted">{{ 'com.inbox.reacted' | translate: { emoji: m.texto || '' } }}</span> }
                    @case ('unsupported') { <span class="muted">{{ 'com.inbox.unsupported' | translate }}</span> }
                    @case ('contacts') {
                      @for (x of m.contenido?.contactos ?? []; track $index) { <div><mat-icon class="mini">person</mat-icon> {{ x.nombre }} · {{ x.telefonos.join(', ') }}</div> }
                    }
                    @default {
                      @if (m.contenido?.respuesta) { <span class="reply"><mat-icon>reply</mat-icon>{{ 'com.inbox.chose' | translate }}</span> }
                      @if (m.texto) { <div class="text" [innerHTML]="html(m.texto)"></div> }
                    }
                  }
                  @if (m.contenido?.botones?.length) {
                    <div class="opts">@for (b of m.contenido!.botones!; track b.id) { <span class="opt">{{ b.titulo }}</span> }</div>
                  }
                  @if (m.contenido?.lista) {
                    <div class="opts col"><span class="opt"><mat-icon>list</mat-icon>{{ m.contenido!.lista!.boton }}</span>
                      @for (f of m.contenido!.lista!.filas; track f.id) { <span class="row-opt">{{ f.titulo }}</span> }</div>
                  }
                  @if (m.tipo === 'template' && m.contenido?.plantilla?.botones?.length) {
                    <div class="opts">@for (b of m.contenido!.plantilla!.botones; track $index) { <span class="opt">{{ b.texto }}</span> }</div>
                  }
                  <span class="meta">{{ hora(m.created_at) }}
                    @if (m.direccion === 'saliente') { <mat-icon [class]="estadoIcono(m.estado).clase" [matTooltip]="'com.status.' + m.estado | translate">{{ estadoIcono(m.estado).icon }}</mat-icon> }
                  </span>
                </div>
                @if (m.estado === 'fallido' && m.error_detalle) { <div class="error small"><mat-icon>error</mat-icon>{{ m.error_detalle }}</div> }
              </div>
            }
          }
        }
      </div>

      @if (!c.ventana_abierta) {
        <div class="window closed">
          <mat-icon>schedule</mat-icon><span>{{ 'com.inbox.window_closed' | translate }}</span>
          <button mat-flat-button id="btn-send-template" (click)="plantilla()"><mat-icon>article</mat-icon>{{ 'com.inbox.send_template' | translate }}</button>
        </div>
      } @else {
        @if (sugerencias().length) {
          <div class="qr-pop">
            @for (r of sugerencias(); track r.id) {
              <button class="qr-item" (click)="usarRespuesta(r)"><strong>/{{ r.atajo }}</strong> {{ r.titulo }}<span class="muted small">{{ r.texto }}</span></button>
            }
          </div>
        }
        <div class="composer">
          <button mat-icon-button [matMenuTriggerFor]="moreMenu" [attr.aria-label]="'com.inbox.more' | translate"><mat-icon>add_circle</mat-icon></button>
          <mat-menu #moreMenu="matMenu">
            <button mat-menu-item (click)="fileInput.click()"><mat-icon>attach_file</mat-icon>{{ 'com.inbox.attach' | translate }}</button>
            <button mat-menu-item (click)="plantilla()"><mat-icon>article</mat-icon>{{ 'com.inbox.send_template' | translate }}</button>
            <button mat-menu-item (click)="gestionarRespuestas()"><mat-icon>bolt</mat-icon>{{ 'com.qr.manage' | translate }}</button>
          </mat-menu>
          <input #fileInput type="file" hidden (change)="adjuntar($event)" />
          <textarea id="composer" class="input" rows="1" [ngModel]="texto()" (ngModelChange)="texto.set($event)" (keydown)="tecla($event)" maxlength="4096"
                    [placeholder]="'com.inbox.write' | translate" [attr.aria-label]="'com.inbox.write' | translate"></textarea>
          <button mat-icon-button id="btn-send" class="send" [disabled]="!texto().trim() || enviando()" (click)="enviar()" [attr.aria-label]="'com.inbox.send' | translate"><mat-icon>send</mat-icon></button>
        </div>
        @if (c.ventana_vence) { <div class="window small muted">{{ 'com.inbox.window_open' | translate: { t: restante(c.ventana_vence) } }}</div> }
      }
    } @else {
      <div class="empty-state"><mat-icon>forum</mat-icon><span>{{ 'com.inbox.pick' | translate }}</span></div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--md-sys-color-surface-container-lowest); }
    .thead { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--md-sys-color-outline-variant); flex-wrap: wrap; }
    .back { display: none; } :host-context(.solo) .back { display: inline-flex; }
    .who { display: flex; flex-direction: column; min-width: 0; flex: 1 1 160px; }
    .name { font: var(--mat-sys-title-medium); color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; &[href]:hover { text-decoration: underline; } }
    .small { font: var(--mat-sys-body-small); }
    .state { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container);
      &[data-estado='cola'] { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
      &[data-estado='cerrada'] { background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); } }
    .tactions { display: flex; align-items: center; gap: 4px; }
    .scroll { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; background: var(--md-sys-color-surface-container-low); }
    .older { align-self: center; }
    .day { align-self: center; margin: 8px 0; span { padding: 4px 12px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-surface-container-high); } }
    .sys { align-self: center; display: flex; align-items: center; gap: 6px; max-width: 90%; padding: 4px 12px; border-radius: 8px; font: var(--mat-sys-body-small);
      background: var(--md-sys-color-surface-container-high); color: var(--md-sys-color-on-surface-variant); text-align: center; mat-icon { width: 16px; height: 16px; font-size: 16px; } }
    .msg { display: flex; flex-direction: column; align-items: flex-start; max-width: min(78%, 560px); &.out { align-self: flex-end; align-items: flex-end; } }
    .bubble { position: relative; padding: 6px 10px 4px; border-radius: 4px 14px 14px 14px; background: var(--md-sys-color-surface-container-lowest); overflow-wrap: anywhere; min-width: 80px;
      box-shadow: 0 1px 1px color-mix(in srgb, var(--md-sys-color-shadow) 15%, transparent); }
    .out .bubble { border-radius: 14px 4px 14px 14px; background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
    .fail .bubble { outline: 1px solid var(--md-sys-color-error); }
    .origin { display: flex; align-items: center; gap: 4px; font: var(--mat-sys-label-small); opacity: .8; mat-icon { width: 14px; height: 14px; font-size: 14px; } }
    .tpl-badge { display: inline-flex; align-items: center; gap: 4px; font: var(--mat-sys-label-small); margin-bottom: 2px; opacity: .85; mat-icon { width: 14px; height: 14px; font-size: 14px; } }
    .text { font: var(--mat-sys-body-medium); line-height: 1.4; }
    .text :is(a) { color: inherit; }
    .reply { display: inline-flex; align-items: center; gap: 4px; font: var(--mat-sys-label-small); opacity: .75; mat-icon { width: 14px; height: 14px; font-size: 14px; } }
    .opts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; &.col { flex-direction: column; } }
    .opt { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 12px; font: var(--mat-sys-label-medium); border: 1px solid currentColor; opacity: .8;
      mat-icon { width: 14px; height: 14px; font-size: 14px; } }
    .row-opt { font: var(--mat-sys-body-small); padding-left: 8px; }
    .loc { display: inline-flex; align-items: center; gap: 4px; color: inherit; }
    .mini { width: 14px; height: 14px; font-size: 14px; vertical-align: middle; }
    .meta { display: flex; justify-content: flex-end; align-items: center; gap: 2px; font: var(--mat-sys-label-small); opacity: .75; margin-top: 2px;
      mat-icon { width: 16px; height: 16px; font-size: 16px; } }
    .st-read { color: var(--md-sys-color-primary); } .out .st-read { color: var(--md-sys-color-tertiary); }
    .st-fail { color: var(--md-sys-color-error); }
    .error { display: flex; align-items: center; gap: 4px; color: var(--md-sys-color-error); margin-top: 2px; mat-icon { width: 16px; height: 16px; font-size: 16px; } }
    .window { display: flex; align-items: center; gap: 8px; padding: 6px 16px; flex-wrap: wrap;
      &.closed { padding: 12px 16px; background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); span { flex: 1 1 200px; } } }
    .composer { display: flex; align-items: flex-end; gap: 4px; padding: 8px; border-top: 1px solid var(--md-sys-color-outline-variant); }
    .input { flex: 1; resize: none; max-height: 160px; min-height: 40px; padding: 10px 14px; border-radius: 20px; border: 1px solid var(--md-sys-color-outline-variant);
      background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface); font: var(--mat-sys-body-large); field-sizing: content;
      &:focus { outline: 2px solid var(--md-sys-color-primary); outline-offset: -1px; } }
    .send { color: var(--md-sys-color-primary); }
    .qr-pop { display: flex; flex-direction: column; max-height: 220px; overflow-y: auto; border-top: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface-container); }
    .qr-item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 8px 16px; border: none; background: none; text-align: left; cursor: pointer; font: inherit; color: inherit;
      &:hover, &:focus { background: var(--md-sys-color-surface-container-high); } .small { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } }
    .empty-state { flex: 1; justify-content: center; }
  `,
})
export class BandejaHiloComponent implements OnDestroy {
  readonly idConversacion = input<number | null>(null);
  readonly cambio = output<void>();
  readonly volver = output<void>();
  readonly panel = output<void>();
  /** La conversación cargada o actualizada (el panel del contacto la usa). */
  readonly conversacion = output<Conversacion | null>();
  private com = inject(ComunicacionesService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private session = inject(SessionService);
  private matDialog = inject(MatDialog);
  private i18n = inject(TranslationService);
  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly conv = signal<Conversacion | null>(null);
  readonly mensajes = signal<Mensaje[]>([]);
  readonly hayAnteriores = signal(false);
  readonly texto = signal('');
  readonly enviando = signal(false);
  readonly usuarios = signal<UsuarioModulo[]>([]);
  readonly respuestas = signal<RespuestaRapida[]>([]);
  private ahora = '';
  private abajo = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pidiendo = false;

  readonly puedeGestionar = computed(() => {
    const c = this.conv();
    return !!c && c.estado !== 'cerrada' && (this.session.hasMinRole('L2') || c.id_asignado === this.session.user()?.id);
  });
  readonly items = computed<Item[]>(() => {
    const out: Item[] = [];
    let dia = '';
    for (const m of this.mensajes()) {
      const d = m.created_at.slice(0, 10);
      if (d !== dia) { dia = d; out.push({ key: 'd' + d, dia: diaSeparador(m.created_at, k => this.i18n.t(k), this.i18n.lang()) }); }
      out.push({ key: 'm' + m.id, m });
    }
    return out;
  });
  readonly sugerencias = computed(() => {
    const t = this.texto();
    if (!t.startsWith('/') || t.includes(' ')) return [];
    const q = t.slice(1).toLowerCase();
    return this.respuestas().filter(r => r.atajo.startsWith(q) || r.titulo.toLowerCase().includes(q)).slice(0, 8);
  });

  constructor() {
    effect(() => {
      const id = this.idConversacion();
      untracked(() => { this.conv.set(null); this.mensajes.set([]); this.texto.set(''); if (id) void this.cargar(id); });
    });
    this.timer = setInterval(() => { if (document.visibilityState === 'visible') void this.poll(); }, POLL_MS);
    void this.cargarRespuestas();
  }

  ngOnDestroy(): void { if (this.timer) clearInterval(this.timer); }

  private async cargar(id: number): Promise<void> {
    const r = await this.loading.wrap(() => this.com.getConversacion(id));
    if (this.idConversacion() !== id) return;
    if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.inbox.error'), message: r.mensaje }); return; }
    this.conv.set(r.data.conversacion);
    this.conversacion.emit(r.data.conversacion);
    this.mensajes.set(r.data.mensajes);
    this.hayAnteriores.set(!!r.data.hay_anteriores);
    this.ahora = r.data.ahora;
    this.abajo = true;
    this.bajar();
    if (r.data.conversacion.no_leidos > 0) { await this.com.marcarLeida(id); this.cambio.emit(); }
  }

  /** Lo nuevo y lo que cambió de estado desde la última consulta. */
  async poll(): Promise<void> {
    const c = this.conv();
    if (!c || this.pidiendo) return;
    this.pidiendo = true;
    try {
      const ultimo = this.mensajes().at(-1)?.id ?? 0;
      const r = await this.com.getConversacion(c.id, { desdeId: Math.max(1, ultimo), desde: this.ahora });
      if (!r.action || !r.data || this.conv()?.id !== c.id) return;
      this.ahora = r.data.ahora;
      this.conv.set(r.data.conversacion);
      this.conversacion.emit(r.data.conversacion);
      if (r.data.mensajes.length) {
        const map = new Map(this.mensajes().map(m => [m.id, m]));
        let nuevos = false;
        for (const m of r.data.mensajes) { if (!map.has(m.id)) nuevos = true; map.set(m.id, m); }
        this.mensajes.set([...map.values()].sort((a, b) => a.id - b.id));
        if (nuevos && this.abajo) this.bajar();
      }
      if (r.data.conversacion.no_leidos > 0 && document.hasFocus()) { await this.com.marcarLeida(c.id); this.cambio.emit(); }
    } catch { /* sin red: el siguiente intento */ } finally { this.pidiendo = false; }
  }

  async anteriores(): Promise<void> {
    const c = this.conv();
    const primero = this.mensajes()[0]?.id;
    if (!c || !primero) return;
    const r = await this.com.getConversacion(c.id, { antesDe: primero });
    if (r.action && r.data) { this.mensajes.update(l => [...r.data!.mensajes, ...l]); this.hayAnteriores.set(!!r.data.hay_anteriores); }
  }

  alScroll(): void {
    const el = this.scroller()?.nativeElement;
    if (el) this.abajo = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  private bajar(): void {
    setTimeout(() => { const el = this.scroller()?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
  }

  html(t: string): string { return waHtml(t); }
  hora(s: string): string { return horaCorta(s); }
  estadoIcono(e: string) { return iconoEstado(e); }
  restante(vence: string): string {
    const min = Math.max(0, Math.round((new Date(vence.replace(' ', 'T')).getTime() - Date.now()) / 60000));
    return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
  }

  private async cargarRespuestas(): Promise<void> {
    try { const r = await this.com.listRespuestas(); if (r.action && r.data) this.respuestas.set(r.data.respuestas); } catch { /* sin atajos */ }
  }
  usarRespuesta(r: RespuestaRapida): void {
    const c = this.conv();
    const nombre = c?.contacto_nombre?.split(/\s+/)[0] ?? '';
    const texto = r.texto.replace(/\{\{\s*nombre\s*\}\}/gi, nombre);
    this.texto.set(texto);
    // Ya mismo en el textarea (ngModel lo escribe en el siguiente render): lo que se teclee enseguida sigue a la respuesta.
    const el = document.getElementById('composer') as HTMLTextAreaElement | null;
    if (el) { el.value = texto; el.focus(); el.setSelectionRange(texto.length, texto.length); }
  }
  gestionarRespuestas(): void {
    this.matDialog.open(RespuestasPersonalesDialogComponent, dialogSize('720px')).afterClosed().subscribe(() => void this.cargarRespuestas());
  }

  tecla(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      const s = this.sugerencias();
      if (s.length) this.usarRespuesta(s[0]); else void this.enviar();
    }
  }

  async enviar(): Promise<void> {
    const c = this.conv();
    const t = this.texto().trim();
    if (!c || !t) return;
    this.enviando.set(true);
    try {
      const r = await this.com.enviarTexto(c.id, t);
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.inbox.send_error'), message: r.mensaje }); return; }
      this.texto.set('');
      this.abajo = true;
      await this.poll();
      this.cambio.emit();
    } finally { this.enviando.set(false); }
  }

  async adjuntar(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    const c = this.conv();
    if (!f || !c) return;
    const r = await this.loading.wrap(() => this.com.enviarArchivo(c.id, f, this.texto().trim() || undefined));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.inbox.send_error'), message: r.mensaje }); return; }
    this.texto.set('');
    await this.poll();
    this.cambio.emit();
  }

  plantilla(): void {
    const c = this.conv();
    if (!c) return;
    abrirEnviarPlantilla(this.matDialog, { idConversacion: c.id, idLinea: c.id_linea, contactoNombre: c.contacto_nombre || c.nombre_perfil || '+' + c.wa_id })
      .afterClosed().subscribe(r => { if (r) { void this.poll(); this.cambio.emit(); } });
  }

  async tomar(): Promise<void> {
    const c = this.conv();
    if (!c) return;
    const r = await this.loading.wrap(() => this.com.tomar(c.id));
    if (!r.action) await this.dialogs.error({ title: this.i18n.t('com.inbox.error'), message: r.mensaje });
    await this.poll();
    this.cambio.emit();
  }

  async cargarUsuarios(): Promise<void> {
    if (this.usuarios().length) return;
    const r = await this.com.listUsuarios();
    if (r.action && r.data) this.usuarios.set(r.data.usuarios);
  }

  async transferir(u: UsuarioModulo): Promise<void> {
    const c = this.conv();
    if (!c) return;
    const r = await this.loading.wrap(() => this.com.transferirConversacion(c.id, { idUsuario: u.id }));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.inbox.error'), message: r.mensaje }); return; }
    this.cambio.emit();
    await this.recargarOSalir(c.id);
  }

  async aCola(): Promise<void> {
    const c = this.conv();
    if (!c) return;
    const r = await this.loading.wrap(() => this.com.transferirConversacion(c.id, { aCola: true }));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.inbox.error'), message: r.mensaje }); return; }
    this.cambio.emit();
    await this.recargarOSalir(c.id);
  }

  async cerrar(): Promise<void> {
    const c = this.conv();
    if (!c) return;
    const ok = await this.dialogs.confirm({ title: this.i18n.t('com.inbox.close_title'), message: this.i18n.t('com.inbox.close_msg'), confirmText: this.i18n.t('com.inbox.close') });
    if (!ok) return;
    const r = await this.loading.wrap(() => this.com.cerrar(c.id));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('com.inbox.error'), message: r.mensaje }); return; }
    if (r.data?.aviso) await this.dialogs.info({ title: this.i18n.t('com.inbox.closed'), message: r.data.aviso });
    this.cambio.emit();
    await this.recargarOSalir(c.id);
  }

  /** Tras transferir o cerrar: si ya no se puede ver (L0/L1), se vuelve a la lista. */
  private async recargarOSalir(id: number): Promise<void> {
    const r = await this.com.getConversacion(id);
    if (r.action && r.data) { this.conv.set(r.data.conversacion); this.mensajes.set(r.data.mensajes); this.ahora = r.data.ahora; this.bajar(); }
    else this.volver.emit();
  }
}

/** Respuestas rápidas personales (desde el compositor). Las de equipo se administran en Ajustes. */
@Component({
  selector: 'app-respuestas-personales-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RespuestasEditorComponent, MatButton, MatDialogTitle, MatDialogContent, MatDialogActions, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'com.qr.personal_title' | translate }}</h2>
    <mat-dialog-content><app-respuestas-editor [equipo]="false" /></mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button (click)="ref.close()">{{ 'common.close' | translate }}</button></mat-dialog-actions>
  `,
})
export class RespuestasPersonalesDialogComponent {
  readonly ref = inject(MatDialogRef<RespuestasPersonalesDialogComponent>);
}
