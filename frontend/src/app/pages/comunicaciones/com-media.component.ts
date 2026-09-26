import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { ComunicacionesService, Mensaje } from '../../services/comunicaciones.service';
import { TranslatePipe } from '../../services/translation.service';

/**
 * Archivo de un mensaje (imagen, audio, video, documento, sticker). Está en el bucket privado: se pide una URL firmada (5 min) al mostrarse
 * y otra si vence. Sin copia (R2 sin configurar o descarga fallida) muestra el motivo.
 */
@Component({
  selector: 'app-com-media',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, TranslatePipe],
  template: `
    @let m = mensaje().media;
    @if (!m?.disponible) {
      <div class="nofile"><mat-icon>{{ icono() }}</mat-icon><span>{{ m?.nombre || ('com.media.' + tipo() | translate) }}</span>
        @if (m?.error) { <span class="err">{{ m?.error }}</span> }</div>
    } @else if (!url()) {
      <button class="cargar" (click)="cargar()" [disabled]="cargando()"><mat-icon>{{ icono() }}</mat-icon>{{ (cargando() ? 'common.loading' : 'com.media.load') | translate }}</button>
    } @else {
      @switch (tipo()) {
        @case ('image') { <a [href]="url()" target="_blank" rel="noopener"><img [src]="url()" alt="" (error)="vencida()" /></a> }
        @case ('sticker') { <img class="sticker" [src]="url()" alt="" (error)="vencida()" /> }
        @case ('audio') { <audio controls [src]="url()" (error)="vencida()"></audio> }
        @case ('video') { <video controls [src]="url()" (error)="vencida()"></video> }
        @default { <a class="doc" [href]="url()" target="_blank" rel="noopener"><mat-icon>description</mat-icon><span>{{ m?.nombre || ('com.media.document' | translate) }}</span></a> }
      }
    }
  `,
  styles: `
    :host { display: block; margin-bottom: 4px; }
    img { display: block; max-width: 100%; max-height: 280px; border-radius: 8px; }
    .sticker { max-width: 140px; }
    audio { width: 240px; max-width: 100%; }
    video { max-width: 100%; max-height: 280px; border-radius: 8px; }
    .doc, .nofile, .cargar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: var(--md-sys-color-surface-container);
      color: inherit; text-decoration: none; overflow-wrap: anywhere; }
    .nofile { flex-wrap: wrap; } .err { flex-basis: 100%; font: var(--mat-sys-body-small); color: var(--md-sys-color-error); }
    .cargar { border: none; cursor: pointer; font: inherit; }
  `,
})
export class ComMediaComponent {
  readonly mensaje = input.required<Mensaje>();
  private com = inject(ComunicacionesService);
  readonly url = signal<string | null>(null);
  readonly cargando = signal(false);
  private intentos = 0;
  readonly tipo = computed(() => this.mensaje().tipo);
  readonly icono = computed(() => ({ image: 'image', audio: 'mic', video: 'videocam', sticker: 'emoji_emotions' } as Record<string, string>)[this.tipo()] ?? 'description');

  constructor() {
    // Imágenes y stickers se cargan solos (se ven en el hilo); audio, video y documentos al tocar.
    queueMicrotask(() => { if (['image', 'sticker'].includes(this.tipo()) && this.mensaje().media?.disponible) void this.cargar(); });
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const r = await this.com.getMedia(this.mensaje().id);
      if (r.action && r.data) this.url.set(r.data.url);
    } finally { this.cargando.set(false); }
  }

  /** La URL firmada venció (5 min): se pide otra una vez. */
  vencida(): void {
    if (this.intentos++ < 1) { this.url.set(null); void this.cargar(); }
  }
}
