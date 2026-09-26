import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ComunicacionesService, ConversacionContacto } from '../../services/comunicaciones.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { abrirEnviarPlantilla } from './enviar-plantilla-dialog.component';
import { fechaRelativa } from './wa-format';

/**
 * Tarjeta «Conversaciones» del perfil de un contacto (con el módulo Comunicaciones): sus chats de WhatsApp por línea y «Enviar WhatsApp»
 * (una plantilla, que es la forma de iniciar o retomar la conversación fuera de la ventana de 24 h).
 */
@Component({
  selector: 'app-contacto-conversaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIcon, TranslatePipe],
  template: `
    <div class="card-head">
      <h2>{{ 'com.profile.title' | translate }}</h2>
      @if (tieneWhatsapp()) {
        <button mat-button id="btn-profile-wa" (click)="enviar()"><mat-icon>send</mat-icon>{{ 'com.profile.send' | translate }}</button>
      }
    </div>
    @for (c of convs(); track c.id) {
      <button class="link-row" [disabled]="!c.puede_abrir" (click)="abrir(c)">
        <mat-icon>forum</mat-icon>
        <span class="link-text">
          <strong>{{ c.linea_nombre }} · {{ 'com.state.' + c.estado | translate }}@if (c.no_leidos) { <span class="badge">{{ c.no_leidos }}</span> }</strong>
          <span class="muted small">{{ c.resumen || ('com.profile.messages' | translate: { n: c.mensajes }) }}</span>
          <span class="muted small">{{ fecha(c.ultimo_mensaje_at) }}@if (c.asignado_nombre) { · {{ c.asignado_nombre }} }</span>
        </span>
      </button>
    } @empty {
      <p class="muted">{{ (tieneWhatsapp() ? 'com.profile.empty' : 'com.profile.no_whatsapp') | translate }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; h2 { margin: 0; font: var(--mat-sys-title-medium); } }
    .link-row { width: 100%; display: flex; align-items: center; gap: 12px; padding: 8px 0; border: none; border-bottom: 1px solid var(--md-sys-color-outline-variant);
      background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; &:last-of-type { border-bottom: none; } &:disabled { cursor: default; opacity: .7; } }
    .link-text { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .small { font: var(--mat-sys-body-small); }
    .badge { margin-left: 6px; padding: 0 6px; border-radius: 10px; font: var(--mat-sys-label-small); background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
  `,
})
export class ContactoConversacionesComponent {
  readonly idContacto = input.required<number>();
  readonly nombre = input.required<string>();
  readonly tieneWhatsapp = input(false);
  private com = inject(ComunicacionesService);
  private router = inject(Router);
  private matDialog = inject(MatDialog);
  private i18n = inject(TranslationService);
  readonly convs = signal<ConversacionContacto[]>([]);

  constructor() {
    effect(() => { const id = this.idContacto(); untracked(() => void this.cargar(id)); });
  }

  private async cargar(id: number): Promise<void> {
    try {
      const r = await this.com.listConversacionesContacto(id);
      if (r.action && r.data) this.convs.set(r.data.conversaciones);
    } catch { /* la tarjeta queda vacía */ }
  }

  fecha(s: string | null): string { return fechaRelativa(s, k => this.i18n.t(k), true); }
  abrir(c: ConversacionContacto): void { void this.router.navigate(['/m/comunicaciones/bandeja'], { queryParams: { c: c.id } }); }

  enviar(): void {
    abrirEnviarPlantilla(this.matDialog, { idContacto: this.idContacto(), contactoNombre: this.nombre() }).afterClosed().subscribe(r => {
      if (r?.id_conversacion) void this.router.navigate(['/m/comunicaciones/bandeja'], { queryParams: { c: r.id_conversacion } });
      else void this.cargar(this.idContacto());
    });
  }
}
