import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTooltip } from '@angular/material/tooltip';
import { ComunicacionesService, FlujoFila, SinCoincidencia } from '../../services/comunicaciones.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { formatDateTime } from '../crm/crm-format';

/**
 * Chatbot (L2+): los flujos de la sede con sus palabras de activación. El bot solo responde cuando el cliente escribe una de esas palabras
 * (o la de pedir asesor); lo demás va a la bandeja, según los Ajustes.
 */
@Component({
  selector: 'app-chatbot-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButton, MatIconButton, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, MatSlideToggle, MatTooltip, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ 'com.bot.title' | translate }}</h1>
        <div class="actions"><a mat-flat-button id="btn-new-flow" routerLink="/m/comunicaciones/chatbot/nuevo"><mat-icon>add</mat-icon>{{ 'com.bot.new' | translate }}</a></div>
      </header>

      <section class="how">
        <mat-icon>smart_toy</mat-icon>
        <div>
          <p>{{ 'com.bot.how' | translate }}</p>
          <p class="muted small">{{ 'com.bot.no_match_now' | translate }} <strong>{{ 'com.config.nm_' + nmKey() | translate }}</strong>
            · {{ 'com.bot.advisor_words' | translate }} <strong>{{ palabras() || '—' }}</strong>
            @if (esL4()) { · <a routerLink="/m/comunicaciones/configuracion">{{ 'com.bot.change' | translate }}</a> }</p>
        </div>
      </section>

      @for (f of flujos(); track f.id) {
        <section class="flow" [class.off]="!f.activo">
          <div class="fhead">
            <mat-slide-toggle [checked]="f.activo" (change)="alternar(f, $event.checked)" [attr.aria-label]="'com.bot.active' | translate" />
            <a class="fname" [routerLink]="['/m/comunicaciones/chatbot', f.id]">{{ f.nombre }}</a>
            @if (f.es_respaldo) { <span class="pill">{{ 'com.bot.fallback' | translate }}</span> }
            <span class="spacer"></span>
            <a mat-stroked-button [routerLink]="['/m/comunicaciones/chatbot', f.id]"><mat-icon>account_tree</mat-icon>{{ 'com.bot.edit' | translate }}</a>
            <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'common.more' | translate"><mat-icon>more_vert</mat-icon></button>
            <mat-menu #menu="matMenu">
              <button mat-menu-item (click)="duplicar(f)"><mat-icon>content_copy</mat-icon>{{ 'com.bot.duplicate' | translate }}</button>
              <button mat-menu-item (click)="eliminar(f)"><mat-icon>delete</mat-icon>{{ 'common.delete' | translate }}</button>
            </mat-menu>
          </div>
          @if (f.descripcion) { <p class="muted desc">{{ f.descripcion }}</p> }
          <div class="triggers">
            @for (d of f.disparadores; track $index) {
              <span class="trig" [matTooltip]="'com.bot.trig.' + d.tipo | translate"><mat-icon>{{ iconoTrig(d.tipo) }}</mat-icon>{{ d.texto }}</span>
            } @empty { <span class="muted small">{{ 'com.bot.no_triggers' | translate }}</span> }
          </div>
          <div class="meta muted small">
            <span>{{ 'com.bot.steps' | translate: { n: f.pasos } }}</span>
            @if (f.en_curso) { <span>· {{ 'com.bot.in_progress' | translate: { n: f.en_curso } }}</span> }
            <span>· {{ 'com.bot.updated' | translate: { date: fecha(f.updated_at), user: f.actualizado_por || '—' } }}</span>
          </div>
        </section>
      } @empty {
        @if (!cargando()) {
          <div class="empty-state">
            <mat-icon>account_tree</mat-icon><strong>{{ 'com.bot.empty' | translate }}</strong><span>{{ 'com.bot.empty_hint' | translate }}</span>
            <a mat-flat-button routerLink="/m/comunicaciones/chatbot/nuevo"><mat-icon>add</mat-icon>{{ 'com.bot.new' | translate }}</a>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .how { display: flex; gap: 16px; align-items: flex-start; padding: 16px 20px; border-radius: 16px; margin-bottom: 16px;
      background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); p { margin: 0 0 4px; } .muted { color: inherit; opacity: .85; } a { color: inherit; } }
    .flow { padding: 16px 20px; border-radius: 16px; margin-bottom: 12px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant);
      display: flex; flex-direction: column; gap: 8px; &.off { opacity: .7; } }
    .fhead { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .fname { font: var(--mat-sys-title-medium); color: inherit; text-decoration: none; &:hover { text-decoration: underline; } }
    .pill { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    .desc { margin: 0; }
    .triggers { display: flex; flex-wrap: wrap; gap: 6px; }
    .trig { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 16px; font: var(--mat-sys-label-large);
      background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); mat-icon { width: 16px; height: 16px; font-size: 16px; } }
    .meta { display: flex; flex-wrap: wrap; gap: 4px; }
    .small { font: var(--mat-sys-body-small); }
  `,
})
export default class ChatbotPage {
  private com = inject(ComunicacionesService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private session = inject(SessionService);
  private router = inject(Router);
  private i18n = inject(TranslationService);
  readonly flujos = signal<FlujoFila[]>([]);
  readonly sinCoincidencia = signal<SinCoincidencia>('bandeja');
  readonly palabras = signal('');
  readonly cargando = signal(true);
  readonly esL4 = computed(() => this.session.hasMinRole('L4'));
  readonly nmKey = computed(() => ({ bandeja: 'inbox', mensaje: 'message', flujo: 'flow' } as const)[this.sinCoincidencia()]);

  constructor() { void this.cargar(); }

  async cargar(): Promise<void> {
    try {
      const r = await this.loading.wrap(() => this.com.listFlujos());
      if (r.action && r.data) { this.flujos.set(r.data.flujos); this.sinCoincidencia.set(r.data.sin_coincidencia); this.palabras.set(r.data.palabras_asesor); }
    } finally { this.cargando.set(false); }
  }

  iconoTrig(t: string): string { return t === 'exacta' ? 'text_fields' : t === 'empieza' ? 'start' : 'manage_search'; }
  fecha(s: string): string { return formatDateTime(s); }

  async alternar(f: FlujoFila, activo: boolean): Promise<void> {
    const g = await this.com.getFlujo(f.id);
    if (!g.action || !g.data) return;
    const x = g.data.flujo;
    const r = await this.loading.wrap(() => this.com.saveFlujo({ id: x.id, nombre: x.nombre, descripcion: x.descripcion, activo, grafo: x.grafo, disparadores: x.disparadores, version: x.version }));
    if (!r.action) await this.dialogs.error({ title: this.i18n.t('com.bot.save_error'), message: r.mensaje });
    await this.cargar();
  }

  async duplicar(f: FlujoFila): Promise<void> {
    const g = await this.com.getFlujo(f.id);
    if (!g.action || !g.data) return;
    const x = g.data.flujo;
    const r = await this.loading.wrap(() => this.com.saveFlujo({ nombre: `${x.nombre} (${this.i18n.t('com.bot.copy')})`.slice(0, 100), descripcion: x.descripcion, activo: false,
      grafo: x.grafo, disparadores: [] }));
    if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('com.bot.save_error'), message: r.mensaje }); return; }
    void this.router.navigate(['/m/comunicaciones/chatbot', r.data.id]);
  }

  async eliminar(f: FlujoFila): Promise<void> {
    const ok = await this.dialogs.confirm({ title: this.i18n.t('com.bot.delete_title'), message: this.i18n.t('com.bot.delete_msg', { name: f.nombre }), confirmText: this.i18n.t('common.delete'), danger: true });
    if (!ok) return;
    const r = await this.loading.wrap(() => this.com.eliminarFlujo(f.id));
    if (!r.action) await this.dialogs.error({ title: this.i18n.t('com.bot.save_error'), message: r.mensaje });
    await this.cargar();
  }
}
