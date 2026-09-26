import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { BotonPlantilla, TipoEncabezado } from '../../services/comunicaciones.service';
import { TranslatePipe } from '../../services/translation.service';
import { waHtml } from './wa-format';

/**
 * Vista previa tipo WhatsApp de un mensaje de plantilla: encabezado (texto o marcador del medio), cuerpo con formato, pie y botones.
 * Solo tokens de la marca (no los colores de WhatsApp): se reconoce por la forma, no por el verde.
 */
@Component({
  selector: 'app-wa-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, TranslatePipe],
  template: `
    <div class="phone" [attr.aria-label]="'com.tpl.preview' | translate">
      <div class="bubble">
        @switch (encabezadoTipo()) {
          @case ('texto') { <div class="h-text">{{ encabezadoTexto() }}</div> }
          @case ('imagen') { <div class="h-media">@if (mediaUrl()) { <img [src]="mediaUrl()" alt="" /> } @else { <mat-icon>image</mat-icon> }</div> }
          @case ('video') { <div class="h-media"><mat-icon>play_circle</mat-icon></div> }
          @case ('documento') { <div class="h-doc"><mat-icon>picture_as_pdf</mat-icon><span>{{ mediaNombre() || ('com.tpl.document' | translate) }}</span></div> }
        }
        <div class="body" [innerHTML]="html()"></div>
        @if (pie()) { <div class="foot">{{ pie() }}</div> }
        <div class="time">{{ hora() }}</div>
      </div>
      @for (b of botones(); track $index) {
        <div class="btn"><mat-icon>{{ b.tipo === 'enlace' ? 'open_in_new' : b.tipo === 'otro' ? 'call' : 'reply' }}</mat-icon>{{ b.texto }}</div>
      }
    </div>
  `,
  styles: `
    .phone { background: var(--md-sys-color-surface-container-high); border-radius: 20px; padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; }
    .bubble {
      align-self: flex-start; max-width: 100%; min-width: 60%; background: var(--md-sys-color-surface-container-lowest); color: var(--md-sys-color-on-surface);
      border-radius: 4px 14px 14px 14px; padding: 6px 8px 4px; box-shadow: 0 1px 1px color-mix(in srgb, var(--md-sys-color-shadow) 18%, transparent);
      overflow-wrap: anywhere;
    }
    .h-text { font-weight: 600; margin-bottom: 4px; }
    .h-media { height: 120px; border-radius: 8px; display: grid; place-items: center; overflow: hidden; margin-bottom: 6px;
      background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant);
      img { width: 100%; height: 100%; object-fit: cover; } mat-icon { width: 40px; height: 40px; font-size: 40px; } }
    .h-doc { display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 8px; margin-bottom: 6px; background: var(--md-sys-color-surface-container); }
    .body { font: var(--mat-sys-body-medium); line-height: 1.4; white-space: normal; }
    .body :is(code) { font-family: monospace; }
    .foot { margin-top: 4px; font: var(--mat-sys-body-small); color: var(--md-sys-color-on-surface-variant); }
    .time { text-align: right; font: var(--mat-sys-label-small); color: var(--md-sys-color-on-surface-variant); }
    .btn {
      align-self: stretch; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px; border-radius: 10px;
      background: var(--md-sys-color-surface-container-lowest); color: var(--md-sys-color-primary); font: var(--mat-sys-label-large);
      mat-icon { width: 18px; height: 18px; font-size: 18px; }
    }
  `,
})
export class WaPreviewComponent {
  readonly encabezadoTipo = input<TipoEncabezado | null>('ninguno');
  readonly encabezadoTexto = input<string | null>(null);
  readonly mediaUrl = input<string | null>(null);
  readonly mediaNombre = input<string | null>(null);
  readonly cuerpo = input<string>('');
  readonly pie = input<string | null>(null);
  readonly botones = input<BotonPlantilla[]>([]);
  readonly html = computed(() => waHtml(this.cuerpo()));
  readonly hora = computed(() => new Date().toTimeString().slice(0, 5));
}
