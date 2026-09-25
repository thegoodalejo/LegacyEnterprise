import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { contrastColor } from '../pages/crm/crm-format';

/**
 * Etiqueta con el color que eligió el cliente. Es un dato del cliente (no un token de marca), por eso el fondo es
 * un hex libre; el texto pasa a blanco o negro según la luminancia para que siempre se lea.
 */
@Component({
  selector: 'app-tag-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="chip" [style.background]="color()" [style.color]="fg()">{{ nombre() }}</span>`,
  styles: `
    :host { display: inline-flex; min-width: 0; }
    .chip {
      padding: 2px 10px; border-radius: 999px; font: var(--mat-sys-label-medium);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
    }
  `,
})
export class TagChipComponent {
  readonly nombre = input.required<string>();
  readonly color = input.required<string>();
  readonly fg = computed(() => contrastColor(this.color()));
}
