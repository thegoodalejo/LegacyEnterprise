import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PwaInstallService } from '../services/pwa-install.service';
import { TranslatePipe } from '../services/translation.service';

/** Tarjeta flotante "Instala la app". Va en app.component.html: <app-pwa-install-banner /> */
@Component({
  selector: 'app-pwa-install-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, TranslatePipe],
  template: `
    @if (pwa.mode(); as mode) {
      <aside class="banner" role="dialog" aria-live="polite">
        <img class="icon" src="icons/icon-96x96.png" alt="" />
        <div class="text">
          <strong>{{ 'pwa.install_title' | translate }}</strong>
          @if (mode === 'ios') {
            <span>{{ 'pwa.install_ios' | translate }} <mat-icon inline>ios_share</mat-icon></span>
          } @else {
            <span>{{ 'pwa.install_desc' | translate }}</span>
          }
        </div>
        <div class="actions">
          @if (mode === 'prompt') {
            <button mat-flat-button (click)="pwa.install()"><mat-icon>download</mat-icon>{{ 'pwa.install' | translate }}</button>
          }
          <button mat-button (click)="pwa.dismiss()">{{ 'pwa.not_now' | translate }}</button>
        </div>
      </aside>
    }
  `,
  styles: `
    .banner {
      position: fixed; z-index: 1500; left: 16px; right: 16px; bottom: 16px; max-width: 560px; margin: 0 auto;
      display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 16px;
      border-radius: 16px; background: var(--md-sys-color-surface-container-high);
      color: var(--md-sys-color-on-surface); box-shadow: 0 6px 24px color-mix(in srgb, var(--md-sys-color-shadow) 24%, transparent);
    }
    .icon { width: 48px; height: 48px; border-radius: 12px; }
    .text { flex: 1 1 200px; display: flex; flex-direction: column; gap: 2px; }
    .text span { color: var(--md-sys-color-on-surface-variant); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
  `,
})
export class PwaInstallBannerComponent {
  pwa = inject(PwaInstallService);
}
